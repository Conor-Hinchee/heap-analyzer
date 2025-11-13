/**
 * Object Shape Analyzer
 * 
 * Inspired by MemLab's ObjectShapeAnalysis
 * Analyzes object shapes (structural patterns) to identify which object structures
 * consume the most memory. Groups objects by their property structure and analyzes
 * retention patterns to find memory bottlenecks at the shape level.
 */

import { HeapNode, HeapSnapshot, HeapEdge } from '../types';
import { isBuiltInGlobal } from './builtInGlobals.js';

interface ObjectShape {
  shapeKey: string;                    // Unique identifier for this shape
  shapeSignature: string;              // Human-readable shape description
  nodeIds: Set<number>;               // All nodes with this shape
  totalRetainedSize: number;          // Combined retained size
  objectCount: number;                // Number of objects with this shape
  averageSize: number;                // Average size per object
  examples: ShapeExample[];           // Top examples of this shape
  referrerBreakdown: ReferrerStat[];  // How objects of this shape are retained
  memoryImpact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;                 // Analysis confidence
}

interface ShapeExample {
  node: HeapNode;
  retainedSize: number;
  nodeId: number;
}

interface ReferrerStat {
  referrerPattern: string;            // Pattern of referring objects
  edgePattern: string;               // Pattern of the reference edge
  count: number;                     // Number of references
  sourceExample: HeapNode;           // Example referring node
  edgeExample: HeapEdge;             // Example edge
}

interface ObjectShapeResult {
  topShapesBySize: ObjectShape[];
  topShapesByCount: ObjectShape[];
  totalShapesAnalyzed: number;
  totalObjectsAnalyzed: number;
  totalMemoryAnalyzed: number;
  shapeDistribution: Record<string, number>;
  criticalShapes: ObjectShape[];
  summary: string;
  insights: string[];
  recommendations: string[];
}

export class ObjectShapeAnalyzer {
  private readonly MAX_EXAMPLES_PER_SHAPE = 5;
  private readonly MAX_REFERRER_PATTERNS = 4;
  private readonly CRITICAL_SHAPE_SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB
  private readonly HIGH_SHAPE_SIZE_THRESHOLD = 5 * 1024 * 1024; // 5MB

  analyze(snapshot: { nodes: HeapNode[] }, maxShapes: number = 40): ObjectShapeResult {
    const shapeMap = this.buildShapeMap(snapshot);
    const shapes = this.calculateShapeMetrics(shapeMap, snapshot);
    
    // Sort by retained size (largest first)
    const topBySize = [...shapes].sort((a, b) => b.totalRetainedSize - a.totalRetainedSize).slice(0, maxShapes);
    const topByCount = [...shapes].sort((a, b) => b.objectCount - a.objectCount).slice(0, maxShapes);
    
    const criticalShapes = shapes.filter(shape => shape.memoryImpact === 'CRITICAL');
    const shapeDistribution = this.calculateShapeDistribution(shapes);
    
    const totalShapesAnalyzed = shapes.length;
    const totalObjectsAnalyzed = shapes.reduce((sum, shape) => sum + shape.objectCount, 0);
    const totalMemoryAnalyzed = shapes.reduce((sum, shape) => sum + shape.totalRetainedSize, 0);

    return {
      topShapesBySize: topBySize,
      topShapesByCount: topByCount,
      totalShapesAnalyzed,
      totalObjectsAnalyzed,
      totalMemoryAnalyzed,
      shapeDistribution,
      criticalShapes,
      summary: this.generateSummary(topBySize, criticalShapes, totalMemoryAnalyzed),
      insights: this.generateInsights(topBySize, criticalShapes, shapeDistribution),
      recommendations: this.generateRecommendations(topBySize, criticalShapes)
    };
  }

  private buildShapeMap(snapshot: { nodes: HeapNode[] }): Map<string, Set<number>> {
    const shapeMap = new Map<string, Set<number>>();
    const nodes = snapshot.nodes;

    nodes.forEach(node => {
      if (!this.shouldAnalyzeNodeForShape(node)) {
        return;
      }

      const shapeKey = this.generateShapeKey(node);
      if (!shapeMap.has(shapeKey)) {
        shapeMap.set(shapeKey, new Set());
      }
      shapeMap.get(shapeKey)!.add(node.id);
    });

    return shapeMap;
  }

  private shouldAnalyzeNodeForShape(node: HeapNode): boolean {
    // Only analyze objects and strings (like MemLab)
    if (node.type !== 'object' && !this.isStringLikeNode(node)) {
      return false;
    }

    // Skip built-in globals
    if (isBuiltInGlobal(node.name)) {
      return false;
    }

    // Skip very small objects
    if ((node.retainedSize || 0) < 100) {
      return false;
    }

    // Skip system objects that MemLab typically ignores
    const ignoredNames = [
      'system',
      'native',
      'builtin',
      'InternalArray',
      'FixedArray',
      'PropertyArray',
      'Map',
      'Set',
      'Array',
      'WeakMap',
      'WeakSet'
    ];

    return !ignoredNames.some(ignored => node.name.startsWith(ignored));
  }

  private isStringLikeNode(node: HeapNode): boolean {
    return node.type === 'string' || 
           node.type === 'concatenated string' ||
           node.name.includes('String');
  }

  private generateShapeKey(node: HeapNode): string {
    if (this.isStringLikeNode(node)) {
      return `STRING:${node.type}`;
    }

    // Simplified shape generation based on node properties available
    // Without edge traversal, we use node type and name as the shape basis
    const sizeCategory = this.getSizeCategory(node.retainedSize || 0);
    return `${node.name}:${node.type}:${sizeCategory}`;
  }

  private getSizeCategory(size: number): string {
    if (size > 1024 * 1024) return 'LARGE';  // >1MB
    if (size > 1024 * 100) return 'MEDIUM';  // >100KB
    if (size > 1024) return 'SMALL';         // >1KB
    return 'TINY';
  }

  private calculateShapeMetrics(shapeMap: Map<string, Set<number>>, snapshot: { nodes: HeapNode[] }): ObjectShape[] {
    const shapes: ObjectShape[] = [];

    shapeMap.forEach((nodeIds, shapeKey) => {
      const examples: ShapeExample[] = [];
      let totalRetainedSize = 0;

      // Collect examples and calculate metrics
      const nodes = snapshot.nodes;
      nodeIds.forEach(nodeId => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          const retainedSize = node.retainedSize || 0;
          totalRetainedSize += retainedSize;
          
          examples.push({
            node,
            retainedSize,
            nodeId
          });
        }
      });

      // Sort examples by size and keep top ones
      examples.sort((a, b) => b.retainedSize - a.retainedSize);
      const topExamples = examples.slice(0, this.MAX_EXAMPLES_PER_SHAPE);

      // Generate human-readable shape signature
      const shapeSignature = this.generateShapeSignature(topExamples[0]?.node);

      // For simplified analysis, we'll skip detailed referrer patterns
      const referrerBreakdown: ReferrerStat[] = [];

      const shape: ObjectShape = {
        shapeKey,
        shapeSignature,
        nodeIds,
        totalRetainedSize,
        objectCount: nodeIds.size,
        averageSize: nodeIds.size > 0 ? totalRetainedSize / nodeIds.size : 0,
        examples: topExamples,
        referrerBreakdown,
        memoryImpact: this.calculateShapeMemoryImpact(totalRetainedSize),
        confidence: this.calculateShapeConfidence(nodeIds.size, totalRetainedSize)
      };

      shapes.push(shape);
    });

    return shapes;
  }

  private generateShapeSignature(node: HeapNode | undefined): string {
    if (!node) return 'Unknown Shape';

    if (this.isStringLikeNode(node)) {
      return `String (${node.type})`;
    }

    // Simplified signature without property details
    const sizeDesc = this.formatBytes(node.retainedSize || 0);
    return `${node.name} (${node.type}, ${sizeDesc})`;
  }

  private calculateShapeMemoryImpact(totalSize: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (totalSize >= this.CRITICAL_SHAPE_SIZE_THRESHOLD) return 'CRITICAL';
    if (totalSize >= this.HIGH_SHAPE_SIZE_THRESHOLD) return 'HIGH';
    if (totalSize >= 1024 * 1024) return 'MEDIUM'; // 1MB
    return 'LOW';
  }

  private calculateShapeConfidence(objectCount: number, totalSize: number): number {
    let confidence = 70; // Base confidence

    // Higher confidence for shapes with many instances
    if (objectCount > 100) confidence += 20;
    if (objectCount > 10) confidence += 10;

    // Higher confidence for large memory impact
    if (totalSize > 5 * 1024 * 1024) confidence += 15;

    // Lower confidence for very few instances
    if (objectCount < 5) confidence -= 20;

    return Math.min(Math.max(confidence, 10), 100);
  }

  private calculateShapeDistribution(shapes: ObjectShape[]): Record<string, number> {
    const distribution: Record<string, number> = {
      'Critical (>10MB)': 0,
      'High (5-10MB)': 0,
      'Medium (1-5MB)': 0,
      'Low (<1MB)': 0
    };

    shapes.forEach(shape => {
      const size = shape.totalRetainedSize;
      if (size >= 10 * 1024 * 1024) {
        distribution['Critical (>10MB)']++;
      } else if (size >= 5 * 1024 * 1024) {
        distribution['High (5-10MB)']++;
      } else if (size >= 1024 * 1024) {
        distribution['Medium (1-5MB)']++;
      } else {
        distribution['Low (<1MB)']++;
      }
    });

    return distribution;
  }

  private generateSummary(topShapes: ObjectShape[], criticalShapes: ObjectShape[], totalMemory: number): string {
    if (topShapes.length === 0) {
      return '✅ No significant object shapes detected';
    }

    const memoryMB = (totalMemory / (1024 * 1024)).toFixed(1);
    
    if (criticalShapes.length > 0) {
      return `🚨 CRITICAL: ${criticalShapes.length} object shapes consuming excessive memory (${memoryMB} MB total)`;
    }

    const highShapes = topShapes.filter(shape => shape.memoryImpact === 'HIGH').length;
    if (highShapes > 0) {
      return `⚠️ HIGH: ${highShapes} object shapes with significant memory usage (${memoryMB} MB analyzed)`;
    }

    return `📊 ${topShapes.length} object shapes analyzed, consuming ${memoryMB} MB total`;
  }

  private generateInsights(topShapes: ObjectShape[], criticalShapes: ObjectShape[], distribution: Record<string, number>): string[] {
    const insights: string[] = [];

    if (criticalShapes.length > 0) {
      const largestShape = criticalShapes[0];
      insights.push(`🔥 Largest shape: "${largestShape.shapeSignature}" (${this.formatBytes(largestShape.totalRetainedSize)})`);
    }

    if (topShapes.length > 0) {
      const avgObjectsPerShape = topShapes.reduce((sum, shape) => sum + shape.objectCount, 0) / topShapes.length;
      if (avgObjectsPerShape > 50) {
        insights.push(`📊 High object density: ${avgObjectsPerShape.toFixed(0)} objects per shape on average`);
      }
    }

    const criticalAndHigh = (distribution['Critical (>10MB)'] || 0) + (distribution['High (5-10MB)'] || 0);
    if (criticalAndHigh > 0) {
      insights.push(`⚠️ ${criticalAndHigh} shapes consuming >5MB each - priority optimization targets`);
    }

    // Pattern insights
    const stringShapes = topShapes.filter(shape => shape.shapeSignature.startsWith('String'));
    if (stringShapes.length > 0) {
      const stringMemory = stringShapes.reduce((sum, shape) => sum + shape.totalRetainedSize, 0);
      insights.push(`📝 String memory usage: ${this.formatBytes(stringMemory)} across ${stringShapes.length} string shapes`);
    }

    return insights;
  }

  private generateRecommendations(topShapes: ObjectShape[], criticalShapes: ObjectShape[]): string[] {
    const recommendations: string[] = [];

    if (topShapes.length === 0) {
      recommendations.push('✅ No object shape optimizations needed');
      return recommendations;
    }

    if (criticalShapes.length > 0) {
      recommendations.push('🚨 Focus on critical shapes first - implement size limits or object pooling');
      
      const topCritical = criticalShapes[0];
      if (topCritical.objectCount > 100) {
        recommendations.push(`🎯 "${topCritical.shapeSignature}" has ${topCritical.objectCount} instances - consider object deduplication`);
      }
    }

    // Shape-specific recommendations
    const largeObjectShapes = topShapes.filter(shape => 
      shape.averageSize > 1024 * 1024 && // >1MB per object
      shape.objectCount > 10
    );
    
    if (largeObjectShapes.length > 0) {
      recommendations.push('📦 Large object instances detected - implement lazy loading or data streaming');
    }

    const highCountShapes = topShapes.filter(shape => shape.objectCount > 1000);
    if (highCountShapes.length > 0) {
      recommendations.push('🔢 High instance count shapes - implement object pooling or flyweight pattern');
    }

    // General recommendations
    recommendations.push('🔍 Use Object Content Analyzer to inspect specific instances of top shapes');
    recommendations.push('📊 Monitor shape memory consumption over time to detect growth trends');
    recommendations.push('🛠️ Consider shape-specific optimization strategies for top memory consumers');

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