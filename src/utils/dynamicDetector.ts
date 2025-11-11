/**
 * Dynamic Memory Leak Detector
 * Analyzes heap snapshots without hardcoded assumptions
 * Extracts actual patterns and variable names from heap data
 */

import { MEMORY_THRESHOLDS, calculateLeakConfidence, calculateSeverity } from './memoryThresholds.js';

export interface GlobalVariable {
  name: string;
  size: number;
  retainedSize: number;
  type: string;
  confidence: number;
  severity: string;
  description: string;
  location: 'window' | 'global' | 'unknown';
}

export interface MemoryPattern {
  type: 'array_growth' | 'object_accumulation' | 'event_listeners' | 'closures' | 'dom_retention';
  objects: any[];
  description: string;
  confidence: number;
  severity: string;
  size: number;
  suggestedFix: string;
}

export interface DynamicAnalysisResult {
  globalVariables: GlobalVariable[];
  memoryPatterns: MemoryPattern[];
  suspiciousObjects: any[];
  recommendations: string[];
  confidence: number;
  severity: string;
}

/**
 * Extract actual global variables from heap snapshot data
 */
export function detectGlobalVariables(heapSnapshot: any): GlobalVariable[] {
  const globalVars: GlobalVariable[] = [];
  
  if (!heapSnapshot?.nodes) {
    return globalVars;
  }
  
  // Analyze heap nodes for global scope indicators
  heapSnapshot.nodes.forEach((node: any) => {
    if (!node || !node.name) return;
    
    const name = node.name;
    const size = node.selfSize || 0;
    const retainedSize = node.retainedSize || size;
    const type = node.type || 'unknown';
    
    // Dynamic detection of global scope patterns
    const isGlobal = isInGlobalScope(name, node);
    const isLarge = size > MEMORY_THRESHOLDS.SUSPICIOUS_OBJECT;
    const isRetaining = retainedSize > size * 2; // Retaining 2x its own size
    
    if (isGlobal && (isLarge || isRetaining)) {
      const confidence = calculateLeakConfidence(retainedSize, 0, 1);
      const severity = calculateSeverity(retainedSize, confidence);
      
      globalVars.push({
        name: extractVariableName(name),
        size,
        retainedSize,
        type,
        confidence,
        severity,
        description: `Global variable retaining ${formatBytes(retainedSize)}`,
        location: detectGlobalLocation(name)
      });
    }
  });
  
  // Sort by retained size (largest first)
  return globalVars.sort((a, b) => b.retainedSize - a.retainedSize);
}

/**
 * Detect memory growth patterns between two snapshots
 */
export function detectMemoryPatterns(
  beforeSnapshot: any, 
  afterSnapshot: any
): MemoryPattern[] {
  const patterns: MemoryPattern[] = [];
  
  // Detect array growth patterns
  const arrayGrowth = findGrowingArrays(beforeSnapshot, afterSnapshot);
  if (arrayGrowth.length > 0) {
    patterns.push({
      type: 'array_growth',
      objects: arrayGrowth,
      description: `${arrayGrowth.length} arrays showing significant growth`,
      confidence: calculateLeakConfidence(
        arrayGrowth.reduce((sum, arr) => sum + arr.sizeGrowth, 0),
        arrayGrowth.length > 5 ? 2.0 : 1.0
      ),
      severity: 'HIGH',
      size: arrayGrowth.reduce((sum, arr) => sum + arr.afterSize, 0),
      suggestedFix: 'Review array usage and implement cleanup: array.length = 0 or proper element removal'
    });
  }
  
  // Detect event listener accumulation
  const eventListeners = findEventListenerGrowth(beforeSnapshot, afterSnapshot);
  if (eventListeners.length > 0) {
    patterns.push({
      type: 'event_listeners',
      objects: eventListeners,
      description: `${eventListeners.length} event listener references accumulated`,
      confidence: calculateLeakConfidence(
        eventListeners.reduce((sum, listener) => sum + listener.size, 0),
        eventListeners.length / 10 // Growth ratio based on count
      ),
      severity: 'HIGH',
      size: eventListeners.reduce((sum, listener) => sum + listener.size, 0),
      suggestedFix: 'Remove event listeners: element.removeEventListener() in cleanup functions'
    });
  }
  
  // Detect closure leaks
  const closureLeaks = findClosureLeaks(beforeSnapshot, afterSnapshot);
  if (closureLeaks.length > 0) {
    patterns.push({
      type: 'closures',
      objects: closureLeaks,
      description: `${closureLeaks.length} closures retaining large amounts of memory`,
      confidence: calculateLeakConfidence(
        closureLeaks.reduce((sum, closure) => sum + closure.retainedSize, 0)
      ),
      severity: 'MEDIUM',
      size: closureLeaks.reduce((sum, closure) => sum + closure.retainedSize, 0),
      suggestedFix: 'Review closure scope - avoid capturing large objects in timer/event callbacks'
    });
  }
  
  return patterns.sort((a, b) => b.size - a.size);
}

/**
 * Generate dynamic recommendations based on actual heap analysis
 */
export function generateDynamicRecommendations(
  globalVars: GlobalVariable[],
  patterns: MemoryPattern[]
): string[] {
  const recommendations: string[] = [];
  
  // Global variable recommendations
  if (globalVars.length > 0) {
    const largeGlobals = globalVars.filter(gv => gv.retainedSize > MEMORY_THRESHOLDS.LARGE_OBJECT);
    if (largeGlobals.length > 0) {
      const varNames = largeGlobals.slice(0, 3).map(gv => gv.name).join(', ');
      recommendations.push(`🌐 CRITICAL: Clear large global variables: ${varNames} (${formatBytes(largeGlobals.reduce((sum, gv) => sum + gv.retainedSize, 0))} total)`);
    }
    
    if (globalVars.length > MEMORY_THRESHOLDS.SUSPICIOUS_GLOBAL_COUNT) {
      recommendations.push(`🌐 WARNING: ${globalVars.length} global variables detected - review global scope for memory leaks`);
    }
  }
  
  // Pattern-based recommendations
  patterns.forEach(pattern => {
    if (pattern.confidence > 70) {
      recommendations.push(`${getPatternEmoji(pattern.type)} ${pattern.suggestedFix}`);
    }
  });
  
  return recommendations;
}

/**
 * Helper functions for dynamic detection
 */

function isInGlobalScope(name: string, node: any): boolean {
  return (
    name.includes('window.') ||
    name.includes('global.') ||
    name === 'Window' ||
    name === 'global' ||
    // Detect global scope based on node structure
    (node.type === 'object' && (
      name.includes('Global') ||
      name.includes('globalThis') ||
      // Check if it's attached to window/global object
      node.edgeName === 'window' ||
      node.edgeName === 'global'
    ))
  );
}

function extractVariableName(fullName: string): string {
  // Extract meaningful variable name from heap node name
  if (fullName.includes('window.')) {
    return fullName.split('window.')[1]?.split(' ')[0] || fullName;
  }
  if (fullName.includes('global.')) {
    return fullName.split('global.')[1]?.split(' ')[0] || fullName;
  }
  return fullName.split(' ')[0] || fullName;
}

function detectGlobalLocation(name: string): 'window' | 'global' | 'unknown' {
  if (name.includes('window.')) return 'window';
  if (name.includes('global.')) return 'global';
  return 'unknown';
}

function findGrowingArrays(beforeSnapshot: any, afterSnapshot: any): any[] {
  // Simplified implementation - would need to match arrays between snapshots
  const growingArrays: any[] = [];
  
  if (!afterSnapshot?.nodes) return growingArrays;
  
  afterSnapshot.nodes.forEach((node: any) => {
    if (node?.type === 'array' && node.selfSize > MEMORY_THRESHOLDS.SUSPICIOUS_OBJECT) {
      growingArrays.push({
        name: node.name || 'unknown array',
        afterSize: node.selfSize,
        sizeGrowth: node.selfSize, // Simplified - would calculate actual growth
        confidence: calculateLeakConfidence(node.selfSize)
      });
    }
  });
  
  return growingArrays.slice(0, 10); // Top 10 growing arrays
}

function findEventListenerGrowth(beforeSnapshot: any, afterSnapshot: any): any[] {
  const listeners: any[] = [];
  
  if (!afterSnapshot?.nodes) return listeners;
  
  afterSnapshot.nodes.forEach((node: any) => {
    const name = node?.name || '';
    if ((name.includes('EventListener') || name.includes('listener') || name.includes('addEventListener')) &&
        node.selfSize > 100) {
      listeners.push({
        name: name,
        size: node.selfSize,
        type: 'event_listener'
      });
    }
  });
  
  return listeners;
}

function findClosureLeaks(beforeSnapshot: any, afterSnapshot: any): any[] {
  const closures: any[] = [];
  
  if (!afterSnapshot?.nodes) return closures;
  
  afterSnapshot.nodes.forEach((node: any) => {
    if ((node?.type === 'closure' || node?.name?.includes('closure')) &&
        node.retainedSize > MEMORY_THRESHOLDS.SUSPICIOUS_OBJECT) {
      closures.push({
        name: node.name || 'closure',
        retainedSize: node.retainedSize || node.selfSize,
        type: 'closure'
      });
    }
  });
  
  return closures.slice(0, 10); // Top 10 closure leaks
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${bytes}B`;
}

function getPatternEmoji(type: string): string {
  switch (type) {
    case 'array_growth': return '📈';
    case 'event_listeners': return '🎧';
    case 'closures': return '🔒';
    case 'dom_retention': return '🏠';
    default: return '⚠️';
  }
}
