/**
 * Collection Unbound Growth Analyzer
 * 
 * Tracks collections (Maps, Sets, Arrays, Objects) across multiple snapshots
 * to detect unbounded growth patterns that indicate memory leaks.
 * 
 * Inspired by MemLab's CollectionUnboundGrowthAnalysis
 */

import { HeapNode } from './heapAnalyzer.js';
import { isBuiltInGlobal } from './builtInGlobals.js';

export interface CollectionGrowthInfo {
  id: number;
  type: string;
  name: string;
  collectionType: 'Array' | 'Map' | 'Set' | 'Object' | 'Unknown';
  initialSize: number;
  currentSize: number;
  maxSize: number;
  minSize: number;
  growthHistory: number[];
  growthRate: number;
  totalGrowth: number;
  isMonotonic: boolean;
  confidence: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  node: HeapNode;
  description: string;
  suggestedFix: string;
}

export interface UnboundGrowthAnalysisResult {
  totalGrowingCollections: number;
  unboundedCollections: CollectionGrowthInfo[];
  topGrowers: CollectionGrowthInfo[];
  totalMemoryGrowth: number;
  averageGrowthRate: number;
  summary: string;
  recommendations: string[];
  criticalCollections: CollectionGrowthInfo[];
}

export class UnboundGrowthAnalyzer {
  private collectionHistory: Map<number, CollectionGrowthInfo> = new Map();
  private snapshotCount: number = 0;
  private monotonicOnly: boolean = false; // Track only monotonic growth

  constructor(monotonicOnly: boolean = false) {
    this.monotonicOnly = monotonicOnly;
  }

  /**
   * Process a snapshot and track collection growth
   */
  public processSnapshot(nodes: HeapNode[]): void {
    this.snapshotCount++;
    
    if (this.snapshotCount === 1) {
      // First snapshot - initialize tracking
      this.initializeCollectionTracking(nodes);
    } else {
      // Subsequent snapshots - update growth tracking
      this.updateCollectionGrowth(nodes);
    }
  }

  /**
   * Get the final analysis results
   */
  public getAnalysisResults(): UnboundGrowthAnalysisResult {
    const growingCollections = this.filterGrowingCollections();
    return this.generateReport(growingCollections);
  }

  /**
   * Initialize collection tracking from first snapshot
   */
  private initializeCollectionTracking(nodes: HeapNode[]): void {
    nodes.forEach(node => {
      if (this.isCollectionNode(node)) {
        const fanout = this.getCollectionFanout(node);
        const growthInfo: CollectionGrowthInfo = {
          id: node.id,
          type: node.type || 'unknown',
          name: node.name || 'unnamed',
          collectionType: this.determineCollectionType(node),
          initialSize: fanout,
          currentSize: fanout,
          maxSize: fanout,
          minSize: fanout,
          growthHistory: [fanout],
          growthRate: 0,
          totalGrowth: 0,
          isMonotonic: true,
          confidence: 50,
          severity: 'LOW',
          node: node,
          description: '',
          suggestedFix: ''
        };
        
        this.collectionHistory.set(node.id, growthInfo);
      }
    });
  }

  /**
   * Update collection growth tracking for subsequent snapshots
   */
  private updateCollectionGrowth(nodes: HeapNode[]): void {
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    
    // Update existing collections
    for (const [id, info] of this.collectionHistory.entries()) {
      const currentNode = nodeMap.get(id);
      
      if (!currentNode) {
        // Collection no longer exists - mark for removal
        this.collectionHistory.delete(id);
        continue;
      }

      // Verify it's still the same collection
      if (currentNode.name !== info.name || currentNode.type !== info.type) {
        this.collectionHistory.delete(id);
        continue;
      }

      const currentFanout = this.getCollectionFanout(currentNode);
      
      // Check monotonic growth requirement
      if (this.monotonicOnly && currentFanout < info.maxSize) {
        this.collectionHistory.delete(id);
        continue;
      }

      // Update growth information
      info.currentSize = currentFanout;
      info.maxSize = Math.max(info.maxSize, currentFanout);
      info.minSize = Math.min(info.minSize, currentFanout);
      info.growthHistory.push(currentFanout);
      info.totalGrowth = info.currentSize - info.initialSize;
      info.isMonotonic = info.isMonotonic && (currentFanout >= info.growthHistory[info.growthHistory.length - 2]);
      info.growthRate = this.calculateGrowthRate(info.growthHistory);
      info.node = currentNode; // Update to latest node
      
      // Update severity and confidence
      info.confidence = this.calculateConfidence(info);
      info.severity = this.calculateSeverity(info);
      info.description = this.generateDescription(info);
      info.suggestedFix = this.generateSuggestedFix(info);
    }
  }

  /**
   * Check if a node represents a collection
   */
  private isCollectionNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    // Skip built-in globals
    if (isBuiltInGlobal(name)) {
      return false;
    }

    // Direct collection types
    if (name === 'Array' || name === 'Map' || name === 'Set') {
      return true;
    }

    if (type === 'array') {
      return true;
    }

    // Collection-like patterns
    if (this.hasCollectionPattern(name)) {
      return true;
    }

    // Large objects that might be collections
    if (type === 'object' && node.selfSize > 1024) {
      return true;
    }

    return false;
  }

  /**
   * Check for collection naming patterns
   */
  private hasCollectionPattern(name: string): boolean {
    const collectionPatterns = [
      'Array', 'List', 'Collection', 'Set', 'Map',
      'Cache', 'Store', 'Registry', 'Queue', 'Stack',
      'Buffer', 'Pool', 'Archive', 'History', 'Log'
    ];
    
    return collectionPatterns.some(pattern => 
      name.includes(pattern) && !isBuiltInGlobal(name)
    );
  }

  /**
   * Determine the type of collection
   */
  private determineCollectionType(node: HeapNode): 'Array' | 'Map' | 'Set' | 'Object' | 'Unknown' {
    const name = node.name || '';
    const type = node.type || '';

    if (name.includes('Map') || name === 'Map') return 'Map';
    if (name.includes('Set') || name === 'Set') return 'Set';
    if (name.includes('Array') || type === 'array') return 'Array';
    if (type === 'object') return 'Object';
    return 'Unknown';
  }

  /**
   * Get the "fanout" (number of elements) in a collection
   * This is a simplified version of MemLab's getCollectionFanout
   */
  private getCollectionFanout(node: HeapNode): number {
    // For our heap format, we'll estimate fanout based on size and patterns
    const size = node.selfSize;
    const name = node.name || '';
    const type = node.type || '';

    // For arrays, estimate element count based on size
    if (type === 'array' || name.includes('Array')) {
      // Assume average 8 bytes per element (rough estimate)
      return Math.floor(size / 8);
    }

    // For objects/maps, estimate property count
    if (type === 'object' || name.includes('Map') || name.includes('Object')) {
      // Assume average 16 bytes per property (key + value)
      return Math.floor(size / 16);
    }

    // For sets, estimate element count
    if (name.includes('Set')) {
      // Assume average 8 bytes per element
      return Math.floor(size / 8);
    }

    // Default: use size as rough element count indicator
    return Math.floor(size / 4);
  }

  /**
   * Calculate growth rate based on history
   */
  private calculateGrowthRate(history: number[]): number {
    if (history.length < 2) return 0;

    let totalGrowthRate = 0;
    let validPeriods = 0;

    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const current = history[i];
      
      if (prev > 0) {
        totalGrowthRate += (current - prev) / prev;
        validPeriods++;
      }
    }

    return validPeriods > 0 ? totalGrowthRate / validPeriods : 0;
  }

  /**
   * Calculate confidence that this represents a real unbound growth issue
   */
  private calculateConfidence(info: CollectionGrowthInfo): number {
    let confidence = 50; // Base confidence

    // Growth magnitude
    const growthRatio = info.totalGrowth / Math.max(info.initialSize, 1);
    confidence += Math.min(growthRatio * 20, 30); // Up to +30 for significant growth

    // Monotonic growth bonus
    if (info.isMonotonic && info.totalGrowth > 0) {
      confidence += 20;
    }

    // Consistent growth pattern
    if (info.growthRate > 0.1) { // 10% growth per snapshot
      confidence += 15;
    }

    // Collection type reliability
    if (['Map', 'Set', 'Array'].includes(info.collectionType)) {
      confidence += 10;
    }

    // Size magnitude
    if (info.currentSize > 1000) confidence += 10;
    if (info.currentSize > 10000) confidence += 10;

    return Math.min(confidence, 95);
  }

  /**
   * Calculate severity based on growth pattern and size
   */
  private calculateSeverity(info: CollectionGrowthInfo): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const currentSize = info.currentSize;
    const totalGrowth = info.totalGrowth;
    const growthRate = info.growthRate;

    // Critical: very large collections or very rapid growth
    if (currentSize > 100000 || totalGrowth > 50000 || growthRate > 1.0) {
      return 'CRITICAL';
    }

    // High: large collections or significant growth
    if (currentSize > 10000 || totalGrowth > 5000 || growthRate > 0.5) {
      return 'HIGH';
    }

    // Medium: moderate size or growth
    if (currentSize > 1000 || totalGrowth > 500 || growthRate > 0.2) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Generate description for the growing collection
   */
  private generateDescription(info: CollectionGrowthInfo): string {
    const growth = info.totalGrowth > 0 ? `+${info.totalGrowth}` : `${info.totalGrowth}`;
    const rate = (info.growthRate * 100).toFixed(1);
    const monotonic = info.isMonotonic ? 'monotonic' : 'fluctuating';
    
    return `${info.collectionType} '${info.name}' grew from ${info.initialSize} to ${info.currentSize} elements (${growth}, ${rate}% avg growth, ${monotonic})`;
  }

  /**
   * Generate fix suggestion for the growing collection
   */
  private generateSuggestedFix(info: CollectionGrowthInfo): string {
    const name = info.name || 'collection';
    
    switch (info.collectionType) {
      case 'Array':
        return `Implement size limits for ${name}: use array.splice() to remove old elements, or implement LRU cache pattern`;
      
      case 'Map':
        return `Add cleanup logic for ${name}: implement Map size limits, use WeakMap if appropriate, or add periodic cache eviction`;
      
      case 'Set':
        return `Control Set growth for ${name}: implement size limits, use WeakSet for automatic cleanup, or add periodic cleanup`;
      
      case 'Object':
        return `Manage object growth for ${name}: delete old properties, implement object size limits, or use Map with cleanup logic`;
      
      default:
        return `Implement growth control for ${name}: add size limits, periodic cleanup, or LRU eviction strategy`;
    }
  }

  /**
   * Filter collections that show concerning growth
   */
  private filterGrowingCollections(): CollectionGrowthInfo[] {
    const growing: CollectionGrowthInfo[] = [];
    
    for (const info of this.collectionHistory.values()) {
      // Only include collections that actually grew and have reasonable confidence
      if (info.totalGrowth > 0 && info.confidence > 60) {
        growing.push(info);
      }
    }

    // Sort by total growth (largest first)
    return growing.sort((a, b) => b.totalGrowth - a.totalGrowth);
  }

  /**
   * Generate comprehensive analysis report
   */
  private generateReport(growingCollections: CollectionGrowthInfo[]): UnboundGrowthAnalysisResult {
    const totalMemoryGrowth = growingCollections.reduce((sum, info) => 
      sum + (info.node.selfSize || 0), 0
    );
    
    const averageGrowthRate = growingCollections.length > 0 
      ? growingCollections.reduce((sum, info) => sum + info.growthRate, 0) / growingCollections.length
      : 0;

    const criticalCollections = growingCollections.filter(info => info.severity === 'CRITICAL');
    const highCollections = growingCollections.filter(info => info.severity === 'HIGH');
    const topGrowers = growingCollections.slice(0, 20);

    let summary = '';
    if (criticalCollections.length > 0) {
      summary = `🚨 CRITICAL: ${criticalCollections.length} collections with unbounded growth detected!`;
    } else if (highCollections.length > 0) {
      summary = `⚠️ HIGH: ${highCollections.length} collections showing significant growth`;
    } else if (growingCollections.length > 0) {
      summary = `💡 ${growingCollections.length} collections showing growth patterns`;
    } else {
      summary = '✅ No unbounded collection growth detected';
    }

    const recommendations = this.generateRecommendations(growingCollections);

    return {
      totalGrowingCollections: growingCollections.length,
      unboundedCollections: growingCollections,
      topGrowers,
      totalMemoryGrowth,
      averageGrowthRate,
      summary,
      recommendations,
      criticalCollections
    };
  }

  /**
   * Generate targeted recommendations
   */
  private generateRecommendations(growingCollections: CollectionGrowthInfo[]): string[] {
    const recommendations: string[] = [];

    if (growingCollections.length === 0) {
      recommendations.push('✅ Collection growth appears under control');
      return recommendations;
    }

    const criticalCount = growingCollections.filter(c => c.severity === 'CRITICAL').length;
    const monotonicCount = growingCollections.filter(c => c.isMonotonic).length;
    const rapidGrowthCount = growingCollections.filter(c => c.growthRate > 0.5).length;

    if (criticalCount > 0) {
      recommendations.push(`🚨 ${criticalCount} collections need immediate size limits or cleanup`);
    }

    if (monotonicCount > 0) {
      recommendations.push(`📈 ${monotonicCount} collections show monotonic growth - implement LRU eviction or size caps`);
    }

    if (rapidGrowthCount > 0) {
      recommendations.push(`⚡ ${rapidGrowthCount} collections growing rapidly - review data accumulation patterns`);
    }

    recommendations.push('🔄 Implement periodic cleanup for long-lived collections');
    recommendations.push('📊 Add size monitoring and alerts for critical collections');
    recommendations.push('💡 Consider using WeakMap/WeakSet for automatic memory management');

    return recommendations;
  }

  /**
   * Reset tracking (useful for new analysis)
   */
  public reset(): void {
    this.collectionHistory.clear();
    this.snapshotCount = 0;
  }
}

/**
 * Convenience function for analyzing unbound growth across snapshots
 */
export function analyzeUnboundGrowth(
  snapshotNodeSets: HeapNode[][],
  monotonicOnly: boolean = false
): UnboundGrowthAnalysisResult {
  const analyzer = new UnboundGrowthAnalyzer(monotonicOnly);
  
  // Process each snapshot in sequence
  snapshotNodeSets.forEach(nodes => {
    analyzer.processSnapshot(nodes);
  });
  
  return analyzer.getAnalysisResults();
}