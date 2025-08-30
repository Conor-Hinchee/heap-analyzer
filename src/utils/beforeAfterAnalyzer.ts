import { HeapNode } from './heapAnalyzer.js';

export interface ComparisonResult {
  memoryGrowth: {
    totalGrowth: number;
    percentageGrowth: number;
    beforeSize: number;
    afterSize: number;
  };
  newObjects: {
    node: HeapNode;
    retainerPath: string[];
    confidence: number;
    category: string;
    size: number;
  }[];
  grownObjects: {
    node: HeapNode;
    beforeSize: number;
    afterSize: number;
    growth: number;
    confidence: number;
  }[];
  potentialLeaks: {
    type: 'detached_dom' | 'closure' | 'timer' | 'array' | 'object';
    nodes: HeapNode[];
    description: string;
    confidence: number;
    suggestedFix: string;
  }[];
  summary: {
    leakConfidence: 'high' | 'medium' | 'low';
    primaryConcerns: string[];
    recommendations: string[];
  };
}

export class BeforeAfterAnalyzer {
  private beforeSnapshot: any;
  private afterSnapshot: any;

  constructor(beforeSnapshotData: any, afterSnapshotData: any) {
    this.beforeSnapshot = beforeSnapshotData;
    this.afterSnapshot = afterSnapshotData;
  }

  async analyze(): Promise<ComparisonResult> {
    // Build object maps for comparison
    const beforeObjects = this.buildObjectMap(this.beforeSnapshot);
    const afterObjects = this.buildObjectMap(this.afterSnapshot);

    // Calculate memory growth
    const memoryGrowth = this.calculateMemoryGrowth();

    // Find new objects (exist in after but not before)
    const newObjects = await this.findNewObjects(beforeObjects, afterObjects);

    // Find objects that grew significantly
    const grownObjects = this.findGrownObjects(beforeObjects, afterObjects);

    // Detect potential leaks using our existing logic + comparison
    const potentialLeaks = await this.detectLeaks(newObjects, grownObjects);

    // Generate summary and recommendations
    const summary = this.generateSummary(memoryGrowth, newObjects, potentialLeaks);

    return {
      memoryGrowth,
      newObjects,
      grownObjects,
      potentialLeaks,
      summary,
    };
  }

  private buildObjectMap(snapshot: any): Map<string, HeapNode> {
    const objectMap = new Map<string, HeapNode>();
    
    if (!snapshot.nodes || !snapshot.strings) {
      return objectMap;
    }

    // Parse nodes from snapshot format
    const nodeFields = snapshot.snapshot.meta.node_fields;
    const nodeTypes = snapshot.snapshot.meta.node_types;
    const nodeCount = snapshot.nodes.length / nodeFields.length;
    
    for (let i = 0; i < nodeCount; i++) {
      const nodeIndex = i * nodeFields.length;
      const node: HeapNode = {
        nodeIndex: i,
        type: snapshot.strings[snapshot.nodes[nodeIndex + nodeFields.indexOf('type')]] || 'unknown',
        name: snapshot.strings[snapshot.nodes[nodeIndex + nodeFields.indexOf('name')]] || 'unknown',
        selfSize: snapshot.nodes[nodeIndex + nodeFields.indexOf('self_size')] || 0,
        retainedSize: snapshot.nodes[nodeIndex + nodeFields.indexOf('retained_size')] || 0,
        id: snapshot.nodes[nodeIndex + nodeFields.indexOf('id')] || 0,
      };

      // Create a unique identifier for objects
      const key = this.createObjectKey(node);
      objectMap.set(key, node);
    }

    return objectMap;
  }

  private createObjectKey(node: HeapNode): string {
    // Create a key that can identify the "same" object across snapshots
    // This is imperfect but works for most cases
    return `${node.type}:${node.name}:${node.selfSize}`;
  }

  private calculateMemoryGrowth() {
    const beforeSize = this.getTotalHeapSize(this.beforeSnapshot);
    const afterSize = this.getTotalHeapSize(this.afterSnapshot);
    
    const totalGrowth = afterSize - beforeSize;
    const percentageGrowth = beforeSize > 0 ? (totalGrowth / beforeSize) * 100 : 0;

    return {
      totalGrowth,
      percentageGrowth,
      beforeSize,
      afterSize,
    };
  }

  private getTotalHeapSize(snapshot: any): number {
    if (!snapshot.nodes || !snapshot.snapshot?.meta?.node_fields) {
      return 0;
    }

    const nodeFields = snapshot.snapshot.meta.node_fields;
    const selfSizeIndex = nodeFields.indexOf('self_size');
    const nodeCount = snapshot.nodes.length / nodeFields.length;
    
    let totalSize = 0;
    for (let i = 0; i < nodeCount; i++) {
      const nodeIndex = i * nodeFields.length;
      totalSize += snapshot.nodes[nodeIndex + selfSizeIndex] || 0;
    }

    return totalSize;
  }

  private async findNewObjects(
    beforeObjects: Map<string, HeapNode>,
    afterObjects: Map<string, HeapNode>
  ) {
    const newObjects = [];
    
    for (const [key, afterNode] of afterObjects) {
      if (!beforeObjects.has(key) && afterNode.selfSize > 1024) { // Only consider objects > 1KB
        // This object exists in after but not before - potential leak
        const category = this.categorizeObject(afterNode);
        const retainerPath: string[] = []; // Simplified for now
        
        // Calculate confidence based on size, type, and retainer path
        const confidence = this.calculateLeakConfidence(afterNode, category, retainerPath);
        
        newObjects.push({
          node: afterNode,
          retainerPath,
          confidence,
          category,
          size: afterNode.selfSize,
        });
      }
    }

    // Sort by confidence and size
    return newObjects
      .sort((a, b) => b.confidence - a.confidence || b.size - a.size)
      .slice(0, 50); // Limit to top 50 for performance
  }

  private findGrownObjects(
    beforeObjects: Map<string, HeapNode>,
    afterObjects: Map<string, HeapNode>
  ) {
    const grownObjects = [];
    
    for (const [key, afterNode] of afterObjects) {
      const beforeNode = beforeObjects.get(key);
      if (beforeNode && afterNode.selfSize > beforeNode.selfSize) {
        const growth = afterNode.selfSize - beforeNode.selfSize;
        // Only care about significant growth
        if (growth > 1024) { // More than 1KB growth
          const confidence = Math.min((growth / beforeNode.selfSize) * 100, 100);
          
          grownObjects.push({
            node: afterNode,
            beforeSize: beforeNode.selfSize,
            afterSize: afterNode.selfSize,
            growth,
            confidence,
          });
        }
      }
    }

    return grownObjects
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20); // Top 20 grown objects
  }

  private async detectLeaks(newObjects: any[], grownObjects: any[]) {
    const potentialLeaks = [];

    // Detect DOM-related leaks
    const domLeaks = newObjects.filter(obj => obj.category === 'DOM' && obj.confidence > 50);
    if (domLeaks.length > 0) {
      potentialLeaks.push({
        type: 'detached_dom' as const,
        nodes: domLeaks.map(leak => leak.node),
        description: `Found ${domLeaks.length} new DOM objects that may be detached`,
        confidence: Math.min(domLeaks.reduce((sum, leak) => sum + leak.confidence, 0) / domLeaks.length, 90),
        suggestedFix: 'Remove event listeners and clear references to DOM elements before removing them from the document',
      });
    }

    // Detect closure leaks from new objects
    const closureLeaks = newObjects.filter(obj => obj.category === 'CLOSURE' && obj.confidence > 60);
    if (closureLeaks.length > 0) {
      potentialLeaks.push({
        type: 'closure' as const,
        nodes: closureLeaks.map(leak => leak.node),
        description: `${closureLeaks.length} new closures detected, potentially capturing large scopes`,
        confidence: Math.min(closureLeaks.reduce((sum, leak) => sum + leak.confidence, 0) / closureLeaks.length, 90),
        suggestedFix: 'Review closures for unnecessary variable captures, use React.useCallback, or clear references',
      });
    }

    // Detect array growth patterns
    const arrayGrowth = grownObjects.filter(obj => 
      this.categorizeObject(obj.node) === 'ARRAY' && obj.growth > 10240 // 10KB
    );
    if (arrayGrowth.length > 0) {
      potentialLeaks.push({
        type: 'array' as const,
        nodes: arrayGrowth.map(growth => growth.node),
        description: `${arrayGrowth.length} arrays grew significantly, possibly accumulating data`,
        confidence: Math.min(arrayGrowth.reduce((sum, growth) => sum + growth.confidence, 0) / arrayGrowth.length, 85),
        suggestedFix: 'Implement cleanup logic for arrays, use pagination, or clear old data',
      });
    }

    // Detect large new objects
    const largeObjects = newObjects.filter(obj => obj.size > 100 * 1024 && obj.confidence > 40); // > 100KB
    if (largeObjects.length > 0) {
      potentialLeaks.push({
        type: 'object' as const,
        nodes: largeObjects.map(obj => obj.node),
        description: `${largeObjects.length} large new objects created (${(largeObjects.reduce((sum, obj) => sum + obj.size, 0) / 1024 / 1024).toFixed(1)}MB total)`,
        confidence: Math.min(largeObjects.reduce((sum, obj) => sum + obj.confidence, 0) / largeObjects.length, 80),
        suggestedFix: 'Review object lifecycle and ensure proper cleanup when objects are no longer needed',
      });
    }

    return potentialLeaks.sort((a, b) => b.confidence - a.confidence);
  }

  private categorizeObject(node: HeapNode): string {
    const name = node.name || '';
    const type = node.type || '';
    
    // Enhanced DOM detection
    if (name.startsWith('HTML') || name.includes('Element') || name.includes('Node') || 
        type.includes('Element') || type.includes('Node')) {
      return 'DOM';
    }
    if (name.includes('Fiber') || name.includes('React')) {
      return 'REACT';
    }
    if (type === 'closure' || name.includes('Closure')) {
      return 'CLOSURE';
    }
    if (type === 'array' || name === 'Array') {
      return 'ARRAY';
    }
    if (name.includes('Promise') || name.includes('async')) {
      return 'ASYNC';
    }
    if (type === 'function' || name.includes('Function')) {
      return 'FUNCTION';
    }
    
    return 'OBJECT';
  }

  private calculateLeakConfidence(node: HeapNode, category: string, retainerPath: string[]): number {
    let confidence = 20; // Base confidence

    // Size-based confidence
    if (node.selfSize > 1024 * 1024) confidence += 30; // > 1MB
    else if (node.selfSize > 100 * 1024) confidence += 20; // > 100KB
    else if (node.selfSize > 10 * 1024) confidence += 10; // > 10KB

    // Category-based confidence
    switch (category) {
      case 'DOM':
        confidence += 25; // DOM objects are often leaked
        break;
      case 'CLOSURE':
        confidence += 20; // Closures often leak
        break;
      case 'ARRAY':
        confidence += 15; // Arrays can accumulate
        break;
      case 'FUNCTION':
        confidence += 10; // Functions can leak via closures
        break;
    }

    // Retainer path analysis
    const hasGlobalRetainer = retainerPath.some(path => 
      path.includes('Window') || path.includes('global') || path.includes('document')
    );
    if (hasGlobalRetainer) confidence += 20;

    return Math.min(confidence, 95); // Cap at 95%
  }

  private generateSummary(memoryGrowth: any, newObjects: any[], potentialLeaks: any[]) {
    const highConfidenceLeaks = potentialLeaks.filter(leak => leak.confidence > 70);
    const totalNewObjectsSize = newObjects.reduce((sum, obj) => sum + obj.size, 0);
    
    let leakConfidence: 'high' | 'medium' | 'low' = 'low';
    if (highConfidenceLeaks.length > 0 || memoryGrowth.percentageGrowth > 50) {
      leakConfidence = 'high';
    } else if (potentialLeaks.length > 0 || memoryGrowth.percentageGrowth > 20) {
      leakConfidence = 'medium';
    }

    const primaryConcerns = [];
    const recommendations = [];

    if (memoryGrowth.totalGrowth > 5 * 1024 * 1024) { // > 5MB growth
      primaryConcerns.push(`Large memory growth: ${(memoryGrowth.totalGrowth / 1024 / 1024).toFixed(1)}MB`);
    }

    if (potentialLeaks.length > 0) {
      primaryConcerns.push(`${potentialLeaks.length} potential leak sources detected`);
      recommendations.push('Focus on the highest confidence leaks first');
    }

    if (newObjects.length > 100) {
      primaryConcerns.push(`${newObjects.length} new objects created`);
      recommendations.push('Review object lifecycle and cleanup patterns');
    }

    if (totalNewObjectsSize > 10 * 1024 * 1024) { // > 10MB of new objects
      primaryConcerns.push(`${(totalNewObjectsSize / 1024 / 1024).toFixed(1)}MB of new objects created`);
      recommendations.push('Large amount of new memory allocated - check for memory retention');
    }

    if (recommendations.length === 0) {
      if (leakConfidence === 'low') {
        recommendations.push('Memory usage appears stable - no immediate action needed');
      } else {
        recommendations.push('Monitor memory usage patterns and repeat analysis');
      }
    }

    return {
      leakConfidence,
      primaryConcerns,
      recommendations,
    };
  }
}
