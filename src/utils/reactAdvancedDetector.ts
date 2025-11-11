import { HeapNode } from './heapAnalyzer';
import { ReactDetector, ReactDetachedNode } from './reactDetector';

export interface ReactHookLeak {
  hookType: 'useState' | 'useEffect' | 'useCallback' | 'useMemo' | 'useRef' | 'useContext' | 'custom';
  nodes: HeapNode[];
  component: string;
  leakPattern: 'cleanup_missing' | 'dependency_retention' | 'closure_capture' | 'context_subscription';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  fixRecommendation: string;
}

export interface EventListenerLeak {
  eventType: string;
  elementType: string;
  handlerCount: number;
  nodes: HeapNode[];
  isDetached: boolean;
  component?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ComponentTreeLeak {
  parentComponent: string;
  retainedChildren: string[];
  nodes: HeapNode[];
  retainedSize: number;
  leakType: 'unmounted_retained' | 'circular_reference' | 'context_binding';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface LazyComponentLeak {
  componentName: string;
  loadedInstances: number;
  isLazyLoaded: boolean;
  suspenseBoundary?: string;
  registryReferences: HeapNode[];
  mountedButNotUnmounted: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  leakPattern: 'registry_accumulation' | 'suspense_retention' | 'lazy_cache_bloat' | 'zombie_components';
  globalRegistries: string[];
  retainedSize: number;
}

export class ReactAdvancedDetector extends ReactDetector {
  private hookLeaks: ReactHookLeak[] = [];
  private eventListenerLeaks: EventListenerLeak[] = [];
  private componentTreeLeaks: ComponentTreeLeak[] = [];
  private lazyComponentLeaks: LazyComponentLeak[] = [];

  constructor(nodes: HeapNode[]) {
    super(nodes);
    this.analyzeAdvancedPatterns();
  }

  /**
   * Analyzes advanced React leak patterns
   */
  private analyzeAdvancedPatterns(): void {
    this.detectHookLeaks();
    this.detectEventListenerLeaks();
    this.detectComponentTreeLeaks();
    this.detectLazyComponentLeaks();
  }

  /**
   * Detects React hook-related memory leaks
   */
  private detectHookLeaks(): void {
    const hookNodes = this.nodes.filter(node => this.isReactHook(node));
    
    for (const node of hookNodes) {
      const hookType = this.identifyHookType(node);
      const component = this.findHookOwner(node);
      const leakPattern = this.analyzeHookLeakPattern(node);
      
      if (leakPattern) {
        this.hookLeaks.push({
          hookType,
          nodes: [node],
          component: component || 'Unknown',
          leakPattern,
          severity: this.calculateHookLeakSeverity(node, leakPattern),
          description: this.describeHookLeak(hookType, leakPattern),
          fixRecommendation: this.getHookFixRecommendation(hookType, leakPattern)
        });
      }
    }
  }

  /**
   * Identifies React hooks in the heap
   */
  private isReactHook(node: HeapNode): boolean {
    const name = node.name || '';
    
    return (
      name.includes('useState') ||
      name.includes('useEffect') ||
      name.includes('useCallback') ||
      name.includes('useMemo') ||
      name.includes('useRef') ||
      name.includes('useContext') ||
      name.includes('useLayoutEffect') ||
      name.includes('useImperativeHandle') ||
      name.includes('hook') && name.includes('React') ||
      name.includes('memoized') ||
      // Custom hook patterns
      name.includes('use') && /^use[A-Z]/.test(name)
    );
  }

  /**
   * Identifies the specific hook type
   */
  private identifyHookType(node: HeapNode): ReactHookLeak['hookType'] {
    const name = node.name || '';
    
    if (name.includes('useState')) return 'useState';
    if (name.includes('useEffect')) return 'useEffect';
    if (name.includes('useCallback')) return 'useCallback';
    if (name.includes('useMemo')) return 'useMemo';
    if (name.includes('useRef')) return 'useRef';
    if (name.includes('useContext')) return 'useContext';
    
    return 'custom';
  }

  /**
   * Analyzes hook leak patterns
   */
  private analyzeHookLeakPattern(node: HeapNode): ReactHookLeak['leakPattern'] | null {
    const name = node.name || '';
    
    // useEffect cleanup issues
    if (name.includes('useEffect') && !name.includes('cleanup')) {
      return 'cleanup_missing';
    }
    
    // Large dependency arrays or closures
    if ((name.includes('useCallback') || name.includes('useMemo')) && 
        node.selfSize > 1024 * 10) { // > 10KB
      return 'dependency_retention';
    }
    
    // Context subscriptions not cleaned up
    if (name.includes('useContext') && name.includes('subscribe')) {
      return 'context_subscription';
    }
    
    // Large closures captured by hooks
    if (node.selfSize > 1024 * 50) { // > 50KB
      return 'closure_capture';
    }
    
    return null;
  }

  /**
   * Finds the component that owns a hook
   */
  private findHookOwner(node: HeapNode): string | undefined {
    // This would trace back through React Fiber relationships
    // Look for component patterns in the node name or structure
    const name = node.name || '';
    
    // Extract component name from hook context if available
    const componentMatch = name.match(/([A-Z][a-zA-Z0-9_]*)/);
    if (componentMatch) {
      return componentMatch[1];
    }
    
    return undefined;
  }

  /**
   * Calculates hook leak severity
   */
  private calculateHookLeakSeverity(node: HeapNode, pattern: ReactHookLeak['leakPattern']): ReactHookLeak['severity'] {
    const sizeInKB = node.selfSize / 1024;
    
    if (pattern === 'cleanup_missing') return 'high';
    if (pattern === 'context_subscription') return 'critical';
    if (sizeInKB > 100) return 'critical';
    if (sizeInKB > 50) return 'high';
    if (sizeInKB > 10) return 'medium';
    
    return 'low';
  }

  /**
   * Describes hook leak patterns
   */
  private describeHookLeak(hookType: ReactHookLeak['hookType'], pattern: ReactHookLeak['leakPattern']): string {
    switch (pattern) {
      case 'cleanup_missing':
        return `${hookType} missing cleanup function - event listeners, timers, or subscriptions not removed`;
      case 'dependency_retention':
        return `${hookType} retaining large objects in dependency array or closure`;
      case 'closure_capture':
        return `${hookType} capturing large objects in closure scope`;
      case 'context_subscription':
        return `${hookType} context subscription not properly cleaned up`;
      default:
        return `${hookType} potential memory leak detected`;
    }
  }

  /**
   * Provides hook-specific fix recommendations
   */
  private getHookFixRecommendation(hookType: ReactHookLeak['hookType'], pattern: ReactHookLeak['leakPattern']): string {
    switch (pattern) {
      case 'cleanup_missing':
        return `Add cleanup function to ${hookType}: return () => { /* cleanup code */ }`;
      case 'dependency_retention':
        return `Optimize ${hookType} dependencies - remove unnecessary objects from dependency array`;
      case 'closure_capture':
        return `Reduce ${hookType} closure scope - move large objects outside hook or use refs`;
      case 'context_subscription':
        return `Add useEffect cleanup for ${hookType} context subscriptions`;
      default:
        return `Review ${hookType} usage for memory retention patterns`;
    }
  }

  /**
   * Detects unremoved React event listeners
   */
  private detectEventListenerLeaks(): void {
    const eventNodes = this.nodes.filter(node => this.isEventListener(node));
    const detachedNodes = this.detectReactDetachedNodes();
    
    // Group event listeners by type and element
    const listenerGroups = new Map<string, HeapNode[]>();
    
    eventNodes.forEach(node => {
      const eventType = this.extractEventType(node);
      const key = `${eventType}_${node.type}`;
      
      if (!listenerGroups.has(key)) {
        listenerGroups.set(key, []);
      }
      listenerGroups.get(key)!.push(node);
    });

    // Analyze each group for potential leaks
    listenerGroups.forEach((nodes, key) => {
      const [eventType, elementType] = key.split('_');
      const isDetached = nodes.some(node => 
        detachedNodes.some(detached => detached.node.id === node.id)
      );
      
      if (nodes.length > 5 || isDetached) { // Suspicious if > 5 listeners or on detached nodes
        this.eventListenerLeaks.push({
          eventType,
          elementType,
          handlerCount: nodes.length,
          nodes,
          isDetached,
          component: this.findEventListenerComponent(nodes[0]),
          severity: this.calculateEventListenerSeverity(nodes.length, isDetached)
        });
      }
    });
  }

  /**
   * Identifies event listener nodes
   */
  private isEventListener(node: HeapNode): boolean {
    const name = node.name || '';
    
    return (
      name.includes('addEventListener') ||
      name.includes('EventListener') ||
      name.includes('onClick') ||
      name.includes('onScroll') ||
      name.includes('onResize') ||
      name.includes('handler') ||
      name.includes('callback') && name.includes('event') ||
      // React synthetic events
      name.includes('SyntheticEvent') ||
      name.includes('ReactEventListener')
    );
  }

  /**
   * Extracts event type from listener node
   */
  private extractEventType(node: HeapNode): string {
    const name = node.name || '';
    
    if (name.includes('click')) return 'click';
    if (name.includes('scroll')) return 'scroll';
    if (name.includes('resize')) return 'resize';
    if (name.includes('keydown')) return 'keydown';
    if (name.includes('mousedown')) return 'mousedown';
    
    return 'unknown';
  }

  /**
   * Finds component that registered the event listener
   */
  private findEventListenerComponent(node: HeapNode): string | undefined {
    // Trace back through React Fiber to find the component
    const name = node.name || '';
    
    // Extract component name from listener context if available
    const componentMatch = name.match(/([A-Z][a-zA-Z0-9_]*)/);
    if (componentMatch) {
      return componentMatch[1];
    }
    
    return undefined;
  }

  /**
   * Calculates event listener leak severity
   */
  private calculateEventListenerSeverity(count: number, isDetached: boolean): EventListenerLeak['severity'] {
    if (isDetached) return 'critical';
    if (count > 20) return 'critical';
    if (count > 10) return 'high';
    if (count > 5) return 'medium';
    return 'low';
  }

  /**
   * Detects React component tree retention issues
   */
  private detectComponentTreeLeaks(): void {
    // Find React components that should be unmounted but are retained
    const components = Array.from(this.reactComponents.entries());
    
    components.forEach(([componentName, componentNode]) => {
      const retainedChildren = this.findRetainedChildren(componentNode);
      const totalRetainedSize = this.calculateRetainedSize([componentNode, ...retainedChildren]);
      
      if (retainedChildren.length > 0 && totalRetainedSize > 1024 * 100) { // > 100KB
        this.componentTreeLeaks.push({
          parentComponent: componentName,
          retainedChildren: retainedChildren.map(n => n.name || 'unnamed'),
          nodes: [componentNode, ...retainedChildren],
          retainedSize: totalRetainedSize,
          leakType: this.determineTreeLeakType(componentNode, retainedChildren),
          severity: this.calculateTreeLeakSeverity(totalRetainedSize)
        });
      }
    });
  }

  /**
   * Detects lazy component and dynamic import leaks
   */
  private detectLazyComponentLeaks(): void {
    // Generic patterns for component registries (not app-specific)
    const genericRegistryPatterns = [
      'componentRegistry',
      'componentCache',
      'componentStore',
      'componentMap',
      'lazyCache',
      'dynamicComponents'
    ];

    // Find all lazy component related nodes
    const lazyNodes = this.nodes.filter(node => this.isLazyRelated(node));
    const componentGroups = this.groupLazyComponentsByName(lazyNodes);

    for (const [componentName, nodes] of componentGroups) {
      const registryRefs = nodes.filter(node => 
        genericRegistryPatterns.some(pattern => (node.name || '').toLowerCase().includes(pattern.toLowerCase()))
      );

      const suspenseNodes = nodes.filter(node => 
        (node.name || '').includes('Suspense')
      );

      const lazyComponentNodes = nodes.filter(node => 
        this.isActualLazyComponent(node)
      );

      const totalRetainedSize = this.calculateRetainedSize(nodes);
      const instanceCount = lazyComponentNodes.length;

      // Detect leak if we have multiple instances or global registry accumulation
      if (instanceCount > 1 || registryRefs.length > 0 || totalRetainedSize > 1024 * 500) { // > 500KB
        const leakPattern = this.determineLazyLeakPattern(registryRefs, suspenseNodes, instanceCount);
        const globalRegistries = registryRefs.map(node => node.name || '').filter(name => name);

        this.lazyComponentLeaks.push({
          componentName,
          loadedInstances: instanceCount,
          isLazyLoaded: lazyComponentNodes.length > 0,
          suspenseBoundary: suspenseNodes.length > 0 ? suspenseNodes[0].name : undefined,
          registryReferences: registryRefs,
          mountedButNotUnmounted: Math.max(0, instanceCount - 1),
          severity: this.calculateLazyLeakSeverity(instanceCount, registryRefs.length, totalRetainedSize),
          leakPattern,
          globalRegistries,
          retainedSize: totalRetainedSize
        });
      }
    }
  }

  /**
   * Checks if a node is related to lazy components
   */
  private isLazyRelated(node: HeapNode): boolean {
    const name = node.name || '';
    return (
      // Universal React.lazy patterns (intrinsic heap signals)
      name.includes('LazyComponent') ||
      name.includes('lazy') ||
      name.includes('Suspense') ||
      name.includes('_payload') ||
      name.includes('_result') ||
      name.includes('_init') && name.includes('lazy') ||
      
      // Universal component registry patterns (any app could use)
      name.includes('componentRegistry') ||
      name.includes('componentCache') ||
      name.includes('componentStore') ||
      name.includes('componentMap') ||
      name.includes('lazyCache') ||
      name.includes('dynamicComponents') ||
      
      // Universal dynamic import patterns
      name.includes('import()') ||
      name.includes('DynamicComponent') ||
      name.includes('AsyncComponent')
    );
  }

  /**
   * Checks if a node is actually a lazy component (not just related)
   */
  private isActualLazyComponent(node: HeapNode): boolean {
    const name = node.name || '';
    return (
      // Direct lazy component indicators (universal)
      name.includes('LazyComponent') ||
      (name.includes('lazy') && !name.includes('Registry') && !name.includes('Cache')) ||
      name.includes('DynamicComponent') ||
      name.includes('AsyncComponent')
    );
  }

  /**
   * Groups lazy component nodes by component name
   */
  private groupLazyComponentsByName(nodes: HeapNode[]): Map<string, HeapNode[]> {
    const groups = new Map<string, HeapNode[]>();

    for (const node of nodes) {
      const name = node.name || '';
      let componentName = 'UnknownLazyComponent';

      // Extract component name from universal patterns (app-agnostic)
      if (name.includes('LazyComponent')) {
        componentName = name;
      } else if (name.includes('DynamicComponent')) {
        componentName = 'DynamicComponent';
      } else if (name.includes('AsyncComponent')) {
        componentName = 'AsyncComponent';
      } else if (name.includes('componentRegistry')) {
        componentName = 'ComponentRegistry';
      } else if (name.includes('componentCache')) {
        componentName = 'ComponentCache';
      } else if (name.includes('lazy') && !name.includes('Registry')) {
        // Extract component name from lazy patterns
        const match = name.match(/(\w*[Cc]omponent\w*)/);
        componentName = match ? match[1] : 'LazyComponent';
      }

      if (!groups.has(componentName)) {
        groups.set(componentName, []);
      }
      groups.get(componentName)!.push(node);
    }

    return groups;
  }

  /**
   * Determines the type of lazy component leak
   */
  private determineLazyLeakPattern(
    registryRefs: HeapNode[], 
    suspenseNodes: HeapNode[], 
    instanceCount: number
  ): LazyComponentLeak['leakPattern'] {
    if (registryRefs.length > 0) return 'registry_accumulation';
    if (suspenseNodes.length > 0 && instanceCount > 1) return 'suspense_retention';
    if (instanceCount > 5) return 'zombie_components';
    return 'lazy_cache_bloat';
  }

  /**
   * Calculates severity for lazy component leaks
   */
  private calculateLazyLeakSeverity(
    instanceCount: number, 
    registryCount: number, 
    retainedSize: number
  ): LazyComponentLeak['severity'] {
    const sizeInMB = retainedSize / (1024 * 1024);
    
    // High severity if multiple instances OR registry accumulation OR large size
    if (instanceCount > 10 || registryCount > 3 || sizeInMB > 10) return 'critical';
    if (instanceCount > 5 || registryCount > 1 || sizeInMB > 5) return 'high';
    if (instanceCount > 2 || registryCount > 0 || sizeInMB > 1) return 'medium';
    return 'low';
  }

  /**
   * Finds children components that should have been unmounted
   */
  private findRetainedChildren(componentNode: HeapNode): HeapNode[] {
    // Simplified implementation - would need React Fiber traversal
    return this.nodes.filter(node => 
      node.id !== componentNode.id && 
      node.name?.includes(componentNode.name || '') &&
      node.selfSize > 1024 // > 1KB
    );
  }

  /**
   * Calculates total retained size
   */
  private calculateRetainedSize(nodes: HeapNode[]): number {
    return nodes.reduce((total, node) => total + node.selfSize, 0);
  }

  /**
   * Determines the type of component tree leak
   */
  private determineTreeLeakType(parent: HeapNode, children: HeapNode[]): ComponentTreeLeak['leakType'] {
    // Simplified logic - would analyze actual relationships
    if (children.length > 10) return 'unmounted_retained';
    return 'circular_reference';
  }

  /**
   * Calculates component tree leak severity
   */
  private calculateTreeLeakSeverity(retainedSize: number): ComponentTreeLeak['severity'] {
    const sizeInMB = retainedSize / (1024 * 1024);
    
    if (sizeInMB > 10) return 'critical';
    if (sizeInMB > 5) return 'high';
    if (sizeInMB > 1) return 'medium';
    return 'low';
  }

  /**
   * Gets all advanced leak analysis results
   */
  public getAdvancedAnalysis() {
    return {
      hookLeaks: this.hookLeaks,
      eventListenerLeaks: this.eventListenerLeaks,
      componentTreeLeaks: this.componentTreeLeaks,
      lazyComponentLeaks: this.lazyComponentLeaks,
      summary: {
        totalHookLeaks: this.hookLeaks.length,
        criticalHookLeaks: this.hookLeaks.filter(h => h.severity === 'critical').length,
        totalEventListenerLeaks: this.eventListenerLeaks.length,
        detachedEventListeners: this.eventListenerLeaks.filter(e => e.isDetached).length,
        totalComponentTreeLeaks: this.componentTreeLeaks.length,
        totalRetainedSize: this.componentTreeLeaks.reduce((sum, c) => sum + c.retainedSize, 0),
        totalLazyComponentLeaks: this.lazyComponentLeaks.length,
        criticalLazyLeaks: this.lazyComponentLeaks.filter(l => l.severity === 'critical').length,
        zombieComponentInstances: this.lazyComponentLeaks.reduce((sum, l) => sum + l.mountedButNotUnmounted, 0)
      }
    };
  }

  /**
   * Generates advanced recommendations
   */
  public getAdvancedRecommendations(): string[] {
    const recommendations: string[] = [];
    
    // Hook leak recommendations
    this.hookLeaks.forEach(leak => {
      if (leak.severity === 'critical' || leak.severity === 'high') {
        recommendations.push(`🪝 ${leak.component}: ${leak.fixRecommendation}`);
      }
    });
    
    // Event listener leak recommendations
    this.eventListenerLeaks.forEach(leak => {
      if (leak.severity === 'critical' || leak.severity === 'high') {
        recommendations.push(`🎧 Remove ${leak.handlerCount} unremoved ${leak.eventType} listeners${leak.isDetached ? ' (on detached DOM)' : ''}`);
      }
    });
    
    // Component tree leak recommendations
    this.componentTreeLeaks.forEach(leak => {
      if (leak.severity === 'critical' || leak.severity === 'high') {
        const sizeMB = (leak.retainedSize / (1024 * 1024)).toFixed(1);
        recommendations.push(`🌳 ${leak.parentComponent}: Clean up retained component tree (${sizeMB}MB, ${leak.retainedChildren.length} children)`);
      }
    });

    // Lazy component leak recommendations
    this.lazyComponentLeaks.forEach(leak => {
      if (leak.severity === 'critical' || leak.severity === 'high') {
        const sizeMB = (leak.retainedSize / (1024 * 1024)).toFixed(1);
        
        if (leak.leakPattern === 'registry_accumulation') {
          recommendations.push(`🧟 ${leak.componentName}: Clear global registries on unmount (${leak.globalRegistries.join(', ')}) - ${sizeMB}MB retained`);
        } else if (leak.leakPattern === 'zombie_components') {
          recommendations.push(`👻 ${leak.componentName}: ${leak.mountedButNotUnmounted} zombie instances never unmounted - clear React.lazy cache and component arrays`);
        } else if (leak.leakPattern === 'suspense_retention') {
          recommendations.push(`⏸️ ${leak.componentName}: Suspense boundary retaining ${leak.loadedInstances} lazy components - check Suspense cleanup`);
        } else {
          recommendations.push(`🔄 ${leak.componentName}: Lazy component cache bloat (${leak.loadedInstances} instances, ${sizeMB}MB) - implement proper lazy component cleanup`);
        }
      }
    });
    
    return recommendations;
  }
}
