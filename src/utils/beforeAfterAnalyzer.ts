import { HeapNode } from './heapAnalyzer.js';
import { isBuiltInGlobal } from './builtInGlobals.js';
import { analyzeGlobalVariables } from './globalVariableAnalyzer.js';
import { analyzeStaleCollections } from './staleCollectionAnalyzer.js';
import { analyzeUnboundGrowth, UnboundGrowthAnalysisResult } from './unboundGrowthAnalyzer.js';
import { DetachedDomAnalyzer } from './detachedDomAnalyzer.js';
import { ObjectFanoutAnalyzer } from './objectFanoutAnalyzer.js';
import { ObjectShallowAnalyzer } from './objectShallowAnalyzer.js';
import { ObjectShapeAnalyzer } from './objectShapeAnalyzer.js';
import { ObjectSizeRankAnalyzer } from './objectSizeRankAnalyzer.js';
import { ObjectUnboundGrowthAnalyzer } from './objectUnboundGrowthAnalyzer.js';
import { ReactComponentHookAnalyzer, ReactAnalysisResult } from './reactComponentHookAnalyzer.js';
import { ShapeUnboundGrowthAnalyzer, ShapeUnboundGrowthAnalysisResult } from './shapeUnboundGrowthAnalyzer.js';
import { StringAnalyzer, StringAnalysisResult } from './stringAnalyzer.js';
import { UnmountedFiberNodeAnalyzer, UnmountedFiberAnalysisResult } from './unmountedFiberNodeAnalyzer.js';

export interface ComparisonResult {
  memoryGrowth: {
    totalGrowth: number;
    percentageGrowth: number;
    beforeSize: number;
    afterSize: number;
  };
  newObjects: {
    node: HeapNode;
    retainerPath: string[];
    confidence: number;
    category: string;
    size: number;
  }[];
  grownObjects: {
    node: HeapNode;
    beforeSize: number;
    afterSize: number;
    growth: number;
    confidence: number;
  }[];
  potentialLeaks: {
    type: 'detached_dom' | 'closure' | 'timer' | 'array' | 'object' | 'event_listener' | 'closure_paradox' | 'image_canvas' | 'data_url' | 'global_variable' | 'collection_growth';
    nodes: HeapNode[];
    description: string;
    confidence: number;
    suggestedFix: string;
  }[];
  summary: {
    leakConfidence: 'high' | 'medium' | 'low';
    primaryConcerns: string[];
    recommendations: string[];
  };
  beforeAnalysis?: {
    globalVariableAnalysis?: any;
    staleCollectionAnalysis?: any;
    detachedDomAnalysis?: any;
    fanoutAnalysis?: any;
    shallowAnalysis?: any;
    shapeAnalysis?: any;
    sizeRankAnalysis?: any;
    reactAnalysis?: ReactAnalysisResult;
    stringAnalysis?: StringAnalysisResult;
    unmountedFiberAnalysis?: UnmountedFiberAnalysisResult;
  };
  afterAnalysis?: {
    globalVariableAnalysis?: any;
    staleCollectionAnalysis?: any;
    detachedDomAnalysis?: any;
    fanoutAnalysis?: any;
    shallowAnalysis?: any;
    shapeAnalysis?: any;
    sizeRankAnalysis?: any;
    reactAnalysis?: ReactAnalysisResult;
    stringAnalysis?: StringAnalysisResult;
    unmountedFiberAnalysis?: UnmountedFiberAnalysisResult;
  };
  unboundGrowthAnalysis?: UnboundGrowthAnalysisResult;
  objectUnboundGrowthAnalysis?: any;
  shapeUnboundGrowthAnalysis?: ShapeUnboundGrowthAnalysisResult;
}

export class BeforeAfterAnalyzer {
  private beforeSnapshot: any;
  private afterSnapshot: any;

  constructor(beforeSnapshotData: any, afterSnapshotData: any) {
    this.beforeSnapshot = beforeSnapshotData;
    this.afterSnapshot = afterSnapshotData;
  }

  async analyze(): Promise<ComparisonResult> {
    // Build object maps for comparison
    const beforeObjects = this.buildObjectMap(this.beforeSnapshot);
    const afterObjects = this.buildObjectMap(this.afterSnapshot);

    // Calculate memory growth
    const memoryGrowth = this.calculateMemoryGrowth();

    // Find new objects (exist in after but not before)
    const newObjects = await this.findNewObjects(beforeObjects, afterObjects);

    // Find objects that grew significantly
    const grownObjects = this.findGrownObjects(beforeObjects, afterObjects);

    // Detect potential leaks using our existing logic + comparison
    const potentialLeaks = await this.detectLeaks(newObjects, grownObjects);

    // Generate summary and recommendations
    const summary = this.generateSummary(memoryGrowth, newObjects, potentialLeaks);

    // Analyze global variables in both snapshots
    const beforeNodes = Array.from(beforeObjects.values());
    const afterNodes = Array.from(afterObjects.values());
    
    const detachedDomAnalyzer = new DetachedDomAnalyzer();
    const fanoutAnalyzer = new ObjectFanoutAnalyzer();
    const shallowAnalyzer = new ObjectShallowAnalyzer();
    const shapeAnalyzer = new ObjectShapeAnalyzer();
    const sizeRankAnalyzer = new ObjectSizeRankAnalyzer();
    
    const beforeAnalysis = {
      globalVariableAnalysis: analyzeGlobalVariables(beforeNodes),
      staleCollectionAnalysis: analyzeStaleCollections(beforeNodes),
      detachedDomAnalysis: detachedDomAnalyzer.analyze({ nodes: beforeNodes }),
      fanoutAnalysis: fanoutAnalyzer.analyze({ nodes: beforeNodes }),
      shallowAnalysis: shallowAnalyzer.analyze({ nodes: beforeNodes }),
      shapeAnalysis: shapeAnalyzer.analyze({ nodes: beforeNodes }),
      sizeRankAnalysis: sizeRankAnalyzer.analyze({ nodes: beforeNodes }),
      reactAnalysis: new ReactComponentHookAnalyzer().analyze({ nodes: beforeNodes }),
      stringAnalysis: new StringAnalyzer().analyze({ nodes: beforeNodes }),
      unmountedFiberAnalysis: new UnmountedFiberNodeAnalyzer().analyze({ nodes: beforeNodes })
    };
    
    const afterAnalysis = {
      globalVariableAnalysis: analyzeGlobalVariables(afterNodes),
      staleCollectionAnalysis: analyzeStaleCollections(afterNodes),
      detachedDomAnalysis: detachedDomAnalyzer.analyze({ nodes: afterNodes }),
      fanoutAnalysis: fanoutAnalyzer.analyze({ nodes: afterNodes }),
      shallowAnalysis: shallowAnalyzer.analyze({ nodes: afterNodes }),
      shapeAnalysis: shapeAnalyzer.analyze({ nodes: afterNodes }),
      sizeRankAnalysis: sizeRankAnalyzer.analyze({ nodes: afterNodes }),
      reactAnalysis: new ReactComponentHookAnalyzer().analyze({ nodes: afterNodes }),
      stringAnalysis: new StringAnalyzer().analyze({ nodes: afterNodes }),
      unmountedFiberAnalysis: new UnmountedFiberNodeAnalyzer().analyze({ nodes: afterNodes })
    };

    // Analyze unbound growth across both snapshots
    const unboundGrowthAnalysis = analyzeUnboundGrowth([beforeNodes, afterNodes]);

    // Analyze individual object growth across snapshots
    const objectUnboundGrowthAnalyzer = new ObjectUnboundGrowthAnalyzer();
    const objectUnboundGrowthAnalysis = objectUnboundGrowthAnalyzer.analyzeAcrossSnapshots([
      { nodes: beforeNodes },
      { nodes: afterNodes }
    ]);

    // Analyze shape unbound growth across snapshots
    const shapeUnboundGrowthAnalyzer = new ShapeUnboundGrowthAnalyzer();
    const shapeUnboundGrowthAnalysis = shapeUnboundGrowthAnalyzer.analyzeAcrossSnapshots([
      { nodes: beforeNodes },
      { nodes: afterNodes }
    ]);

    return {
      memoryGrowth,
      newObjects,
      grownObjects,
      potentialLeaks,
      summary,
      beforeAnalysis,
      afterAnalysis,
      unboundGrowthAnalysis,
      objectUnboundGrowthAnalysis,
      shapeUnboundGrowthAnalysis,
    };
  }

  private buildObjectMap(snapshot: any): Map<string, HeapNode> {
    const objectMap = new Map<string, HeapNode>();
    
    if (!snapshot.nodes || !snapshot.strings) {
      return objectMap;
    }

    // Parse nodes from snapshot format
    const nodeFields = snapshot.snapshot.meta.node_fields;
    const nodeTypes = snapshot.snapshot.meta.node_types;
    const nodeCount = snapshot.nodes.length / nodeFields.length;
    
    for (let i = 0; i < nodeCount; i++) {
      const nodeIndex = i * nodeFields.length;
      const node: HeapNode = {
        nodeIndex: i,
        type: snapshot.strings[snapshot.nodes[nodeIndex + nodeFields.indexOf('type')]] || 'unknown',
        name: snapshot.strings[snapshot.nodes[nodeIndex + nodeFields.indexOf('name')]] || 'unknown',
        selfSize: snapshot.nodes[nodeIndex + nodeFields.indexOf('self_size')] || 0,
        retainedSize: snapshot.nodes[nodeIndex + nodeFields.indexOf('retained_size')] || 0,
        id: snapshot.nodes[nodeIndex + nodeFields.indexOf('id')] || 0,
      };

      // Create a unique identifier for objects
      const key = this.createObjectKey(node);
      objectMap.set(key, node);
    }

    return objectMap;
  }

  private createObjectKey(node: HeapNode): string {
    // Create a key that can identify the "same" object across snapshots
    // This is imperfect but works for most cases
    return `${node.type}:${node.name}:${node.selfSize}`;
  }

  private calculateMemoryGrowth() {
    const beforeSize = this.getTotalHeapSize(this.beforeSnapshot);
    const afterSize = this.getTotalHeapSize(this.afterSnapshot);
    
    const totalGrowth = afterSize - beforeSize;
    const percentageGrowth = beforeSize > 0 ? (totalGrowth / beforeSize) * 100 : 0;

    return {
      totalGrowth,
      percentageGrowth,
      beforeSize,
      afterSize,
    };
  }

  private getTotalHeapSize(snapshot: any): number {
    if (!snapshot.nodes || !snapshot.snapshot?.meta?.node_fields) {
      return 0;
    }

    const nodeFields = snapshot.snapshot.meta.node_fields;
    const selfSizeIndex = nodeFields.indexOf('self_size');
    const nodeCount = snapshot.nodes.length / nodeFields.length;
    
    let totalSize = 0;
    for (let i = 0; i < nodeCount; i++) {
      const nodeIndex = i * nodeFields.length;
      totalSize += snapshot.nodes[nodeIndex + selfSizeIndex] || 0;
    }

    return totalSize;
  }

  private async findNewObjects(
    beforeObjects: Map<string, HeapNode>,
    afterObjects: Map<string, HeapNode>
  ) {
    const newObjects = [];
    
    for (const [key, afterNode] of afterObjects) {
      if (!beforeObjects.has(key) && afterNode.selfSize > 1024) { // Only consider objects > 1KB
        // This object exists in after but not before - potential leak
        const category = this.categorizeObject(afterNode);
        const retainerPath: string[] = []; // Simplified for now
        
        // Calculate confidence based on size, type, and retainer path
        const confidence = this.calculateLeakConfidence(afterNode, category, retainerPath);
        
        newObjects.push({
          node: afterNode,
          retainerPath,
          confidence,
          category,
          size: afterNode.selfSize,
        });
      }
    }

    // Sort by confidence and size
    return newObjects
      .sort((a, b) => b.confidence - a.confidence || b.size - a.size)
      .slice(0, 50); // Limit to top 50 for performance
  }

  private findGrownObjects(
    beforeObjects: Map<string, HeapNode>,
    afterObjects: Map<string, HeapNode>
  ) {
    const grownObjects = [];
    
    for (const [key, afterNode] of afterObjects) {
      const beforeNode = beforeObjects.get(key);
      if (beforeNode && afterNode.selfSize > beforeNode.selfSize) {
        const growth = afterNode.selfSize - beforeNode.selfSize;
        // Only care about significant growth
        if (growth > 1024) { // More than 1KB growth
          const confidence = Math.min((growth / beforeNode.selfSize) * 100, 100);
          
          grownObjects.push({
            node: afterNode,
            beforeSize: beforeNode.selfSize,
            afterSize: afterNode.selfSize,
            growth,
            confidence,
          });
        }
      }
    }

    return grownObjects
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20); // Top 20 grown objects
  }

  private async detectLeaks(newObjects: any[], grownObjects: any[]) {
    const potentialLeaks = [];

    // ===== COMPOSITE PATTERN DETECTION =====
    // Detect React component patterns first (high specificity)
    const reactComponentLeak = this.detectReactComponentLeaks(newObjects, grownObjects);
    if (reactComponentLeak) {
      potentialLeaks.push(reactComponentLeak);
    }

    // Detect image processing patterns (higher specificity)
    const imageProcessingLeak = this.detectImageProcessingPattern(newObjects, grownObjects);
    if (imageProcessingLeak) {
      potentialLeaks.push(imageProcessingLeak);
    }

    // ===== IMAGE/CANVAS/DATA URL LEAK DETECTION =====
    const imageCanvasLeaks = this.detectImageCanvasLeaks(newObjects, grownObjects);
    if (imageCanvasLeaks) {
      potentialLeaks.push(imageCanvasLeaks);
    }

    const dataUrlLeaks = this.detectDataUrlLeaks(newObjects, grownObjects);
    if (dataUrlLeaks) {
      potentialLeaks.push(dataUrlLeaks);
    }

    const globalVariableLeaks = this.detectGlobalVariableLeaks(newObjects, grownObjects);
    if (globalVariableLeaks) {
      potentialLeaks.push(globalVariableLeaks);
    }

    // Collection Growth Pattern Detection (new!)
    const collectionGrowthLeak = this.detectCollectionGrowthPattern(newObjects, grownObjects);
    if (collectionGrowthLeak) {
      potentialLeaks.push(collectionGrowthLeak);
    }

    // Enhanced Event Listener Leak Detection (only if no React or image processing pattern detected)
    if (!reactComponentLeak && !imageProcessingLeak) {
      const eventListenerPattern = this.detectEventListenerLeaks(newObjects, grownObjects);
      if (eventListenerPattern) {
        potentialLeaks.push(eventListenerPattern);
      }
    }

    // Detect DOM-related leaks
    const domLeaks = newObjects.filter(obj => obj.category === 'DOM' && obj.confidence > 50);
    if (domLeaks.length > 0) {
      potentialLeaks.push({
        type: 'detached_dom' as const,
        nodes: domLeaks.map(leak => leak.node),
        description: `Found ${domLeaks.length} new DOM objects that may be detached`,
        confidence: Math.min(domLeaks.reduce((sum, leak) => sum + leak.confidence, 0) / domLeaks.length, 90),
        suggestedFix: 'Remove event listeners and clear references to DOM elements before removing them from the document',
      });
    }

    // Enhanced closure leak detection with closure paradox analysis
    const closureLeaks = newObjects.filter(obj => obj.category === 'CLOSURE' && obj.confidence > 60);
    const closureParadoxPattern = this.detectClosureParadox(newObjects, closureLeaks);
    
    if (closureParadoxPattern) {
      potentialLeaks.push(closureParadoxPattern);
    } else if (closureLeaks.length > 0) {
      potentialLeaks.push({
        type: 'closure' as const,
        nodes: closureLeaks.map(leak => leak.node),
        description: `${closureLeaks.length} new closures detected, potentially capturing large scopes`,
        confidence: Math.min(closureLeaks.reduce((sum, leak) => sum + leak.confidence, 0) / closureLeaks.length, 90),
        suggestedFix: 'Review closures for unnecessary variable captures, use React.useCallback, or clear references',
      });
    }

    // Detect array growth patterns
    const arrayGrowth = grownObjects.filter(obj => 
      this.categorizeObject(obj.node) === 'ARRAY' && obj.growth > 10240 // 10KB
    );
    if (arrayGrowth.length > 0) {
      potentialLeaks.push({
        type: 'array' as const,
        nodes: arrayGrowth.map(growth => growth.node),
        description: `${arrayGrowth.length} arrays grew significantly, possibly accumulating data`,
        confidence: Math.min(arrayGrowth.reduce((sum, growth) => sum + growth.confidence, 0) / arrayGrowth.length, 85),
        suggestedFix: 'Implement cleanup logic for arrays, use pagination, or clear old data',
      });
    }

    // Detect large new objects
    const largeObjects = newObjects.filter(obj => obj.size > 100 * 1024 && obj.confidence > 40); // > 100KB
    if (largeObjects.length > 0) {
      potentialLeaks.push({
        type: 'object' as const,
        nodes: largeObjects.map(obj => obj.node),
        description: `${largeObjects.length} large new objects created (${(largeObjects.reduce((sum, obj) => sum + obj.size, 0) / 1024 / 1024).toFixed(1)}MB total)`,
        confidence: Math.min(largeObjects.reduce((sum, obj) => sum + obj.confidence, 0) / largeObjects.length, 80),
        suggestedFix: 'Review object lifecycle and ensure proper cleanup when objects are no longer needed',
      });
    }

    return potentialLeaks.sort((a, b) => b.confidence - a.confidence);
  }

  // ===== REACT COMPONENT LEAK DETECTION =====

  /**
   * Detects React component lifecycle leaks using intrinsic heap signals
   * - High timer growth + object explosion = useEffect intervals without cleanup
   * - React Fiber node accumulation = components not unmounting properly
   * - Array accumulation + timers = component instance leaks
   * - Lazy component accumulation = React.lazy components not unmounting
   * - Context provider leaks = Context subscriptions growing
   */
  private detectReactComponentLeaks(newObjects: any[], grownObjects: any[]): any | null {
    console.log(`🔍 DEBUG: Starting React component leak detection with ${newObjects.length} new objects`);
    
    const reactFiberObjects = newObjects.filter(obj => this.isReactFiberNode(obj.node));
    const arrayObjects = newObjects.filter(obj => obj.category === 'ARRAY');
    const timerRelatedObjects = newObjects.filter(obj => this.isTimerRelatedNode(obj.node));
    
    // Additional React-specific pattern detection
    const lazyComponentObjects = newObjects.filter(obj => this.isLazyComponentNode(obj.node));
    const contextObjects = newObjects.filter(obj => this.isReactContextNode(obj.node));
    const suspenseObjects = newObjects.filter(obj => this.isReactSuspenseNode(obj.node));
    const routerObjects = newObjects.filter(obj => this.isReactRouterNode(obj.node));
    const hookObjects = newObjects.filter(obj => this.isReactHookNode(obj.node));
    
    const totalObjects = newObjects.length;
    const reactNodeGrowth = reactFiberObjects.length;
    const arrayGrowth = arrayObjects.length;
    const timerObjectGrowth = timerRelatedObjects.length;
    const lazyComponentGrowth = lazyComponentObjects.length;
    const contextGrowth = contextObjects.length;
    const suspenseGrowth = suspenseObjects.length;
    const routerGrowth = routerObjects.length;
    const hookGrowth = hookObjects.length;

    // Debug: Log lazy component detection
    console.log(`🔍 DEBUG: Lazy component detection:
      LazyComponentGrowth: ${lazyComponentGrowth}
      LazyComponentObjects: ${lazyComponentObjects.slice(0, 3).map(o => o.node.name).join(', ')}
      ReactNodeGrowth: ${reactNodeGrowth}
      TotalObjects: ${totalObjects}`);

    // Enhanced React component leak signatures (using intrinsic heap signals):
    const hasReactComponentLeakSignature = (
      // Pattern 1: React nodes + timers + massive objects (classic useEffect interval leak)
      reactNodeGrowth > 10 &&
      timerObjectGrowth > 20 &&
      totalObjects > 100000
    ) || (
      // Pattern 2: Array accumulation + timer explosion (component arrays + intervals)
      arrayGrowth > 50 &&
      timerObjectGrowth > 50 &&
      totalObjects > 150000
    ) || (
      // Pattern 3: Lazy component accumulation (React.lazy zombie components)
      lazyComponentGrowth > 5 &&
      reactNodeGrowth > 10 &&
      totalObjects > 100000
    ) || (
      // Pattern 4: Context provider explosion (Context subscription leaks)
      contextGrowth > 10 &&
      reactNodeGrowth > 15 &&
      totalObjects > 80000
    ) || (
      // Pattern 5: Router navigation accumulation 
      routerGrowth > 10 &&
      reactNodeGrowth > 20 &&
      totalObjects > 120000
    ) || (
      // Pattern 6: Hook dependency retention
      hookGrowth > 20 &&
      timerObjectGrowth > 10 &&
      totalObjects > 100000
    ) || (
      // Pattern 7: Suspense boundary accumulation
      suspenseGrowth > 5 &&
      lazyComponentGrowth > 3 &&
      totalObjects > 80000
    );

    if (hasReactComponentLeakSignature) {
      const confidence = Math.min(95, 70 + 
        Math.min(10, reactNodeGrowth / 5) + // React nodes
        Math.min(10, timerObjectGrowth / 20) + // Timers
        Math.min(10, lazyComponentGrowth / 2) + // Lazy components
        Math.min(5, contextGrowth / 5) // Context growth
      );

      // Determine primary leak type for more specific recommendations
      let leakType = 'general';
      let specificRecommendation = '';

      if (lazyComponentGrowth > 5 && reactNodeGrowth > 10) {
        leakType = 'lazy_components';
        specificRecommendation = 'React.lazy component accumulation detected! Components are mounting via dynamic imports but never unmounting. Add proper cleanup in component lifecycle.';
      } else if (contextGrowth > 10) {
        leakType = 'context_providers';
        specificRecommendation = 'React Context subscription leak! Context providers/consumers accumulating. Ensure useContext cleanup and provider unmounting.';
      } else if (routerGrowth > 10) {
        leakType = 'router_navigation';
        specificRecommendation = 'React Router navigation leak! Route components accumulating from navigation. Check for route caching and component cleanup.';
      } else if (hookGrowth > 20) {
        leakType = 'hook_dependencies';
        specificRecommendation = 'React Hook dependency leak! useEffect/useMemo dependencies causing retention. Review dependency arrays and cleanup functions.';
      } else if (suspenseGrowth > 5) {
        leakType = 'suspense_boundaries';
        specificRecommendation = 'React Suspense boundary accumulation! Suspense components and lazy loading boundaries not cleaning up properly.';
      }

      return {
        type: 'react_component_lifecycle' as const,
        nodes: [
          ...reactFiberObjects.slice(0, 3),
          ...timerRelatedObjects.slice(0, 3),
          ...lazyComponentObjects.slice(0, 2),
          ...contextObjects.slice(0, 2),
          ...routerObjects.slice(0, 2),
          ...hookObjects.slice(0, 2)
        ].map(obj => obj.node),
        description: `⚛️ CRITICAL: React ${leakType.replace('_', ' ')} leak - ${reactNodeGrowth} React nodes, ${lazyComponentGrowth} lazy components, ${contextGrowth} context objects, ${timerObjectGrowth} timers causing ${totalObjects.toLocaleString()} object explosion`,
        confidence,
        suggestedFix: specificRecommendation || 'URGENT: Add useEffect cleanup! Return cleanup functions: useEffect(() => { const timer = setInterval(...); return () => clearInterval(timer); }). Clear component arrays on unmount.',
        details: {
          reactNodes: reactNodeGrowth,
          timerObjects: timerObjectGrowth,
          arrayGrowth: arrayGrowth,
          lazyComponents: lazyComponentGrowth,
          contextObjects: contextGrowth,
          routerObjects: routerGrowth,
          hookObjects: hookGrowth,
          suspenseObjects: suspenseGrowth,
          leakType,
          objectExplosion: totalObjects
        }
      };
    }

    return null;
  }

  // ===== IMAGE/CANVAS/DATA URL SPECIFIC LEAK DETECTORS =====

  /**
   * Composite Image Processing Leak Detection
   * Detects when Data URLs + Canvas objects + massive object growth = image processing leak
   */
  private detectImageProcessingPattern(newObjects: any[], grownObjects: any[]): any | null {
    const dataUrlObjects = newObjects.filter(obj => 
      obj.category === 'DATA_URL' || obj.category === 'BASE64_DATA'
    );
    const imageCanvasObjects = newObjects.filter(obj => 
      obj.category === 'IMAGE_CANVAS'
    );
    const largeStringObjects = newObjects.filter(obj => 
      obj.category === 'OBJECT' && obj.node.type === 'string' && obj.node.selfSize > 50000
    );

    // Calculate key metrics
    const totalObjects = newObjects.length;
    const totalDataUrlSize = dataUrlObjects.reduce((sum, obj) => sum + obj.size, 0);
    const totalCanvasSize = imageCanvasObjects.reduce((sum, obj) => sum + obj.size, 0);
    const totalLargeStringSize = largeStringObjects.reduce((sum, obj) => sum + obj.size, 0);

    // Image processing pattern signatures:
    // 1. Data URLs present + Canvas objects + massive object growth
    // 2. Large base64 strings accumulating
    // 3. High ratio of string data to total objects
    const hasImageProcessingSignature = (
      dataUrlObjects.length > 0 && // Must have data URLs
      imageCanvasObjects.length > 0 && // Must have canvas objects
      totalObjects > 50000 && // Significant object growth
      (totalDataUrlSize + totalLargeStringSize) > totalDataUrlSize * 0.3 // High string data ratio
    ) || (
      // Alternative: Massive string data even without explicit canvas detection
      (totalDataUrlSize + totalLargeStringSize) > 5 * 1024 * 1024 && // > 5MB of string data
      largeStringObjects.length > 10 && // Multiple large strings
      totalObjects > 100000 // Massive object growth
    );

    if (hasImageProcessingSignature) {
      const totalLeakSize = totalDataUrlSize + totalCanvasSize + totalLargeStringSize;
      const confidence = Math.min(95, 80 + 
        Math.min(15, dataUrlObjects.length / 5) + // More data URLs = higher confidence
        Math.min(15, imageCanvasObjects.length / 3) // More canvas objects = higher confidence
      );

      return {
        type: 'image_processing' as const,
        nodes: [
          ...dataUrlObjects.slice(0, 5),
          ...imageCanvasObjects.slice(0, 5),
          ...largeStringObjects.slice(0, 5)
        ].map(obj => obj.node),
        description: `🖼️ CRITICAL: Image processing leak detected - ${dataUrlObjects.length} data URLs, ${imageCanvasObjects.length} canvas objects, ${(totalLeakSize / 1024 / 1024).toFixed(1)}MB of image data accumulating`,
        confidence,
        suggestedFix: 'URGENT: Clear global image arrays immediately. Stop canvas.toDataURL() loops. Use canvas.width = canvas.height = 0 after processing. Review global arrays storing base64 strings.',
        details: {
          dataUrls: dataUrlObjects.length,
          canvasObjects: imageCanvasObjects.length,
          largeStrings: largeStringObjects.length,
          totalImageDataMB: (totalLeakSize / 1024 / 1024).toFixed(1)
        }
      };
    }

    return null;
  }

  private detectImageCanvasLeaks(newObjects: any[], grownObjects: any[]) {
    const imageCanvasObjects = newObjects.filter(obj => 
      obj.category === 'IMAGE_CANVAS' && obj.confidence > 40
    );
    
    if (imageCanvasObjects.length > 0) {
      const totalSize = imageCanvasObjects.reduce((sum, obj) => sum + obj.size, 0);
      return {
        type: 'image_canvas' as const,
        nodes: imageCanvasObjects.map(obj => obj.node),
        description: `🖼️ Canvas/Image leak: ${imageCanvasObjects.length} objects (${(totalSize / 1024 / 1024).toFixed(1)}MB) - likely from repeated canvas.toDataURL() calls`,
        confidence: Math.min(90, 70 + (imageCanvasObjects.length / 10) * 10),
        suggestedFix: 'Clear canvas references after toDataURL(). Use canvas.width = canvas.height = 0 and remove from DOM when done.',
      };
    }
    return null;
  }

  private detectDataUrlLeaks(newObjects: any[], grownObjects: any[]) {
    const dataUrlObjects = newObjects.filter(obj => 
      obj.category === 'DATA_URL' || obj.category === 'BASE64_DATA'
    );
    
    if (dataUrlObjects.length > 0) {
      const totalSize = dataUrlObjects.reduce((sum, obj) => sum + obj.size, 0);
      const avgSize = totalSize / dataUrlObjects.length;
      
      // High confidence if we see large base64 strings accumulating
      const confidence = Math.min(95, 75 + (avgSize / 50000) * 15); // Higher confidence for larger average sizes
      
      return {
        type: 'data_url' as const,
        nodes: dataUrlObjects.map(obj => obj.node),
        description: `💾 CRITICAL: Data URL accumulation - ${dataUrlObjects.length} base64 strings (${(totalSize / 1024 / 1024).toFixed(1)}MB). Avg size: ${(avgSize / 1024).toFixed(0)}KB each`,
        confidence,
        suggestedFix: 'URGENT: Clear data URL arrays immediately - Review global arrays containing base64 strings. Consider using object URLs or canvas cleanup instead.',
      };
    }
    return null;
  }

  /**
   * Collection Growth Pattern Detection
   * Detects unbounded growth of Arrays, Maps, Sets, and Objects (like GrowingCollections component)
   */
  private detectCollectionGrowthPattern(newObjects: any[], grownObjects: any[]): any | null {
    const totalNewObjects = newObjects.length;
    const totalNewObjectsSize = newObjects.reduce((sum, obj) => sum + obj.size, 0);
    
    // Look for patterns indicating collection growth
    const arrayObjects = newObjects.filter(obj => 
      obj.category === 'ARRAY' || obj.node.type === 'object' && obj.node.name === 'Array'
    );
    
    const objectCollections = newObjects.filter(obj => 
      obj.category === 'OBJECT' && obj.node.type === 'object' && obj.size > 5000 // Medium-sized objects
    );
    
    const stringAccumulation = newObjects.filter(obj => 
      obj.node.type === 'string' && obj.size > 1000 // Strings larger than 1KB
    );

    // Calculate key metrics
    const totalArraySize = arrayObjects.reduce((sum, obj) => sum + obj.size, 0);
    const totalObjectSize = objectCollections.reduce((sum, obj) => sum + obj.size, 0);
    const totalStringSize = stringAccumulation.reduce((sum, obj) => sum + obj.size, 0);
    
    // Collection growth signature:
    // 1. Massive object count increase (100K+ objects)
    // 2. Many arrays, objects, and strings (collections + their content)
    // 3. Moderate memory per object (indicating many small-medium objects)
    // 4. NOT primarily DOM/Canvas/Image data
    const avgObjectSize = totalNewObjectsSize / totalNewObjects;
    const hasCollectionGrowthSignature = (
      totalNewObjects > 80000 && // High object count
      (arrayObjects.length + objectCollections.length + stringAccumulation.length) > totalNewObjects * 0.15 && // 15%+ are collections/strings
      avgObjectSize > 500 && avgObjectSize < 10000 && // Medium-sized objects (not tiny, not huge)
      (totalArraySize + totalObjectSize + totalStringSize) > totalNewObjectsSize * 0.25 // 25%+ of memory in collections
    );

    if (hasCollectionGrowthSignature) {
      const confidence = Math.min(95, 70 + 
        Math.min(15, totalNewObjects / 10000) + // More objects = higher confidence
        Math.min(10, (arrayObjects.length + objectCollections.length) / 1000) // More collections = higher confidence
      );

      return {
        type: 'collection_growth' as const,
        nodes: [...arrayObjects.slice(0, 5), ...objectCollections.slice(0, 5), ...stringAccumulation.slice(0, 5)].map(obj => obj.node),
        description: `🗃️ COLLECTION GROWTH LEAK: ${totalNewObjects.toLocaleString()} objects created with heavy array/object accumulation (${arrayObjects.length} arrays, ${objectCollections.length} objects, ${stringAccumulation.length} strings)`,
        confidence,
        suggestedFix: 'CRITICAL: Implement collection size limits (Arrays: splice() old items, Objects: delete old keys, Maps/Sets: use LRU cache pattern). Add periodic cleanup for unbounded global collections.',
      };
    }

    return null;
  }

  private detectGlobalVariableLeaks(newObjects: any[], grownObjects: any[]) {
    const globalObjects = newObjects.filter(obj => 
      obj.category === 'GLOBAL_VARIABLE' && obj.confidence > 30
    );
    
    // Enhanced: Look for global collections (Arrays, Maps, Sets, Objects on window)
    const globalCollections = newObjects.filter(obj => 
      (obj.node.type === 'object' && obj.node.name && 
       (obj.node.name.includes('Map') || obj.node.name.includes('Set') || obj.node.name === 'Array')) ||
      (obj.retainerPath && obj.retainerPath.some((path: string) => 
        path.includes('window.') || path.includes('Window')))
    );
    
    // Look for suspicious patterns in the global objects
    const suspiciousGlobalObjects = globalObjects.filter(obj => 
      obj.node.name && (
        obj.node.name.includes('Archive') ||
        obj.node.name.includes('Cache') ||
        obj.node.name.includes('Store') ||
        obj.node.name.includes('Buffer') ||
        obj.node.name.includes('Pool') ||
        obj.node.name.includes('Registry') ||
        obj.node.name.includes('Manifest') ||
        obj.node.name.includes('Log') ||
        obj.node.name.includes('Hoard') ||
        obj.size > 100 * 1024 // Objects larger than 100KB
      )
    );
    
    // Combine both patterns for stronger detection
    const allSuspiciousGlobals = [...suspiciousGlobalObjects, ...globalCollections];
    
    if (allSuspiciousGlobals.length > 0 || globalObjects.length > 20) {
      const totalSize = [...globalObjects, ...globalCollections].reduce((sum, obj) => sum + obj.size, 0);
      return {
        type: 'global_variable' as const,
        nodes: allSuspiciousGlobals.map(obj => obj.node),
        description: `🌐 CRITICAL: Global variable leak detected - ${allSuspiciousGlobals.length} objects in global scope (${(totalSize / 1024 / 1024).toFixed(1)}MB). Includes ${globalCollections.length} global collections (Maps/Sets/Arrays).`,
        confidence: Math.min(95, 80 + (allSuspiciousGlobals.length / globalObjects.length) * 15),
        suggestedFix: 'URGENT: Review and clear global arrays/objects - Check window.* variables for large accumulating data structures.',
      };
    }
    return null;
  }

  /**
   * Enhanced Event Listener Leak Detection
   * Detects patterns where objects explode but closures remain stable/decrease
   * Now specifically excludes image processing patterns
   */
  private detectEventListenerLeaks(newObjects: any[], grownObjects: any[]) {
    const totalNewObjects = newObjects.length;
    const totalNewObjectsSize = newObjects.reduce((sum, obj) => sum + obj.size, 0);
    const closureObjects = newObjects.filter(obj => obj.category === 'CLOSURE');
    const globalRetainerObjects = newObjects.filter(obj => 
      obj.retainerPath && obj.retainerPath.some((path: string) => 
        path.includes('Window') || path.includes('document') || path.includes('global')
      )
    );

    // Check if this is actually an image processing leak in disguise
    const dataUrlObjects = newObjects.filter(obj => 
      obj.category === 'DATA_URL' || obj.category === 'BASE64_DATA'
    );
    const imageCanvasObjects = newObjects.filter(obj => 
      obj.category === 'IMAGE_CANVAS'
    );
    const largeStringObjects = newObjects.filter(obj => 
      obj.category === 'OBJECT' && obj.node.type === 'string' && obj.node.selfSize > 50000
    );

    // Exclude image processing patterns from event listener detection
    const totalImageDataSize = dataUrlObjects.reduce((sum, obj) => sum + obj.size, 0) +
                              largeStringObjects.reduce((sum, obj) => sum + obj.size, 0);
    const isImageProcessingPattern = (
      (dataUrlObjects.length > 0 && imageCanvasObjects.length > 0) ||
      totalImageDataSize > 5 * 1024 * 1024 // > 5MB of string/image data
    );

    // Event listener leak patterns (excluding image processing):
    // 1. Massive object growth with stable/few closures
    // 2. High global retainer count (window/document attached)  
    // 3. Memory growth outpacing object count growth
    // 4. NOT an image processing pattern
    const hasEventListenerSignature = (
      !isImageProcessingPattern && // Key exclusion
      totalNewObjects > 50000 && // High object count
      closureObjects.length < totalNewObjects * 0.1 && // Low closure ratio
      globalRetainerObjects.length > totalNewObjects * 0.05 && // Some global retainers
      totalImageDataSize < totalNewObjectsSize * 0.2 // Low image data ratio
    );

    if (hasEventListenerSignature) {
      return {
        type: 'event_listener' as const,
        nodes: [...globalRetainerObjects.slice(0, 10), ...newObjects.slice(0, 10)].map(obj => obj.node),
        description: `🎧 Event listener accumulation pattern detected: ${totalNewObjects.toLocaleString()} objects with ${globalRetainerObjects.length} global retainers (NOT image processing)`,
        confidence: Math.min(85, 60 + (globalRetainerObjects.length / totalNewObjects) * 100),
        suggestedFix: 'Remove event listeners with removeEventListener() before component unmount. Check for listeners on window, document, or global objects that are never cleaned up.',
      };
    }

    return null;
  }

  /**
   * Closure Paradox Detection
   * Detects when object count explodes but closure count is low/decreasing
   */
  private detectClosureParadox(newObjects: any[], closureLeaks: any[]) {
    const totalNewObjects = newObjects.length;
    const totalSize = newObjects.reduce((sum, obj) => sum + obj.size, 0);
    const avgObjectSize = totalSize / totalNewObjects;
    
    // Paradox pattern: Many objects, few closures, but heavy memory per object
    const hasClosureParadox = (
      totalNewObjects > 100000 && // Lots of new objects
      closureLeaks.length < 50 && // But few closure leaks
      avgObjectSize > 1024 // Objects are data-heavy
    );

    if (hasClosureParadox) {
      return {
        type: 'closure_paradox' as const,
        nodes: [...newObjects.slice(0, 15)].map(obj => obj.node),
        description: `🔗 Closure paradox detected: ${totalNewObjects.toLocaleString()} objects with few closures suggests event listeners or global retention`,
        confidence: Math.min(80, 50 + (totalNewObjects / 100000) * 30),
        suggestedFix: 'Investigate global objects, event handlers, or data structures that retain references without creating obvious closures.',
      };
    }

    return null;
  }

  private categorizeObject(node: HeapNode): string {
    const name = node.name || '';
    const type = node.type || '';
    
    // IMAGE/CANVAS LEAK DETECTION - Critical patterns
    if (this.isImageCanvasNode(node)) {
      return 'IMAGE_CANVAS';
    }
    if (this.isDataURLNode(node)) {
      return 'DATA_URL';
    }
    if (this.isBase64DataNode(node)) {
      return 'BASE64_DATA';
    }
    if (this.isGlobalVariableNode(node)) {
      return 'GLOBAL_VARIABLE';
    }
    
    // Enhanced DOM detection
    if (name.startsWith('HTML') || name.includes('Element') || name.includes('Node') || 
        type.includes('Element') || type.includes('Node')) {
      return 'DOM';
    }
    if (name.includes('Fiber') || name.includes('React')) {
      return 'REACT';
    }
    if (type === 'closure' || name.includes('Closure')) {
      return 'CLOSURE';
    }
    if (type === 'array' || name === 'Array') {
      return 'ARRAY';
    }
    if (name.includes('Promise') || name.includes('async')) {
      return 'ASYNC';
    }
    if (type === 'function' || name.includes('Function')) {
      return 'FUNCTION';
    }
    
    return 'OBJECT';
  }

  private calculateLeakConfidence(node: HeapNode, category: string, retainerPath: string[]): number {
    let confidence = 20; // Base confidence

    // Size-based confidence
    if (node.selfSize > 1024 * 1024) confidence += 30; // > 1MB
    else if (node.selfSize > 100 * 1024) confidence += 20; // > 100KB
    else if (node.selfSize > 10 * 1024) confidence += 10; // > 10KB

    // Category-based confidence
    switch (category) {
      case 'DOM':
        confidence += 25; // DOM objects are often leaked
        break;
      case 'CLOSURE':
        confidence += 20; // Closures often leak
        break;
      case 'ARRAY':
        confidence += 15; // Arrays can accumulate
        break;
      case 'FUNCTION':
        confidence += 10; // Functions can leak via closures
        break;
    }

    // Retainer path analysis
    const hasGlobalRetainer = retainerPath.some(path => 
      path.includes('Window') || path.includes('global') || path.includes('document')
    );
    if (hasGlobalRetainer) confidence += 20;

    return Math.min(confidence, 95); // Cap at 95%
  }

  private generateSummary(memoryGrowth: any, newObjects: any[], potentialLeaks: any[]) {
    const highConfidenceLeaks = potentialLeaks.filter(leak => leak.confidence > 70);
    const totalNewObjectsSize = newObjects.reduce((sum, obj) => sum + obj.size, 0);
    
    let leakConfidence: 'high' | 'medium' | 'low' = 'low';
    if (highConfidenceLeaks.length > 0 || memoryGrowth.percentageGrowth > 50) {
      leakConfidence = 'high';
    } else if (potentialLeaks.length > 0 || memoryGrowth.percentageGrowth > 20) {
      leakConfidence = 'medium';
    }

    const primaryConcerns = [];
    const recommendations = [];

    if (memoryGrowth.totalGrowth > 5 * 1024 * 1024) { // > 5MB growth
      primaryConcerns.push(`Large memory growth: ${(memoryGrowth.totalGrowth / 1024 / 1024).toFixed(1)}MB`);
    }

    if (potentialLeaks.length > 0) {
      primaryConcerns.push(`${potentialLeaks.length} potential leak sources detected`);
      recommendations.push('Focus on the highest confidence leaks first');
    }

    if (newObjects.length > 100) {
      primaryConcerns.push(`${newObjects.length} new objects created`);
      recommendations.push('Review object lifecycle and cleanup patterns');
    }

    if (totalNewObjectsSize > 10 * 1024 * 1024) { // > 10MB of new objects
      primaryConcerns.push(`${(totalNewObjectsSize / 1024 / 1024).toFixed(1)}MB of new objects created`);
      recommendations.push('Large amount of new memory allocated - check for memory retention');
    }

    if (recommendations.length === 0) {
      if (leakConfidence === 'low') {
        recommendations.push('Memory usage appears stable - no immediate action needed');
      } else {
        recommendations.push('Monitor memory usage patterns and repeat analysis');
      }
    }

    return {
      leakConfidence,
      primaryConcerns,
      recommendations,
    };
  }

  // ===== REACT/TIMER DETECTION HELPER METHODS =====
  
  private isReactFiberNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // React Fiber internal nodes (intrinsic heap signals)
      name.includes('Fiber') ||
      name.includes('FiberNode') ||
      name.includes('ReactFiber') ||
      name.includes('FiberRoot') ||
      
      // React component patterns in heap
      name.includes('Component') && type === 'object' ||
      name.includes('Element') && type === 'object' ||
      
      // React internal structures
      name.includes('__reactInternalInstance') ||
      name.includes('_reactInternalFiber') ||
      name.includes('__reactInternalMemoizedUnmaskedChildContext') ||
      
      // React hooks and effects
      name.includes('useEffect') ||
      name.includes('useState') ||
      name.includes('useCallback') ||
      name.includes('useMemo') ||
      
      // React lazy/suspense patterns
      name.includes('lazy') && name.includes('Component') ||
      name.includes('Suspense') ||
      name.includes('LazyComponent')
    );
  }

  private isLazyComponentNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // React.lazy specific patterns (intrinsic heap signals)
      name.includes('LazyComponent') ||
      name.includes('lazy') && name.includes('Component') ||
      name.includes('React.lazy') ||
      
      // Dynamic import patterns (universal)
      name.includes('import()') ||
      name.includes('__webpack_require__') && name.includes('lazy') ||
      
      // Lazy loading internal structures (universal React patterns)
      name.includes('_payload') && type === 'object' ||
      name.includes('_init') && name.includes('lazy') ||
      name.includes('_result') && type === 'object' ||
      
      // Component loader patterns (universal)
      name.includes('ComponentLoader') ||
      name.includes('DynamicComponent') ||
      name.includes('AsyncComponent') ||
      
      // Suspense-related lazy patterns (universal React)
      name.includes('_status') && name.includes('pending') ||
      name.includes('Suspense') ||
      name.includes('SuspenseComponent') ||
      
      // Universal component registry patterns (any app could use these)
      name.includes('componentRegistry') ||
      name.includes('componentCache') ||
      name.includes('componentStore') ||
      name.includes('componentMap') ||
      name.includes('lazyCache') ||
      name.includes('dynamicComponents')
    );
  }

  private isReactContextNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // React Context patterns (intrinsic heap signals)
      name.includes('Context') && type === 'object' ||
      name.includes('Provider') && type === 'object' ||
      name.includes('Consumer') && type === 'object' ||
      
      // Context internal structures
      name.includes('_context') ||
      name.includes('useContext') ||
      name.includes('createContext') ||
      
      // Context subscription patterns
      name.includes('subscribe') && name.includes('Context') ||
      name.includes('Subscription') ||
      
      // Provider/Consumer patterns
      name.includes('ContextProvider') ||
      name.includes('ContextConsumer') ||
      
      // React internal context
      name.includes('__reactInternalMemoizedUnmaskedChildContext') ||
      name.includes('__reactInternalMemoizedMaskedChildContext')
    );
  }

  private isReactSuspenseNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // React Suspense patterns (intrinsic heap signals)
      name.includes('Suspense') ||
      name.includes('SuspenseComponent') ||
      
      // Suspense internal structures
      name.includes('_suspense') ||
      name.includes('suspense') && type === 'object' ||
      
      // Suspense boundary patterns
      name.includes('SuspenseBoundary') ||
      name.includes('fallback') && name.includes('Suspense') ||
      
      // Error boundary + Suspense
      name.includes('ErrorBoundary') && name.includes('Suspense') ||
      
      // Suspense state management
      name.includes('_pending') && name.includes('Suspense') ||
      name.includes('_resolved') && name.includes('Suspense')
    );
  }

  private isReactRouterNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // React Router patterns (intrinsic heap signals)
      name.includes('Router') && type === 'object' ||
      name.includes('Route') && type === 'object' ||
      name.includes('history') && type === 'object' ||
      
      // Router internal structures
      name.includes('react-router') ||
      name.includes('useNavigate') ||
      name.includes('useLocation') ||
      name.includes('useParams') ||
      
      // Navigation patterns
      name.includes('navigation') && type === 'object' ||
      name.includes('location') && name.includes('pathname') ||
      
      // Route matching
      name.includes('RouteMatch') ||
      name.includes('matchPath') ||
      
      // History API patterns
      name.includes('History') && type === 'object' ||
      name.includes('MemoryHistory') ||
      name.includes('BrowserHistory')
    );
  }

  private isReactHookNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // React Hook patterns (intrinsic heap signals)
      name.includes('useState') ||
      name.includes('useEffect') ||
      name.includes('useCallback') ||
      name.includes('useMemo') ||
      name.includes('useRef') ||
      name.includes('useContext') ||
      name.includes('useReducer') ||
      name.includes('useLayoutEffect') ||
      
      // Custom hook patterns
      name.startsWith('use') && name.length > 3 && type === 'function' ||
      
      // Hook internal structures
      name.includes('Hook') && type === 'object' ||
      name.includes('_hook') ||
      name.includes('memoizedState') ||
      
      // Hook dependency arrays
      name.includes('deps') && type === 'array' ||
      name.includes('dependencies') && type === 'array' ||
      
      // Effect cleanup patterns
      name.includes('cleanup') && name.includes('Effect') ||
      name.includes('destroy') && type === 'function'
    );
  }

  private isTimerRelatedNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // Timer/interval objects in heap (intrinsic signals)
      name.toLowerCase().includes('timer') ||
      name.toLowerCase().includes('interval') ||
      name.toLowerCase().includes('timeout') ||
      
      // Browser timer APIs
      name.includes('Timeout') ||
      name.includes('Interval') ||
      name.includes('setInterval') ||
      name.includes('setTimeout') ||
      
      // Timer-related native objects
      name.includes('TimerTask') ||
      name.includes('TimeoutHandler') ||
      name.includes('IntervalHandler') ||
      
      // JavaScript timer internal structures
      type === 'object' && (
        name.includes('Timer') ||
        name.includes('Schedule')
      )
    );
  }

  // ===== IMAGE/CANVAS/DATA URL LEAK DETECTION METHODS =====
  
  private isImageCanvasNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // HTML Image and Canvas elements
      name.includes('HTMLImageElement') ||
      name.includes('HTMLCanvasElement') ||
      name.includes('ImageData') ||
      name.includes('CanvasRenderingContext2D') ||
      name.includes('WebGLRenderingContext') ||
      name.includes('CanvasPattern') ||
      name.includes('CanvasGradient') ||
      name.includes('Path2D') ||
      
      // Image-related browser objects
      name.includes('Image') ||
      name.includes('Canvas') ||
      
      // Canvas API objects
      type === 'object' && (
        name.includes('canvas') ||
        name.includes('context') ||
        name.includes('imagedata')
      )
    );
  }

  private isDataURLNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // Data URL strings (these are huge in heap snapshots)
      (type === 'string' || type === 'cons string' || name.includes('String')) && (
        name.includes('data:image') ||
        name.includes('data:') && name.includes('base64') ||
        // Large strings that could be data URLs
        (node.selfSize > 50000 && type === 'string') ||
        // Blob URLs
        name.includes('blob:') ||
        // Object URLs
        name.includes('objectURL')
      ) ||
      
      // Objects that commonly hold data URLs
      name.includes('dataUrl') ||
      name.includes('dataURL') ||
      name.includes('base64Data') ||
      name.includes('imageData') && type === 'object'
    );
  }

  private isBase64DataNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    return (
      // Base64 encoded strings (very memory intensive)
      (type === 'string' || type === 'cons string') && (
        name.includes('base64') ||
        // Large strings with base64 patterns (common in heap snapshots)
        (node.selfSize > 100000 && (type === 'string' || type === 'cons string')) ||
        // ArrayBuffer/TypedArray data that could be base64 source
        name.includes('ArrayBuffer') ||
        name.includes('Uint8Array') ||
        name.includes('Buffer')
      ) ||
      
      // External string resources (often base64 data)
      name.includes('ExternalStringResource') ||
      name.includes('ExternalString')
    );
  }

  private isGlobalVariableNode(node: HeapNode): boolean {
    const name = node.name || '';
    const type = node.type || '';
    
    // Filter out built-in globals first
    if (isBuiltInGlobal(name)) {
      return false; // Don't flag built-in globals as leaks
    }
    
    // Detect objects attached to global scope (window.* properties)
    return (
      // Window property patterns
      name.includes('window.') ||
      name.includes('global.') ||
      
      // Generic global leak patterns - now more accurate without built-ins
      (type === 'object' && (
        name.includes('Archive') ||
        name.includes('Cache') ||
        name.includes('Store') ||
        name.includes('Buffer') ||
        name.includes('Pool') ||
        name.includes('Registry') ||
        name.includes('Manager')
      )) ||
      
      // Global scope indicators
      name === 'Window' || name === 'global'
    );
  }
}
