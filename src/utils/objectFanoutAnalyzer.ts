/**
 * Object Fanout Analyzer
 * 
 * Inspired by MemLab's ObjectFanoutAnalysis
 * Finds objects with the highest number of outgoing references (fan-out).
 * High fan-out objects often indicate memory bottlenecks, collection hubs,
 * or objects preventing garbage collection of many other objects.
 */

import { HeapNode, HeapSnapshot, HeapEdge } from '../types';
import { isBuiltInGlobal } from './builtInGlobals.js';

interface FanoutNode {
  node: HeapNode;
  fanoutCount: number;
  outgoingEdges: HeapEdge[];
  referenceTypes: Record<string, number>;
  memoryImpact: number;
  confidence: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
  suspiciousPatterns: string[];
  recommendations: string[];
}

interface ObjectFanoutResult {
  topFanoutObjects: FanoutNode[];
  totalAnalyzedObjects: number;
  averageFanout: number;
  maxFanout: number;
  fanoutDistribution: Record<string, number>;
  highFanoutByCategory: Record<string, FanoutNode[]>;
  suspiciousCollections: FanoutNode[];
  summary: string;
  insights: string[];
  recommendations: string[];
}

export class ObjectFanoutAnalyzer {
  private readonly HIGH_FANOUT_THRESHOLD = 50;
  private readonly CRITICAL_FANOUT_THRESHOLD = 200;
  private readonly SUSPICIOUS_FANOUT_PATTERNS = [
    'cache',
    'registry',
    'collection',
    'manager',
    'store',
    'pool',
    'tracker',
    'accumulated'
  ];

  analyze(snapshot: HeapSnapshot, listSize: number = 20): ObjectFanoutResult {
    const fanoutNodes = this.calculateFanoutForAllObjects(snapshot);
    
    // Sort by fanout count (highest first)
    fanoutNodes.sort((a, b) => b.fanoutCount - a.fanoutCount);
    
    // Take top objects
    const topFanoutObjects = fanoutNodes.slice(0, listSize);
    
    // Calculate statistics
    const totalAnalyzedObjects = fanoutNodes.length;
    const averageFanout = fanoutNodes.reduce((sum, node) => sum + node.fanoutCount, 0) / totalAnalyzedObjects;
    const maxFanout = fanoutNodes[0]?.fanoutCount || 0;
    
    // Group by categories
    const highFanoutByCategory = this.groupByCategory(topFanoutObjects);
    const fanoutDistribution = this.calculateFanoutDistribution(fanoutNodes);
    const suspiciousCollections = fanoutNodes.filter(node => 
      node.severity === 'CRITICAL' || node.severity === 'HIGH'
    );

    return {
      topFanoutObjects,
      totalAnalyzedObjects,
      averageFanout,
      maxFanout,
      fanoutDistribution,
      highFanoutByCategory,
      suspiciousCollections,
      summary: this.generateSummary(topFanoutObjects, maxFanout, averageFanout),
      insights: this.generateInsights(topFanoutObjects, suspiciousCollections),
      recommendations: this.generateRecommendations(topFanoutObjects, suspiciousCollections)
    };
  }

  private calculateFanoutForAllObjects(snapshot: HeapSnapshot): FanoutNode[] {
    const fanoutNodes: FanoutNode[] = [];

    snapshot.nodes.forEach(node => {
      if (!this.isNodeWorthInspecting(node)) {
        return;
      }

      const outgoingEdges = this.getOutgoingEdges(node, snapshot);
      const fanoutCount = outgoingEdges.length;
      
      if (fanoutCount === 0) {
        return; // Skip objects with no outgoing references
      }

      const fanoutNode: FanoutNode = {
        node,
        fanoutCount,
        outgoingEdges,
        referenceTypes: this.analyzeReferenceTypes(outgoingEdges, snapshot),
        memoryImpact: this.calculateMemoryImpact(node, outgoingEdges, snapshot),
        confidence: this.calculateConfidence(node, fanoutCount),
        severity: this.calculateSeverity(node, fanoutCount),
        category: this.categorizeObject(node),
        suspiciousPatterns: this.detectSuspiciousPatterns(node, fanoutCount),
        recommendations: this.generateObjectRecommendations(node, fanoutCount)
      };

      fanoutNodes.push(fanoutNode);
    });

    return fanoutNodes;
  }

  private isNodeWorthInspecting(node: HeapNode): boolean {
    // Skip built-in globals and system objects
    if (isBuiltInGlobal(node.name)) {
      return false;
    }

    // Skip very small objects (likely primitives or system internals)
    if ((node.retainedSize || 0) < 100) {
      return false;
    }

    // Skip system/internal objects
    const systemPatterns = [
      'system /',
      '(system)',
      'native',
      'builtin',
      'internal',
      'InternalArray',
      'FixedArray',
      'PropertyArray'
    ];

    const name = node.name.toLowerCase();
    if (systemPatterns.some(pattern => name.includes(pattern.toLowerCase()))) {
      return false;
    }

    return true;
  }

  private getOutgoingEdges(node: HeapNode, snapshot: HeapSnapshot): HeapEdge[] {
    if (!snapshot.edges) return [];
    
    return snapshot.edges.filter(edge => 
      edge.fromNode === node.id &&
      edge.type !== 'hidden' &&
      edge.type !== 'weak'
    );
  }

  private analyzeReferenceTypes(edges: HeapEdge[], snapshot: HeapSnapshot): Record<string, number> {
    const referenceTypes: Record<string, number> = {};

    edges.forEach(edge => {
      const type = edge.type;
      referenceTypes[type] = (referenceTypes[type] || 0) + 1;
    });

    return referenceTypes;
  }

  private calculateMemoryImpact(node: HeapNode, edges: HeapEdge[], snapshot: HeapSnapshot): number {
    let totalImpact = node.retainedSize || 0;

    // Add memory from immediate children (simplified)
    edges.forEach(edge => {
      const targetNode = snapshot.nodes.find(n => n.id === edge.toNode);
      if (targetNode) {
        totalImpact += (targetNode.selfSize || 0);
      }
    });

    return totalImpact;
  }

  private calculateConfidence(node: HeapNode, fanoutCount: number): number {
    let confidence = 70; // Base confidence

    // Higher confidence for objects with very high fanout
    if (fanoutCount > 100) confidence += 20;
    if (fanoutCount > 500) confidence += 10;

    // Higher confidence for larger objects
    const size = node.retainedSize || 0;
    if (size > 1024 * 1024) confidence += 15; // >1MB

    // Lower confidence for very small fanout (might be normal)
    if (fanoutCount < 10) confidence -= 20;

    return Math.min(Math.max(confidence, 10), 100);
  }

  private calculateSeverity(node: HeapNode, fanoutCount: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const size = node.retainedSize || 0;

    // Critical: Very high fanout OR large object with high fanout
    if (fanoutCount >= this.CRITICAL_FANOUT_THRESHOLD || 
        (fanoutCount >= 100 && size > 5 * 1024 * 1024)) {
      return 'CRITICAL';
    }

    // High: High fanout OR medium object with significant fanout
    if (fanoutCount >= this.HIGH_FANOUT_THRESHOLD || 
        (fanoutCount >= 25 && size > 1024 * 1024)) {
      return 'HIGH';
    }

    // Medium: Notable fanout
    if (fanoutCount >= 20 || size > 512 * 1024) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private categorizeObject(node: HeapNode): string {
    const name = node.name.toLowerCase();
    const type = node.type.toLowerCase();

    // DOM-related objects
    if (type.includes('html') || type.includes('element') || type.includes('node')) {
      return 'DOM';
    }

    // Collections
    if (type.includes('array') || name.includes('array')) {
      return 'Array';
    }
    if (type.includes('map') || name.includes('map')) {
      return 'Map';
    }
    if (type.includes('set') || name.includes('set')) {
      return 'Set';
    }

    // Framework objects
    if (name.includes('react') || name.includes('component')) {
      return 'React';
    }
    if (name.includes('vue') || name.includes('vm')) {
      return 'Vue';
    }

    // Cache/Storage objects
    if (name.includes('cache') || name.includes('store') || name.includes('registry')) {
      return 'Cache';
    }

    // Event-related
    if (name.includes('event') || name.includes('listener') || name.includes('handler')) {
      return 'Events';
    }

    // Global/Window objects
    if (name.includes('window') || name.includes('global')) {
      return 'Global';
    }

    // Default category
    return 'Object';
  }

  private detectSuspiciousPatterns(node: HeapNode, fanoutCount: number): string[] {
    const patterns: string[] = [];
    const name = node.name.toLowerCase();

    // Very high fanout
    if (fanoutCount > this.CRITICAL_FANOUT_THRESHOLD) {
      patterns.push(`Extremely high fanout: ${fanoutCount} references`);
    }

    // Suspicious naming patterns
    this.SUSPICIOUS_FANOUT_PATTERNS.forEach(pattern => {
      if (name.includes(pattern)) {
        patterns.push(`Suspicious naming pattern: contains '${pattern}'`);
      }
    });

    // Collection-like behavior
    if (fanoutCount > 50 && (name.includes('array') || name.includes('list'))) {
      patterns.push('Large collection detected');
    }

    // Cache-like behavior
    if (fanoutCount > 30 && name.includes('cache')) {
      patterns.push('Large cache detected - may need size limits');
    }

    // Registry pattern
    if (fanoutCount > 20 && (name.includes('registry') || name.includes('manager'))) {
      patterns.push('Registry/Manager with high fanout - check cleanup logic');
    }

    return patterns;
  }

  private generateObjectRecommendations(node: HeapNode, fanoutCount: number): string[] {
    const recommendations: string[] = [];
    const name = node.name.toLowerCase();
    const category = this.categorizeObject(node);

    if (fanoutCount > this.CRITICAL_FANOUT_THRESHOLD) {
      recommendations.push('🚨 Implement immediate size limits or cleanup logic');
    } else if (fanoutCount > this.HIGH_FANOUT_THRESHOLD) {
      recommendations.push('⚠️ Consider implementing size limits or periodic cleanup');
    }

    // Category-specific recommendations
    switch (category) {
      case 'Array':
        recommendations.push('📊 Implement array size limits with splice() or shift()');
        break;
      case 'Map':
        recommendations.push('🗺️ Use Map.clear() or implement LRU eviction policy');
        break;
      case 'Set':
        recommendations.push('🔗 Consider WeakSet or implement periodic Set.clear()');
        break;
      case 'Cache':
        recommendations.push('💾 Implement cache expiration and size limits');
        break;
      case 'DOM':
        recommendations.push('🌐 Review DOM element retention and cleanup on unmount');
        break;
      case 'Events':
        recommendations.push('🎧 Audit event listener cleanup and removeEventListener calls');
        break;
      case 'Global':
        recommendations.push('🌍 Review global object lifecycle and cleanup patterns');
        break;
    }

    // Pattern-specific recommendations
    if (name.includes('registry')) {
      recommendations.push('📝 Implement registry cleanup on object lifecycle end');
    }

    if (name.includes('manager')) {
      recommendations.push('👨‍💼 Review manager cleanup and resource disposal patterns');
    }

    return recommendations;
  }

  private groupByCategory(fanoutNodes: FanoutNode[]): Record<string, FanoutNode[]> {
    const grouped: Record<string, FanoutNode[]> = {};
    
    fanoutNodes.forEach(node => {
      const category = node.category;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(node);
    });

    return grouped;
  }

  private calculateFanoutDistribution(fanoutNodes: FanoutNode[]): Record<string, number> {
    const distribution: Record<string, number> = {
      'Low (1-10)': 0,
      'Medium (11-50)': 0,
      'High (51-200)': 0,
      'Critical (200+)': 0
    };

    fanoutNodes.forEach(node => {
      const fanout = node.fanoutCount;
      if (fanout <= 10) {
        distribution['Low (1-10)']++;
      } else if (fanout <= 50) {
        distribution['Medium (11-50)']++;
      } else if (fanout <= 200) {
        distribution['High (51-200)']++;
      } else {
        distribution['Critical (200+)']++;
      }
    });

    return distribution;
  }

  private generateSummary(topObjects: FanoutNode[], maxFanout: number, avgFanout: number): string {
    if (topObjects.length === 0) {
      return '✅ No objects with significant fanout detected';
    }

    const criticalCount = topObjects.filter(obj => obj.severity === 'CRITICAL').length;
    const highCount = topObjects.filter(obj => obj.severity === 'HIGH').length;

    if (criticalCount > 0) {
      return `🚨 CRITICAL: ${criticalCount} objects with extremely high fanout detected! Max: ${maxFanout}, Avg: ${avgFanout.toFixed(1)}`;
    } else if (highCount > 0) {
      return `⚠️ HIGH: ${highCount} objects with high fanout detected. Max: ${maxFanout}, Avg: ${avgFanout.toFixed(1)}`;
    } else {
      return `📊 ${topObjects.length} objects analyzed. Max fanout: ${maxFanout}, Avg: ${avgFanout.toFixed(1)}`;
    }
  }

  private generateInsights(topObjects: FanoutNode[], suspicious: FanoutNode[]): string[] {
    const insights: string[] = [];

    if (suspicious.length > 0) {
      insights.push(`🔍 ${suspicious.length} objects with suspicious fanout patterns`);
    }

    const categories = new Set(topObjects.map(obj => obj.category));
    if (categories.size > 1) {
      insights.push(`📊 High fanout spans ${categories.size} object categories: ${Array.from(categories).join(', ')}`);
    }

    const avgMemoryPerObject = topObjects.reduce((sum, obj) => sum + obj.memoryImpact, 0) / topObjects.length;
    if (avgMemoryPerObject > 1024 * 1024) {
      insights.push(`💾 High fanout objects average ${this.formatBytes(avgMemoryPerObject)} each`);
    }

    const totalSuspiciousPatterns = topObjects.reduce((sum, obj) => sum + obj.suspiciousPatterns.length, 0);
    if (totalSuspiciousPatterns > 0) {
      insights.push(`⚠️ ${totalSuspiciousPatterns} suspicious patterns detected across high fanout objects`);
    }

    return insights;
  }

  private generateRecommendations(topObjects: FanoutNode[], suspicious: FanoutNode[]): string[] {
    const recommendations: string[] = [];

    if (suspicious.length > 0) {
      recommendations.push('🚨 Prioritize cleanup for CRITICAL/HIGH severity fanout objects');
    }

    // Get most common categories
    const categoryCount: Record<string, number> = {};
    topObjects.forEach(obj => {
      categoryCount[obj.category] = (categoryCount[obj.category] || 0) + 1;
    });

    const topCategory = Object.entries(categoryCount).sort(([,a], [,b]) => b - a)[0];
    if (topCategory && topCategory[1] > 1) {
      recommendations.push(`🎯 Focus on ${topCategory[0]} objects - ${topCategory[1]} high fanout instances detected`);
    }

    recommendations.push('📊 Implement size limits for collections with high fanout');
    recommendations.push('🔄 Add periodic cleanup for long-lived high fanout objects');
    recommendations.push('📈 Monitor fanout growth over time to detect trends');
    recommendations.push('🔍 Use Object Content Analyzer for deep inspection of top fanout objects');

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