/**
 * String Analysis Analyzer
 * 
 * Finds duplicated string instances in JavaScript heap and ranks them
 * based on duplicated string size and count. Identifies memory waste
 * from string duplication patterns.
 * 
 * Inspired by MemLab's StringAnalysis
 */

import { HeapNode } from './heapAnalyzer.js';
import { isBuiltInGlobal } from './builtInGlobals.js';

interface StringRecord {
  /** number of duplicated strings with this pattern */
  count: number;
  /** aggregated retained sizes of all duplicated strings with this pattern */
  totalSize: number;
  /** average size per string instance */
  averageSize: number;
  /** heap object ids of the duplicated string */
  nodeIds: number[];
  /** duplicated string content */
  content: string;
  /** confidence score for this being a problem */
  confidence: number;
  /** severity of the duplication */
  severity: StringSeverity;
  /** recommendations for this string pattern */
  recommendations: string[];
}

interface StringPatternRecord {
  patternName: string;
  totalCount: number;
  duplicatedCount: number;
  totalSize: number;
  duplicatedSize: number;
  wastePercentage: number;
  examples: string[];
}

interface StringAnalysisResult {
  topDuplicatedByCount: StringRecord[];
  topDuplicatedBySize: StringRecord[];
  stringPatterns: StringPatternRecord[];
  totalStringsAnalyzed: number;
  totalDuplicatedStrings: number;
  totalWastedMemory: number;
  wastePercentage: number;
  insights: string[];
  recommendations: string[];
  summary: string;
}

type StringSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type StringPatterns = {
  [patternName: string]: (str: string) => boolean;
};

export { StringAnalysisResult, StringRecord };

export class StringAnalyzer {
  private static readonly MAX_STRING_DISPLAY_LENGTH = 100;
  private static readonly TOP_STRINGS_COUNT = 15;

  // String patterns to analyze (inspired by MemLab but adapted for general use)
  private static readonly STRING_PATTERNS: StringPatterns = {
    'All strings': () => true,
    
    'URL patterns': (str: string) => {
      return /^https?:\/\//.test(str) || str.startsWith('//') || str.includes('://');
    },
    
    'JSON strings': (str: string) => {
      return (str.startsWith('{') && str.endsWith('}')) || 
             (str.startsWith('[') && str.endsWith(']'));
    },
    
    'CSS class names': (str: string) => {
      const parts = str.trim().split(/\s+/);
      if (parts.length < 2) return false;
      return parts.every(part => /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(part));
    },
    
    'Base64 encoded': (str: string) => {
      if (str.length < 20) return false;
      return /^[A-Za-z0-9+/]+=*$/.test(str) || str.startsWith('data:');
    },
    
    'UUIDs': (str: string) => {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    },
    
    'File paths': (str: string) => {
      return str.includes('/') && (str.includes('.') || str.startsWith('/'));
    },
    
    'Error messages': (str: string) => {
      return str.toLowerCase().includes('error') || 
             str.toLowerCase().includes('exception') ||
             str.toLowerCase().includes('failed');
    },
    
    'React keys': (str: string) => {
      return str.startsWith('.$') || str.startsWith('.r');
    },
    
    'Timestamp patterns': (str: string) => {
      return /^\d{10,13}$/.test(str) || /^\d{4}-\d{2}-\d{2}/.test(str);
    },
    
    'Long repeated text': (str: string) => {
      if (str.length < 50) return false;
      const chunks = str.match(/.{1,10}/g) || [];
      const uniqueChunks = new Set(chunks);
      return uniqueChunks.size < chunks.length * 0.5; // More than 50% repetition
    }
  };

  analyze(input: { nodes: HeapNode[] }): StringAnalysisResult {
    const { nodes } = input;
    
    // Build string map from heap nodes
    const stringMap = this.buildStringMap(nodes);
    
    // Calculate pattern statistics
    const stringPatterns = this.calculateStringPatterns(stringMap);
    
    // Find top duplicated strings
    const topDuplicatedByCount = this.getTopDuplicatedByCount(stringMap);
    const topDuplicatedBySize = this.getTopDuplicatedBySize(stringMap);
    
    // Calculate overall statistics
    const stats = this.calculateOverallStats(stringMap);
    
    // Generate insights and recommendations
    const insights = this.generateInsights(stringMap, stringPatterns, stats);
    const recommendations = this.generateRecommendations(topDuplicatedByCount, topDuplicatedBySize, stringPatterns);
    
    return {
      topDuplicatedByCount,
      topDuplicatedBySize,
      stringPatterns,
      totalStringsAnalyzed: stats.totalStrings,
      totalDuplicatedStrings: stats.duplicatedStrings,
      totalWastedMemory: stats.wastedMemory,
      wastePercentage: stats.wastePercentage,
      insights,
      recommendations,
      summary: this.generateSummary(stats)
    };
  }

  private buildStringMap(nodes: HeapNode[]): Map<string, StringRecord> {
    const stringMap = new Map<string, StringRecord>();
    
    for (const node of nodes) {
      // Only process string nodes
      if (node.type !== 'string') continue;
      
      // Skip system strings and built-ins
      if (isBuiltInGlobal(node.name)) continue;
      if (node.name === '(system)' || node.name === '(internal)') continue;
      
      // Extract string content (use name as content for string nodes)
      const content = this.extractStringContent(node);
      if (!content || content.length === 0) continue;
      
      // Skip very short strings (likely not significant duplicates)
      if (content.length < 3) continue;
      
      if (!stringMap.has(content)) {
        stringMap.set(content, {
          count: 0,
          totalSize: 0,
          averageSize: 0,
          nodeIds: [],
          content,
          confidence: 70,
          severity: 'LOW',
          recommendations: []
        });
      }
      
      const record = stringMap.get(content)!;
      record.count++;
      record.totalSize += node.selfSize;
      record.nodeIds.push(node.id);
    }
    
    // Post-process records
    for (const record of stringMap.values()) {
      record.averageSize = record.count > 0 ? record.totalSize / record.count : 0;
      record.severity = this.calculateStringSeverity(record);
      record.confidence = this.calculateStringConfidence(record);
      record.recommendations = this.generateStringRecommendations(record);
    }
    
    return stringMap;
  }

  private extractStringContent(node: HeapNode): string {
    // For string nodes, the name often contains the actual string content
    let content = node.name;
    
    // Clean up common prefixes/suffixes
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }
    if (content.startsWith("'") && content.endsWith("'")) {
      content = content.slice(1, -1);
    }
    
    // Truncate very long strings for analysis
    if (content.length > 1000) {
      content = content.substring(0, 1000);
    }
    
    return content;
  }

  private calculateStringSeverity(record: StringRecord): StringSeverity {
    const wastedMemory = (record.count - 1) * record.averageSize;
    const duplicateCount = record.count;
    
    if (wastedMemory > 5 * 1024 * 1024 || duplicateCount > 1000) return 'CRITICAL';
    if (wastedMemory > 1024 * 1024 || duplicateCount > 500) return 'HIGH';
    if (wastedMemory > 100 * 1024 || duplicateCount > 100) return 'MEDIUM';
    return 'LOW';
  }

  private calculateStringConfidence(record: StringRecord): number {
    let confidence = 60;
    
    // Higher count = higher confidence
    if (record.count > 100) confidence += 20;
    else if (record.count > 50) confidence += 15;
    else if (record.count > 10) confidence += 10;
    else if (record.count > 5) confidence += 5;
    
    // Larger strings = higher confidence
    if (record.averageSize > 1024) confidence += 15;
    else if (record.averageSize > 100) confidence += 10;
    else if (record.averageSize > 50) confidence += 5;
    
    // Content analysis
    const content = record.content.toLowerCase();
    if (content.includes('http') || content.includes('data:')) confidence += 5;
    if (content.length > 100) confidence += 5;
    
    return Math.min(confidence, 95);
  }

  private generateStringRecommendations(record: StringRecord): string[] {
    const recommendations: string[] = [];
    const content = record.content;
    const wastedMemory = (record.count - 1) * record.averageSize;
    
    if (record.severity === 'CRITICAL' || record.severity === 'HIGH') {
      recommendations.push(`High-priority optimization: ${this.formatBytes(wastedMemory)} wasted memory`);
    }
    
    if (content.includes('http') || content.includes('://')) {
      recommendations.push('Consider URL constant pooling or string interning');
    }
    
    if (content.startsWith('{') || content.startsWith('[')) {
      recommendations.push('Consider JSON object caching instead of string duplication');
    }
    
    if (content.includes('data:')) {
      recommendations.push('Use shared references for data URLs instead of duplication');
    }
    
    if (record.count > 100) {
      recommendations.push(`String appears ${record.count} times - implement string interning`);
    }
    
    if (content.length > 200) {
      recommendations.push('Large string content - consider compression or shared references');
    }
    
    recommendations.push('Implement string deduplication or use string constants');
    
    return recommendations;
  }

  private calculateStringPatterns(stringMap: Map<string, StringRecord>): StringPatternRecord[] {
    const patterns: StringPatternRecord[] = [];
    
    for (const [patternName, patternCheck] of Object.entries(StringAnalyzer.STRING_PATTERNS)) {
      let totalCount = 0;
      let duplicatedCount = 0;
      let totalSize = 0;
      let duplicatedSize = 0;
      const examples: string[] = [];
      
      for (const [content, record] of stringMap.entries()) {
        if (!patternCheck(content)) continue;
        
        totalCount += record.count;
        totalSize += record.totalSize;
        
        if (record.count > 1) {
          duplicatedCount += record.count - 1;
          duplicatedSize += (record.totalSize * (record.count - 1)) / record.count;
          
          if (examples.length < 3) {
            examples.push(this.truncateString(content, 50));
          }
        }
      }
      
      if (totalCount > 0) {
        patterns.push({
          patternName,
          totalCount,
          duplicatedCount,
          totalSize,
          duplicatedSize,
          wastePercentage: totalSize > 0 ? (duplicatedSize / totalSize) * 100 : 0,
          examples
        });
      }
    }
    
    return patterns.sort((a, b) => b.duplicatedSize - a.duplicatedSize);
  }

  private getTopDuplicatedByCount(stringMap: Map<string, StringRecord>): StringRecord[] {
    return Array.from(stringMap.values())
      .filter(record => record.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, StringAnalyzer.TOP_STRINGS_COUNT);
  }

  private getTopDuplicatedBySize(stringMap: Map<string, StringRecord>): StringRecord[] {
    return Array.from(stringMap.values())
      .filter(record => record.count > 1)
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, StringAnalyzer.TOP_STRINGS_COUNT);
  }

  private calculateOverallStats(stringMap: Map<string, StringRecord>) {
    let totalStrings = 0;
    let duplicatedStrings = 0;
    let wastedMemory = 0;
    let totalMemory = 0;
    
    for (const record of stringMap.values()) {
      totalStrings += record.count;
      totalMemory += record.totalSize;
      
      if (record.count > 1) {
        duplicatedStrings += record.count - 1;
        wastedMemory += (record.totalSize * (record.count - 1)) / record.count;
      }
    }
    
    return {
      totalStrings,
      duplicatedStrings,
      wastedMemory,
      totalMemory,
      wastePercentage: totalMemory > 0 ? (wastedMemory / totalMemory) * 100 : 0
    };
  }

  private generateInsights(
    stringMap: Map<string, StringRecord>, 
    patterns: StringPatternRecord[], 
    stats: any
  ): string[] {
    const insights: string[] = [];
    
    if (stats.wastedMemory > 10 * 1024 * 1024) {
      insights.push(`🚨 Significant string waste detected: ${this.formatBytes(stats.wastedMemory)}`);
    }
    
    if (stats.wastePercentage > 25) {
      insights.push(`📊 ${stats.wastePercentage.toFixed(1)}% of string memory is duplicated`);
    }
    
    const highWastePatterns = patterns.filter(p => p.wastePercentage > 50);
    if (highWastePatterns.length > 0) {
      insights.push(`🔍 ${highWastePatterns.length} string patterns show >50% waste`);
    }
    
    const criticalStrings = Array.from(stringMap.values()).filter(s => s.severity === 'CRITICAL');
    if (criticalStrings.length > 0) {
      insights.push(`⚠️ ${criticalStrings.length} strings with critical duplication levels`);
    }
    
    const uniqueStrings = stringMap.size;
    if (stats.totalStrings > uniqueStrings * 3) {
      insights.push(`🔄 High string duplication ratio: ${(stats.totalStrings / uniqueStrings).toFixed(1)}:1`);
    }
    
    insights.push(`📈 Analyzed ${stats.totalStrings} strings (${uniqueStrings} unique)`);
    
    return insights;
  }

  private generateRecommendations(
    byCount: StringRecord[], 
    bySize: StringRecord[], 
    patterns: StringPatternRecord[]
  ): string[] {
    const recommendations: string[] = [];
    
    const highWastePatterns = patterns.filter(p => p.duplicatedSize > 1024 * 1024);
    if (highWastePatterns.length > 0) {
      recommendations.push('🎯 Focus on high-waste string patterns for maximum impact');
    }
    
    const criticalBySize = bySize.filter(s => s.severity === 'CRITICAL');
    if (criticalBySize.length > 0) {
      recommendations.push('🚨 Address critical string duplications immediately');
    }
    
    const criticalByCount = byCount.filter(s => s.count > 500);
    if (criticalByCount.length > 0) {
      recommendations.push('♻️ Implement string interning for high-frequency strings');
    }
    
    const hasJsonPattern = patterns.some(p => p.patternName === 'JSON strings' && p.duplicatedSize > 100 * 1024);
    if (hasJsonPattern) {
      recommendations.push('📦 Consider JSON object caching to reduce string duplication');
    }
    
    const hasUrlPattern = patterns.some(p => p.patternName === 'URL patterns' && p.duplicatedSize > 100 * 1024);
    if (hasUrlPattern) {
      recommendations.push('🔗 Implement URL constant pooling for frequently used URLs');
    }
    
    recommendations.push('📚 Implement string deduplication strategies in application code');
    recommendations.push('🔧 Use string constants or enums for repeated text');
    recommendations.push('💾 Consider compression for large repeated strings');
    
    return recommendations;
  }

  private generateSummary(stats: any): string {
    if (stats.wastedMemory < 100 * 1024) {
      return `✅ Minimal string duplication detected (${this.formatBytes(stats.wastedMemory)} wasted)`;
    } else if (stats.wastedMemory > 10 * 1024 * 1024) {
      return `🚨 CRITICAL: ${this.formatBytes(stats.wastedMemory)} wasted memory from string duplication`;
    } else if (stats.wastedMemory > 1024 * 1024) {
      return `⚠️ HIGH: ${this.formatBytes(stats.wastedMemory)} wasted memory from string duplication`;
    } else {
      return `📊 Detected ${this.formatBytes(stats.wastedMemory)} wasted memory from string duplication`;
    }
  }

  private truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}