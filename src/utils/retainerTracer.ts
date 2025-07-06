import { HeapNode } from './heapAnalyzer.js';

export interface TraceResult {
  node: HeapNode;
  isLikelyLeak: boolean;
  confidence: number;
  rootPath: string[];
  retainerInfo: RetainerInfo;
  explanation: string;
  actionableAdvice: string;
}

export interface RetainerInfo {
  rootType: 'gc-root' | 'global' | 'closure' | 'dom' | 'framework' | 'unknown';
  isDetached: boolean;
  retainerCount: number;
  pathLength: number;
  hasCircularRefs: boolean;
}

export class RetainerTracer {
  private snapshot: any;
  private nodes: HeapNode[];
  private edges: any[] = [];
  private distributedLeakPatterns: Map<string, number> = new Map();

  constructor(snapshot: any, nodes: HeapNode[]) {
    this.snapshot = snapshot;
    this.nodes = nodes;
    this.parseEdges();
    this.analyzeDistributedPatterns();
  }

  private parseEdges(): void {
    this.edges = this.snapshot.edges || [];
    // Note: Real implementation would parse the edge format from V8 heap snapshots
    // For now, we'll simulate based on object patterns
  }

  /**
   * Analyze patterns across ALL nodes to detect distributed leaks
   * This catches leaks that are spread across many small objects
   */
  private analyzeDistributedPatterns(): void {
    const functionCount = this.countPattern(n => n.type === 'closure' || n.name?.includes('Function'));
    const arrayCount = this.countPattern(n => n.type === 'array');
    const stringCount = this.countPattern(n => n.name?.includes('string') || n.name?.includes('String'));
    const timerRelatedCount = this.countPattern(n => 
      n.name?.toLowerCase().includes('timer') || 
      n.name?.toLowerCase().includes('interval') ||
      n.name?.toLowerCase().includes('timeout'));

    // Store patterns for later reference
    this.distributedLeakPatterns.set('functions', functionCount);
    this.distributedLeakPatterns.set('arrays', arrayCount);
    this.distributedLeakPatterns.set('strings', stringCount);
    this.distributedLeakPatterns.set('timers', timerRelatedCount);

    // Calculate ratios for distributed leak detection
    const totalNodes = this.nodes.length;
    this.distributedLeakPatterns.set('functionRatio', functionCount / totalNodes);
    this.distributedLeakPatterns.set('arrayRatio', arrayCount / totalNodes);
    this.distributedLeakPatterns.set('timerRatio', timerRelatedCount / totalNodes);
  }

  private countPattern(predicate: (node: HeapNode) => boolean): number {
    return this.nodes.filter(predicate).length;
  }

  /**
   * Trace a specific object to determine if it's a memory leak
   */
  public traceObject(node: HeapNode): TraceResult {
    const rootPath = this.findRetainerPath(node);
    const retainerInfo = this.analyzeRetainerPath(rootPath, node);
    const { isLikelyLeak, confidence, explanation } = this.assessLeakProbability(node, retainerInfo, rootPath);
    const actionableAdvice = this.generateActionableAdvice(node, retainerInfo, rootPath);

    return {
      node,
      isLikelyLeak,
      confidence,
      rootPath,
      retainerInfo,
      explanation,
      actionableAdvice
    };
  }

  /**
   * Find the path from GC root to this object
   */
  private findRetainerPath(node: HeapNode): string[] {
    // Simulate retainer path analysis based on object characteristics
    const name = node.name || node.type;
    const isLargeString = name.includes('ExternalStringData') && node.selfSize > 1024 * 1024;
    
    if (isLargeString) {
      // Large strings are often held by global variables or closures
      if (node.selfSize > 2 * 1024 * 1024) {
        return [
          'Global Object (Window/Global)',
          'Application Data Store',
          'Large String Buffer',
          `${name} (${this.formatSize(node.selfSize)})`
        ];
      } else {
        return [
          'Module Scope',
          'Closure Context',
          'String Reference',
          `${name} (${this.formatSize(node.selfSize)})`
        ];
      }
    }

    if (name.includes('HTML') || name.includes('Element')) {
      return [
        'Document',
        'DOM Tree',
        'Element Reference',
        name
      ];
    }

    if (name.includes('Fiber') || name.includes('React')) {
      return [
        'React Root',
        'Component Tree',
        'Fiber Node',
        name
      ];
    }

    // Generic path
    return [
      'GC Root',
      'Object Reference',
      name || node.type
    ];
  }

  /**
   * Analyze the retainer path to understand the retention context
   */
  private analyzeRetainerPath(path: string[], node: HeapNode): RetainerInfo {
    const pathStr = path.join(' → ');
    
    // Determine root type
    let rootType: RetainerInfo['rootType'] = 'unknown';
    if (pathStr.includes('Global') || pathStr.includes('Window')) {
      rootType = 'global';
    } else if (pathStr.includes('Closure')) {
      rootType = 'closure';
    } else if (pathStr.includes('DOM') || pathStr.includes('Document')) {
      rootType = 'dom';
    } else if (pathStr.includes('React') || pathStr.includes('Fiber')) {
      rootType = 'framework';
    } else if (pathStr.includes('GC Root')) {
      rootType = 'gc-root';
    }

    // Check if object appears detached
    const isDetached = pathStr.includes('detached') || 
                      (!pathStr.includes('Document') && node.name?.includes('HTML'));

    return {
      rootType,
      isDetached,
      retainerCount: 1, // Simplified - would count actual retainers in real implementation
      pathLength: path.length,
      hasCircularRefs: false // Would detect cycles in real implementation
    };
  }

  /**
   * Assess the probability that this object represents a memory leak
   */
  private assessLeakProbability(node: HeapNode, retainerInfo: RetainerInfo, path: string[]): {
    isLikelyLeak: boolean;
    confidence: number;
    explanation: string;
  } {
    let confidence = 0;
    const factors: string[] = [];
    const name = node.name || node.type;

    // Enhanced detection for interval/timeout leaks and closure patterns
    const isTimerRelated = name.includes('timer') || name.includes('interval') || name.includes('timeout') || 
                          path.some(p => p.toLowerCase().includes('timer') || p.toLowerCase().includes('interval'));
    const isArrayObject = node.type === 'array' || name.includes('Array');
    const isFunctionClosure = node.type === 'closure' || name.includes('Closure') || name.includes('Function');

    // Size-based indicators
    if (node.selfSize > 5 * 1024 * 1024) { // > 5MB
      confidence += 0.4;
      factors.push('extremely large size (>5MB)');
    } else if (node.selfSize > 1 * 1024 * 1024) { // > 1MB
      confidence += 0.2;
      factors.push('large size (>1MB)');
    } else if (node.selfSize > 100 * 1024) { // > 100KB
      confidence += 0.1;
      factors.push('moderate size (>100KB)');
    }

    // Timer/Interval specific leak patterns (NEW)
    if (isTimerRelated) {
      confidence += 0.4;
      factors.push('timer/interval related object (common leak source)');
      
      if (retainerInfo.rootType === 'closure') {
        confidence += 0.3;
        factors.push('timer callback capturing closure data');
      }
    }

    // Array accumulation patterns (NEW)
    if (isArrayObject && node.selfSize > 50 * 1024) {
      const estimatedElements = Math.floor(node.selfSize / 8);
      if (estimatedElements > 1000) {
        confidence += 0.3;
        factors.push(`large array with ~${estimatedElements.toLocaleString()} elements (possible accumulation)`);
      }
      
      if (retainerInfo.rootType === 'closure' || retainerInfo.rootType === 'global') {
        confidence += 0.2;
        factors.push('array retained in closure/global scope');
      }
    }

    // Function/Closure leak patterns (ENHANCED)
    if (isFunctionClosure) {
      confidence += 0.2;
      factors.push('closure object detected');
      
      if (node.selfSize > 200 * 1024) {
        confidence += 0.2;
        factors.push('large closure suggesting captured variables');
      }
      
      if (retainerInfo.rootType === 'global') {
        confidence += 0.2;
        factors.push('closure retained globally (timer callbacks?)');
      }
    }

    // String-specific leak patterns (REFINED)
    if (name.includes('ExternalStringData')) {
      if (node.selfSize > 2 * 1024 * 1024) {
        confidence += 0.3;
        factors.push('massive string data suggesting data accumulation');
      }
      
      // Check if it's in a context that suggests accumulation
      if (retainerInfo.rootType === 'global' || retainerInfo.rootType === 'closure') {
        confidence += 0.2;
        factors.push('string held in global/closure context');
      } else {
        // Likely legitimate large strings (libraries, etc.) get reduced confidence
        confidence = Math.max(0, confidence - 0.1);
        factors.push('possibly legitimate large string (library/bundle)');
      }
    }

    // DOM-specific patterns
    if (retainerInfo.isDetached) {
      confidence += 0.4;
      factors.push('detached from DOM tree');
    }

    // Framework patterns
    if (retainerInfo.rootType === 'framework' && node.selfSize > 500 * 1024) {
      confidence += 0.2;
      factors.push('large framework object that may not be cleaned up');
    }

    // Multi-factor leak indicators (NEW)
    if (factors.length >= 3) {
      confidence += 0.1;
      factors.push('multiple leak indicators present');
    }

    // Distributed pattern analysis (NEW - analyze patterns across entire heap)
    const distributedBonus = this.assessDistributedLeakPatterns(node, retainerInfo);
    confidence += distributedBonus.confidenceBonus;
    factors.push(...distributedBonus.factors);

    const isLikelyLeak = confidence > 0.5;
    
    let explanation = `Confidence: ${(confidence * 100).toFixed(0)}% - `;
    if (factors.length > 0) {
      explanation += `Based on: ${factors.join(', ')}`;
    } else {
      explanation += 'No strong leak indicators found';
    }

    return { isLikelyLeak, confidence, explanation };
  }

  /**
   * Generate specific, actionable advice based on the trace results
   */
  private generateActionableAdvice(node: HeapNode, retainerInfo: RetainerInfo, path: string[]): string {
    const name = node.name || node.type;
    const size = this.formatSize(node.selfSize);
    const isTimerRelated = name.includes('timer') || name.includes('interval') || name.includes('timeout') || 
                          path.some(p => p.toLowerCase().includes('timer') || p.toLowerCase().includes('interval'));
    const isArrayObject = node.type === 'array' || name.includes('Array');
    const isFunctionClosure = node.type === 'closure' || name.includes('Closure') || name.includes('Function');

    // Timer/Interval specific advice (NEW)
    if (isTimerRelated) {
      return `🔧 Timer/Interval leak detected (${size}). Fix by:
• Clear intervals with clearInterval() in cleanup functions
• Clear timeouts with clearTimeout() when component unmounts
• Use useEffect cleanup returns or componentWillUnmount
• Avoid capturing large objects in timer callback closures
→ Check for setInterval/setTimeout without corresponding clear calls

🔍 DevTools Investigation:
• Open DevTools → Memory tab → Take another heap snapshot
• Search for "timer" or "interval" in the snapshot
• Look for objects with retainer paths through Timer/Timeout
• Check the "Retainers" section for timer callback functions
• Use "Comparison" view to see if timer objects are growing`;
    }

    // Array accumulation advice (NEW)
    if (isArrayObject && node.selfSize > 50 * 1024) {
      const estimatedElements = Math.floor(node.selfSize / 8);
      return `🔧 Array accumulation detected (~${estimatedElements.toLocaleString()} elements, ${size}). Fix by:
• Implement array size limits (e.g., keep only last 100 items)
• Use pagination or virtual scrolling for large datasets
• Clear old array entries periodically
• Check for growing state arrays that never get pruned
→ Look for setState calls that append without removing old items

🔍 DevTools Investigation:
• Open DevTools → Memory tab → Take heap snapshots over time
• Use "Comparison" view to see array growth between snapshots
• Search for "Array" and sort by "Retained Size"
• Click on large arrays to see their contents and retainer paths
• Look for arrays in component state or global variables`;
    }

    // Function/Closure specific advice (ENHANCED)
    if (isFunctionClosure) {
      if (retainerInfo.rootType === 'global' && node.selfSize > 200 * 1024) {
        return `🔧 Large closure in global scope (${size}). Likely timer callback leak:
• Check for setInterval/setTimeout callbacks capturing large data
• Ensure timer cleanup in component unmount lifecycle
• Avoid capturing entire component state in timer closures
• Use refs for mutable data instead of closure capture
→ Search for uncleared timers with closure captures

🔍 DevTools Investigation:
• Open DevTools → Memory tab → Take heap snapshot
• Search for "Function" or "Closure" in snapshot
• Look for closures with large "Retained Size"
• Check "Retainers" section for timer/interval references
• Use Console tab: run clearTimeout/clearInterval on suspicious timers`;
      } else {
        return `🔧 Closure capturing large scope (${size}). Fix by:
• Minimize variables captured in closure scope
• Break circular references between closures and objects
• Use WeakRef for large data references in closures
• Implement explicit cleanup patterns for event handlers
→ Review functions that capture large objects from outer scope

🔍 DevTools Investigation:
• Open DevTools → Memory tab → Take heap snapshot
• Search for "Closure" or function names in snapshot
• Click on closures to see their "Scope" in retainer path
• Look for large objects in the closure's scope chain
• Use "Comparison" view to track closure growth over time`;
      }
    }

    // String data advice (REFINED)
    if (name.includes('ExternalStringData')) {
      if (retainerInfo.rootType === 'global') {
        return `🔧 String data in global scope (${size}). Check for:
• Global variables accumulating API responses or log data
• Uncleared timer callbacks building up string data
• State variables that grow without bounds
• Debug output or logging that accumulates
→ Look for global arrays/objects that keep growing`;
      } else if (retainerInfo.rootType === 'closure') {
        return `🔧 String data captured in closure (${size}). Investigate:
• Timer callbacks capturing large string variables
• Event handlers holding references to large strings
• Functions capturing entire component state including strings
→ Minimize closure scope, use WeakRef for large data`;
      } else {
        return `🔧 Large string (${size}) in memory. Likely causes:
• Bundled JavaScript code or libraries (may be normal)
• Large data files loaded into memory
• Accumulated API responses or log data
→ If legitimate, consider code splitting; if data, use streaming`;
      }
    }

    // DOM advice
    if (retainerInfo.isDetached) {
      return `🔧 Detached DOM element (${size}). Fix by:
• Remove event listeners before DOM removal
• Clear references to removed elements in component state
• Use WeakRef for DOM references in JavaScript
• Implement proper cleanup in component unmount lifecycle
→ Check for timer callbacks or event handlers holding DOM refs

🔍 DevTools Investigation:
• Open DevTools → Memory tab → Take heap snapshot
• Search for "Detached" or "HTMLElement" in snapshot
• Look for DOM nodes with no document parent
• Check "Retainers" section for JavaScript references
• Use Elements tab to verify if element is still in DOM`;
    }

    // Framework advice
    if (retainerInfo.rootType === 'framework') {
      return `🔧 Framework object (${size}) retained. Common causes:
• React components not properly unmounting
• Uncleared useEffect dependencies or timer callbacks
• State management stores holding large objects
• Framework caches or memoization not being cleared
→ Check useEffect cleanup, timer cleanup, and component lifecycle

🔍 DevTools Investigation:
• Open DevTools → Memory tab → Take heap snapshot
• Search for framework names (React, Vue, etc.) in snapshot
• Look for component instances with large retained sizes
• Check "Retainers" section for state or context references
• Use React DevTools Profiler to track component lifecycle`;
    }

    // Generic advice
    return `🔧 Object (${size}) held in memory. Investigate:
• Timer callbacks capturing this object
• Event handlers or closures preventing GC
• Growing arrays or state objects
• Circular references preventing cleanup
→ Use heap profiler to identify exact retention cause, check for uncleared timers

🔍 DevTools Investigation:
• Open DevTools → Memory tab → Click "Take heap snapshot"
• Find this object by searching for its name or type
• Click on the object to see its "Retainers" section
• Follow the retainer path to find what's holding the reference
• Use "Comparison" view to see if object count is growing over time
• Try Console tab: type object name to inspect it live`;
  }

  /**
   * Assess distributed leak patterns across the entire heap
   * This helps detect leaks that manifest as many small objects rather than single large ones
   */
  private assessDistributedLeakPatterns(node: HeapNode, retainerInfo: RetainerInfo): {
    confidenceBonus: number;
    factors: string[];
  } {
    const factors: string[] = [];
    let confidenceBonus = 0;

    const name = node.name || node.type;
    const isTimerRelated = name.toLowerCase().includes('timer') || 
                          name.toLowerCase().includes('interval') ||
                          name.toLowerCase().includes('timeout');
    const isArrayObject = node.type === 'array' || name.includes('Array');
    const isFunctionClosure = node.type === 'closure' || name.includes('Closure') || name.includes('Function');

    // Check timer pattern across heap - many timers suggest leak pattern
    const timerRatio = this.distributedLeakPatterns.get('timerRatio') || 0;
    if (isTimerRelated && timerRatio > 0.01) { // More than 1% of objects are timer-related
      confidenceBonus += 0.2;
      factors.push(`high timer density in heap (${(timerRatio * 100).toFixed(1)}% of objects)`);
    }

    // Check function/closure accumulation - many closures suggest captured scope leaks
    const functionRatio = this.distributedLeakPatterns.get('functionRatio') || 0;
    if (isFunctionClosure && functionRatio > 0.05) { // More than 5% of objects are functions/closures
      confidenceBonus += 0.15;
      factors.push(`high closure density in heap (${(functionRatio * 100).toFixed(1)}% of objects)`);
    }

    // Check array accumulation pattern - many arrays suggest collection leaks
    const arrayRatio = this.distributedLeakPatterns.get('arrayRatio') || 0;
    if (isArrayObject && arrayRatio > 0.03) { // More than 3% of objects are arrays
      confidenceBonus += 0.1;
      factors.push(`high array density in heap (${(arrayRatio * 100).toFixed(1)}% of objects)`);
    }

    // Look for distributed string accumulation (many medium-sized strings vs few large ones)
    if (name.includes('String') || name.includes('string')) {
      const stringCount = this.distributedLeakPatterns.get('strings') || 0;
      const totalNodes = this.nodes.length;
      if (stringCount > totalNodes * 0.1 && node.selfSize > 1024 && node.selfSize < 100 * 1024) {
        confidenceBonus += 0.1;
        factors.push(`distributed string accumulation pattern (many medium-sized strings)`);
      }
    }

    // Check for memory fragmentation patterns - many small objects of similar size
    const similarSizedObjects = this.nodes.filter(n => 
      Math.abs(n.selfSize - node.selfSize) < node.selfSize * 0.1 &&
      n.type === node.type
    ).length;
    
    if (similarSizedObjects > 100 && node.selfSize > 1024) {
      confidenceBonus += 0.15;
      factors.push(`memory fragmentation: ${similarSizedObjects} similar objects (${this.formatSize(node.selfSize)} each)`);
    }

    return { confidenceBonus, factors };
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  /**
   * Batch trace multiple objects and provide summary
   */
  public batchTrace(nodes: HeapNode[]): {
    traces: TraceResult[];
    summary: {
      totalLikelyLeaks: number;
      highConfidenceLeaks: number;
      totalRetainedByLeaks: number;
      leakCategories: Record<string, number>;
    };
  } {
    const traces = nodes.map(node => this.traceObject(node));
    
    const likelyLeaks = traces.filter(t => t.isLikelyLeak);
    const highConfidenceLeaks = traces.filter(t => t.confidence > 0.7);
    const totalRetainedByLeaks = likelyLeaks.reduce((sum, t) => sum + t.node.selfSize, 0);
    
    const leakCategories: Record<string, number> = {};
    likelyLeaks.forEach(trace => {
      const category = trace.retainerInfo.rootType;
      leakCategories[category] = (leakCategories[category] || 0) + 1;
    });

    return {
      traces,
      summary: {
        totalLikelyLeaks: likelyLeaks.length,
        highConfidenceLeaks: highConfidenceLeaks.length,
        totalRetainedByLeaks,
        leakCategories
      }
    };
  }
}
