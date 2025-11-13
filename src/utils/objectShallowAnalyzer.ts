/**
 * Object Shallow Analyzer
 * 
 * Inspired by MemLab's ObjectShallowAnalysis
 * Finds duplicated objects by analyzing their shallow structure (properties and values)
 * without recursing into sub-objects. Identifies memory waste from object duplication
 * and provides insights into redundant data structures.
 */

import { HeapNode, HeapSnapshot, HeapEdge } from '../types';
import { isBuiltInGlobal } from './builtInGlobals.js';

interface ObjectRecord {
  count: number;                    // Number of duplicated objects with this pattern
  totalSize: number;               // Aggregated retained sizes of all duplicated objects
  ids: number[];                   // Heap object IDs of the duplicated objects
  pattern: string;                 // Object pattern (serialized shallow structure)
  averageSize: number;            // Average size per object
  wastedMemory: number;           // Memory that could be saved by deduplication
  className: string;              // Object class/constructor name
  sampleObject: any;              // Sample object structure for inspection
}

interface ObjectPatternStat {
  totalObjects: number;           // Total number of objects matching pattern
  duplicatedObjects: number;      // Number that are duplicates (count > 1)
  totalSize: number;              // Total memory used
  duplicatedSize: number;         // Memory used by duplicates
  duplicationRate: number;        // Percentage of objects that are duplicates
  wasteRate: number;              // Percentage of memory that's wasted
}

interface ObjectShallowResult {
  topDuplicatedByCount: ObjectRecord[];
  topDuplicatedBySize: ObjectRecord[];
  patternStatistics: Record<string, ObjectPatternStat>;
  totalAnalyzedObjects: number;
  totalDuplicatedObjects: number;
  totalWastedMemory: number;
  duplicationRate: number;
  mostWastedClasses: Array<{className: string; wastedMemory: number; count: number}>;
  summary: string;
  insights: string[];
  recommendations: string[];
}

export class ObjectShallowAnalyzer {
  private readonly MIN_DUPLICATION_COUNT = 2;
  private readonly MAX_OBJECT_DISPLAY_LENGTH = 100;
  private readonly SUSPICIOUS_DUPLICATION_THRESHOLD = 10;
  private readonly CRITICAL_DUPLICATION_THRESHOLD = 50;

  analyze(snapshot: HeapSnapshot, listSize: number = 15): ObjectShallowResult {
    const objectMap = this.buildObjectMap(snapshot);
    const patternStats = this.calculatePatternStatistics(objectMap);
    const topByCount = this.getTopDuplicatedByCount(objectMap, listSize);
    const topBySize = this.getTopDuplicatedBySize(objectMap, listSize);
    
    const totalAnalyzed = Object.values(objectMap).reduce((sum, record) => sum + record.count, 0);
    const totalDuplicated = Object.values(objectMap).reduce((sum, record) => 
      sum + Math.max(0, record.count - 1), 0);
    const totalWastedMemory = Object.values(objectMap).reduce((sum, record) => 
      sum + record.wastedMemory, 0);
    const duplicationRate = totalAnalyzed > 0 ? (totalDuplicated / totalAnalyzed) * 100 : 0;

    const mostWastedClasses = this.getMostWastedClasses(objectMap);

    return {
      topDuplicatedByCount: topByCount,
      topDuplicatedBySize: topBySize,
      patternStatistics: patternStats,
      totalAnalyzedObjects: totalAnalyzed,
      totalDuplicatedObjects: totalDuplicated,
      totalWastedMemory,
      duplicationRate,
      mostWastedClasses,
      summary: this.generateSummary(totalDuplicated, totalWastedMemory, duplicationRate),
      insights: this.generateInsights(topByCount, topBySize, mostWastedClasses, duplicationRate),
      recommendations: this.generateRecommendations(topByCount, topBySize, mostWastedClasses)
    };
  }

  private buildObjectMap(snapshot: HeapSnapshot): Record<string, ObjectRecord> {
    const objectMap: Record<string, ObjectRecord> = {};

    snapshot.nodes.forEach(node => {
      if (!this.shouldAnalyzeNode(node)) {
        return;
      }

      const shallowObject = this.nodeToShallowObject(node, snapshot);
      const pattern = JSON.stringify(shallowObject);

      if (!objectMap[pattern]) {
        objectMap[pattern] = {
          count: 0,
          totalSize: 0,
          ids: [],
          pattern,
          averageSize: 0,
          wastedMemory: 0,
          className: node.name,
          sampleObject: shallowObject
        };
      }

      const record = objectMap[pattern];
      record.count++;
      record.totalSize += node.retainedSize || 0;
      record.ids.push(node.id);
    });

    // Calculate derived metrics
    Object.values(objectMap).forEach(record => {
      record.averageSize = record.count > 0 ? record.totalSize / record.count : 0;
      // Wasted memory is the memory used by all duplicates (keeping only 1 copy)
      record.wastedMemory = record.count > 1 
        ? ((record.count - 1) / record.count) * record.totalSize 
        : 0;
    });

    return objectMap;
  }

  private shouldAnalyzeNode(node: HeapNode): boolean {
    // Skip built-in globals
    if (isBuiltInGlobal(node.name)) {
      return false;
    }

    // Skip very small objects (likely primitives)
    if ((node.retainedSize || 0) < 100) {
      return false;
    }

    // Focus on objects (not primitives or system types)
    if (node.type !== 'object') {
      return false;
    }

    // Skip system objects and built-in types
    const skipPatterns = [
      'Array',
      'ArrayBuffer', 
      'Set',
      'Map',
      'Window',
      'system /',
      'native',
      'builtin',
      'InternalArray',
      'FixedArray'
    ];

    const name = node.name;
    if (skipPatterns.some(pattern => name.startsWith(pattern))) {
      return false;
    }

    return true;
  }

  private nodeToShallowObject(node: HeapNode, snapshot: HeapSnapshot): any {
    const result: Record<string, any> = {};

    if (!snapshot.edges) {
      return { class: node.name, object: result };
    }

    // Get property edges from this node
    const propertyEdges = snapshot.edges.filter(edge => 
      edge.fromNode === node.id && 
      edge.type === 'property' &&
      edge.name !== '__proto__'
    );

    propertyEdges.forEach(edge => {
      if (!edge.name) return;

      const key = edge.name;
      const targetNode = snapshot.nodes.find(n => n.id === edge.toNode);
      
      if (!targetNode) {
        result[key] = 'UNKNOWN';
        return;
      }

      // Extract primitive values, use references for objects
      if (this.isStringLikeNode(targetNode)) {
        result[key] = this.extractStringValue(targetNode);
      } else if (this.isNumberLikeNode(targetNode)) {
        result[key] = this.extractNumberValue(targetNode);
      } else if (this.isBooleanLikeNode(targetNode)) {
        result[key] = this.extractBooleanValue(targetNode);
      } else if (targetNode.name === 'null') {
        result[key] = null;
      } else if (targetNode.name === 'undefined') {
        result[key] = undefined;
      } else {
        // For objects, use a reference pattern to detect structural similarity
        result[key] = `REF_${targetNode.type}_${targetNode.name}`;
      }
    });

    return {
      class: node.name,
      object: result
    };
  }

  private isStringLikeNode(node: HeapNode): boolean {
    return node.type === 'string' || 
           node.name.includes('String') ||
           node.type === 'concatenated string';
  }

  private isNumberLikeNode(node: HeapNode): boolean {
    return node.type === 'number' || node.name === 'Number';
  }

  private isBooleanLikeNode(node: HeapNode): boolean {
    return node.type === 'boolean' || node.name === 'Boolean';
  }

  private extractStringValue(node: HeapNode): string {
    // In a real implementation, you'd parse the string value from the heap
    // For now, return a placeholder that indicates it's a string
    return `"${node.name || 'string'}"`;
  }

  private extractNumberValue(node: HeapNode): number | string {
    // In a real implementation, you'd parse the number value from the heap
    return `NUM_${node.selfSize || 0}`;
  }

  private extractBooleanValue(node: HeapNode): boolean | string {
    // In a real implementation, you'd parse the boolean value from the heap
    return node.name === 'true' ? true : node.name === 'false' ? false : 'BOOL';
  }

  private calculatePatternStatistics(objectMap: Record<string, ObjectRecord>): Record<string, ObjectPatternStat> {
    const stats: Record<string, ObjectPatternStat> = {
      'All Objects': {
        totalObjects: 0,
        duplicatedObjects: 0,
        totalSize: 0,
        duplicatedSize: 0,
        duplicationRate: 0,
        wasteRate: 0
      }
    };

    const allStats = stats['All Objects'];

    Object.values(objectMap).forEach(record => {
      allStats.totalObjects += record.count;
      allStats.totalSize += record.totalSize;

      if (record.count > 1) {
        allStats.duplicatedObjects += record.count - 1;
        allStats.duplicatedSize += record.wastedMemory;
      }
    });

    // Calculate rates
    if (allStats.totalObjects > 0) {
      allStats.duplicationRate = (allStats.duplicatedObjects / allStats.totalObjects) * 100;
    }
    if (allStats.totalSize > 0) {
      allStats.wasteRate = (allStats.duplicatedSize / allStats.totalSize) * 100;
    }

    return stats;
  }

  private getTopDuplicatedByCount(objectMap: Record<string, ObjectRecord>, listSize: number): ObjectRecord[] {
    return Object.values(objectMap)
      .filter(record => record.count >= this.MIN_DUPLICATION_COUNT)
      .sort((a, b) => b.count - a.count)
      .slice(0, listSize);
  }

  private getTopDuplicatedBySize(objectMap: Record<string, ObjectRecord>, listSize: number): ObjectRecord[] {
    return Object.values(objectMap)
      .filter(record => record.count >= this.MIN_DUPLICATION_COUNT)
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, listSize);
  }

  private getMostWastedClasses(objectMap: Record<string, ObjectRecord>): Array<{className: string; wastedMemory: number; count: number}> {
    const classWaste: Record<string, {wastedMemory: number; count: number}> = {};

    Object.values(objectMap).forEach(record => {
      if (record.count > 1) {
        const className = record.className;
        if (!classWaste[className]) {
          classWaste[className] = { wastedMemory: 0, count: 0 };
        }
        classWaste[className].wastedMemory += record.wastedMemory;
        classWaste[className].count += record.count - 1; // Number of duplicate instances
      }
    });

    return Object.entries(classWaste)
      .map(([className, data]) => ({ className, ...data }))
      .sort((a, b) => b.wastedMemory - a.wastedMemory)
      .slice(0, 10);
  }

  private generateSummary(totalDuplicated: number, totalWasted: number, duplicationRate: number): string {
    if (totalDuplicated === 0) {
      return '✅ No significant object duplication detected';
    }

    const wastedMB = totalWasted / (1024 * 1024);
    
    if (duplicationRate > 50) {
      return `🚨 CRITICAL: ${totalDuplicated} duplicated objects wasting ${wastedMB.toFixed(1)} MB (${duplicationRate.toFixed(1)}% duplication rate)`;
    } else if (duplicationRate > 25) {
      return `⚠️ HIGH: ${totalDuplicated} duplicated objects wasting ${wastedMB.toFixed(1)} MB (${duplicationRate.toFixed(1)}% duplication rate)`;
    } else if (duplicationRate > 10) {
      return `🟡 MEDIUM: ${totalDuplicated} duplicated objects wasting ${wastedMB.toFixed(1)} MB (${duplicationRate.toFixed(1)}% duplication rate)`;
    } else {
      return `📊 ${totalDuplicated} duplicated objects found, wasting ${wastedMB.toFixed(1)} MB (${duplicationRate.toFixed(1)}% duplication rate)`;
    }
  }

  private generateInsights(
    topByCount: ObjectRecord[], 
    topBySize: ObjectRecord[], 
    mostWasted: Array<{className: string; wastedMemory: number; count: number}>,
    duplicationRate: number
  ): string[] {
    const insights: string[] = [];

    if (topByCount.length > 0) {
      const maxCount = topByCount[0].count;
      if (maxCount >= this.CRITICAL_DUPLICATION_THRESHOLD) {
        insights.push(`🚨 Extreme duplication detected: ${maxCount} identical objects`);
      } else if (maxCount >= this.SUSPICIOUS_DUPLICATION_THRESHOLD) {
        insights.push(`⚠️ High duplication detected: ${maxCount} identical objects`);
      }
    }

    if (topBySize.length > 0) {
      const largestWaste = topBySize[0].wastedMemory / (1024 * 1024);
      if (largestWaste > 5) {
        insights.push(`💾 Large memory waste: ${largestWaste.toFixed(1)} MB from single object pattern`);
      }
    }

    if (mostWasted.length > 0) {
      const topWastedClass = mostWasted[0];
      insights.push(`🎯 Most wasteful class: ${topWastedClass.className} (${(topWastedClass.wastedMemory / (1024 * 1024)).toFixed(1)} MB wasted)`);
    }

    if (duplicationRate > 30) {
      insights.push(`📊 High overall duplication rate: ${duplicationRate.toFixed(1)}% of analyzed objects are duplicates`);
    }

    // Pattern insights
    const classPatterns = new Set(topByCount.map(obj => obj.className));
    if (classPatterns.size < topByCount.length / 2) {
      insights.push(`🔄 Duplication concentrated in few classes: ${classPatterns.size} classes account for top duplications`);
    }

    return insights;
  }

  private generateRecommendations(
    topByCount: ObjectRecord[], 
    topBySize: ObjectRecord[], 
    mostWasted: Array<{className: string; wastedMemory: number; count: number}>
  ): string[] {
    const recommendations: string[] = [];

    if (topByCount.length === 0) {
      recommendations.push('✅ No object deduplication needed');
      return recommendations;
    }

    // High-level recommendations
    recommendations.push('🔄 Implement object deduplication or caching for repeated patterns');
    recommendations.push('📦 Consider object pooling for frequently created identical objects');

    // Class-specific recommendations
    if (mostWasted.length > 0) {
      const topClass = mostWasted[0];
      recommendations.push(`🎯 Priority: Focus on ${topClass.className} class - highest memory waste`);
    }

    // Pattern-specific recommendations
    const configLikeObjects = topByCount.filter(obj => 
      obj.className.toLowerCase().includes('config') || 
      JSON.stringify(obj.sampleObject).includes('config')
    );
    
    if (configLikeObjects.length > 0) {
      recommendations.push('⚙️ Configuration objects detected - consider singleton pattern or shared instances');
    }

    const dataObjects = topByCount.filter(obj => 
      obj.count >= this.SUSPICIOUS_DUPLICATION_THRESHOLD
    );
    
    if (dataObjects.length > 0) {
      recommendations.push('💾 High duplication detected - implement data normalization or referential integrity');
    }

    // Technical recommendations
    recommendations.push('🔍 Use WeakMap for object caching to prevent memory leaks');
    recommendations.push('📊 Monitor object creation patterns to prevent future duplication');
    recommendations.push('🛠️ Consider using Object.freeze() for immutable shared objects');

    return recommendations;
  }

  private ellipsis(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
      return str;
    }
    return str.slice(0, maxLength - 3) + '...';
  }
}