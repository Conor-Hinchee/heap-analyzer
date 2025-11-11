import { HeapNode } from './heapAnalyzer';

export interface ReactDetachedNode {
  node: HeapNode;
  componentName?: string;
  refName?: string;
  isDetached: boolean;
  retainerType: 'ref' | 'state' | 'context' | 'event' | 'unknown';
  reactFiberId?: number;
  jsxElementType?: string;
}

export interface ReactLeakPattern {
  type: 'detached_dom' | 'unmounted_component' | 'event_handlers' | 'context_retention' | 'hook_cleanup';
  nodes: ReactDetachedNode[];
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fixRecommendation: string;
  componentNames: string[];
}

export class ReactDetector {
  protected nodes: HeapNode[];
  protected reactComponents: Map<string, HeapNode> = new Map();
  protected reactRefs: Map<string, HeapNode[]> = new Map();
  protected reactFibers: HeapNode[] = [];

  constructor(nodes: HeapNode[]) {
    this.nodes = nodes;
    this.identifyReactStructures();
  }

  /**
   * Identifies React components, refs, and Fiber nodes in the heap
   */
  private identifyReactStructures(): void {
    for (const node of this.nodes) {
      const name = node.name || '';
      const type = node.type || '';

      // Identify React components
      if (this.isReactComponent(node)) {
        this.reactComponents.set(name, node);
      }

      // Identify React Fiber nodes
      if (this.isReactFiber(node)) {
        this.reactFibers.push(node);
      }

      // Identify React refs
      if (this.isReactRef(node)) {
        const refName = this.extractRefName(node);
        if (refName) {
          if (!this.reactRefs.has(refName)) {
            this.reactRefs.set(refName, []);
          }
          this.reactRefs.get(refName)!.push(node);
        }
      }
    }
  }

  /**
   * Detects if a node represents a React component
   */
  private isReactComponent(node: HeapNode): boolean {
    const name = node.name || '';
    
    return (
      // React component patterns
      /^[A-Z][a-zA-Z0-9_]*$/.test(name) || // PascalCase component names
      name.includes('Component') ||
      name.includes('Element') ||
      
      // Lazy component patterns
      this.isLazyComponent(node) ||
      
      // React DevTools patterns
      name.includes('_reactInternalFiber') ||
      name.includes('_reactInternalInstance') ||
      
      // React Fiber patterns
      name.includes('FiberNode') ||
      name.includes('ReactElement')
    );
  }

  /**
   * Detects if a node represents a lazy-loaded React component
   */
  private isLazyComponent(node: HeapNode): boolean {
    const name = node.name || '';
    
    return (
      // React.lazy patterns (intrinsic heap signals)
      name.includes('LazyComponent') ||
      name.includes('lazy') ||
      name.includes('_payload') ||
      name.includes('_result') ||
      
      // Dynamic import patterns (universal)
      name.includes('import()') ||
      name.includes('dynamicImport') ||
      name.includes('__webpack_require__') && name.includes('lazy') ||
      
      // Suspense patterns (universal React patterns)
      name.includes('Suspense') ||
      name.includes('SuspenseComponent') ||
      name.includes('_status') && name.includes('pending') ||
      
      // Universal component registry patterns (any app could have these)
      name.includes('componentRegistry') ||
      name.includes('componentCache') ||
      name.includes('componentStore') ||
      name.includes('componentMap') ||
      name.includes('lazyCache') ||
      name.includes('dynamicComponents')
    );
  }

  /**
   * Detects React Fiber nodes (React's internal structure)
   */
  private isReactFiber(node: HeapNode): boolean {
    const name = node.name || '';
    
    return (
      name.includes('FiberNode') ||
      name.includes('fiber') ||
      name.includes('_owner') ||
      name.includes('stateNode') ||
      name.includes('elementType')
    );
  }

  /**
   * Detects React refs (useRef, createRef, etc.)
   */
  private isReactRef(node: HeapNode): boolean {
    const name = node.name || '';
    
    return (
      name.includes('Ref') ||
      name.includes('.current') ||
      name.includes('useRef') ||
      name.includes('createRef')
    );
  }

  /**
   * Extracts ref name from a React ref node
   */
  private extractRefName(node: HeapNode): string | null {
    const name = node.name || '';
    
    if (name.includes('Ref')) return name;
    
    return null;
  }

  /**
   * Detects React-specific detached DOM nodes
   */
  public detectReactDetachedNodes(): ReactDetachedNode[] {
    const detachedNodes: ReactDetachedNode[] = [];

    // Check React refs for DOM elements
    for (const [refName, refNodes] of this.reactRefs) {
      for (const refNode of refNodes) {
        if (this.isReactDOMElement(refNode)) {
          const detachedNode: ReactDetachedNode = {
            node: refNode,
            refName,
            isDetached: this.isNodeDetachedFromReactPerspective(refNode),
            retainerType: 'ref',
            componentName: this.findOwningComponent(refNode),
            jsxElementType: this.extractJSXElementType(refNode)
          };
          
          if (detachedNode.isDetached) {
            detachedNodes.push(detachedNode);
          }
        }
      }
    }

    // Check for DOM nodes in React components that should be unmounted
    for (const [componentName, component] of this.reactComponents) {
      const domNodes = this.findDOMNodesInComponent(component);
      for (const domNode of domNodes) {
        if (this.isNodeDetachedFromReactPerspective(domNode)) {
          detachedNodes.push({
            node: domNode,
            componentName,
            isDetached: true,
            retainerType: 'state',
            jsxElementType: this.extractJSXElementType(domNode)
          });
        }
      }
    }

    return detachedNodes;
  }

  /**
   * Checks if a node represents a React DOM element
   */
  private isReactDOMElement(node: HeapNode): boolean {
    const name = node.name || '';
    
    return (
      // Standard DOM elements
      name.startsWith('HTML') ||
      name.includes('Element') ||
      /^(div|span|h[1-6]|ul|li|p|img|a|button|form|input|textarea)$/i.test(name) ||
      
      // React-specific DOM markers
      name.includes('stateNode') ||
      name.includes('_reactInternalInstance') ||
      
      // React portal elements
      name.includes('Portal') && name.includes('Element')
    );
  }

  /**
   * Determines if a node is detached from React's perspective
   */
  private isNodeDetachedFromReactPerspective(node: HeapNode): boolean {
    // For React components, check if they're still mounted
    // For DOM elements, check if they're still in the document
    
    const name = node.name || '';
    
    // Explicit detached patterns
    if (name.includes('detached') || name.includes('unmounted')) {
      return true;
    }
    
    // Check if node is in any refs array (generic pattern)
    if (this.isNodeInDetachedRefs(node)) {
      return true;
    }
    
    // Check if it's a DOM element without document connection
    if (this.isReactDOMElement(node) && !this.hasDocumentConnection(node)) {
      return true;
    }
    
    return false;
  }

  /**
   * Checks if node is referenced by any refs array that might hold detached nodes
   */
  private isNodeInDetachedRefs(node: HeapNode): boolean {
    // Check if this node is referenced by any ref arrays
    // This is a generic check that works for any ref array, not specific names
    for (const [refName, refNodes] of this.reactRefs) {
      if (refNodes.some(ref => 
        ref.id === node.id || 
        ref.nodeIndex === node.nodeIndex
      )) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Checks if a node has connection to document
   */
  private hasDocumentConnection(node: HeapNode): boolean {
    // This would need to trace retainer paths to see if document is reachable
    // Simplified implementation for now
    const name = node.name || '';
    return name.includes('document') || name.includes('body') || name.includes('html');
  }

  /**
   * Finds the React component that owns a DOM node
   */
  private findOwningComponent(node: HeapNode): string | undefined {
    // Trace through React Fiber relationships to find owning component
    // Look through all React components to find one that might own this node
    for (const [componentName] of this.reactComponents) {
      // Generic check - any PascalCase component could own DOM nodes
      if (/^[A-Z][a-zA-Z0-9_]*$/.test(componentName)) {
        return componentName;
      }
    }
    return undefined;
  }

  /**
   * Extracts JSX element type (div, span, etc.)
   */
  private extractJSXElementType(node: HeapNode): string | undefined {
    const name = node.name || '';
    
    if (name.includes('HTMLDivElement') || name.includes('div')) return 'div';
    if (name.includes('HTMLSpanElement') || name.includes('span')) return 'span';
    if (name.includes('HTMLHeadingElement') || name.includes('h3')) return 'h3';
    if (name.includes('HTMLUListElement') || name.includes('ul')) return 'ul';
    if (name.includes('HTMLLIElement') || name.includes('li')) return 'li';
    
    return undefined;
  }

  /**
   * Finds DOM nodes within a React component
   */
  private findDOMNodesInComponent(component: HeapNode): HeapNode[] {
    // This would trace the component's render tree
    // Simplified implementation
    return this.nodes.filter(node => 
      this.isReactDOMElement(node) && 
      node.name?.includes(component.name || '')
    );
  }

  /**
   * Analyzes React-specific leak patterns
   */
  public analyzeReactLeakPatterns(): ReactLeakPattern[] {
    const patterns: ReactLeakPattern[] = [];
    const detachedNodes = this.detectReactDetachedNodes();

    if (detachedNodes.length > 0) {
      // Group by component
      const byComponent = new Map<string, ReactDetachedNode[]>();
      
      detachedNodes.forEach(node => {
        const componentName = node.componentName || 'Unknown';
        if (!byComponent.has(componentName)) {
          byComponent.set(componentName, []);
        }
        byComponent.get(componentName)!.push(node);
      });

      // Create patterns for each component
      byComponent.forEach((nodes, componentName) => {
        const refNodes = nodes.filter(n => n.retainerType === 'ref');
        
        if (refNodes.length > 0) {
          patterns.push({
            type: 'detached_dom',
            nodes: refNodes,
            description: `React component "${componentName}" has ${refNodes.length} detached DOM elements held in refs`,
            severity: refNodes.length > 10 ? 'critical' : refNodes.length > 5 ? 'high' : 'medium',
            fixRecommendation: `Clear refs in ${componentName}: Set ${refNodes.map(n => n.refName).join(', ')} to empty arrays in useEffect cleanup`,
            componentNames: [componentName]
          });
        }
      });
    }

    return patterns;
  }

  /**
   * Gets summary statistics
   */
  public getReactAnalysisSummary() {
    const detachedNodes = this.detectReactDetachedNodes();
    const patterns = this.analyzeReactLeakPatterns();
    
    return {
      totalReactComponents: this.reactComponents.size,
      totalReactRefs: this.reactRefs.size,
      totalReactFibers: this.reactFibers.length,
      detachedDOMNodes: detachedNodes.length,
      leakPatterns: patterns.length,
      criticalPatterns: patterns.filter(p => p.severity === 'critical').length,
      affectedComponents: new Set(patterns.flatMap(p => p.componentNames)).size
    };
  }
}
