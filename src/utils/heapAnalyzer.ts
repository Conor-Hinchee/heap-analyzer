import fs from 'fs';
import path from 'path';

export interface HeapNode {
  nodeIndex: number;
  type: string;
  name: string;
  selfSize: number;
  retainedSize: number;
  id: number;
}

export interface AnalysisResult {
  topRetainers: RetainerResult[];
  summary: {
    totalObjects: number;
    totalRetainedSize: number;
    categories: Record<string, number>;
  };
}

export interface RetainerResult {
  node: HeapNode;
  category: string;
  emoji: string;
  retainerPaths: string[][];
  suggestion: string;
}

export class HeapAnalyzer {
  private snapshot: any;
  private nodes: HeapNode[] = [];

  constructor(snapshotData: any) {
    this.snapshot = snapshotData;
    this.parseNodes();
  }

  private parseNodes(): void {
    const nodes = this.snapshot.nodes || [];
    const strings = this.snapshot.strings || [];
    const nodeFields = this.snapshot.snapshot?.meta?.node_fields || [];
    const nodeTypes = this.snapshot.snapshot?.meta?.node_types || [];
    
    // Find field indices
    const typeIndex = nodeFields.indexOf('type');
    const nameIndex = nodeFields.indexOf('name');
    const selfSizeIndex = nodeFields.indexOf('self_size');
    const edgeCountIndex = nodeFields.indexOf('edge_count');
    const idIndex = nodeFields.indexOf('id');
    
    const nodeFieldCount = nodeFields.length;
    
    for (let i = 0; i < nodes.length; i += nodeFieldCount) {
      const nodeIndex = i / nodeFieldCount;
      const typeValue = nodes[i + typeIndex];
      const nameValue = nodes[i + nameIndex];
      const selfSize = nodes[i + selfSizeIndex] || 0;
      
      // Get type string from node_types array
      let typeString = 'unknown';
      if (nodeTypes[0] && Array.isArray(nodeTypes[0])) {
        typeString = nodeTypes[0][typeValue] || 'unknown';
      }
      
      // Get name string
      let nameString = '';
      if (typeof nameValue === 'number' && strings[nameValue]) {
        nameString = strings[nameValue];
      } else if (typeof nameValue === 'string') {
        nameString = nameValue;
      }
      
      this.nodes.push({
        nodeIndex,
        type: typeString,
        name: nameString,
        selfSize: selfSize,
        retainedSize: selfSize, // For now, use self size as approximation. Real retained size calculation is complex
        id: nodes[i + idIndex] || 0
      });
    }
  }

  public analyzeSnapshot(options: {
    topCount?: number;
    minSizeKB?: number;
    filterRegex?: string;
  } = {}): AnalysisResult {
    const { topCount = 10, minSizeKB = 1, filterRegex } = options; // Lowered minimum to 1KB
    const minSizeBytes = minSizeKB * 1024;
    const filterPattern = filterRegex ? new RegExp(filterRegex, 'i') : null;

    // Filter and sort nodes by self size (using as approximation for retained size)
    let candidates = this.nodes.filter(node => {
      if (node.selfSize < minSizeBytes) return false;
      if (filterPattern && !filterPattern.test(node.name) && !filterPattern.test(node.type)) return false;
      if (node.name === '' && node.type === 'synthetic') return false;
      if (node.name.includes('(system)')) return false;
      return true;
    });

    candidates.sort((a, b) => b.selfSize - a.selfSize);
    const topNodes = candidates.slice(0, topCount);

    // Analyze each top node
    const topRetainers: RetainerResult[] = topNodes.map(node => {
      const category = this.categorizeObject(node);
      const retainerPaths = this.traceRetainerPaths(node, 5);
      const suggestion = this.suggestFix(node, retainerPaths, category);

      return {
        node,
        category: category.category,
        emoji: category.emoji,
        retainerPaths,
        suggestion
      };
    });

    // Calculate summary
    const totalRetainedSize = this.nodes.reduce((sum, node) => sum + node.selfSize, 0);
    const categories: Record<string, number> = {};
    
    topRetainers.forEach(result => {
      categories[result.category] = (categories[result.category] || 0) + 1;
    });

    return {
      topRetainers,
      summary: {
        totalObjects: this.nodes.length,
        totalRetainedSize,
        categories
      }
    };
  }

  private categorizeObject(node: HeapNode): { category: string; emoji: string; color: string } {
    const name = node.name || '';
    const type = node.type || '';
    
    if (name.includes('HTML') || name.includes('Element') || type.includes('Element')) {
      return { category: 'DOM', emoji: '🔴', color: 'red' };
    }
    if (name.includes('Fiber') || name.includes('React')) {
      return { category: 'REACT', emoji: '⚛️', color: 'blue' };
    }
    if (type === 'closure' || name.includes('Closure')) {
      return { category: 'CLOSURE', emoji: '🟡', color: 'yellow' };
    }
    if (type === 'array' || name === 'Array') {
      return { category: 'ARRAY', emoji: '🟠', color: 'orange' };
    }
    if (name.includes('Promise') || name.includes('async')) {
      return { category: 'ASYNC', emoji: '🟣', color: 'magenta' };
    }
    if (type === 'function' || name.includes('Function')) {
      return { category: 'FUNCTION', emoji: '🔵', color: 'cyan' };
    }
    
    return { category: 'OBJECT', emoji: '⚫', color: 'gray' };
  }

  private traceRetainerPaths(node: HeapNode, maxDepth: number): string[][] {
    // Simplified retainer path tracing
    // This would need more complex implementation for full functionality
    const paths: string[][] = [];
    
    // For now, return a simple path based on the object type
    const category = this.categorizeObject(node);
    paths.push([
      'GC Root',
      category.category === 'DOM' ? 'Document' : 'Window',
      node.name || node.type
    ]);
    
    return paths;
  }

  private suggestFix(node: HeapNode, retainerPaths: string[][], category: { category: string }): string {
    const pathStr = retainerPaths.map(p => p.join(' → ')).join(' | ');
    
    switch (category.category) {
      case 'DOM':
        if (pathStr.includes('detached') || !pathStr.includes('Document')) {
          return 'Detached DOM node — remove references or event listeners';
        }
        return 'DOM element retained — check for event listeners or component refs';
        
      case 'REACT':
        return 'React component/fiber retained — check useEffect cleanup or component unmounting';
        
      case 'CLOSURE':
        if (pathStr.includes('timer') || pathStr.includes('interval')) {
          return 'Closure retained by timer — use clearInterval/clearTimeout';
        }
        return 'Closure capturing large scope — avoid capturing unnecessary variables';
        
      case 'ARRAY':
        if (pathStr.includes('cache') || pathStr.includes('buffer')) {
          return 'Unbounded array/cache — implement size limits or periodic cleanup';
        }
        return 'Growing array — check for memory leaks in collection';
        
      case 'ASYNC':
        return 'Async operation holding references — use AbortController or cleanup promises';
        
      case 'FUNCTION':
        return 'Function retained — check for event listeners or timer callbacks';
        
      default:
        return 'Object retained through reference chain — trace path to identify cause';
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function analyzeHeapSnapshot(filePath: string): Promise<AnalysisResult> {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const snapshot = JSON.parse(data);
    const analyzer = new HeapAnalyzer(snapshot);
    return analyzer.analyzeSnapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to analyze heap snapshot: ${message}`);
  }
}
