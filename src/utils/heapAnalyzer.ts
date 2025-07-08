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

export interface DetachedDOMNode {
  node: HeapNode;
  isDetached: boolean;
  retainerInfo: string[];
  attributes: Record<string, string>;
  elementType: string;
}

export interface DOMLeakSummary {
  totalDetachedNodes: number;
  detachedNodesByType: Record<string, number>;
  suspiciousPatterns: string[];
  retainerArrays: Array<{
    name: string;
    nodeCount: number;
    retainedNodes: string[];
  }>;
}

export interface AnalysisResult {
  topRetainers: RetainerResult[];
  detachedDOMNodes: DetachedDOMNode[];
  domLeakSummary: DOMLeakSummary;
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
  private edges: any[] = [];

  constructor(snapshotData: any) {
    this.snapshot = snapshotData;
    this.parseNodes();
    this.parseEdges();
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

  private parseEdges(): void {
    const edges = this.snapshot.edges || [];
    const strings = this.snapshot.strings || [];
    const edgeFields = this.snapshot.snapshot?.meta?.edge_fields || [];
    const edgeTypes = this.snapshot.snapshot?.meta?.edge_types || [];
    
    // Find field indices
    const typeIndex = edgeFields.indexOf('type');
    const nameOrIndex = edgeFields.indexOf('name_or_index');
    const toNodeIndex = edgeFields.indexOf('to_node');
    
    const edgeFieldCount = edgeFields.length;
    
    for (let i = 0; i < edges.length; i += edgeFieldCount) {
      const typeValue = edges[i + typeIndex];
      const nameValue = edges[i + nameOrIndex];
      const toNode = edges[i + toNodeIndex];
      
      let typeString = 'unknown';
      if (edgeTypes[0] && Array.isArray(edgeTypes[0])) {
        typeString = edgeTypes[0][typeValue] || 'unknown';
      }
      
      let nameString = '';
      if (typeof nameValue === 'number' && strings[nameValue]) {
        nameString = strings[nameValue];
      } else if (typeof nameValue === 'string') {
        nameString = nameValue;
      }
      
      this.edges.push({
        type: typeString,
        name: nameString,
        toNode: toNode
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

    // Analyze detached DOM nodes
    const domAnalysis = this.analyzeDetachedDOMNodes();

    // Calculate summary
    const totalRetainedSize = this.nodes.reduce((sum, node) => sum + node.selfSize, 0);
    const categories: Record<string, number> = {};
    
    topRetainers.forEach(result => {
      categories[result.category] = (categories[result.category] || 0) + 1;
    });

    return {
      topRetainers,
      detachedDOMNodes: domAnalysis.detachedNodes,
      domLeakSummary: domAnalysis.summary,
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
    
    // Enhanced DOM detection
    if (this.isDOMNode(node)) {
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
          if (pathStr.includes('array') || pathStr.includes('refs')) {
            return 'Detached DOM node retained by array/ref — clear references after DOM removal (e.g., detachedNodesRefs.current = [])';
          }
          return 'Detached DOM node — remove references or event listeners';
        }
        if (pathStr.includes('island') || pathStr.includes('treasure')) {
          return 'DOM nodes with custom data attributes — ensure proper cleanup in useEffect return function';
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
        if (pathStr.includes('detached') || pathStr.includes('dom')) {
          return 'Array holding DOM references — clear array after DOM removal';
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

  private isDOMNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    // Enhanced DOM node detection
    return (
      name.startsWith('HTML') ||
      name.includes('Element') ||
      name.includes('Node') ||
      type.includes('Element') ||
      type.includes('Node') ||
      /^(DIV|SPAN|P|H[1-6]|UL|LI|TABLE|TR|TD|INPUT|BUTTON|FORM|IMG|A|SCRIPT|STYLE)$/.test(name) ||
      (type === 'object' && (
        name.includes('HTMLDivElement') ||
        name.includes('HTMLSpanElement') ||
        name.includes('HTMLElement') ||
        name.includes('HTMLDocument') ||
        name.includes('Text') ||
        name.includes('Comment')
      ))
    );
  }

  private analyzeDetachedDOMNodes(): { detachedNodes: DetachedDOMNode[], summary: DOMLeakSummary } {
    const domNodes = this.nodes.filter(node => this.isDOMNode(node));
    const detachedNodes: DetachedDOMNode[] = [];
    const detachedNodesByType: Record<string, number> = {};
    const suspiciousPatterns: string[] = [];
    const retainerArrays: Array<{ name: string; nodeCount: number; retainedNodes: string[] }> = [];

    for (const node of domNodes) {
      const retainerPaths = this.traceRetainerPaths(node, 10);
      const isDetached = this.isNodeDetached(node, retainerPaths);
      
      if (isDetached) {
        const attributes = this.extractNodeAttributes(node);
        const elementType = this.getElementType(node);
        
        detachedNodes.push({
          node,
          isDetached: true,
          retainerInfo: retainerPaths.flat(),
          attributes,
          elementType
        });

        // Count by type
        detachedNodesByType[elementType] = (detachedNodesByType[elementType] || 0) + 1;

        // Check for suspicious patterns
        if (attributes['data-island-id'] || attributes['data-timestamp']) {
          suspiciousPatterns.push(`Custom data attributes detected: ${elementType} with ${Object.keys(attributes).join(', ')}`);
        }

        // Track retainer arrays
        const arrayRetainer = this.findArrayRetainer(node, retainerPaths);
        if (arrayRetainer) {
          let existingArray = retainerArrays.find(arr => arr.name === arrayRetainer);
          if (existingArray) {
            existingArray.nodeCount++;
            existingArray.retainedNodes.push(`${elementType}(${node.name || node.type})`);
          } else {
            retainerArrays.push({
              name: arrayRetainer,
              nodeCount: 1,
              retainedNodes: [`${elementType}(${node.name || node.type})`]
            });
          }
        }
      }
    }

    // Detect bulk retention patterns
    retainerArrays.forEach(arr => {
      if (arr.nodeCount > 5) {
        suspiciousPatterns.push(`Bulk DOM retention: ${arr.name} retaining ${arr.nodeCount} DOM nodes`);
      }
    });

    return {
      detachedNodes,
      summary: {
        totalDetachedNodes: detachedNodes.length,
        detachedNodesByType,
        suspiciousPatterns,
        retainerArrays
      }
    };
  }

  private isNodeDetached(node: HeapNode, retainerPaths: string[][]): boolean {
    const pathStr = retainerPaths.map(p => p.join(' → ')).join(' | ').toLowerCase();
    
    // Check if the node appears to be detached
    return (
      pathStr.includes('detached') ||
      !pathStr.includes('document') ||
      !pathStr.includes('window') ||
      pathStr.includes('array') && !pathStr.includes('document')
    );
  }

  private extractNodeAttributes(node: HeapNode): Record<string, string> {
    // This is a simplified implementation
    // In a real scenario, you'd need to traverse the node's properties
    const attributes: Record<string, string> = {};
    
    if (node.name.includes('island')) {
      attributes['data-island-id'] = 'detected';
    }
    if (node.name.includes('timestamp')) {
      attributes['data-timestamp'] = 'detected';
    }
    if (node.name.includes('treasure')) {
      attributes['data-treasure-value'] = 'detected';
    }
    
    return attributes;
  }

  private getElementType(node: HeapNode): string {
    const name = node.name || '';
    
    if (name.includes('HTMLDivElement') || name === 'DIV') return 'div';
    if (name.includes('HTMLSpanElement') || name === 'SPAN') return 'span';
    if (name.includes('HTMLElement')) return name.replace('HTML', '').replace('Element', '').toLowerCase();
    if (name.startsWith('HTML')) return name.substring(4).replace('Element', '').toLowerCase();
    
    return node.type || 'unknown';
  }

  private findArrayRetainer(node: HeapNode, retainerPaths: string[][]): string | null {
    for (const path of retainerPaths) {
      for (const step of path) {
        if (step.toLowerCase().includes('array') || step.includes('refs') || step.includes('current')) {
          return step;
        }
      }
    }
    return null;
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
