/**
 * Object Size Rank Analyzer
 * 
 * Inspired by MemLab's ObjectSizeRankAnalysis
 * Identifies and ranks the largest objects in a heap snapshot by retained size.
 * Essential for finding memory bottlenecks and optimization targets.
 */

import { HeapNode } from '../types';
import { isBuiltInGlobal } from './builtInGlobals.js';

interface LargeObject {
  node: HeapNode;
  rank: number;                       // Position in size ranking (1 = largest)
  retainedSize: number;               // Memory retained by this object
  sizePercentage: number;             // Percentage of total heap memory
  category: ObjectCategory;           // Classification of object type
  significance: ObjectSignificance;   // Impact level assessment
  confidence: number;                 // Analysis confidence score
  optimization: string[];             // Specific optimization recommendations
}

interface ObjectSizeRankResult {
  largestObjects: LargeObject[];
  totalAnalyzed: number;
  totalMemoryAnalyzed: number;
  sizeDistribution: Record<ObjectCategory, SizeStats>;
  significanceBreakdown: Record<ObjectSignificance, number>;
  topCategories: CategoryRanking[];
  summary: string;
  insights: string[];
  recommendations: string[];
}

interface SizeStats {
  count: number;
  totalSize: number;
  averageSize: number;
  largestSize: number;
}

interface CategoryRanking {
  category: ObjectCategory;
  totalSize: number;
  count: number;
  averageSize: number;
  percentage: number;
}

type ObjectCategory = 
  | 'ARRAY' | 'OBJECT' | 'STRING' | 'FUNCTION' | 'CLOSURE' 
  | 'REGEXP' | 'DATE' | 'TYPED_ARRAY' | 'DOM_NODE' | 'CODE' 
  | 'SYSTEM' | 'UNKNOWN';

type ObjectSignificance = 
  | 'CRITICAL'    // >10MB or >5% of heap
  | 'HIGH'        // >5MB or >2% of heap  
  | 'MEDIUM'      // >1MB or >0.5% of heap
  | 'LOW'         // <1MB
  | 'NEGLIGIBLE'; // <100KB

export class ObjectSizeRankAnalyzer {
  private readonly DEFAULT_TOP_COUNT = 50;
  private readonly CRITICAL_SIZE_THRESHOLD = 10 * 1024 * 1024;  // 10MB
  private readonly HIGH_SIZE_THRESHOLD = 5 * 1024 * 1024;       // 5MB  
  private readonly MEDIUM_SIZE_THRESHOLD = 1024 * 1024;         // 1MB
  private readonly LOW_SIZE_THRESHOLD = 100 * 1024;             // 100KB

  analyze(snapshot: { nodes: HeapNode[] }, maxResults: number = this.DEFAULT_TOP_COUNT): ObjectSizeRankResult {
    const worthInspecting = this.filterWorthInspecting(snapshot.nodes);
    const rankedObjects = this.rankObjectsBySize(worthInspecting);
    const topObjects = rankedObjects.slice(0, maxResults);
    
    const totalMemoryAnalyzed = worthInspecting.reduce((sum, node) => sum + (node.retainedSize || 0), 0);
    const largeObjects = this.enhanceWithAnalysis(topObjects, totalMemoryAnalyzed);
    
    const sizeDistribution = this.calculateSizeDistribution(rankedObjects);
    const significanceBreakdown = this.calculateSignificanceBreakdown(largeObjects);
    const topCategories = this.calculateTopCategories(rankedObjects);
    
    return {
      largestObjects: largeObjects,
      totalAnalyzed: worthInspecting.length,
      totalMemoryAnalyzed,
      sizeDistribution,
      significanceBreakdown,
      topCategories,
      summary: this.generateSummary(largeObjects, totalMemoryAnalyzed),
      insights: this.generateInsights(largeObjects, sizeDistribution, topCategories),
      recommendations: this.generateRecommendations(largeObjects, topCategories)
    };
  }

  private filterWorthInspecting(nodes: HeapNode[]): HeapNode[] {
    return nodes.filter(node => {
      // Skip very small objects
      const size = node.retainedSize || 0;
      if (size < 1024) return false; // Skip objects <1KB

      // Skip built-in globals
      if (isBuiltInGlobal(node.name)) return false;

      // Skip system internals
      if (this.isSystemInternal(node)) return false;

      // Skip obvious native objects
      if (this.isNativeObject(node)) return false;

      return true;
    });
  }

  private isSystemInternal(node: HeapNode): boolean {
    const systemNames = [
      'system /',
      'native',
      'builtin',
      'InternalArray',
      'FixedArray', 
      'PropertyArray',
      'DescriptorArray',
      'TransitionArray',
      'HashTable',
      'OrderedHashMap',
      'OrderedHashSet',
      'Context'
    ];
    
    return systemNames.some(name => node.name.startsWith(name)) ||
           node.type === 'hidden' ||
           node.type === 'synthetic';
  }

  private isNativeObject(node: HeapNode): boolean {
    const nativePatterns = [
      /^V8\./,
      /^Internal\./,
      /^Native\./,
      /^\(.*\)$/,  // Objects in parentheses are often internal
    ];
    
    return nativePatterns.some(pattern => pattern.test(node.name));
  }

  private rankObjectsBySize(nodes: HeapNode[]): HeapNode[] {
    return [...nodes].sort((a, b) => (b.retainedSize || 0) - (a.retainedSize || 0));
  }

  private enhanceWithAnalysis(rankedNodes: HeapNode[], totalMemory: number): LargeObject[] {
    return rankedNodes.map((node, index) => {
      const retainedSize = node.retainedSize || 0;
      const sizePercentage = totalMemory > 0 ? (retainedSize / totalMemory) * 100 : 0;
      
      return {
        node,
        rank: index + 1,
        retainedSize,
        sizePercentage,
        category: this.categorizeObject(node),
        significance: this.calculateSignificance(retainedSize, sizePercentage),
        confidence: this.calculateConfidence(node, retainedSize),
        optimization: this.generateOptimizationSuggestions(node, retainedSize)
      };
    });
  }

  private categorizeObject(node: HeapNode): ObjectCategory {
    const name = node.name.toLowerCase();
    const type = node.type;

    // Arrays and typed arrays
    if (type === 'array' || name.includes('array')) {
      if (name.includes('int') || name.includes('float') || name.includes('uint')) {
        return 'TYPED_ARRAY';
      }
      return 'ARRAY';
    }

    // Strings
    if (type === 'string' || type === 'concatenated string' || name.includes('string')) {
      return 'STRING';
    }

    // Functions and closures  
    if (type === 'closure' || name.includes('closure')) {
      return 'CLOSURE';
    }
    if (type === 'function' || name === 'Function') {
      return 'FUNCTION';
    }

    // Code objects
    if (type === 'code' || name.includes('code') || name.includes('instruction')) {
      return 'CODE';
    }

    // DOM nodes
    if (name.includes('html') || name.includes('element') || name.includes('node')) {
      return 'DOM_NODE';
    }

    // Regex
    if (name.includes('regexp') || name === 'RegExp') {
      return 'REGEXP';
    }

    // Date objects  
    if (name === 'Date') {
      return 'DATE';
    }

    // System objects
    if (name.startsWith('system') || type === 'hidden') {
      return 'SYSTEM';
    }

    // Regular objects
    if (type === 'object') {
      return 'OBJECT';
    }

    return 'UNKNOWN';
  }

  private calculateSignificance(size: number, percentage: number): ObjectSignificance {
    if (size >= this.CRITICAL_SIZE_THRESHOLD || percentage >= 5) {
      return 'CRITICAL';
    }
    if (size >= this.HIGH_SIZE_THRESHOLD || percentage >= 2) {
      return 'HIGH';
    }
    if (size >= this.MEDIUM_SIZE_THRESHOLD || percentage >= 0.5) {
      return 'MEDIUM';
    }
    if (size >= this.LOW_SIZE_THRESHOLD) {
      return 'LOW';
    }
    return 'NEGLIGIBLE';
  }

  private calculateConfidence(node: HeapNode, size: number): number {
    let confidence = 70; // Base confidence

    // Higher confidence for larger objects
    if (size > 10 * 1024 * 1024) confidence += 20; // >10MB
    if (size > 1024 * 1024) confidence += 10; // >1MB

    // Higher confidence for well-known object types
    if (['object', 'array', 'string', 'closure'].includes(node.type)) {
      confidence += 15;
    }

    // Lower confidence for system objects
    if (this.isSystemInternal(node)) {
      confidence -= 15;
    }

    // Lower confidence for very generic names
    if (node.name === 'Object' || node.name === 'unknown') {
      confidence -= 10;
    }

    return Math.min(Math.max(confidence, 20), 100);
  }

  private generateOptimizationSuggestions(node: HeapNode, size: number): string[] {
    const suggestions: string[] = [];
    const category = this.categorizeObject(node);
    
    // Size-based suggestions
    if (size > 10 * 1024 * 1024) { // >10MB
      suggestions.push('🔥 CRITICAL: Implement immediate size reduction');
      suggestions.push('📦 Consider breaking into smaller chunks');
    } else if (size > 5 * 1024 * 1024) { // >5MB
      suggestions.push('⚠️ HIGH: Review necessity and implement lazy loading');
    }

    // Category-specific suggestions  
    switch (category) {
      case 'ARRAY':
        suggestions.push('🔄 Use sparse arrays or pagination for large datasets');
        suggestions.push('🗑️ Implement cleanup for unused array elements');
        break;
      case 'STRING':
        suggestions.push('📝 Consider string interning or compression');
        suggestions.push('💾 Use StringBuilder pattern for large concatenations');
        break;
      case 'OBJECT':
        suggestions.push('🏗️ Review object structure and remove unused properties');
        suggestions.push('📊 Consider using Maps for dynamic key-value storage');
        break;
      case 'CLOSURE':
        suggestions.push('🔗 Review closure scope and captured variables');
        suggestions.push('💡 Consider breaking closure into smaller functions');
        break;
      case 'DOM_NODE':
        suggestions.push('🎯 Verify DOM element is still needed and attached');
        suggestions.push('🧹 Remove event listeners before element disposal');
        break;
      case 'CODE':
        suggestions.push('⚡ Review code generation and compilation patterns');
        suggestions.push('🔄 Consider code splitting or lazy compilation');
        break;
    }

    // General suggestions if no specific ones
    if (suggestions.length === 0) {
      suggestions.push('🔍 Investigate object lifecycle and cleanup opportunities');
      suggestions.push('📋 Review references to this object for optimization');
    }

    return suggestions;
  }

  private calculateSizeDistribution(objects: HeapNode[]): Record<ObjectCategory, SizeStats> {
    const distribution: Record<ObjectCategory, SizeStats> = {} as any;
    
    objects.forEach(node => {
      const category = this.categorizeObject(node);
      const size = node.retainedSize || 0;
      
      if (!distribution[category]) {
        distribution[category] = {
          count: 0,
          totalSize: 0,
          averageSize: 0,
          largestSize: 0
        };
      }
      
      const stats = distribution[category];
      stats.count++;
      stats.totalSize += size;
      stats.largestSize = Math.max(stats.largestSize, size);
    });
    
    // Calculate averages
    Object.values(distribution).forEach(stats => {
      stats.averageSize = stats.count > 0 ? stats.totalSize / stats.count : 0;
    });
    
    return distribution;
  }

  private calculateSignificanceBreakdown(objects: LargeObject[]): Record<ObjectSignificance, number> {
    const breakdown: Record<ObjectSignificance, number> = {
      'CRITICAL': 0,
      'HIGH': 0, 
      'MEDIUM': 0,
      'LOW': 0,
      'NEGLIGIBLE': 0
    };
    
    objects.forEach(obj => {
      breakdown[obj.significance]++;
    });
    
    return breakdown;
  }

  private calculateTopCategories(objects: HeapNode[]): CategoryRanking[] {
    const distribution = this.calculateSizeDistribution(objects);
    const totalMemory = objects.reduce((sum, node) => sum + (node.retainedSize || 0), 0);
    
    return Object.entries(distribution)
      .map(([category, stats]) => ({
        category: category as ObjectCategory,
        totalSize: stats.totalSize,
        count: stats.count,
        averageSize: stats.averageSize,
        percentage: totalMemory > 0 ? (stats.totalSize / totalMemory) * 100 : 0
      }))
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, 10); // Top 10 categories
  }

  private generateSummary(objects: LargeObject[], totalMemory: number): string {
    if (objects.length === 0) {
      return '✅ No large objects detected';
    }

    const criticalCount = objects.filter(obj => obj.significance === 'CRITICAL').length;
    const highCount = objects.filter(obj => obj.significance === 'HIGH').length;
    
    const memoryMB = (totalMemory / (1024 * 1024)).toFixed(1);
    
    if (criticalCount > 0) {
      return `🚨 CRITICAL: ${criticalCount} objects >10MB detected (${memoryMB} MB analyzed)`;
    }
    
    if (highCount > 0) {
      return `⚠️ HIGH: ${highCount} large objects detected (${memoryMB} MB analyzed)`;
    }

    const largestSize = objects[0]?.retainedSize || 0;
    return `📊 Top object: ${this.formatBytes(largestSize)} (${memoryMB} MB analyzed)`;
  }

  private generateInsights(objects: LargeObject[], distribution: Record<ObjectCategory, SizeStats>, topCategories: CategoryRanking[]): string[] {
    const insights: string[] = [];

    if (objects.length === 0) return insights;

    // Largest object insight
    const largest = objects[0];
    insights.push(`🔥 Largest object: ${largest.node.name} (${this.formatBytes(largest.retainedSize)}, ${largest.sizePercentage.toFixed(1)}% of heap)`);

    // Category insights
    if (topCategories.length > 0) {
      const topCategory = topCategories[0];
      if (topCategory.percentage > 25) {
        insights.push(`📊 ${topCategory.category} objects dominate memory (${topCategory.percentage.toFixed(1)}% of heap)`);
      }
    }

    // Size distribution insights
    const criticalObjects = objects.filter(obj => obj.significance === 'CRITICAL');
    if (criticalObjects.length > 0) {
      const criticalMemory = criticalObjects.reduce((sum, obj) => sum + obj.retainedSize, 0);
      insights.push(`⚠️ ${criticalObjects.length} critical objects consuming ${this.formatBytes(criticalMemory)}`);
    }

    // Memory concentration insight
    const top10Memory = objects.slice(0, 10).reduce((sum, obj) => sum + obj.retainedSize, 0);
    const top10Percentage = objects.length > 0 ? (top10Memory / (objects.reduce((sum, obj) => sum + obj.retainedSize, 0))) * 100 : 0;
    if (top10Percentage > 80) {
      insights.push(`🎯 Top 10 objects hold ${top10Percentage.toFixed(1)}% of analyzed memory - high concentration`);
    }

    return insights;
  }

  private generateRecommendations(objects: LargeObject[], topCategories: CategoryRanking[]): string[] {
    const recommendations: string[] = [];

    if (objects.length === 0) {
      recommendations.push('✅ No large object optimizations needed');
      return recommendations;
    }

    const criticalObjects = objects.filter(obj => obj.significance === 'CRITICAL');
    const highObjects = objects.filter(obj => obj.significance === 'HIGH');

    // Critical object recommendations
    if (criticalObjects.length > 0) {
      recommendations.push('🚨 Address critical objects immediately - implement size limits');
      recommendations.push(`🎯 Focus on top ${Math.min(3, criticalObjects.length)} critical objects first`);
    }

    // High impact recommendations
    if (highObjects.length > 0) {
      recommendations.push('⚡ Implement lazy loading for high-impact objects');
    }

    // Category-specific recommendations
    if (topCategories.length > 0) {
      const topCategory = topCategories[0];
      switch (topCategory.category) {
        case 'ARRAY':
          recommendations.push('🔄 Implement array pagination or virtualization');
          break;
        case 'STRING': 
          recommendations.push('📝 Consider string compression or interning');
          break;
        case 'OBJECT':
          recommendations.push('🏗️ Review object structures and implement property cleanup');
          break;
        case 'CLOSURE':
          recommendations.push('🔗 Optimize closure scope and captured variables');
          break;
      }
    }

    // General recommendations
    recommendations.push('🔍 Use Object Content Analyzer to inspect specific large objects');
    recommendations.push('📊 Monitor object sizes over time to prevent memory growth');
    recommendations.push('🛠️ Implement cleanup patterns for top memory consumers');

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