/**
 * Detached DOM Element Analyzer
 * 
 * Inspired by MemLab's DetachedDOMElementAnalysis
 * Finds DOM elements that are disconnected from the document tree
 * but still held in memory, indicating potential memory leaks.
 */

import { HeapNode, HeapSnapshot, HeapEdge } from '../types';

interface DetachedDomNode {
  id: number;
  name: string;
  className: string;
  tagName: string;
  retainedSize: number;
  shallowSize: number;
  confidence: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detachmentReason: string;
  parentChain: string[];
}

interface DetachedDomAnalysisResult {
  totalDetachedElements: number;
  detachedNodes: DetachedDomNode[];
  totalMemoryWasted: number;
  severityBreakdown: Record<string, number>;
  largestDetached: DetachedDomNode[];
  summary: string;
  recommendations: string[];
}

export class DetachedDomAnalyzer {
  private readonly DOM_NODE_TYPES = new Set([
    'HTMLDivElement',
    'HTMLSpanElement', 
    'HTMLButtonElement',
    'HTMLInputElement',
    'HTMLFormElement',
    'HTMLImageElement',
    'HTMLCanvasElement',
    'HTMLVideoElement',
    'HTMLAudioElement',
    'HTMLIFrameElement',
    'HTMLTableElement',
    'HTMLUListElement',
    'HTMLLIElement',
    'HTMLParagraphElement',
    'HTMLHeadingElement',
    'HTMLAnchorElement',
    'HTMLSelectElement',
    'HTMLTextAreaElement',
    'HTMLLabelElement',
    'HTMLFieldSetElement',
    'HTMLLegendElement',
    'HTMLOptGroupElement',
    'HTMLOptionElement',
    'HTMLBRElement',
    'HTMLHRElement',
    'HTMLModElement',
    'HTMLQuoteElement',
    'HTMLOListElement',
    'HTMLDListElement',
    'HTMLDirectoryElement',
    'HTMLMenuElement',
    'HTMLTableCaptionElement',
    'HTMLTableColElement',
    'HTMLTableSectionElement',
    'HTMLTableRowElement',
    'HTMLTableCellElement',
    'Text',
    'Comment',
    'DocumentFragment',
    'HTMLDocument',
    'Document',
    'Element',
    'Node'
  ]);

  private readonly DETACHMENT_INDICATORS = [
    'removed',
    'detached',
    'orphaned',
    'disconnected',
    'stale',
    'zombie'
  ];

  analyze(snapshot: HeapSnapshot): DetachedDomAnalysisResult {
    const detachedNodes: DetachedDomNode[] = [];
    
    // Find all DOM nodes in the heap
    snapshot.nodes.forEach((node: HeapNode) => {
      if (this.isDomNode(node)) {
        const detachmentInfo = this.analyzeDetachment(node, snapshot);
        if (detachmentInfo.isDetached) {
          const detachedNode = this.createDetachedNodeInfo(node, detachmentInfo, snapshot);
          detachedNodes.push(detachedNode);
        }
      }
    });

    // Sort by retained size (largest first)
    detachedNodes.sort((a, b) => b.retainedSize - a.retainedSize);

    // Calculate summary metrics
    const totalMemoryWasted = detachedNodes.reduce((sum, node) => sum + node.retainedSize, 0);
    const severityBreakdown = this.calculateSeverityBreakdown(detachedNodes);
    const largestDetached = detachedNodes.slice(0, 10);

    return {
      totalDetachedElements: detachedNodes.length,
      detachedNodes,
      totalMemoryWasted,
      severityBreakdown,
      largestDetached,
      summary: this.generateSummary(detachedNodes, totalMemoryWasted),
      recommendations: this.generateRecommendations(detachedNodes)
    };
  }

  private isDomNode(node: HeapNode): boolean {
    // Check if node name matches DOM element patterns
    if (this.DOM_NODE_TYPES.has(node.name)) {
      return true;
    }

    // Check for DOM-like patterns in node name
    const domPatterns = [
      /^HTML\w+Element$/,
      /^SVG\w+Element$/,
      /^XML\w+Element$/,
      /Element$/,
      /^Text$/,
      /^Comment$/,
      /^Document/,
      /^Node$/
    ];

    return domPatterns.some(pattern => pattern.test(node.name));
  }

  private analyzeDetachment(node: HeapNode, snapshot: HeapSnapshot): {
    isDetached: boolean;
    reason: string;
    confidence: number;
    parentChain: string[];
  } {
    let isDetached = false;
    let reason = '';
    let confidence = 0;
    const parentChain: string[] = [];

    // Method 1: Check if node is not reachable from document
    const isReachableFromDocument = this.isReachableFromDocument(node, snapshot);
    if (!isReachableFromDocument) {
      isDetached = true;
      reason = 'Not reachable from document root';
      confidence += 40;
    }

    // Method 2: Check for detachment indicators in retainer path
    const retainerPath = this.getRetainerPath(node, snapshot);
    parentChain.push(...retainerPath);
    
    const hasDetachmentIndicators = retainerPath.some(path => 
      this.DETACHMENT_INDICATORS.some(indicator => 
        path.toLowerCase().includes(indicator)
      )
    );
    
    if (hasDetachmentIndicators) {
      isDetached = true;
      reason += (reason ? ' + ' : '') + 'Detachment indicators in retainer path';
      confidence += 30;
    }

    // Method 3: Check if parent is null or undefined  
    const hasNullParent = this.hasNullParent(node, snapshot);
    if (hasNullParent) {
      isDetached = true;
      reason += (reason ? ' + ' : '') + 'Parent node is null/undefined';
      confidence += 25;
    }

    // Method 4: Check if contained in detached collections
    const inDetachedCollection = this.isInDetachedCollection(node, snapshot);
    if (inDetachedCollection) {
      isDetached = true;
      reason += (reason ? ' + ' : '') + 'Contained in detached collection';
      confidence += 20;
    }

    return {
      isDetached,
      reason: reason || 'Unknown detachment pattern',
      confidence: Math.min(confidence, 100),
      parentChain
    };
  }

  private isReachableFromDocument(node: HeapNode, snapshot: HeapSnapshot): boolean {
    // Simple heuristic: check if there's a path to document/window objects
    const visited = new Set<number>();
    const queue = [node.id];
    let maxDepth = 20; // Limit search depth

    while (queue.length > 0 && maxDepth-- > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const currentNode = snapshot.nodes.find((n: HeapNode) => n.id === currentId);
      if (!currentNode) continue;

      // Check if we reached document/window
      if (this.isDocumentOrWindow(currentNode)) {
        return true;
      }

      // Add retainers to queue
      snapshot.edges?.forEach((edge: HeapEdge) => {
        if (edge.toNode === currentId && edge.type === 'element') {
          queue.push(edge.fromNode);
        }
      });
    }

    return false;
  }

  private isDocumentOrWindow(node: HeapNode): boolean {
    const documentPatterns = [
      'HTMLDocument',
      'Document', 
      'Window',
      'global',
      'document',
      'window'
    ];
    
    return documentPatterns.some(pattern => 
      node.name.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private getRetainerPath(node: HeapNode, snapshot: HeapSnapshot): string[] {
    const path: string[] = [];
    let currentId = node.id;
    let depth = 0;
    const maxDepth = 10;

    while (depth < maxDepth) {
      const retainer = snapshot.edges?.find((edge: HeapEdge) => edge.toNode === currentId);
      if (!retainer) break;

      const retainerNode = snapshot.nodes.find((n: HeapNode) => n.id === retainer.fromNode);
      if (!retainerNode) break;

      path.push(`${retainerNode.name}[${retainer.name || retainer.type}]`);
      currentId = retainer.fromNode;
      depth++;
    }

    return path;
  }

  private hasNullParent(node: HeapNode, snapshot: HeapSnapshot): boolean {
    const parentEdges = snapshot.edges?.filter((edge: HeapEdge) => 
      edge.toNode === node.id && 
      (edge.name === 'parentNode' || edge.name === 'parentElement')
    );
    
    if (!parentEdges || parentEdges.length === 0) {
      return true; // No parent found
    }

    return parentEdges.some((edge: HeapEdge) => {
      const parentNode = snapshot.nodes.find((n: HeapNode) => n.id === edge.fromNode);
      return !parentNode || parentNode.name === 'null' || parentNode.name === 'undefined';
    });
  }

  private isInDetachedCollection(node: HeapNode, snapshot: HeapSnapshot): boolean {
    // Check if node is in an array/collection that seems detached
    const containerEdges = snapshot.edges?.filter((edge: HeapEdge) => edge.toNode === node.id);
    
    return containerEdges?.some((edge: HeapEdge) => {
      const container = snapshot.nodes.find((n: HeapNode) => n.id === edge.fromNode);
      if (!container) return false;

      // Check for detached collection indicators
      return this.DETACHMENT_INDICATORS.some(indicator =>
        container.name.toLowerCase().includes(indicator)
      );
    }) || false;
  }

  private createDetachedNodeInfo(
    node: HeapNode, 
    detachmentInfo: any, 
    snapshot: HeapSnapshot
  ): DetachedDomNode {
    const tagName = this.extractTagName(node);
    const className = this.extractClassName(node, snapshot);
    
    return {
      id: node.id,
      name: node.name,
      className,
      tagName,
      retainedSize: node.retainedSize || 0,
      shallowSize: node.shallowSize || node.selfSize || 0,
      confidence: detachmentInfo.confidence,
      severity: this.calculateSeverity(node, detachmentInfo.confidence),
      detachmentReason: detachmentInfo.reason,
      parentChain: detachmentInfo.parentChain
    };
  }

  private extractTagName(node: HeapNode): string {
    // Extract tag name from node name (e.g., HTMLDivElement -> div)
    const match = node.name.match(/HTML(\w+)Element/);
    if (match) {
      return match[1].toLowerCase();
    }
    
    // Handle other patterns
    if (node.name === 'Text') return '#text';
    if (node.name === 'Comment') return '#comment';
    if (node.name.includes('Element')) {
      return node.name.replace('Element', '').toLowerCase();
    }
    
    return node.name.toLowerCase();
  }

  private extractClassName(node: HeapNode, snapshot: HeapSnapshot): string {
    // Try to find className property
    const classNameEdge = snapshot.edges?.find((edge: HeapEdge) => 
      edge.fromNode === node.id && edge.name === 'className'
    );
    
    if (classNameEdge) {
      const classNode = snapshot.nodes.find((n: HeapNode) => n.id === classNameEdge.toNode);
      if (classNode && classNode.name !== 'undefined') {
        return classNode.name;
      }
    }
    
    return '';
  }

  private calculateSeverity(node: HeapNode, confidence: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const size = node.retainedSize || 0;
    
    if (confidence >= 80 && size > 1024 * 1024) return 'CRITICAL'; // >1MB + high confidence
    if (confidence >= 70 && size > 512 * 1024) return 'HIGH';     // >512KB + good confidence
    if (confidence >= 60 && size > 100 * 1024) return 'MEDIUM';   // >100KB + ok confidence
    if (size > 1024 * 1024) return 'HIGH';                        // >1MB regardless
    if (size > 256 * 1024) return 'MEDIUM';                       // >256KB
    
    return 'LOW';
  }

  private calculateSeverityBreakdown(detachedNodes: DetachedDomNode[]): Record<string, number> {
    const breakdown = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    
    detachedNodes.forEach(node => {
      breakdown[node.severity]++;
    });
    
    return breakdown;
  }

  private generateSummary(detachedNodes: DetachedDomNode[], totalMemory: number): string {
    if (detachedNodes.length === 0) {
      return '✅ No detached DOM elements detected';
    }

    const critical = detachedNodes.filter(n => n.severity === 'CRITICAL').length;
    const high = detachedNodes.filter(n => n.severity === 'HIGH').length;
    const memoryMB = (totalMemory / (1024 * 1024)).toFixed(1);

    if (critical > 0) {
      return `🚨 CRITICAL: ${critical} detached DOM elements found! Total: ${detachedNodes.length} elements wasting ${memoryMB} MB`;
    } else if (high > 0) {
      return `⚠️ HIGH: ${high} detached DOM elements found. Total: ${detachedNodes.length} elements wasting ${memoryMB} MB`;
    } else {
      return `⚠️ ${detachedNodes.length} detached DOM elements found, wasting ${memoryMB} MB`;
    }
  }

  private generateRecommendations(detachedNodes: DetachedDomNode[]): string[] {
    const recommendations: string[] = [];
    
    if (detachedNodes.length === 0) {
      recommendations.push('✅ No detached DOM cleanup needed');
      return recommendations;
    }

    // General recommendations
    recommendations.push('🔍 Use DevTools Elements panel to verify DOM attachments');
    recommendations.push('🧹 Remove event listeners before removing DOM elements');
    recommendations.push('📝 Set element references to null after removal');
    
    // Specific recommendations based on detected elements
    const elementTypes = new Set(detachedNodes.map(n => n.tagName));
    
    if (elementTypes.has('canvas')) {
      recommendations.push('🎨 Clear canvas contexts and dispose WebGL resources');
    }
    
    if (elementTypes.has('video') || elementTypes.has('audio')) {
      recommendations.push('🎵 Call pause() and remove src before disposal');
    }
    
    if (elementTypes.has('iframe')) {
      recommendations.push('🖼️ Clear iframe src and remove from DOM properly');
    }

    // Memory-specific recommendations
    const largeElements = detachedNodes.filter(n => n.retainedSize > 1024 * 1024);
    if (largeElements.length > 0) {
      recommendations.push(`💾 ${largeElements.length} large detached elements need immediate cleanup`);
    }

    return recommendations;
  }
}