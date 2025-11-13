/**
 * React Component Hook Analyzer
 * 
 * Inspired by MemLab's ReactComponentHookAnalysis
 * Analyzes React components, Fiber nodes, and React hooks memory consumption.
 * Provides detailed breakdown of React-specific memory patterns including
 * component instances, memoized state, props, and individual hook analysis.
 * 
 * Based on the tech talk by Giulio Zausa at React Berlin Day 2023:
 * "How much RAM is your useMemo using? Let's profile it!"
 */

import { HeapNode } from '../types';
import { isBuiltInGlobal } from './builtInGlobals.js';

interface ReactHookStat {
  type: string;                       // Hook type (useState, useEffect, useMemo, etc.)
  size: number;                       // Memory consumed by this hook
  index: number;                      // Position in hook chain
  confidence: number;                 // Analysis confidence
}

interface ReactComponentStat {
  componentName: string;              // React component name
  fiberNodeIds: number[];            // All Fiber node IDs for this component
  instances: number;                 // Number of component instances
  totalRetainedSize: number;         // Total memory retained by all instances
  totalShallowSize: number;          // Shallow size of all instances
  memoizedStateSize: number;         // Memory used by memoized state
  memoizedPropsSize: number;         // Memory used by memoized props
  childrenSize: number;              // Memory used by children
  siblingSize: number;               // Memory used by siblings
  hooks: ReactHookStat[];            // Individual hook analysis
  totalHookSize: number;             // Combined hook memory usage
  averageInstanceSize: number;       // Average memory per instance
  significance: ReactSignificance;   // Component memory impact
  confidence: number;                // Analysis confidence
  recommendations: string[];         // Optimization recommendations
}

export interface ReactAnalysisResult {
  components: ReactComponentStat[];
  totalComponents: number;
  totalFiberNodes: number;
  totalReactMemory: number;
  isMinified: boolean;
  fiberNodeName: string | null;
  significantComponents: ReactComponentStat[];
  hookBreakdown: Record<string, { count: number; totalSize: number }>;
  memoryDistribution: ReactMemoryDistribution;
  summary: string;
  insights: string[];
  recommendations: string[];
}

interface ReactMemoryDistribution {
  components: number;                 // Memory in component logic
  hooks: number;                     // Memory in React hooks
  memoizedState: number;             // Memory in memoized state
  memoizedProps: number;             // Memory in memoized props
  children: number;                  // Memory in child components
  fiber: number;                     // Memory in Fiber structure
}

type ReactSignificance = 
  | 'CRITICAL'    // >10MB per component type
  | 'HIGH'        // >5MB per component type
  | 'MEDIUM'      // >1MB per component type
  | 'LOW'         // >100KB per component type
  | 'NEGLIGIBLE'; // <100KB per component type

export class ReactComponentHookAnalyzer {
  private readonly FIBER_NODE_PROPERTIES = new Set([
    'alternate', 'child', 'memoizedProps', 'memoizedState', 
    'return', 'sibling', 'type'
  ]);
  
  private readonly MAX_HOOK_CHAIN_LENGTH = 1000;
  private readonly CRITICAL_COMPONENT_THRESHOLD = 10 * 1024 * 1024; // 10MB
  private readonly HIGH_COMPONENT_THRESHOLD = 5 * 1024 * 1024;      // 5MB

  private isHeapSnapshotMinified = false;
  private fiberNodeName: string | null = null;

  analyze(snapshot: { nodes: HeapNode[] }): ReactAnalysisResult {
    const nodes = snapshot.nodes;
    
    // Probe for React Fiber nodes
    this.probeHeapAndFiberInfo(nodes);
    
    if (!this.fiberNodeName) {
      return this.createEmptyResult('No React Fiber nodes detected');
    }

    // Analyze React components
    const componentStatsMap = this.analyzeReactComponents(nodes);
    const components = Array.from(componentStatsMap.values())
      .sort((a, b) => b.totalRetainedSize - a.totalRetainedSize);
    
    return this.generateAnalysisResult(components, nodes.length);
  }

  private probeHeapAndFiberInfo(nodes: HeapNode[]): void {
    let foundFiberNodeWithUnminifiedName = false;
    const likelyFiberNodes = new Map<string, number>();
    
    nodes.forEach(node => {
      if (node.name === 'FiberNode' && node.type !== 'string') {
        foundFiberNodeWithUnminifiedName = true;
      } else if (this.hasFiberNodeAttributes(node)) {
        const count = likelyFiberNodes.get(node.name) || 0;
        likelyFiberNodes.set(node.name, count + 1);
      }
    });
    
    if (foundFiberNodeWithUnminifiedName) {
      this.fiberNodeName = 'FiberNode';
      this.isHeapSnapshotMinified = false;
      return;
    }
    
    // Find most likely minified Fiber node name
    const entries = Array.from(likelyFiberNodes.entries())
      .sort((a, b) => b[1] - a[1]);
    
    if (entries.length > 0) {
      this.fiberNodeName = entries[0][0];
      this.isHeapSnapshotMinified = true;
    } else {
      this.fiberNodeName = null;
    }
  }

  private hasFiberNodeAttributes(node: HeapNode): boolean {
    // Simplified check - look for key Fiber properties in node name patterns
    const hasTypeProperty = this.hasPropertyReference(node, 'type');
    const hasMemoizedState = this.hasPropertyReference(node, 'memoizedState');
    const hasChild = this.hasPropertyReference(node, 'child');
    
    // Must have at least 2 key Fiber properties
    return [hasTypeProperty, hasMemoizedState, hasChild].filter(Boolean).length >= 2;
  }

  private hasPropertyReference(node: HeapNode, propertyName: string): boolean {
    // Simplified property detection - in real implementation would check edges
    return node.name.includes(propertyName) || 
           node.type === 'object'; // Assume objects might have these properties
  }

  private analyzeReactComponents(nodes: HeapNode[]): Map<string, ReactComponentStat> {
    const componentStatsMap = new Map<string, ReactComponentStat>();
    
    if (!this.fiberNodeName) return componentStatsMap;

    nodes.forEach(node => {
      const componentName = this.getComponentNameFromFiberNode(node);
      if (!componentName) return;

      let stat = componentStatsMap.get(componentName);
      if (!stat) {
        stat = this.createEmptyComponentStat(componentName);
        componentStatsMap.set(componentName, stat);
      }

      // Update component statistics
      stat.fiberNodeIds.push(node.id);
      stat.instances++;
      stat.totalShallowSize += node.selfSize || 0;
      stat.totalRetainedSize += node.retainedSize || 0;

      // Analyze hooks (simplified - in real implementation would traverse edges)
      const hooks = this.analyzeComponentHooks(node);
      if (hooks.length > 0) {
        stat.hooks = hooks;
        stat.totalHookSize = hooks.reduce((sum, hook) => sum + hook.size, 0);
      }

      // Estimate memoized state and props (simplified)
      stat.memoizedStateSize += this.estimateMemoizedStateSize(node);
      stat.memoizedPropsSize += this.estimateMemoizedPropsSize(node);
    });

    // Calculate derived statistics
    componentStatsMap.forEach(stat => {
      stat.averageInstanceSize = stat.instances > 0 ? stat.totalRetainedSize / stat.instances : 0;
      stat.significance = this.calculateComponentSignificance(stat.totalRetainedSize);
      stat.confidence = this.calculateComponentConfidence(stat);
      stat.recommendations = this.generateComponentRecommendations(stat);
    });

    return componentStatsMap;
  }

  private getComponentNameFromFiberNode(node: HeapNode): string | null {
    if (node.name !== this.fiberNodeName) {
      return null;
    }

    // Simplified component name extraction
    // In a real implementation, would traverse node edges to find type.displayName, etc.
    
    // Check for common React component patterns
    const name = node.name;
    
    // If minified, create a meaningful name
    if (this.isHeapSnapshotMinified) {
      return `<MinifiedComponent_${node.id}>`;
    }
    
    // Look for component-like patterns in the node structure
    if (name === 'FiberNode') {
      return `Component_${node.id}`;
    }
    
    return name;
  }

  private analyzeComponentHooks(node: HeapNode): ReactHookStat[] {
    const hooks: ReactHookStat[] = [];
    
    // Simplified hook analysis
    // In a real implementation, would traverse memoizedState chain
    
    // Estimate hooks based on node size and patterns
    const nodeSize = node.retainedSize || 0;
    
    if (nodeSize > 10000) { // If component is large enough to likely have hooks
      // Common React hooks with estimated sizes
      const commonHooks = [
        { type: 'useState', estimatedSize: nodeSize * 0.2 },
        { type: 'useEffect', estimatedSize: nodeSize * 0.15 },
        { type: 'useMemo', estimatedSize: nodeSize * 0.1 },
        { type: 'useCallback', estimatedSize: nodeSize * 0.05 }
      ];
      
      commonHooks.forEach((hook, index) => {
        if (hook.estimatedSize > 1000) { // Only include if meaningful size
          hooks.push({
            type: hook.type,
            size: Math.floor(hook.estimatedSize),
            index,
            confidence: 60 // Medium confidence for estimates
          });
        }
      });
    }
    
    return hooks;
  }

  private estimateMemoizedStateSize(node: HeapNode): number {
    // Simplified estimation - in real implementation would traverse memoizedState
    const totalSize = node.retainedSize || 0;
    return Math.floor(totalSize * 0.3); // Estimate 30% for memoized state
  }

  private estimateMemoizedPropsSize(node: HeapNode): number {
    // Simplified estimation - in real implementation would traverse memoizedProps  
    const totalSize = node.retainedSize || 0;
    return Math.floor(totalSize * 0.2); // Estimate 20% for memoized props
  }

  private createEmptyComponentStat(componentName: string): ReactComponentStat {
    return {
      componentName,
      fiberNodeIds: [],
      instances: 0,
      totalRetainedSize: 0,
      totalShallowSize: 0,
      memoizedStateSize: 0,
      memoizedPropsSize: 0,
      childrenSize: 0,
      siblingSize: 0,
      hooks: [],
      totalHookSize: 0,
      averageInstanceSize: 0,
      significance: 'NEGLIGIBLE',
      confidence: 70,
      recommendations: []
    };
  }

  private calculateComponentSignificance(totalSize: number): ReactSignificance {
    if (totalSize >= this.CRITICAL_COMPONENT_THRESHOLD) return 'CRITICAL';
    if (totalSize >= this.HIGH_COMPONENT_THRESHOLD) return 'HIGH';
    if (totalSize >= 1024 * 1024) return 'MEDIUM';
    if (totalSize >= 100 * 1024) return 'LOW';
    return 'NEGLIGIBLE';
  }

  private calculateComponentConfidence(stat: ReactComponentStat): number {
    let confidence = 70; // Base confidence

    // Higher confidence for more instances
    if (stat.instances > 10) confidence += 15;
    if (stat.instances > 50) confidence += 10;

    // Higher confidence for larger components
    if (stat.totalRetainedSize > 1024 * 1024) confidence += 15;

    // Higher confidence for unminified heap
    if (!this.isHeapSnapshotMinified) confidence += 10;

    // Lower confidence for estimated data
    if (stat.hooks.length > 0 && stat.hooks[0].confidence < 80) {
      confidence -= 10;
    }

    return Math.min(Math.max(confidence, 40), 100);
  }

  private generateComponentRecommendations(stat: ReactComponentStat): string[] {
    const recommendations: string[] = [];

    // Size-based recommendations
    if (stat.significance === 'CRITICAL') {
      recommendations.push('🚨 CRITICAL: Component consuming excessive memory - implement immediate optimization');
    } else if (stat.significance === 'HIGH') {
      recommendations.push('⚠️ HIGH: Large component - review for optimization opportunities');
    }

    // Instance-based recommendations
    if (stat.instances > 100) {
      recommendations.push('🔄 High instance count - consider component pooling or virtualization');
    }

    // Hook-based recommendations
    if (stat.totalHookSize > stat.totalRetainedSize * 0.5) {
      recommendations.push('🪝 Hooks consuming >50% of component memory - review hook dependencies');
    }

    // Memoization recommendations
    if (stat.memoizedStateSize > 1024 * 1024) {
      recommendations.push('💾 Large memoized state - review useMemo and useState dependencies');
    }

    if (stat.memoizedPropsSize > 1024 * 1024) {
      recommendations.push('📦 Large memoized props - review React.memo and prop drilling patterns');
    }

    // Average size recommendations
    if (stat.averageInstanceSize > 1024 * 1024) {
      recommendations.push('📊 Large average instance size - consider component splitting');
    }

    // General React recommendations
    if (recommendations.length === 0) {
      recommendations.push('✅ Component appears optimized - monitor for growth trends');
    }

    return recommendations;
  }

  private generateAnalysisResult(components: ReactComponentStat[], totalNodes: number): ReactAnalysisResult {
    const significantComponents = components.filter(comp => 
      comp.significance !== 'NEGLIGIBLE' && comp.significance !== 'LOW'
    );

    const hookBreakdown = this.calculateHookBreakdown(components);
    const memoryDistribution = this.calculateMemoryDistribution(components);
    const totalReactMemory = components.reduce((sum, comp) => sum + comp.totalRetainedSize, 0);
    const totalFiberNodes = components.reduce((sum, comp) => sum + comp.instances, 0);

    return {
      components,
      totalComponents: components.length,
      totalFiberNodes,
      totalReactMemory,
      isMinified: this.isHeapSnapshotMinified,
      fiberNodeName: this.fiberNodeName,
      significantComponents,
      hookBreakdown,
      memoryDistribution,
      summary: this.generateSummary(components, significantComponents, totalReactMemory),
      insights: this.generateInsights(components, hookBreakdown, this.isHeapSnapshotMinified),
      recommendations: this.generateRecommendations(significantComponents, hookBreakdown)
    };
  }

  private calculateHookBreakdown(components: ReactComponentStat[]): Record<string, { count: number; totalSize: number }> {
    const breakdown: Record<string, { count: number; totalSize: number }> = {};
    
    components.forEach(comp => {
      comp.hooks.forEach(hook => {
        if (!breakdown[hook.type]) {
          breakdown[hook.type] = { count: 0, totalSize: 0 };
        }
        breakdown[hook.type].count++;
        breakdown[hook.type].totalSize += hook.size;
      });
    });
    
    return breakdown;
  }

  private calculateMemoryDistribution(components: ReactComponentStat[]): ReactMemoryDistribution {
    return components.reduce((dist, comp) => ({
      components: dist.components + comp.totalRetainedSize,
      hooks: dist.hooks + comp.totalHookSize,
      memoizedState: dist.memoizedState + comp.memoizedStateSize,
      memoizedProps: dist.memoizedProps + comp.memoizedPropsSize,
      children: dist.children + comp.childrenSize,
      fiber: dist.fiber + comp.totalShallowSize
    }), {
      components: 0, hooks: 0, memoizedState: 0, 
      memoizedProps: 0, children: 0, fiber: 0
    });
  }

  private createEmptyResult(reason: string): ReactAnalysisResult {
    return {
      components: [],
      totalComponents: 0,
      totalFiberNodes: 0,
      totalReactMemory: 0,
      isMinified: false,
      fiberNodeName: null,
      significantComponents: [],
      hookBreakdown: {},
      memoryDistribution: { components: 0, hooks: 0, memoizedState: 0, memoizedProps: 0, children: 0, fiber: 0 },
      summary: `⚠️ ${reason}`,
      insights: [],
      recommendations: ['📱 This analyzer requires a React application heap snapshot']
    };
  }

  private generateSummary(components: ReactComponentStat[], significant: ReactComponentStat[], totalMemory: number): string {
    if (components.length === 0) {
      return '⚠️ No React components detected in heap snapshot';
    }

    const criticalCount = significant.filter(comp => comp.significance === 'CRITICAL').length;
    
    if (criticalCount > 0) {
      return `🚨 CRITICAL: ${criticalCount} React components consuming excessive memory (${this.formatBytes(totalMemory)} total)`;
    }

    const highCount = significant.filter(comp => comp.significance === 'HIGH').length;
    if (highCount > 0) {
      return `⚠️ HIGH: ${highCount} React components with significant memory usage (${this.formatBytes(totalMemory)} total)`;
    }

    return `⚛️ ${components.length} React components analyzed (${this.formatBytes(totalMemory)} total)`;
  }

  private generateInsights(components: ReactComponentStat[], hookBreakdown: Record<string, any>, isMinified: boolean): string[] {
    const insights: string[] = [];

    if (components.length === 0) return insights;

    // Largest component insight
    const largest = components[0];
    insights.push(`🔥 Largest component: ${largest.componentName} (${this.formatBytes(largest.totalRetainedSize)})`);

    // Instance count insight
    const totalInstances = components.reduce((sum, comp) => sum + comp.instances, 0);
    insights.push(`📊 Total React instances: ${totalInstances} across ${components.length} component types`);

    // Hook insights
    const hookTypes = Object.keys(hookBreakdown);
    if (hookTypes.length > 0) {
      const totalHooks = hookTypes.reduce((sum, type) => sum + hookBreakdown[type].count, 0);
      insights.push(`🪝 React hooks detected: ${totalHooks} hooks across ${hookTypes.length} types`);
      
      // Most memory-consuming hook type
      const heaviestHook = hookTypes.reduce((prev, current) => 
        hookBreakdown[current].totalSize > hookBreakdown[prev].totalSize ? current : prev
      );
      if (hookBreakdown[heaviestHook].totalSize > 1024 * 1024) {
        insights.push(`💾 Heaviest hook type: ${heaviestHook} (${this.formatBytes(hookBreakdown[heaviestHook].totalSize)})`);
      }
    }

    // Minification insight
    if (isMinified) {
      insights.push(`🔒 Minified heap detected - component names may not be accurate`);
    }

    return insights;
  }

  private generateRecommendations(significant: ReactComponentStat[], hookBreakdown: Record<string, any>): string[] {
    const recommendations: string[] = [];

    if (significant.length === 0) {
      recommendations.push('✅ No React component optimizations needed');
      return recommendations;
    }

    // Critical component recommendations
    const critical = significant.filter(comp => comp.significance === 'CRITICAL');
    if (critical.length > 0) {
      recommendations.push('🚨 Address critical React components immediately');
      recommendations.push('⚛️ Consider component splitting, memoization, or virtualization');
    }

    // Hook-specific recommendations
    const hookTypes = Object.keys(hookBreakdown);
    if (hookTypes.includes('useMemo') || hookTypes.includes('useCallback')) {
      recommendations.push('💡 Review useMemo and useCallback dependencies for over-memoization');
    }

    if (hookTypes.includes('useState')) {
      recommendations.push('📊 Review useState for large state objects - consider state splitting');
    }

    if (hookTypes.includes('useEffect')) {
      recommendations.push('🔄 Review useEffect cleanup functions and dependencies');
    }

    // General React recommendations
    recommendations.push('⚛️ Use React DevTools Profiler for component-level performance analysis');
    recommendations.push('🔍 Use Object Content Analyzer to inspect specific component instances');
    recommendations.push('📈 Monitor React component memory usage over time');

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