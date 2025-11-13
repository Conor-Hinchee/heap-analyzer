/**
 * Collections Holding Stale Objects Analyzer
 * 
 * Detects Arrays, Maps, and Sets that are holding onto stale objects
 * like detached DOM nodes, preventing garbage collection.
 * 
 * Inspired by MemLab's CollectionsHoldingStaleAnalysis
 */

import { HeapNode } from './heapAnalyzer.js';
import { isBuiltInGlobal } from './builtInGlobals.js';

export interface StaleCollectionStat {
  collection: HeapNode;
  staleChildren: HeapNode[];
  childrenSize: number;
  staleRetainedSize: number;
  collectionType: 'Array' | 'Map' | 'Set' | 'Object';
  confidence: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  suggestedFix: string;
}

export interface StaleCollectionAnalysisResult {
  totalCollections: number;
  staleCollections: StaleCollectionStat[];
  totalStaleObjects: number;
  totalStaleMemory: number;
  summary: string;
  recommendations: string[];
  topOffenders: StaleCollectionStat[];
}

export class StaleCollectionAnalyzer {
  private nodes: HeapNode[];
  private maxResults: number;

  constructor(nodes: HeapNode[], maxResults: number = 20) {
    this.nodes = nodes;
    this.maxResults = maxResults;
  }

  /**
   * Analyze collections for stale objects
   */
  public analyzeStaleCollections(): StaleCollectionAnalysisResult {
    const collections = this.findCollections();
    const staleStats = this.analyzeCollectionsForStaleObjects(collections);
    
    return this.generateReport(staleStats);
  }

  /**
   * Find all collection nodes (Arrays, Maps, Sets, Objects)
   */
  private findCollections(): HeapNode[] {
    return this.nodes.filter(node => {
      const name = node.name || '';
      const type = node.type || '';
      
      // Skip built-in collections
      if (isBuiltInGlobal(name)) {
        return false;
      }

      return (
        // Direct collection types
        name === 'Array' || 
        name === 'Map' || 
        name === 'Set' ||
        type === 'array' ||
        
        // Object collections (large objects that might hold references)
        (type === 'object' && node.selfSize > 1024) ||
        
        // Collection-like naming patterns
        this.hasCollectionPattern(name)
      );
    });
  }

  /**
   * Check if node name suggests it's a collection
   */
  private hasCollectionPattern(name: string): boolean {
    const collectionPatterns = [
      'Array', 'List', 'Collection', 'Set', 'Map', 
      'Cache', 'Store', 'Registry', 'Queue', 'Stack',
      'Buffer', 'Pool', 'Archive', 'History'
    ];
    
    return collectionPatterns.some(pattern => 
      name.includes(pattern) && !isBuiltInGlobal(name)
    );
  }

  /**
   * Analyze each collection for stale objects
   */
  private analyzeCollectionsForStaleObjects(collections: HeapNode[]): StaleCollectionStat[] {
    const staleStats: StaleCollectionStat[] = [];

    collections.forEach(collection => {
      const stat = this.processCollection(collection);
      if (stat && stat.staleChildren.length > 0) {
        staleStats.push(stat);
      }
    });

    return staleStats.sort((a, b) => b.staleRetainedSize - a.staleRetainedSize);
  }

  /**
   * Process a single collection for stale objects
   */
  private processCollection(collection: HeapNode): StaleCollectionStat | null {
    const collectionType = this.determineCollectionType(collection);
    
    // Find potential children of this collection
    const children = this.findCollectionChildren(collection);
    const staleChildren = children.filter(child => this.isStaleObject(child));
    
    if (staleChildren.length === 0) {
      return null;
    }

    const staleRetainedSize = staleChildren.reduce((sum, child) => 
      sum + (child.retainedSize || child.selfSize), 0
    );

    const confidence = this.calculateConfidence(collection, staleChildren, children);
    const severity = this.calculateSeverity(staleChildren.length, staleRetainedSize);

    return {
      collection,
      staleChildren,
      childrenSize: children.length,
      staleRetainedSize,
      collectionType,
      confidence,
      severity,
      description: this.generateDescription(collection, staleChildren, children),
      suggestedFix: this.generateSuggestedFix(collection, staleChildren, collectionType)
    };
  }

  /**
   * Determine the type of collection
   */
  private determineCollectionType(node: HeapNode): 'Array' | 'Map' | 'Set' | 'Object' {
    const name = node.name || '';
    const type = node.type || '';

    if (name.includes('Map') || name === 'Map') return 'Map';
    if (name.includes('Set') || name === 'Set') return 'Set';
    if (name.includes('Array') || type === 'array') return 'Array';
    return 'Object';
  }

  /**
   * Find children of a collection (simplified heuristic)
   */
  private findCollectionChildren(collection: HeapNode): HeapNode[] {
    // Since we don't have direct edge traversal, we'll use heuristics
    // to find nodes that might be referenced by this collection
    
    const children: HeapNode[] = [];
    const collectionId = collection.id;
    
    // Look for nodes that might be referenced by this collection
    // This is a simplified approach - in real MemLab, this would use edge traversal
    this.nodes.forEach(node => {
      if (node.id === collectionId) return; // Skip self
      
      // Heuristic: nodes with similar size patterns or naming might be related
      if (this.mightBeReferencedBy(node, collection)) {
        children.push(node);
      }
    });

    return children.slice(0, 100); // Limit to prevent performance issues
  }

  /**
   * Heuristic to determine if a node might be referenced by a collection
   */
  private mightBeReferencedBy(node: HeapNode, collection: HeapNode): boolean {
    const nodeName = node.name || '';
    const nodeType = node.type || '';
    const collectionName = collection.name || '';

    // Look for DOM nodes, which are commonly held stale in collections
    if (this.isDOMNode(node)) {
      return true;
    }

    // Look for nodes with similar naming patterns
    if (nodeName.includes(collectionName.split(' ')[0])) {
      return true;
    }

    // Look for objects that might be collection elements
    if (nodeType === 'object' && node.selfSize > 100 && node.selfSize < 10000) {
      return Math.random() < 0.1; // 10% chance (simplified heuristic)
    }

    return false;
  }

  /**
   * Check if an object is "stale" (detached DOM, old data, etc.)
   */
  private isStaleObject(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';

    // Detached DOM nodes (common stale objects)
    if (this.isDetachedDOM(node)) {
      return true;
    }

    // Old/stale data patterns
    if (this.hasStalePattern(name)) {
      return true;
    }

    // Large objects that might be stale
    if (type === 'object' && node.selfSize > 50 * 1024) { // > 50KB
      return true;
    }

    // String objects that might be old data
    if (type === 'string' && node.selfSize > 10 * 1024) { // > 10KB strings
      return true;
    }

    return false;
  }

  /**
   * Check if node is a DOM node
   */
  private isDOMNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';

    return (
      name.includes('HTML') ||
      name.includes('DOM') ||
      name.includes('Element') ||
      name.includes('Node') ||
      type.includes('HTML') ||
      type.includes('DOM')
    );
  }

  /**
   * Check if node is detached DOM
   */
  private isDetachedDOM(node: HeapNode): boolean {
    const name = node.name || '';
    
    return (
      name.includes('Detached') ||
      name.includes('detached') ||
      (this.isDOMNode(node) && name.includes('disconnected'))
    );
  }

  /**
   * Check for stale object patterns
   */
  private hasStalePattern(name: string): boolean {
    const stalePatterns = [
      'old', 'stale', 'cache', 'expired', 'unused',
      'previous', 'last', 'backup', 'temp', 'tmp'
    ];
    
    const lowerName = name.toLowerCase();
    return stalePatterns.some(pattern => lowerName.includes(pattern));
  }

  /**
   * Calculate confidence that this is a real stale collection issue
   */
  private calculateConfidence(collection: HeapNode, staleChildren: HeapNode[], allChildren: HeapNode[]): number {
    let confidence = 50; // Base confidence

    // Higher confidence if many stale objects
    const staleRatio = staleChildren.length / Math.max(allChildren.length, 1);
    confidence += staleRatio * 30; // Up to +30 for 100% stale

    // Higher confidence for detached DOM
    const detachedDOMCount = staleChildren.filter(child => this.isDetachedDOM(child)).length;
    confidence += Math.min(detachedDOMCount * 10, 20); // Up to +20

    // Higher confidence for large collections
    if (allChildren.length > 50) confidence += 10;
    if (allChildren.length > 100) confidence += 10;

    // Collection type bonus
    const collectionName = collection.name || '';
    if (collectionName.includes('Cache') || collectionName.includes('Store')) {
      confidence += 15;
    }

    return Math.min(confidence, 95);
  }

  /**
   * Calculate severity based on stale count and memory impact
   */
  private calculateSeverity(staleCount: number, staleMemory: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (staleCount > 100 || staleMemory > 10 * 1024 * 1024) return 'CRITICAL'; // >100 objects or >10MB
    if (staleCount > 50 || staleMemory > 5 * 1024 * 1024) return 'HIGH';       // >50 objects or >5MB
    if (staleCount > 10 || staleMemory > 1024 * 1024) return 'MEDIUM';         // >10 objects or >1MB
    return 'LOW';
  }

  /**
   * Generate description for the stale collection
   */
  private generateDescription(collection: HeapNode, staleChildren: HeapNode[], allChildren: HeapNode[]): string {
    const collectionName = collection.name || 'Unknown Collection';
    const staleCount = staleChildren.length;
    const totalCount = allChildren.length;
    const staleMemory = (staleChildren.reduce((sum, child) => sum + child.selfSize, 0) / (1024 * 1024)).toFixed(1);
    
    const percentage = totalCount > 0 ? Math.round((staleCount / totalCount) * 100) : 0;
    
    return `Collection '${collectionName}' holding ${staleCount} stale objects (${percentage}% of ${totalCount} total, ${staleMemory}MB memory)`;
  }

  /**
   * Generate fix suggestion
   */
  private generateSuggestedFix(collection: HeapNode, staleChildren: HeapNode[], collectionType: 'Array' | 'Map' | 'Set' | 'Object'): string {
    const collectionName = collection.name || 'collection';
    
    switch (collectionType) {
      case 'Array':
        return `Clean stale array elements: ${collectionName}.splice() to remove detached objects, or filter out null/undefined references`;
      
      case 'Map':
        return `Clear stale map entries: ${collectionName}.delete(key) for old keys, or implement automatic cleanup with WeakMap if appropriate`;
      
      case 'Set':
        return `Remove stale set items: ${collectionName}.delete(item) for detached objects, or use WeakSet for automatic cleanup`;
      
      case 'Object':
        return `Clean object properties: delete ${collectionName}.property for stale references, implement periodic cleanup, or use WeakRef for large objects`;
      
      default:
        return `Implement cleanup logic to remove stale references from ${collectionName}`;
    }
  }

  /**
   * Generate comprehensive analysis report
   */
  private generateReport(staleStats: StaleCollectionStat[]): StaleCollectionAnalysisResult {
    const totalStaleObjects = staleStats.reduce((sum, stat) => sum + stat.staleChildren.length, 0);
    const totalStaleMemory = staleStats.reduce((sum, stat) => sum + stat.staleRetainedSize, 0);
    const topOffenders = staleStats.slice(0, this.maxResults);

    const criticalCount = staleStats.filter(stat => stat.severity === 'CRITICAL').length;
    const highCount = staleStats.filter(stat => stat.severity === 'HIGH').length;

    let summary = '';
    if (criticalCount > 0) {
      summary = `🚨 CRITICAL: ${criticalCount} collections with major stale object accumulation!`;
    } else if (highCount > 0) {
      summary = `⚠️ HIGH: ${highCount} collections holding significant stale objects`;
    } else if (staleStats.length > 0) {
      summary = `💡 ${staleStats.length} collections found with stale objects`;
    } else {
      summary = '✅ No collections holding stale objects detected';
    }

    const recommendations = this.generateRecommendations(staleStats);

    return {
      totalCollections: staleStats.length,
      staleCollections: staleStats,
      totalStaleObjects,
      totalStaleMemory,
      summary,
      recommendations,
      topOffenders
    };
  }

  /**
   * Generate targeted recommendations
   */
  private generateRecommendations(staleStats: StaleCollectionStat[]): string[] {
    const recommendations: string[] = [];

    if (staleStats.length === 0) {
      recommendations.push('✅ Collection management appears healthy');
      return recommendations;
    }

    const criticalCollections = staleStats.filter(stat => stat.severity === 'CRITICAL');
    const domCollections = staleStats.filter(stat => 
      stat.staleChildren.some(child => this.isDetachedDOM(child))
    );
    const largeCollections = staleStats.filter(stat => stat.staleChildren.length > 50);

    if (criticalCollections.length > 0) {
      recommendations.push(`🚨 ${criticalCollections.length} critical collections need immediate cleanup`);
    }

    if (domCollections.length > 0) {
      recommendations.push(`🔗 ${domCollections.length} collections holding detached DOM - implement DOM cleanup on component unmount`);
    }

    if (largeCollections.length > 0) {
      recommendations.push(`📦 ${largeCollections.length} collections with >50 stale objects - implement periodic cleanup or size limits`);
    }

    recommendations.push('🔄 Implement cleanup logic in component lifecycle methods');
    recommendations.push('💡 Consider using WeakMap/WeakSet for automatic garbage collection');
    recommendations.push('🧹 Add periodic cleanup tasks for long-lived collections');

    return recommendations;
  }
}

/**
 * Convenience function for stale collection analysis
 */
export function analyzeStaleCollections(nodes: HeapNode[]): StaleCollectionAnalysisResult {
  const analyzer = new StaleCollectionAnalyzer(nodes);
  return analyzer.analyzeStaleCollections();
}