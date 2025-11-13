/**
 * Global Variable Memory Leak Analyzer
 * 
 * Dedicated analyzer for detecting memory leaks in global variables,
 * inspired by MemLab's GlobalVariableAnalysis but adapted for our heap format.
 */

import { HeapNode } from './heapAnalyzer.js';
import { isBuiltInGlobal } from './builtInGlobals.js';

export interface GlobalVariableResult {
  name: string;
  node: HeapNode;
  retainedSize: number;
  selfSize: number;
  type: string;
  edgeType: string;
  confidence: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  suggestedFix: string;
}

export interface GlobalVariableAnalysisResult {
  totalGlobalVariables: number;
  suspiciousGlobals: GlobalVariableResult[];
  totalMemoryImpact: number;
  topLeaks: GlobalVariableResult[];
  summary: string;
  recommendations: string[];
}

export class GlobalVariableAnalyzer {
  private nodes: HeapNode[];

  constructor(nodes: HeapNode[]) {
    this.nodes = nodes;
  }

  /**
   * Analyze global variables for memory leaks
   */
  public analyzeGlobalVariables(): GlobalVariableAnalysisResult {
    const windowNodes = this.findWindowNodes();
    const globalVariables = this.extractGlobalVariables(windowNodes);
    const suspiciousGlobals = this.identifySuspiciousGlobals(globalVariables);
    
    return this.generateReport(suspiciousGlobals);
  }

  /**
   * Find all Window objects in the heap
   */
  private findWindowNodes(): HeapNode[] {
    return this.nodes.filter(node => {
      const name = node.name || '';
      const type = node.type || '';
      
      return (
        name.startsWith('Window ') ||
        name === 'Window' ||
        name.includes('window') ||
        type === 'object' && (
          name.includes('global') ||
          name.includes('Global')
        )
      );
    });
  }

  /**
   * Extract global variable references from Window nodes
   */
  private extractGlobalVariables(windowNodes: HeapNode[]): GlobalVariableResult[] {
    const globalVars: GlobalVariableResult[] = [];
    
    windowNodes.forEach(windowNode => {
      // In our heap format, we need to find references differently
      // Look for large objects that could be global variables
      const potentialGlobals = this.findReferencesFromWindow(windowNode);
      globalVars.push(...potentialGlobals);
    });

    return globalVars.sort((a, b) => b.retainedSize - a.retainedSize);
  }

  /**
   * Find references from a window node that could be global variables
   */
  private findReferencesFromWindow(windowNode: HeapNode): GlobalVariableResult[] {
    const results: GlobalVariableResult[] = [];
    
    // Since we don't have direct edge traversal in our format,
    // we'll identify globals by patterns and size
    this.nodes.forEach(node => {
      const name = node.name || '';
      const globalVarName = this.extractGlobalVariableName(name);
      
      if (this.isLikelyGlobalVariable(node, globalVarName)) {
        const result: GlobalVariableResult = {
          name: globalVarName,
          node: node,
          retainedSize: node.retainedSize || node.selfSize,
          selfSize: node.selfSize,
          type: node.type || 'unknown',
          edgeType: this.inferEdgeType(name),
          confidence: this.calculateConfidence(node, globalVarName),
          severity: this.calculateSeverity(node.selfSize),
          description: this.generateDescription(node, globalVarName),
          suggestedFix: this.generateSuggestedFix(node, globalVarName)
        };
        
        results.push(result);
      }
    });

    return results;
  }

  /**
   * Check if a node is likely a global variable
   */
  private isLikelyGlobalVariable(node: HeapNode, variableName: string): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    // Filter out built-in globals
    if (isBuiltInGlobal(variableName)) {
      return false;
    }

    // Filter out certain types that are rarely global variables
    if (this.shouldFilterOutType(type)) {
      return false;
    }

    // Filter out symbol properties
    if (name.includes('<symbol>') || name.includes('Symbol(')) {
      return false;
    }

    // Look for patterns that indicate global variables
    return (
      name.includes('window.') ||
      name.includes('global.') ||
      (type === 'object' && node.selfSize > 1024) || // Objects > 1KB
      (type === 'array' && node.selfSize > 512) ||   // Arrays > 512B
      this.hasGlobalVariablePattern(name)
    );
  }

  /**
   * Extract the actual variable name from heap node name
   */
  private extractGlobalVariableName(fullName: string): string {
    if (fullName.includes('window.')) {
      return fullName.split('window.')[1]?.split(' ')[0] || fullName;
    }
    if (fullName.includes('global.')) {
      return fullName.split('global.')[1]?.split(' ')[0] || fullName;
    }
    
    // Extract meaningful name from other patterns
    return fullName.split(' ')[0] || fullName;
  }

  /**
   * Check if we should filter out this type
   */
  private shouldFilterOutType(type: string): boolean {
    const filteredTypes = new Set([
      'hidden',
      'number',
      'boolean',
      'null',
      'undefined',
      'symbol'
    ]);
    
    return filteredTypes.has(type);
  }

  /**
   * Check for global variable naming patterns
   */
  private hasGlobalVariablePattern(name: string): boolean {
    const globalPatterns = [
      'Cache', 'Store', 'Registry', 'Manager', 'Pool', 
      'Buffer', 'Archive', 'Collection', 'Map', 'Set',
      'Config', 'Settings', 'State', 'Data'
    ];
    
    return globalPatterns.some(pattern => 
      name.includes(pattern) && !isBuiltInGlobal(name)
    );
  }

  /**
   * Infer the edge type based on the name
   */
  private inferEdgeType(name: string): string {
    if (name.includes('window.')) return 'window_property';
    if (name.includes('global.')) return 'global_property';
    if (name.includes('[')) return 'array_element';
    return 'property';
  }

  /**
   * Calculate confidence that this is a problematic global variable
   */
  private calculateConfidence(node: HeapNode, variableName: string): number {
    let confidence = 50; // Base confidence
    
    // Size-based confidence
    if (node.selfSize > 100 * 1024) confidence += 30; // > 100KB
    else if (node.selfSize > 10 * 1024) confidence += 20; // > 10KB
    else if (node.selfSize > 1024) confidence += 10; // > 1KB
    
    // Pattern-based confidence
    if (this.hasGlobalVariablePattern(variableName)) confidence += 20;
    if (variableName.includes('window.') || variableName.includes('global.')) confidence += 15;
    
    // Type-based confidence
    if (node.type === 'array') confidence += 10;
    if (node.type === 'object') confidence += 5;
    
    return Math.min(confidence, 95); // Cap at 95%
  }

  /**
   * Calculate severity based on size
   */
  private calculateSeverity(size: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (size > 10 * 1024 * 1024) return 'CRITICAL'; // > 10MB
    if (size > 1024 * 1024) return 'HIGH';          // > 1MB
    if (size > 100 * 1024) return 'MEDIUM';         // > 100KB
    return 'LOW';
  }

  /**
   * Generate description for the global variable
   */
  private generateDescription(node: HeapNode, variableName: string): string {
    const sizeMB = (node.selfSize / (1024 * 1024)).toFixed(1);
    const sizeKB = (node.selfSize / 1024).toFixed(1);
    const sizeDisplay = node.selfSize > 1024 * 1024 ? `${sizeMB}MB` : `${sizeKB}KB`;
    
    return `Global variable '${variableName}' consuming ${sizeDisplay} of memory (${node.type})`;
  }

  /**
   * Generate suggested fix for the global variable leak
   */
  private generateSuggestedFix(node: HeapNode, variableName: string): string {
    const fixes = [
      `Clear ${variableName} when no longer needed`,
      `Set ${variableName} = null in cleanup code`,
      `Implement size limits for ${variableName}`,
      `Move ${variableName} to local scope if possible`,
      `Add periodic cleanup for ${variableName}`
    ];
    
    // Choose fix based on patterns
    if (variableName.toLowerCase().includes('cache')) {
      return `Implement cache size limits and expiration for ${variableName}`;
    }
    if (variableName.toLowerCase().includes('array') || node.type === 'array') {
      return `Clear array contents: ${variableName}.length = 0 or implement array size limits`;
    }
    if (variableName.toLowerCase().includes('map') || variableName.toLowerCase().includes('set')) {
      return `Clear collection: ${variableName}.clear() or implement LRU eviction`;
    }
    
    return fixes[0]; // Default fix
  }

  /**
   * Identify suspicious global variables
   */
  private identifySuspiciousGlobals(globalVariables: GlobalVariableResult[]): GlobalVariableResult[] {
    return globalVariables.filter(gv => 
      gv.confidence > 60 && 
      (gv.severity === 'HIGH' || gv.severity === 'CRITICAL' || gv.selfSize > 50 * 1024)
    );
  }

  /**
   * Generate comprehensive analysis report
   */
  private generateReport(suspiciousGlobals: GlobalVariableResult[]): GlobalVariableAnalysisResult {
    const totalMemoryImpact = suspiciousGlobals.reduce((sum, gv) => sum + gv.selfSize, 0);
    const topLeaks = suspiciousGlobals.slice(0, 10); // Top 10 by size
    
    const criticalCount = suspiciousGlobals.filter(gv => gv.severity === 'CRITICAL').length;
    const highCount = suspiciousGlobals.filter(gv => gv.severity === 'HIGH').length;
    
    let summary = '';
    if (criticalCount > 0) {
      summary = `🚨 CRITICAL: ${criticalCount} critical global variable leaks found!`;
    } else if (highCount > 0) {
      summary = `⚠️ HIGH: ${highCount} high-impact global variable leaks detected`;
    } else if (suspiciousGlobals.length > 0) {
      summary = `💡 ${suspiciousGlobals.length} potential global variable issues found`;
    } else {
      summary = '✅ No significant global variable leaks detected';
    }

    const recommendations = this.generateRecommendations(suspiciousGlobals);

    return {
      totalGlobalVariables: suspiciousGlobals.length,
      suspiciousGlobals,
      totalMemoryImpact,
      topLeaks,
      summary,
      recommendations
    };
  }

  /**
   * Generate targeted recommendations based on findings
   */
  private generateRecommendations(suspiciousGlobals: GlobalVariableResult[]): string[] {
    const recommendations: string[] = [];
    
    if (suspiciousGlobals.length === 0) {
      recommendations.push('✅ Global variable usage appears healthy');
      return recommendations;
    }

    // Group by patterns
    const caches = suspiciousGlobals.filter(gv => gv.name.toLowerCase().includes('cache'));
    const arrays = suspiciousGlobals.filter(gv => gv.type === 'array');
    const largeObjects = suspiciousGlobals.filter(gv => gv.selfSize > 1024 * 1024);

    if (largeObjects.length > 0) {
      recommendations.push(`🚨 ${largeObjects.length} global variables > 1MB - implement immediate cleanup`);
    }
    
    if (caches.length > 0) {
      recommendations.push(`🗄️ ${caches.length} cache-related globals - add size limits and expiration`);
    }
    
    if (arrays.length > 0) {
      recommendations.push(`📦 ${arrays.length} global arrays - implement periodic cleanup or size limits`);
    }

    recommendations.push('🔍 Review global variable lifecycle and cleanup patterns');
    recommendations.push('💡 Consider moving large globals to local scopes when possible');

    return recommendations;
  }
}

/**
 * Convenience function for quick global variable analysis
 */
export function analyzeGlobalVariables(nodes: HeapNode[]): GlobalVariableAnalysisResult {
  const analyzer = new GlobalVariableAnalyzer(nodes);
  return analyzer.analyzeGlobalVariables();
}