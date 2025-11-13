/**
 * Object Unbound Growth Analyzer
 * 
 * Inspired by MemLab's ObjectUnboundGrowthAnalysis
 * Tracks individual objects that exhibit monotonic or significant growth patterns
 * across multiple heap snapshots. Detects single objects that accumulate memory
 * over time, which is a common pattern for memory leaks.
 */

import { HeapNode } from '../types';
import { isBuiltInGlobal } from './builtInGlobals.js';

interface GrowingObject {
  nodeId: number;
  objectType: string;
  objectName: string;
  startSize: number;
  currentSize: number;
  peakSize: number;
  minSize: number;
  sizeHistory: number[];
  growthPattern: GrowthPattern;
  growthRate: number;              // Bytes per snapshot
  totalGrowth: number;             // Total size increase
  growthPercentage: number;        // Percentage growth from start
  snapshots: number;               // Number of snapshots tracked
  confidence: number;              // Analysis confidence score
  severity: GrowthSeverity;        // Impact assessment
  lastSeen: boolean;               // Still exists in latest snapshot
  recommendations: string[];       // Specific optimization advice
}

interface ObjectUnboundGrowthResult {
  growingObjects: GrowingObject[];
  totalObjectsTracked: number;
  snapshotsAnalyzed: number;
  significantGrowthObjects: GrowingObject[];
  monotonicallyGrowingObjects: GrowingObject[];
  growthPatternBreakdown: Record<GrowthPattern, number>;
  severityBreakdown: Record<GrowthSeverity, number>;
  totalGrowthDetected: number;
  summary: string;
  insights: string[];
  recommendations: string[];
}

type GrowthPattern = 
  | 'MONOTONIC'          // Always increasing
  | 'SIGNIFICANT'        // Large growth with some fluctuation
  | 'FLUCTUATING'        // Growing but with decreases
  | 'STABLE';            // No significant growth

type GrowthSeverity =
  | 'CRITICAL'           // >10MB growth or >500% increase
  | 'HIGH'               // >5MB growth or >200% increase  
  | 'MEDIUM'             // >1MB growth or >100% increase
  | 'LOW'                // >100KB growth or >50% increase
  | 'NEGLIGIBLE';        // <100KB or <50% increase

export class ObjectUnboundGrowthAnalyzer {
  private readonly SIGNIFICANT_GROWTH_THRESHOLD = 1024 * 1024; // 1MB
  private readonly MONOTONIC_GROWTH_ONLY = false; // Allow non-monotonic growth
  private readonly MIN_SNAPSHOTS_FOR_ANALYSIS = 2;
  private readonly MAX_TRACKED_OBJECTS = 10000; // Performance limit

  private objectTrackingMap = new Map<number, ObjectGrowthTracker>();

  analyzeAcrossSnapshots(snapshots: { nodes: HeapNode[] }[]): ObjectUnboundGrowthResult {
    if (snapshots.length < this.MIN_SNAPSHOTS_FOR_ANALYSIS) {
      return this.createEmptyResult(snapshots.length);
    }

    this.initializeTracking(snapshots[0]);
    
    // Process subsequent snapshots
    for (let i = 1; i < snapshots.length; i++) {
      this.updateTracking(snapshots[i], i);
    }

    // Process final results
    const growingObjects = this.processTrackingResults(snapshots[snapshots.length - 1]);
    
    return this.generateAnalysisResult(growingObjects, snapshots.length);
  }

  private initializeTracking(firstSnapshot: { nodes: HeapNode[] }): void {
    this.objectTrackingMap.clear();
    
    firstSnapshot.nodes.forEach(node => {
      if (!this.isValidForTracking(node)) return;
      
      const tracker = new ObjectGrowthTracker(node);
      this.objectTrackingMap.set(node.id, tracker);
    });

    // Limit tracking for performance
    if (this.objectTrackingMap.size > this.MAX_TRACKED_OBJECTS) {
      const entries = Array.from(this.objectTrackingMap.entries());
      // Keep the largest objects for tracking
      entries.sort((a, b) => (b[1].startSize) - (a[1].startSize));
      
      this.objectTrackingMap.clear();
      entries.slice(0, this.MAX_TRACKED_OBJECTS).forEach(([id, tracker]) => {
        this.objectTrackingMap.set(id, tracker);
      });
    }
  }

  private updateTracking(snapshot: { nodes: HeapNode[] }, snapshotIndex: number): void {
    const currentNodeMap = new Map<number, HeapNode>();
    snapshot.nodes.forEach(node => {
      currentNodeMap.set(node.id, node);
    });

    // Update existing tracked objects
    for (const [nodeId, tracker] of this.objectTrackingMap.entries()) {
      const currentNode = currentNodeMap.get(nodeId);
      
      if (currentNode) {
        // Object still exists, update tracking
        if (!tracker.updateWithNode(currentNode, snapshotIndex)) {
          // Object changed type/name - stop tracking
          this.objectTrackingMap.delete(nodeId);
        }
      } else {
        // Object no longer exists - mark as disappeared
        tracker.markDisappeared(snapshotIndex);
      }
    }
  }

  private processTrackingResults(lastSnapshot: { nodes: HeapNode[] }): GrowingObject[] {
    const growingObjects: GrowingObject[] = [];
    const lastSnapshotIds = new Set(lastSnapshot.nodes.map(node => node.id));

    for (const [nodeId, tracker] of this.objectTrackingMap.entries()) {
      if (!tracker.hasSignificantGrowth(this.SIGNIFICANT_GROWTH_THRESHOLD)) {
        continue;
      }

      const growingObject = tracker.toGrowingObject(
        lastSnapshotIds.has(nodeId)
      );
      
      if (growingObject) {
        growingObjects.push(growingObject);
      }
    }

    // Sort by total growth (descending)
    return growingObjects.sort((a, b) => b.totalGrowth - a.totalGrowth);
  }

  private isValidForTracking(node: HeapNode): boolean {
    // Only track objects, closures, and regexps (like MemLab)
    if (!['object', 'closure', 'regexp'].includes(node.type)) {
      return false;
    }

    // Skip very small objects
    const size = node.retainedSize || 0;
    if (size < 1024) return false; // <1KB

    // Skip built-in globals
    if (isBuiltInGlobal(node.name)) return false;

    // Skip system internals
    const systemPatterns = [
      'system /',
      'native',
      'builtin',
      'InternalArray',
      'FixedArray'
    ];
    
    return !systemPatterns.some(pattern => node.name.startsWith(pattern));
  }

  private generateAnalysisResult(growingObjects: GrowingObject[], snapshotsAnalyzed: number): ObjectUnboundGrowthResult {
    const significantGrowthObjects = growingObjects.filter(obj => 
      obj.severity !== 'NEGLIGIBLE' && obj.severity !== 'LOW'
    );
    
    const monotonicallyGrowingObjects = growingObjects.filter(obj => 
      obj.growthPattern === 'MONOTONIC'
    );

    const growthPatternBreakdown = this.calculateGrowthPatternBreakdown(growingObjects);
    const severityBreakdown = this.calculateSeverityBreakdown(growingObjects);
    const totalGrowthDetected = growingObjects.reduce((sum, obj) => sum + obj.totalGrowth, 0);

    return {
      growingObjects,
      totalObjectsTracked: this.objectTrackingMap.size,
      snapshotsAnalyzed,
      significantGrowthObjects,
      monotonicallyGrowingObjects,
      growthPatternBreakdown,
      severityBreakdown,
      totalGrowthDetected,
      summary: this.generateSummary(significantGrowthObjects, monotonicallyGrowingObjects, totalGrowthDetected),
      insights: this.generateInsights(growingObjects, snapshotsAnalyzed),
      recommendations: this.generateRecommendations(significantGrowthObjects, monotonicallyGrowingObjects)
    };
  }

  private calculateGrowthPatternBreakdown(objects: GrowingObject[]): Record<GrowthPattern, number> {
    const breakdown: Record<GrowthPattern, number> = {
      'MONOTONIC': 0,
      'SIGNIFICANT': 0,
      'FLUCTUATING': 0,
      'STABLE': 0
    };
    
    objects.forEach(obj => {
      breakdown[obj.growthPattern]++;
    });
    
    return breakdown;
  }

  private calculateSeverityBreakdown(objects: GrowingObject[]): Record<GrowthSeverity, number> {
    const breakdown: Record<GrowthSeverity, number> = {
      'CRITICAL': 0,
      'HIGH': 0,
      'MEDIUM': 0,
      'LOW': 0,
      'NEGLIGIBLE': 0
    };
    
    objects.forEach(obj => {
      breakdown[obj.severity]++;
    });
    
    return breakdown;
  }

  private createEmptyResult(snapshotsCount: number): ObjectUnboundGrowthResult {
    return {
      growingObjects: [],
      totalObjectsTracked: 0,
      snapshotsAnalyzed: snapshotsCount,
      significantGrowthObjects: [],
      monotonicallyGrowingObjects: [],
      growthPatternBreakdown: { 'MONOTONIC': 0, 'SIGNIFICANT': 0, 'FLUCTUATING': 0, 'STABLE': 0 },
      severityBreakdown: { 'CRITICAL': 0, 'HIGH': 0, 'MEDIUM': 0, 'LOW': 0, 'NEGLIGIBLE': 0 },
      totalGrowthDetected: 0,
      summary: snapshotsCount < this.MIN_SNAPSHOTS_FOR_ANALYSIS 
        ? `⚠️ Need at least ${this.MIN_SNAPSHOTS_FOR_ANALYSIS} snapshots for object growth analysis`
        : '✅ No object growth detected',
      insights: [],
      recommendations: snapshotsCount < this.MIN_SNAPSHOTS_FOR_ANALYSIS 
        ? ['📊 Take multiple heap snapshots over time to track object growth']
        : []
    };
  }

  private generateSummary(significant: GrowingObject[], monotonic: GrowingObject[], totalGrowth: number): string {
    if (significant.length === 0) {
      return '✅ No significant object growth detected';
    }

    const criticalObjects = significant.filter(obj => obj.severity === 'CRITICAL').length;
    
    if (criticalObjects > 0) {
      return `🚨 CRITICAL: ${criticalObjects} objects with unbounded growth (${this.formatBytes(totalGrowth)} total)`;
    }

    if (monotonic.length > 0) {
      return `⚠️ ${monotonic.length} objects showing monotonic growth (${this.formatBytes(totalGrowth)} total)`;
    }

    return `📈 ${significant.length} objects with significant growth patterns detected`;
  }

  private generateInsights(objects: GrowingObject[], snapshotsAnalyzed: number): string[] {
    const insights: string[] = [];

    if (objects.length === 0) return insights;

    // Fastest growing object
    const fastestGrowing = objects.reduce((prev, current) => 
      current.growthRate > prev.growthRate ? current : prev
    );
    insights.push(`🚀 Fastest growing: ${fastestGrowing.objectName} (+${this.formatBytes(fastestGrowing.growthRate)}/snapshot)`);

    // Largest absolute growth
    const largestGrowth = objects.reduce((prev, current) => 
      current.totalGrowth > prev.totalGrowth ? current : prev
    );
    if (largestGrowth.totalGrowth > 1024 * 1024) { // >1MB
      insights.push(`📊 Largest growth: ${largestGrowth.objectName} (+${this.formatBytes(largestGrowth.totalGrowth)} total)`);
    }

    // Monotonic growth pattern
    const monotonicCount = objects.filter(obj => obj.growthPattern === 'MONOTONIC').length;
    if (monotonicCount > 0) {
      insights.push(`📈 ${monotonicCount} objects showing monotonic (always increasing) growth`);
    }

    // Snapshot coverage insight
    const avgSnapshots = objects.reduce((sum, obj) => sum + obj.snapshots, 0) / objects.length;
    if (avgSnapshots < snapshotsAnalyzed * 0.8) {
      insights.push(`⏳ Some objects disappeared during analysis - potential cleanup or GC activity`);
    }

    return insights;
  }

  private generateRecommendations(significant: GrowingObject[], monotonic: GrowingObject[]): string[] {
    const recommendations: string[] = [];

    if (significant.length === 0) {
      recommendations.push('✅ No object growth optimizations needed');
      return recommendations;
    }

    // Critical recommendations
    const critical = significant.filter(obj => obj.severity === 'CRITICAL');
    if (critical.length > 0) {
      recommendations.push('🚨 Address critical growing objects immediately - implement size limits');
      recommendations.push('🎯 Focus on objects with monotonic growth patterns first');
    }

    // Pattern-based recommendations
    if (monotonic.length > 0) {
      recommendations.push('📈 Investigate monotonic growth objects - likely accumulating data without cleanup');
    }

    const highGrowthObjects = significant.filter(obj => obj.severity === 'HIGH');
    if (highGrowthObjects.length > 0) {
      recommendations.push('🔍 Review data structures in high-growth objects for cleanup opportunities');
    }

    // Type-specific recommendations
    const objectTypes = new Set(significant.map(obj => obj.objectType));
    if (objectTypes.has('object')) {
      recommendations.push('🏗️ Review object property accumulation patterns');
    }
    if (objectTypes.has('closure')) {
      recommendations.push('🔗 Investigate closure scope and captured variable growth');
    }

    // General recommendations
    recommendations.push('📊 Monitor object growth trends over longer periods');
    recommendations.push('🛠️ Implement periodic cleanup for growing data structures');
    recommendations.push('🔍 Use Object Content Analyzer to inspect specific growing objects');

    return recommendations;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}

// Helper class for tracking individual object growth
class ObjectGrowthTracker {
  public readonly nodeId: number;
  public readonly objectType: string;
  public readonly objectName: string;
  public readonly startSize: number;
  
  private sizeHistory: number[] = [];
  private snapshotIndices: number[] = [];
  private disappeared = false;
  private lastSnapshotIndex = -1;

  constructor(initialNode: HeapNode) {
    this.nodeId = initialNode.id;
    this.objectType = initialNode.type;
    this.objectName = initialNode.name;
    this.startSize = initialNode.retainedSize || 0;
    
    this.sizeHistory.push(this.startSize);
    this.snapshotIndices.push(0);
  }

  updateWithNode(node: HeapNode, snapshotIndex: number): boolean {
    // Verify object identity
    if (node.type !== this.objectType || node.name !== this.objectName) {
      return false; // Object changed identity
    }

    const currentSize = node.retainedSize || 0;
    this.sizeHistory.push(currentSize);
    this.snapshotIndices.push(snapshotIndex);
    this.lastSnapshotIndex = snapshotIndex;
    
    return true;
  }

  markDisappeared(snapshotIndex: number): void {
    this.disappeared = true;
    this.lastSnapshotIndex = snapshotIndex;
  }

  hasSignificantGrowth(threshold: number): boolean {
    if (this.sizeHistory.length < 2) return false;
    
    const totalGrowth = this.getCurrentSize() - this.startSize;
    return totalGrowth >= threshold;
  }

  toGrowingObject(stillExists: boolean): GrowingObject | null {
    if (this.sizeHistory.length < 2) return null;

    const currentSize = this.getCurrentSize();
    const peakSize = Math.max(...this.sizeHistory);
    const minSize = Math.min(...this.sizeHistory);
    const totalGrowth = currentSize - this.startSize;
    const growthPercentage = this.startSize > 0 ? (totalGrowth / this.startSize) * 100 : 0;
    const snapshots = this.sizeHistory.length;
    const growthRate = snapshots > 1 ? totalGrowth / (snapshots - 1) : 0;

    return {
      nodeId: this.nodeId,
      objectType: this.objectType,
      objectName: this.objectName,
      startSize: this.startSize,
      currentSize,
      peakSize,
      minSize,
      sizeHistory: [...this.sizeHistory],
      growthPattern: this.determineGrowthPattern(),
      growthRate,
      totalGrowth,
      growthPercentage,
      snapshots,
      confidence: this.calculateConfidence(),
      severity: this.calculateSeverity(totalGrowth, growthPercentage),
      lastSeen: stillExists,
      recommendations: this.generateRecommendations(totalGrowth, growthPercentage)
    };
  }

  private getCurrentSize(): number {
    return this.sizeHistory[this.sizeHistory.length - 1];
  }

  private determineGrowthPattern(): GrowthPattern {
    if (this.sizeHistory.length < 2) return 'STABLE';

    let isMonotonic = true;
    let hasSignificantIncrease = false;
    
    for (let i = 1; i < this.sizeHistory.length; i++) {
      const current = this.sizeHistory[i];
      const previous = this.sizeHistory[i - 1];
      
      if (current < previous) {
        isMonotonic = false;
      }
      
      if (current > previous * 1.1) { // 10% increase
        hasSignificantIncrease = true;
      }
    }

    if (isMonotonic && hasSignificantIncrease) {
      return 'MONOTONIC';
    }

    if (hasSignificantIncrease) {
      return isMonotonic ? 'SIGNIFICANT' : 'FLUCTUATING';
    }

    return 'STABLE';
  }

  private calculateConfidence(): number {
    let confidence = 70; // Base confidence

    // More data points = higher confidence
    if (this.sizeHistory.length >= 5) confidence += 20;
    else if (this.sizeHistory.length >= 3) confidence += 10;

    // Larger growth = higher confidence
    const totalGrowth = this.getCurrentSize() - this.startSize;
    if (totalGrowth > 10 * 1024 * 1024) confidence += 15; // >10MB
    else if (totalGrowth > 1024 * 1024) confidence += 10; // >1MB

    // Monotonic growth = higher confidence
    if (this.determineGrowthPattern() === 'MONOTONIC') {
      confidence += 15;
    }

    // Object still exists = higher confidence
    if (!this.disappeared) {
      confidence += 5;
    }

    return Math.min(Math.max(confidence, 30), 100);
  }

  private calculateSeverity(totalGrowth: number, growthPercentage: number): GrowthSeverity {
    if (totalGrowth >= 10 * 1024 * 1024 || growthPercentage >= 500) {
      return 'CRITICAL'; // >10MB or >500%
    }
    if (totalGrowth >= 5 * 1024 * 1024 || growthPercentage >= 200) {
      return 'HIGH'; // >5MB or >200%
    }
    if (totalGrowth >= 1024 * 1024 || growthPercentage >= 100) {
      return 'MEDIUM'; // >1MB or >100%
    }
    if (totalGrowth >= 100 * 1024 || growthPercentage >= 50) {
      return 'LOW'; // >100KB or >50%
    }
    return 'NEGLIGIBLE';
  }

  private generateRecommendations(totalGrowth: number, growthPercentage: number): string[] {
    const recommendations: string[] = [];

    if (totalGrowth >= 10 * 1024 * 1024) {
      recommendations.push('🚨 CRITICAL: Implement immediate size limits and cleanup');
    } else if (totalGrowth >= 1024 * 1024) {
      recommendations.push('⚠️ HIGH: Review data accumulation patterns');
    }

    // Type-specific recommendations
    switch (this.objectType) {
      case 'object':
        recommendations.push('🏗️ Review object properties for accumulating data');
        recommendations.push('🧹 Implement property cleanup or use WeakMap for auto-cleanup');
        break;
      case 'closure':
        recommendations.push('🔗 Review closure scope and captured variables');
        recommendations.push('💡 Consider breaking closure or limiting captured data');
        break;
      case 'regexp':
        recommendations.push('🔍 Review RegExp usage and caching patterns');
        break;
    }

    if (this.determineGrowthPattern() === 'MONOTONIC') {
      recommendations.push('📈 Object shows monotonic growth - likely missing cleanup logic');
    }

    return recommendations;
  }
}