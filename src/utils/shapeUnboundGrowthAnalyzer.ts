/**
 * Shape Unbound Growth Analyzer
 * 
 * Detects object shapes (classes/structures) with unbound growth patterns
 * across multiple heap snapshots. Tracks aggregated retained size growth
 * for specific object shapes to identify systematic memory leaks.
 * 
 * Inspired by MemLab's ShapeUnboundGrowthAnalysis
 */

import { HeapNode } from './heapAnalyzer.js';
import { isBuiltInGlobal } from './builtInGlobals.js';

interface ShapeInfo {
  shape: string;
  count: number;
  examples: number[];
  totalSize: number;
  retainedSize: number;
  nodeIds: Set<number>;
  averageSize: number;
  maxSize: number;
  significance: ShapeSignificance;
  confidence: number;
}

interface ShapeSummary {
  shape: string;
  counts: number[];
  sizes: number[];
  retainedSizes: number[];
  examples: number[];
  snapshots: number;
  totalGrowth: number;
  growthPattern: GrowthPattern;
  growthRate: number;
  peakCount: number;
  peakSize: number;
  lastSeenSnapshot: number;
  confidence: number;
  severity: ShapeSeverity;
  recommendations: string[];
}

interface ShapeGrowthAnalysisResult {
  shapesWithGrowth: ShapeSummary[];
  totalShapesTracked: number;
  snapshotsAnalyzed: number;
  totalGrowthDetected: number;
  significantGrowthShapes: ShapeSummary[];
  monotonicallyGrowingShapes: ShapeSummary[];
  severityBreakdown: Record<ShapeSeverity, number>;
  growthPatternBreakdown: Record<GrowthPattern, number>;
  insights: string[];
  recommendations: string[];
  summary: string;
}

type ShapeSignificance = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type ShapeSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type GrowthPattern = 'MONOTONIC' | 'SIGNIFICANT' | 'FLUCTUATING' | 'STABLE';

export interface ShapeUnboundGrowthAnalysisResult extends ShapeGrowthAnalysisResult {}

export class ShapeUnboundGrowthAnalyzer {
  private shapesOfInterest: Set<string> | null = null;
  private shapeHistory: Map<string, ShapeSummary> = new Map();

  analyze(input: { nodes: HeapNode[] }): ShapeUnboundGrowthAnalysisResult {
    const { nodes } = input;
    
    // Single snapshot analysis - return basic shape analysis
    const shapesInfo = this.getShapesInfo(nodes);
    const singleSnapshotShapes = Object.values(shapesInfo)
      .filter(shape => shape.count > 10) // Only significant shapes
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, 20);

    const result: ShapeUnboundGrowthAnalysisResult = {
      shapesWithGrowth: [],
      totalShapesTracked: singleSnapshotShapes.length,
      snapshotsAnalyzed: 1,
      totalGrowthDetected: 0,
      significantGrowthShapes: [],
      monotonicallyGrowingShapes: [],
      severityBreakdown: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
      growthPatternBreakdown: { MONOTONIC: 0, SIGNIFICANT: 0, FLUCTUATING: 0, STABLE: singleSnapshotShapes.length },
      insights: [
        'Single snapshot analysis - shape growth requires multiple snapshots',
        `Found ${singleSnapshotShapes.length} significant object shapes`,
        singleSnapshotShapes.length > 50 ? 'Large number of object shapes may indicate memory complexity' : 'Object shape diversity within normal ranges'
      ],
      recommendations: [
        '📊 Take multiple heap snapshots to enable shape growth analysis',
        '🔍 Focus on largest object shapes for optimization opportunities',
        '💡 Consider object pooling for frequently created shapes'
      ],
      summary: `Analyzed ${singleSnapshotShapes.length} object shapes in single snapshot`
    };

    return result;
  }

  analyzeAcrossSnapshots(snapshots: { nodes: HeapNode[] }[]): ShapeUnboundGrowthAnalysisResult {
    if (snapshots.length < 2) {
      return this.analyze(snapshots[0] || { nodes: [] });
    }

    // First pass: identify shapes of interest
    const initialShapes = this.getShapesInfo(snapshots[0].nodes);
    this.shapesOfInterest = new Set(
      Object.keys(initialShapes).filter(shape => 
        initialShapes[shape].count > 10 || initialShapes[shape].totalSize > 1024 * 1024
      )
    );

    // Second pass: track growth across snapshots
    const shapeGrowthData = this.trackShapeGrowth(snapshots);
    
    // Analyze growth patterns
    const shapesWithGrowth = this.analyzePotentialGrowth(shapeGrowthData);
    
    // Calculate statistics
    const totalGrowthDetected = shapesWithGrowth.reduce((sum, shape) => sum + shape.totalGrowth, 0);
    const significantGrowthShapes = shapesWithGrowth.filter(shape => 
      shape.severity === 'HIGH' || shape.severity === 'CRITICAL'
    );
    const monotonicallyGrowingShapes = shapesWithGrowth.filter(shape => 
      shape.growthPattern === 'MONOTONIC'
    );

    // Generate insights and recommendations
    const insights = this.generateShapeGrowthInsights(shapesWithGrowth, snapshots.length);
    const recommendations = this.generateShapeGrowthRecommendations(shapesWithGrowth);

    const result: ShapeUnboundGrowthAnalysisResult = {
      shapesWithGrowth,
      totalShapesTracked: shapeGrowthData.length,
      snapshotsAnalyzed: snapshots.length,
      totalGrowthDetected,
      significantGrowthShapes,
      monotonicallyGrowingShapes,
      severityBreakdown: this.calculateSeverityBreakdown(shapesWithGrowth),
      growthPatternBreakdown: this.calculatePatternBreakdown(shapesWithGrowth),
      insights,
      recommendations,
      summary: this.generateShapeGrowthSummary(shapesWithGrowth, totalGrowthDetected, snapshots.length)
    };

    return result;
  }

  private getShapesInfo(nodes: HeapNode[]): Record<string, ShapeInfo> {
    const shapesInfo: Record<string, ShapeInfo> = {};

    for (const node of nodes) {
      // Skip non-object nodes and built-in globals
      if (node.type !== 'object' && node.type !== 'string') continue;
      if (isBuiltInGlobal(node.name)) continue;
      if (node.name === '(system)' || node.name === '(internal)') continue;

      const shape = this.getNodeShape(node);
      
      // Filter by shapes of interest if set
      if (this.shapesOfInterest && !this.shapesOfInterest.has(shape)) {
        continue;
      }

      if (!shapesInfo[shape]) {
        shapesInfo[shape] = {
          shape,
          count: 0,
          examples: [],
          totalSize: 0,
          retainedSize: 0,
          nodeIds: new Set(),
          averageSize: 0,
          maxSize: 0,
          significance: 'LOW',
          confidence: 70
        };
      }

      const shapeInfo = shapesInfo[shape];
      shapeInfo.count++;
      shapeInfo.totalSize += node.selfSize;
      shapeInfo.retainedSize += node.retainedSize || node.selfSize;
      shapeInfo.nodeIds.add(node.id);
      shapeInfo.maxSize = Math.max(shapeInfo.maxSize, node.selfSize);

      // Track examples (up to 3)
      if (shapeInfo.examples.length < 3) {
        shapeInfo.examples.push(node.id);
      }
    }

    // Calculate derived metrics
    for (const shapeInfo of Object.values(shapesInfo)) {
      shapeInfo.averageSize = shapeInfo.count > 0 ? shapeInfo.totalSize / shapeInfo.count : 0;
      shapeInfo.significance = this.calculateShapeSignificance(shapeInfo);
    }

    return shapesInfo;
  }

  private getNodeShape(node: HeapNode): string {
    // Create a shape signature based on node characteristics
    const parts: string[] = [];
    
    // Primary type and name
    parts.push(node.type);
    if (node.name && node.name !== '(object)') {
      parts.push(node.name);
    }

    // Size category for additional differentiation
    if (node.selfSize > 1024 * 1024) {
      parts.push('XL'); // > 1MB
    } else if (node.selfSize > 100 * 1024) {
      parts.push('L');  // > 100KB
    } else if (node.selfSize > 10 * 1024) {
      parts.push('M');  // > 10KB
    } else if (node.selfSize > 1024) {
      parts.push('S');  // > 1KB
    } else {
      parts.push('XS'); // <= 1KB
    }

    return parts.join('::');
  }

  private calculateShapeSignificance(shapeInfo: ShapeInfo): ShapeSignificance {
    const totalMemory = shapeInfo.retainedSize;
    const instanceCount = shapeInfo.count;

    if (totalMemory > 10 * 1024 * 1024 || instanceCount > 10000) return 'CRITICAL';
    if (totalMemory > 5 * 1024 * 1024 || instanceCount > 5000) return 'HIGH';
    if (totalMemory > 1 * 1024 * 1024 || instanceCount > 1000) return 'MEDIUM';
    return 'LOW';
  }

  private trackShapeGrowth(snapshots: { nodes: HeapNode[] }[]): ShapeSummary[] {
    const shapeData: Map<string, ShapeSummary> = new Map();

    // Process each snapshot
    for (let i = 0; i < snapshots.length; i++) {
      const shapesInfo = this.getShapesInfo(snapshots[i].nodes);

      for (const [shape, info] of Object.entries(shapesInfo)) {
        if (!shapeData.has(shape)) {
          shapeData.set(shape, {
            shape,
            counts: [],
            sizes: [],
            retainedSizes: [],
            examples: [],
            snapshots: 0,
            totalGrowth: 0,
            growthPattern: 'STABLE',
            growthRate: 0,
            peakCount: 0,
            peakSize: 0,
            lastSeenSnapshot: i,
            confidence: 70,
            severity: 'LOW',
            recommendations: []
          });
        }

        const summary = shapeData.get(shape)!;
        summary.counts.push(info.count);
        summary.sizes.push(info.totalSize);
        summary.retainedSizes.push(info.retainedSize);
        summary.examples.push(info.examples[0] || 0);
        summary.snapshots++;
        summary.lastSeenSnapshot = i;
        summary.peakCount = Math.max(summary.peakCount, info.count);
        summary.peakSize = Math.max(summary.peakSize, info.retainedSize);
      }
    }

    return Array.from(shapeData.values());
  }

  private analyzePotentialGrowth(shapeData: ShapeSummary[]): ShapeSummary[] {
    const growthShapes: ShapeSummary[] = [];

    for (const shape of shapeData) {
      if (shape.snapshots < 2) continue;

      const firstSize = shape.retainedSizes[0];
      const lastSize = shape.retainedSizes[shape.retainedSizes.length - 1];
      const totalGrowth = lastSize - firstSize;

      // Only consider significant growth
      if (totalGrowth < 100 * 1024) continue; // < 100KB growth

      shape.totalGrowth = totalGrowth;
      shape.growthRate = totalGrowth / (shape.snapshots - 1);
      shape.growthPattern = this.determineGrowthPattern(shape.retainedSizes);
      shape.severity = this.calculateGrowthSeverity(totalGrowth, shape.growthPattern);
      shape.confidence = this.calculateGrowthConfidence(shape);
      shape.recommendations = this.generateShapeRecommendations(shape);

      growthShapes.push(shape);
    }

    return growthShapes
      .sort((a, b) => b.totalGrowth - a.totalGrowth)
      .slice(0, 50); // Top 50 growing shapes
  }

  private determineGrowthPattern(sizes: number[]): GrowthPattern {
    if (sizes.length < 2) return 'STABLE';

    let increases = 0;
    let decreases = 0;
    let significant = false;

    for (let i = 1; i < sizes.length; i++) {
      const change = sizes[i] - sizes[i - 1];
      if (Math.abs(change) > sizes[i - 1] * 0.1) { // > 10% change
        significant = true;
      }
      
      if (change > 0) increases++;
      else if (change < 0) decreases++;
    }

    if (decreases === 0 && increases > 0) return 'MONOTONIC';
    if (significant && increases > decreases) return 'SIGNIFICANT';
    if (increases > 0 && decreases > 0) return 'FLUCTUATING';
    return 'STABLE';
  }

  private calculateGrowthSeverity(totalGrowth: number, pattern: GrowthPattern): ShapeSeverity {
    let baseScore = 0;

    if (totalGrowth > 50 * 1024 * 1024) baseScore = 4; // > 50MB
    else if (totalGrowth > 10 * 1024 * 1024) baseScore = 3; // > 10MB
    else if (totalGrowth > 5 * 1024 * 1024) baseScore = 2; // > 5MB
    else if (totalGrowth > 1024 * 1024) baseScore = 1; // > 1MB
    else baseScore = 0;

    // Adjust for pattern
    if (pattern === 'MONOTONIC') baseScore += 1;
    else if (pattern === 'SIGNIFICANT') baseScore += 0.5;

    if (baseScore >= 4) return 'CRITICAL';
    if (baseScore >= 3) return 'HIGH';
    if (baseScore >= 2) return 'MEDIUM';
    return 'LOW';
  }

  private calculateGrowthConfidence(shape: ShapeSummary): number {
    let confidence = 60;

    // More snapshots = higher confidence
    confidence += Math.min(shape.snapshots * 5, 20);

    // Consistent pattern = higher confidence
    if (shape.growthPattern === 'MONOTONIC') confidence += 15;
    else if (shape.growthPattern === 'SIGNIFICANT') confidence += 10;

    // Large growth = higher confidence
    if (shape.totalGrowth > 10 * 1024 * 1024) confidence += 10;
    else if (shape.totalGrowth > 1024 * 1024) confidence += 5;

    return Math.min(confidence, 95);
  }

  private generateShapeRecommendations(shape: ShapeSummary): string[] {
    const recommendations: string[] = [];
    const shapeType = shape.shape.split('::')[0];
    const shapeName = shape.shape.split('::')[1] || 'unknown';

    if (shape.growthPattern === 'MONOTONIC') {
      recommendations.push(`Implement object pooling for ${shapeName} ${shapeType} instances`);
      recommendations.push(`Add cleanup logic to prevent ${shapeName} accumulation`);
    }

    if (shape.severity === 'CRITICAL' || shape.severity === 'HIGH') {
      recommendations.push(`Investigate ${shapeName} lifecycle - may have memory leak`);
      recommendations.push(`Consider weak references for ${shapeName} caching`);
    }

    if (shape.peakCount > 1000) {
      recommendations.push(`High instance count (${shape.peakCount}) - consider instance reuse`);
    }

    if (shape.totalGrowth > 10 * 1024 * 1024) {
      recommendations.push(`Large memory impact (${this.formatBytes(shape.totalGrowth)}) - priority optimization target`);
    }

    recommendations.push(`Monitor ${shapeName} ${shapeType} creation patterns in application code`);

    return recommendations;
  }

  private calculateSeverityBreakdown(shapes: ShapeSummary[]): Record<ShapeSeverity, number> {
    const breakdown = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const shape of shapes) {
      breakdown[shape.severity]++;
    }
    return breakdown;
  }

  private calculatePatternBreakdown(shapes: ShapeSummary[]): Record<GrowthPattern, number> {
    const breakdown = { MONOTONIC: 0, SIGNIFICANT: 0, FLUCTUATING: 0, STABLE: 0 };
    for (const shape of shapes) {
      breakdown[shape.growthPattern]++;
    }
    return breakdown;
  }

  private generateShapeGrowthInsights(shapes: ShapeSummary[], snapshotCount: number): string[] {
    const insights: string[] = [];

    const criticalShapes = shapes.filter(s => s.severity === 'CRITICAL');
    const monotonicShapes = shapes.filter(s => s.growthPattern === 'MONOTONIC');
    const totalGrowth = shapes.reduce((sum, s) => sum + s.totalGrowth, 0);

    if (criticalShapes.length > 0) {
      insights.push(`🚨 ${criticalShapes.length} object shapes show critical memory growth`);
    }

    if (monotonicShapes.length > 0) {
      insights.push(`📈 ${monotonicShapes.length} object shapes show consistent monotonic growth`);
    }

    if (totalGrowth > 100 * 1024 * 1024) {
      insights.push(`💾 Combined shape growth of ${this.formatBytes(totalGrowth)} indicates systematic leaks`);
    }

    if (shapes.length > 20) {
      insights.push(`🏗️ Large number of growing shapes (${shapes.length}) suggests architectural review needed`);
    }

    insights.push(`📊 Analyzed ${snapshotCount} snapshots for shape-based memory patterns`);

    return insights;
  }

  private generateShapeGrowthRecommendations(shapes: ShapeSummary[]): string[] {
    const recommendations: string[] = [];

    const criticalShapes = shapes.filter(s => s.severity === 'CRITICAL');
    const monotonicShapes = shapes.filter(s => s.growthPattern === 'MONOTONIC');

    if (criticalShapes.length > 0) {
      recommendations.push('🚨 Address critical shape growth patterns immediately');
      recommendations.push('🔍 Profile object creation hotspots for critical shapes');
    }

    if (monotonicShapes.length > 0) {
      recommendations.push('📈 Implement object lifecycle management for monotonic shapes');
      recommendations.push('♻️ Consider object pooling for frequently created shapes');
    }

    if (shapes.length > 10) {
      recommendations.push('🏗️ Review application architecture for memory efficiency');
      recommendations.push('📐 Implement shape-based memory monitoring in production');
    }

    recommendations.push('📊 Continue shape growth monitoring across application lifecycle');
    recommendations.push('🎯 Focus optimization efforts on highest-growth shapes first');

    return recommendations;
  }

  private generateShapeGrowthSummary(shapes: ShapeSummary[], totalGrowth: number, snapshotCount: number): string {
    if (shapes.length === 0) {
      return `No significant shape growth detected across ${snapshotCount} snapshots`;
    }

    const criticalCount = shapes.filter(s => s.severity === 'CRITICAL').length;
    const highCount = shapes.filter(s => s.severity === 'HIGH').length;

    if (criticalCount > 0) {
      return `🚨 CRITICAL: ${criticalCount} shapes with severe growth (${this.formatBytes(totalGrowth)} total)`;
    } else if (highCount > 0) {
      return `⚠️ HIGH: ${highCount} shapes with significant growth (${this.formatBytes(totalGrowth)} total)`;
    } else {
      return `📊 Detected ${shapes.length} shapes with growth patterns (${this.formatBytes(totalGrowth)} total)`;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}