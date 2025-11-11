import fs from 'fs';
import path from 'path';
import { ReactDetector, ReactDetachedNode, ReactLeakPattern } from './reactDetector.js';
import { FrameworkDetector, FrameworkDetectionResult, formatFrameworkDetection } from './frameworkDetector.js';

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
  reactInfo?: {
    componentName?: string;
    refName?: string;
    jsxElementType?: string;
    retainerType?: string;
  };
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
  reactAnalysis?: {
    totalReactComponents: number;
    totalReactRefs: number;
    reactDetachedNodes: number;
    criticalReactPatterns: number;
    affectedComponents: number;
  };
}

export interface AnalysisResult {
  topRetainers: RetainerResult[];
  detachedDOMNodes: DetachedDOMNode[];
  domLeakSummary: DOMLeakSummary;
  frameworkAnalysis?: FrameworkDetectionResult;
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
    const { topCount = 20, minSizeKB = 0.1, filterRegex } = options; // Increased count and lowered to 100 bytes
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

    // DEBUG: Log some sample objects to understand the heap structure
    console.log('🔍 DEBUG: Sample heap objects:');
    const sampleObjects = this.nodes.slice(0, 100);
    const interestingObjects = sampleObjects.filter(node => 
      node.selfSize > 1000 || 
      node.name.includes('data') ||
      node.name.includes('image') ||
      node.name.includes('Canvas') ||
      node.name.includes('String') ||
      node.type === 'string'
    );
    
    interestingObjects.slice(0, 10).forEach(node => {
      console.log(`  Type: ${node.type}, Name: ${node.name}, Size: ${node.selfSize} bytes`);
    });

    candidates.sort((a, b) => b.selfSize - a.selfSize);
    const topNodes = candidates.slice(0, topCount);

    console.log(`🔍 DEBUG: Found ${candidates.length} candidates, top ${topNodes.length} objects:`);
    topNodes.slice(0, 5).forEach(node => {
      console.log(`  ${node.type}: ${node.name} (${node.selfSize} bytes)`);
    });

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

    // Framework analysis
    const frameworkDetector = new FrameworkDetector(this.nodes);
    const frameworkAnalysis = frameworkDetector.detectFrameworks();

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
      frameworkAnalysis,
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
    
    // IMAGE/CANVAS LEAK DETECTION - Critical patterns
    if (this.isImageCanvasNode(node)) {
      return { category: 'IMAGE_CANVAS', emoji: '📸', color: 'pink' };
    }
    if (this.isDataURLNode(node)) {
      return { category: 'DATA_URL', emoji: '🖼️', color: 'purple' };
    }
    if (this.isBase64DataNode(node)) {
      return { category: 'BASE64_DATA', emoji: '📱', color: 'darkred' };
    }
    if (this.isGlobalVariableNode(node)) {
      return { category: 'GLOBAL_VARIABLE', emoji: '🌐', color: 'darkblue' };
    }
    
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
      case 'IMAGE_CANVAS':
        if (pathStr.includes('interval') || pathStr.includes('timer')) {
          return 'Canvas/Image objects retained by timer — clear canvas references and use clearInterval/clearTimeout';
        }
        if (pathStr.includes('global') || pathStr.includes('window')) {
          return 'Canvas/Image retained in global scope — clear window.* references when done processing';
        }
        return 'Canvas/Image memory leak — ensure canvas.getContext() references are cleaned up and canvases are removed from DOM';
        
      case 'DATA_URL':
        if (pathStr.includes('Array') || pathStr.includes('Cache')) {
          return 'CRITICAL: Data URL accumulation in array/cache — implement cleanup: array.length = 0 or delete cache entries';
        }
        if (pathStr.includes('global') || pathStr.includes('window')) {
          return 'CRITICAL: Data URLs in global variables — clear large data URL arrays and similar global collections';
        }
        return 'CRITICAL: Data URL memory leak — data URLs are 33% larger than original images due to base64. Convert back to blobs or clear references immediately';
        
      case 'BASE64_DATA':
        return 'CRITICAL: Base64 data accumulation — these strings are memory-intensive. Clear after use or convert to more efficient formats';
        
      case 'GLOBAL_VARIABLE':
        if (pathStr.includes('Archive') || pathStr.includes('Cache') || pathStr.includes('Store')) {
          return 'CRITICAL: Global variable memory leak detected — review and clear large global arrays/objects';
        }
        return 'Global variable leak — review window.* properties and clear unused references';
        
      case 'DOM':
        if (pathStr.includes('detached') || !pathStr.includes('Document')) {
          if (pathStr.includes('array') || pathStr.includes('refs')) {
            return 'Detached DOM node retained by array/ref — clear references after DOM removal (e.g., refs.current = [])';
          }
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
        if (pathStr.includes('detached') || pathStr.includes('dom')) {
          return 'Array holding DOM references — clear array after DOM removal';
        }
        if (pathStr.includes('dataUrl') || pathStr.includes('image')) {
          return 'CRITICAL: Array accumulating images/data URLs — clear array.length = 0 or implement cleanup logic';
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

  // ===== IMAGE/CANVAS/DATA URL LEAK DETECTION METHODS =====
  
  private isImageCanvasNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // HTML Image and Canvas elements
      name.includes('HTMLImageElement') ||
      name.includes('HTMLCanvasElement') ||
      name.includes('ImageData') ||
      name.includes('CanvasRenderingContext2D') ||
      name.includes('WebGLRenderingContext') ||
      name.includes('CanvasPattern') ||
      name.includes('CanvasGradient') ||
      name.includes('Path2D') ||
      
      // Image-related browser objects
      name.includes('Image') ||
      name.includes('Canvas') ||
      
      // Canvas API objects
      type === 'object' && (
        name.includes('canvas') ||
        name.includes('context') ||
        name.includes('imagedata')
      )
    );
  }

  private isDataURLNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // Data URL strings (these are huge in heap snapshots)
      (type === 'string' || type === 'cons string' || name.includes('String')) && (
        name.includes('data:image') ||
        name.includes('data:') && name.includes('base64') ||
        // Large strings that could be data URLs
        (node.selfSize > 50000 && type === 'string') ||
        // Blob URLs
        name.includes('blob:') ||
        // Object URLs
        name.includes('objectURL')
      ) ||
      
      // Objects that commonly hold data URLs
      name.includes('dataUrl') ||
      name.includes('dataURL') ||
      name.includes('base64Data') ||
      name.includes('imageData') && type === 'object'
    );
  }

  private isBase64DataNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // Base64 encoded strings (very memory intensive)
      (type === 'string' || type === 'cons string') && (
        name.includes('base64') ||
        // Large strings with base64 patterns (common in heap snapshots)
        (node.selfSize > 100000 && (type === 'string' || type === 'cons string')) ||
        // ArrayBuffer/TypedArray data that could be base64 source
        name.includes('ArrayBuffer') ||
        name.includes('Uint8Array') ||
        name.includes('Buffer')
      ) ||
      
      // External string resources (often base64 data)
      name.includes('ExternalStringResource') ||
      name.includes('ExternalString')
    );
  }

  private isGlobalVariableNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    // Detect objects attached to global scope (window.* properties)
    return (
      // Window property patterns
      name.includes('window.') ||
      name.includes('global.') ||
      
      // Generic global leak patterns - TODO: Replace with dynamic detection
      (type === 'object' && (
        name.includes('Archive') ||
        name.includes('Cache') ||
        name.includes('Store') ||
        name.includes('Registry') ||
        name.includes('Manager') ||
        name.includes('Buffer') ||
        name.includes('Pool')
      )) ||
      
      // Global scope indicators
      name === 'Window' || name === 'global'
    );
  }

  private isDOMNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    // Enhanced DOM node detection to catch more patterns
    return (
      // Standard HTML element patterns
      name.startsWith('HTML') ||
      name.includes('Element') ||
      name.includes('Node') ||
      type.includes('Element') ||
      type.includes('Node') ||
      
      // Tag name patterns
      /^(DIV|SPAN|P|H[1-6]|UL|LI|TABLE|TR|TD|INPUT|BUTTON|FORM|IMG|A|SCRIPT|STYLE)$/.test(name) ||
      
      // More comprehensive object type detection
      (type === 'object' && (
        name.includes('HTMLDivElement') ||
        name.includes('HTMLSpanElement') ||
        name.includes('HTMLElement') ||
        name.includes('HTMLDocument') ||
        name.includes('HTMLHeadingElement') ||
        name.includes('HTMLUListElement') ||
        name.includes('HTMLLIElement') ||
        name.includes('Text') ||
        name.includes('Comment') ||
        name.includes('DocumentFragment')
      )) ||
      
      // Native DOM types
      type === 'native' && (
        name.includes('div') ||
        name.includes('span') ||
        name.includes('h3') ||
        name.includes('ul') ||
        name.includes('li')
      )
    );
  }

  private analyzeDetachedDOMNodes(): { detachedNodes: DetachedDOMNode[], summary: DOMLeakSummary } {
    const domNodes = this.nodes.filter(node => this.isDOMNode(node));
    const detachedNodes: DetachedDOMNode[] = [];
    const detachedNodesByType: Record<string, number> = {};
    const suspiciousPatterns: string[] = [];
    const retainerArrays: Array<{ name: string; nodeCount: number; retainedNodes: string[] }> = [];

    // Initialize React detector for enhanced React-specific analysis
    const reactDetector = new ReactDetector(this.nodes);
    const reactDetachedNodes = reactDetector.detectReactDetachedNodes();
    const reactLeakPatterns = reactDetector.analyzeReactLeakPatterns();
    const reactSummary = reactDetector.getReactAnalysisSummary();

    // Process traditional DOM nodes
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

        // Check for suspicious patterns (any data attributes)
        if (Object.keys(attributes).length > 0) {
          suspiciousPatterns.push(`Custom data attributes detected: ${elementType} with ${Object.keys(attributes).join(', ')}`);
        }
      }
    }

    // Process React-specific detached nodes
    for (const reactNode of reactDetachedNodes) {
      const attributes = this.extractNodeAttributes(reactNode.node);
      const elementType = reactNode.jsxElementType || this.getElementType(reactNode.node);
      
      const detachedNode: DetachedDOMNode = {
        node: reactNode.node,
        isDetached: true,
        retainerInfo: [`React component: ${reactNode.componentName}`, `Ref: ${reactNode.refName}`],
        attributes,
        elementType,
        reactInfo: {
          componentName: reactNode.componentName,
          refName: reactNode.refName,
          jsxElementType: reactNode.jsxElementType,
          retainerType: reactNode.retainerType
        }
      };
      
      detachedNodes.push(detachedNode);
      
      // Count by type with React prefix
      const reactElementType = `React-${elementType}`;
      detachedNodesByType[reactElementType] = (detachedNodesByType[reactElementType] || 0) + 1;
    }

    // Add React-specific patterns
    for (const pattern of reactLeakPatterns) {
      suspiciousPatterns.push(`React ${pattern.type}: ${pattern.description}`);
      
      if (pattern.type === 'detached_dom') {
        retainerArrays.push({
          name: `React refs in ${pattern.componentNames.join(', ')}`,
          nodeCount: pattern.nodes.length,
          retainedNodes: pattern.nodes.map(n => n.node.name || 'unnamed')
        });
      }
    }

    // Add React-specific retainer arrays
    if (reactSummary.totalReactRefs > 0) {
      suspiciousPatterns.push(`Detected ${reactSummary.totalReactRefs} React refs - check for detached DOM references`);
    }
    
    if (reactSummary.detachedDOMNodes > 0) {
      suspiciousPatterns.push(`Found ${reactSummary.detachedDOMNodes} React-managed detached DOM nodes`);
    }

    // Continue with traditional DOM analysis for remaining nodes...
    // Only process non-React DOM nodes to avoid duplicates
    const traditionalDomNodes = domNodes.filter(node => 
      !reactDetachedNodes.some(reactNode => reactNode.node.id === node.id)
    );

    for (const node of traditionalDomNodes) {
      const retainerPaths = this.traceRetainerPaths(node, 10);
      const isDetached = this.isNodeDetached(node, retainerPaths);
      
      if (isDetached) {
        // Process traditional detached nodes...
        const arrayRetainer = this.findArrayRetainer(node, retainerPaths);
        if (arrayRetainer) {
          let existingArray = retainerArrays.find(arr => arr.name === arrayRetainer);
          if (existingArray) {
            existingArray.nodeCount++;
            existingArray.retainedNodes.push(`${this.getElementType(node)}(${node.name || node.type})`);
          } else {
            retainerArrays.push({
              name: arrayRetainer,
              nodeCount: 1,
              retainedNodes: [`${this.getElementType(node)}(${node.name || node.type})`]
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
        retainerArrays,
        reactAnalysis: {
          totalReactComponents: reactSummary.totalReactComponents,
          totalReactRefs: reactSummary.totalReactRefs,
          reactDetachedNodes: reactSummary.detachedDOMNodes,
          criticalReactPatterns: reactSummary.criticalPatterns,
          affectedComponents: reactSummary.affectedComponents
        }
      }
    };
  }

  private isNodeDetached(node: HeapNode, retainerPaths: string[][]): boolean {
    const pathStr = retainerPaths.map(p => p.join(' → ')).join(' | ').toLowerCase();
    const nodeName = (node.name || '').toLowerCase();
    
    // Enhanced detached node detection
    const hasDetachedIndicators = (
      // Explicit detached indicators
      pathStr.includes('detached') ||
      nodeName.includes('detached') ||
      
      // Not connected to main document tree
      (!pathStr.includes('document') && !pathStr.includes('window') && !pathStr.includes('body')) ||
      
      // Retained by arrays but not connected to DOM tree (classic detached DOM pattern)
      (pathStr.includes('array') && !pathStr.includes('document') && !pathStr.includes('body')) ||
      
      // Generic detached patterns (not app-specific)
      pathStr.includes('detached_nodes') ||
      pathStr.includes('unmounted') ||
      
      // Generic signs of detachment - nodes with references but no DOM parent chain
      (retainerPaths.length > 0 && 
       !retainerPaths.some(path => 
         path.some(step => 
           step.toLowerCase().includes('document') || 
           step.toLowerCase().includes('body') ||
           step.toLowerCase().includes('html')
         )
       ))
    );
    
    // Additional check: if it's a DOM node but has unusual retainer patterns
    const hasUnusualRetainers = (
      this.isDOMNode(node) &&
      retainerPaths.some(path => 
        path.some(step => 
          step.toLowerCase().includes('current') || // React refs
          step.toLowerCase().includes('ref') ||
          step.toLowerCase().includes('array')
        )
      ) &&
      !pathStr.includes('document')
    );
    
    return hasDetachedIndicators || hasUnusualRetainers;
  }

  private extractNodeAttributes(node: HeapNode): Record<string, string> {
    // This is a simplified implementation
    // In a real scenario, you'd need to traverse the node's properties
    const attributes: Record<string, string> = {};
    
    // Check for common data attribute patterns in node name
    if (node.name.includes('timestamp')) {
      attributes['data-timestamp'] = 'detected';
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
