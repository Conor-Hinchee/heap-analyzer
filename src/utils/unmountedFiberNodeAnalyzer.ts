/**
 * Unmounted Fiber Node Analyzer
 * 
 * Detects unmounted React Fiber nodes that are still retained in memory.
 * These are common sources of memory leaks in React applications when
 * components are unmounted but their Fiber nodes remain referenced.
 * 
 * Inspired by MemLab's UnmountedFiberNodeAnalysis
 */

import { HeapNode } from './heapAnalyzer.js';
import { isBuiltInGlobal } from './builtInGlobals.js';

interface UnmountedFiberRecord {
  fiberNode: HeapNode;
  componentName: string;
  retainedSize: number;
  selfSize: number;
  depth: number;
  isDetached: boolean;
  hasChildren: boolean;
  hasParent: boolean;
  stateSize: number;
  propsSize: number;
  confidence: number;
  severity: FiberSeverity;
  retainerPath: string[];
  recommendations: string[];
}

interface UnmountedFiberAnalysisResult {
  unmountedFibers: UnmountedFiberRecord[];
  totalUnmountedFibers: number;
  totalRetainedMemory: number;
  averageFiberSize: number;
  largestFiber: UnmountedFiberRecord | null;
  fibersByComponent: Map<string, UnmountedFiberRecord[]>;
  severityBreakdown: Record<FiberSeverity, number>;
  isReactApp: boolean;
  fiberTreeDepth: number;
  detachedFiberCount: number;
  insights: string[];
  recommendations: string[];
  summary: string;
}

type FiberSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export { UnmountedFiberAnalysisResult, UnmountedFiberRecord };

export class UnmountedFiberNodeAnalyzer {
  private static readonly MAX_FIBERS_TO_ANALYZE = 100;
  private static readonly MIN_FIBER_SIZE = 1024; // 1KB minimum

  // React Fiber node indicators
  private static readonly FIBER_NODE_INDICATORS = [
    'FiberNode',
    'Fiber',
    'ReactFiber',
    'fiber',
    '_owner',
    'stateNode',
    'pendingProps',
    'memoizedProps',
    'memoizedState',
    'updateQueue'
  ];

  // Component name patterns
  private static readonly COMPONENT_PATTERNS = [
    /^[A-Z][a-zA-Z0-9]*$/,  // PascalCase components
    /^use[A-Z][a-zA-Z0-9]*$/, // Custom hooks
    /^_default$/,           // Default exports
    /^Anonymous$/,          // Anonymous components
    /^ForwardRef$/,         // React.forwardRef
    /^Memo$/               // React.memo
  ];

  analyze(input: { nodes: HeapNode[] }): UnmountedFiberAnalysisResult {
    const { nodes } = input;
    
    // Detect if this is a React application
    const isReactApp = this.detectReactApp(nodes);
    
    if (!isReactApp) {
      return this.createEmptyResult();
    }
    
    // Find potential Fiber nodes
    const fiberNodes = this.findFiberNodes(nodes);
    
    // Analyze unmounted Fiber nodes
    const unmountedFibers = this.analyzeUnmountedFibers(fiberNodes, nodes);
    
    // Calculate statistics
    const stats = this.calculateStats(unmountedFibers);
    
    // Group by component
    const fibersByComponent = this.groupByComponent(unmountedFibers);
    
    // Generate insights and recommendations
    const insights = this.generateInsights(unmountedFibers, stats, isReactApp);
    const recommendations = this.generateRecommendations(unmountedFibers, fibersByComponent);
    
    return {
      unmountedFibers: unmountedFibers.slice(0, UnmountedFiberNodeAnalyzer.MAX_FIBERS_TO_ANALYZE),
      totalUnmountedFibers: unmountedFibers.length,
      totalRetainedMemory: stats.totalRetainedMemory,
      averageFiberSize: stats.averageFiberSize,
      largestFiber: stats.largestFiber,
      fibersByComponent,
      severityBreakdown: stats.severityBreakdown,
      isReactApp,
      fiberTreeDepth: stats.maxDepth,
      detachedFiberCount: stats.detachedCount,
      insights,
      recommendations,
      summary: this.generateSummary(unmountedFibers, stats)
    };
  }

  private detectReactApp(nodes: HeapNode[]): boolean {
    // Look for React-specific indicators
    const reactIndicators = [
      'react',
      'React',
      'ReactDOM',
      'FiberNode',
      'ReactFiber',
      '__reactInternalInstance',
      '_reactInternalFiber'
    ];
    
    let reactCount = 0;
    
    for (const node of nodes.slice(0, 10000)) { // Sample first 10k nodes
      const name = node.name.toLowerCase();
      
      for (const indicator of reactIndicators) {
        if (name.includes(indicator.toLowerCase())) {
          reactCount++;
          if (reactCount > 5) return true; // Strong React presence
        }
      }
    }
    
    return reactCount > 2; // Weak React presence
  }

  private findFiberNodes(nodes: HeapNode[]): HeapNode[] {
    const fiberNodes: HeapNode[] = [];
    
    for (const node of nodes) {
      if (this.isFiberNode(node)) {
        fiberNodes.push(node);
      }
    }
    
    return fiberNodes;
  }

  private isFiberNode(node: HeapNode): boolean {
    // Skip system and built-in nodes
    if (isBuiltInGlobal(node.name)) return false;
    if (node.name === '(system)' || node.name === '(internal)') return false;
    
    // Check for Fiber node indicators
    const name = node.name;
    
    // Direct Fiber node names
    if (UnmountedFiberNodeAnalyzer.FIBER_NODE_INDICATORS.some(indicator => 
        name.includes(indicator))) {
      return true;
    }
    
    // Check if it's an object with typical Fiber properties
    if (node.type === 'object') {
      // Look for Fiber-like structure in object names
      const lowerName = name.toLowerCase();
      if (lowerName.includes('fiber') || 
          lowerName.includes('react') ||
          lowerName.includes('component')) {
        return true;
      }
    }
    
    // Check size threshold - Fiber nodes are typically substantial
    return node.selfSize > UnmountedFiberNodeAnalyzer.MIN_FIBER_SIZE;
  }

  private analyzeUnmountedFibers(fiberNodes: HeapNode[], allNodes: HeapNode[]): UnmountedFiberRecord[] {
    const unmountedFibers: UnmountedFiberRecord[] = [];
    
    for (const fiberNode of fiberNodes) {
      const record = this.analyzeFiberNode(fiberNode, allNodes);
      if (record && this.isLikelyUnmounted(record)) {
        unmountedFibers.push(record);
      }
    }
    
    return unmountedFibers
      .sort((a, b) => b.retainedSize - a.retainedSize)
      .slice(0, UnmountedFiberNodeAnalyzer.MAX_FIBERS_TO_ANALYZE);
  }

  private analyzeFiberNode(fiberNode: HeapNode, allNodes: HeapNode[]): UnmountedFiberRecord | null {
    const componentName = this.extractComponentName(fiberNode);
    const retainerPath = this.buildRetainerPath(fiberNode, allNodes);
    const isDetached = this.isDetachedFiber(fiberNode, allNodes);
    
    // Analyze Fiber structure
    const hasChildren = this.hasChildFibers(fiberNode, allNodes);
    const hasParent = this.hasParentFiber(fiberNode, allNodes);
    
    // Estimate props and state sizes
    const stateSize = this.estimateStateSize(fiberNode, allNodes);
    const propsSize = this.estimatePropsSize(fiberNode, allNodes);
    
    const record: UnmountedFiberRecord = {
      fiberNode,
      componentName,
      retainedSize: fiberNode.retainedSize || fiberNode.selfSize,
      selfSize: fiberNode.selfSize,
      depth: retainerPath.length,
      isDetached,
      hasChildren,
      hasParent,
      stateSize,
      propsSize,
      confidence: 70,
      severity: 'LOW',
      retainerPath,
      recommendations: []
    };
    
    // Calculate confidence and severity
    record.confidence = this.calculateFiberConfidence(record);
    record.severity = this.calculateFiberSeverity(record);
    record.recommendations = this.generateFiberRecommendations(record);
    
    return record;
  }

  private extractComponentName(fiberNode: HeapNode): string {
    const name = fiberNode.name;
    
    // Try to extract component name from various patterns
    if (name.includes('Component')) {
      const match = name.match(/(\w+)Component/);
      if (match) return match[1];
    }
    
    // Check for PascalCase names
    for (const pattern of UnmountedFiberNodeAnalyzer.COMPONENT_PATTERNS) {
      if (pattern.test(name)) {
        return name;
      }
    }
    
    // Extract from object descriptions
    if (name.includes('(') && name.includes(')')) {
      const match = name.match(/\(([^)]+)\)/);
      if (match) return match[1];
    }
    
    return name || 'Unknown';
  }

  private isLikelyUnmounted(record: UnmountedFiberRecord): boolean {
    // Fiber is likely unmounted if:
    // 1. It's detached from the main tree
    // 2. It has no parent but has children (orphaned)
    // 3. It has significant retained size but no active references
    
    if (record.isDetached) return true;
    if (!record.hasParent && record.hasChildren) return true;
    if (record.retainedSize > 100 * 1024 && record.depth > 10) return true;
    
    return false;
  }

  private isDetachedFiber(fiberNode: HeapNode, allNodes: HeapNode[]): boolean {
    // A Fiber is detached if it's not reachable from a root
    // This is a simplified heuristic based on retainer paths
    
    const name = fiberNode.name.toLowerCase();
    
    // Look for detachment indicators
    if (name.includes('detached') || name.includes('unmounted')) {
      return true;
    }
    
    // Check if it has unusual retainer patterns
    // (This would require more sophisticated analysis in a real implementation)
    return false;
  }

  private hasChildFibers(fiberNode: HeapNode, allNodes: HeapNode[]): boolean {
    // Simplified check - in a real implementation, this would traverse edges
    return fiberNode.selfSize > 10 * 1024; // Assume large fibers have children
  }

  private hasParentFiber(fiberNode: HeapNode, allNodes: HeapNode[]): boolean {
    // Simplified check - in a real implementation, this would check retainers
    return !!(fiberNode.retainedSize && fiberNode.retainedSize > fiberNode.selfSize);
  }

  private estimateStateSize(fiberNode: HeapNode, allNodes: HeapNode[]): number {
    // Estimate state size based on fiber size
    return Math.floor(fiberNode.selfSize * 0.2); // Rough estimate
  }

  private estimatePropsSize(fiberNode: HeapNode, allNodes: HeapNode[]): number {
    // Estimate props size based on fiber size
    return Math.floor(fiberNode.selfSize * 0.15); // Rough estimate
  }

  private buildRetainerPath(fiberNode: HeapNode, allNodes: HeapNode[]): string[] {
    // Simplified retainer path - would be more sophisticated in real implementation
    return [fiberNode.name];
  }

  private calculateFiberConfidence(record: UnmountedFiberRecord): number {
    let confidence = 60;
    
    // Higher confidence for larger fibers
    if (record.retainedSize > 1024 * 1024) confidence += 20;
    else if (record.retainedSize > 100 * 1024) confidence += 15;
    else if (record.retainedSize > 10 * 1024) confidence += 10;
    
    // Higher confidence for detached fibers
    if (record.isDetached) confidence += 25;
    
    // Higher confidence for orphaned fibers
    if (!record.hasParent && record.hasChildren) confidence += 20;
    
    // Component name quality
    if (UnmountedFiberNodeAnalyzer.COMPONENT_PATTERNS.some(p => p.test(record.componentName))) {
      confidence += 10;
    }
    
    return Math.min(confidence, 95);
  }

  private calculateFiberSeverity(record: UnmountedFiberRecord): FiberSeverity {
    const retainedSize = record.retainedSize;
    
    if (retainedSize > 10 * 1024 * 1024 || record.isDetached) return 'CRITICAL';
    if (retainedSize > 5 * 1024 * 1024) return 'HIGH';
    if (retainedSize > 1024 * 1024) return 'MEDIUM';
    return 'LOW';
  }

  private generateFiberRecommendations(record: UnmountedFiberRecord): string[] {
    const recommendations: string[] = [];
    
    if (record.severity === 'CRITICAL') {
      recommendations.push(`Critical: ${record.componentName} fiber consuming ${this.formatBytes(record.retainedSize)}`);
    }
    
    if (record.isDetached) {
      recommendations.push(`Remove references to detached ${record.componentName} component`);
    }
    
    if (!record.hasParent && record.hasChildren) {
      recommendations.push(`Orphaned fiber tree detected - check ${record.componentName} cleanup`);
    }
    
    if (record.stateSize > 1024 * 1024) {
      recommendations.push(`Large component state (${this.formatBytes(record.stateSize)}) - optimize state management`);
    }
    
    if (record.propsSize > 1024 * 1024) {
      recommendations.push(`Large props (${this.formatBytes(record.propsSize)}) - consider prop optimization`);
    }
    
    recommendations.push(`Ensure ${record.componentName} componentWillUnmount/useEffect cleanup`);
    
    return recommendations;
  }

  private calculateStats(unmountedFibers: UnmountedFiberRecord[]) {
    let totalRetainedMemory = 0;
    let maxDepth = 0;
    let detachedCount = 0;
    let largestFiber: UnmountedFiberRecord | null = null;
    
    const severityBreakdown = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    
    for (const fiber of unmountedFibers) {
      totalRetainedMemory += fiber.retainedSize;
      maxDepth = Math.max(maxDepth, fiber.depth);
      
      if (fiber.isDetached) detachedCount++;
      
      severityBreakdown[fiber.severity]++;
      
      if (!largestFiber || fiber.retainedSize > largestFiber.retainedSize) {
        largestFiber = fiber;
      }
    }
    
    return {
      totalRetainedMemory,
      averageFiberSize: unmountedFibers.length > 0 ? totalRetainedMemory / unmountedFibers.length : 0,
      maxDepth,
      detachedCount,
      largestFiber,
      severityBreakdown
    };
  }

  private groupByComponent(unmountedFibers: UnmountedFiberRecord[]): Map<string, UnmountedFiberRecord[]> {
    const grouped = new Map<string, UnmountedFiberRecord[]>();
    
    for (const fiber of unmountedFibers) {
      const componentName = fiber.componentName;
      if (!grouped.has(componentName)) {
        grouped.set(componentName, []);
      }
      grouped.get(componentName)!.push(fiber);
    }
    
    return grouped;
  }

  private generateInsights(
    unmountedFibers: UnmountedFiberRecord[], 
    stats: any, 
    isReactApp: boolean
  ): string[] {
    const insights: string[] = [];
    
    if (!isReactApp) {
      insights.push('🚫 No React application detected in heap snapshot');
      return insights;
    }
    
    if (unmountedFibers.length === 0) {
      insights.push('✅ No unmounted Fiber nodes detected - React cleanup looks good');
      return insights;
    }
    
    if (stats.totalRetainedMemory > 50 * 1024 * 1024) {
      insights.push(`🚨 Significant Fiber memory leak: ${this.formatBytes(stats.totalRetainedMemory)} in unmounted components`);
    }
    
    if (stats.detachedCount > 10) {
      insights.push(`⚠️ ${stats.detachedCount} detached Fiber nodes - indicates component cleanup issues`);
    }
    
    const criticalFibers = unmountedFibers.filter(f => f.severity === 'CRITICAL');
    if (criticalFibers.length > 0) {
      insights.push(`🔥 ${criticalFibers.length} critical unmounted Fiber nodes require immediate attention`);
    }
    
    if (unmountedFibers.length > 50) {
      insights.push(`📊 High unmounted Fiber count (${unmountedFibers.length}) - review component lifecycle`);
    }
    
    insights.push(`🔍 Analyzed React application with ${unmountedFibers.length} unmounted Fiber nodes`);
    
    return insights;
  }

  private generateRecommendations(
    unmountedFibers: UnmountedFiberRecord[],
    fibersByComponent: Map<string, UnmountedFiberRecord[]>
  ): string[] {
    const recommendations: string[] = [];
    
    if (unmountedFibers.length === 0) {
      recommendations.push('✅ React Fiber cleanup appears healthy');
      return recommendations;
    }
    
    const criticalFibers = unmountedFibers.filter(f => f.severity === 'CRITICAL');
    if (criticalFibers.length > 0) {
      recommendations.push('🚨 Address critical unmounted Fiber nodes immediately');
    }
    
    // Find components with multiple unmounted fibers
    const problematicComponents = Array.from(fibersByComponent.entries())
      .filter(([, fibers]) => fibers.length > 3)
      .map(([name]) => name);
    
    if (problematicComponents.length > 0) {
      recommendations.push(`🎯 Focus on components with multiple leaks: ${problematicComponents.slice(0, 3).join(', ')}`);
    }
    
    recommendations.push('🧹 Implement proper componentWillUnmount or useEffect cleanup');
    recommendations.push('🔍 Review event listener removal in component cleanup');
    recommendations.push('📝 Ensure refs are set to null on unmount');
    recommendations.push('⚡ Use React DevTools Profiler to identify problematic components');
    
    return recommendations;
  }

  private generateSummary(unmountedFibers: UnmountedFiberRecord[], stats: any): string {
    if (unmountedFibers.length === 0) {
      return '✅ No unmounted React Fiber nodes detected';
    }
    
    const criticalCount = unmountedFibers.filter(f => f.severity === 'CRITICAL').length;
    const highCount = unmountedFibers.filter(f => f.severity === 'HIGH').length;
    
    if (criticalCount > 0) {
      return `🚨 CRITICAL: ${criticalCount} unmounted Fiber nodes (${this.formatBytes(stats.totalRetainedMemory)} retained)`;
    } else if (highCount > 0) {
      return `⚠️ HIGH: ${highCount} unmounted Fiber nodes (${this.formatBytes(stats.totalRetainedMemory)} retained)`;
    } else {
      return `📊 Found ${unmountedFibers.length} unmounted Fiber nodes (${this.formatBytes(stats.totalRetainedMemory)} retained)`;
    }
  }

  private createEmptyResult(): UnmountedFiberAnalysisResult {
    return {
      unmountedFibers: [],
      totalUnmountedFibers: 0,
      totalRetainedMemory: 0,
      averageFiberSize: 0,
      largestFiber: null,
      fibersByComponent: new Map(),
      severityBreakdown: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
      isReactApp: false,
      fiberTreeDepth: 0,
      detachedFiberCount: 0,
      insights: ['🚫 No React application detected in heap snapshot'],
      recommendations: ['📱 This analyzer requires a React application heap snapshot'],
      summary: 'No React Fiber nodes found'
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}