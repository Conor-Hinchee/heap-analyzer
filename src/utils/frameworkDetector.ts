import { HeapNode } from './heapAnalyzer.js';

export interface FrameworkInfo {
  name: string;
  version?: string;
  confidence: number;
  indicators: string[];
  memoryPattern: 'light' | 'moderate' | 'heavy';
  commonLeakPatterns: string[];
}

export interface FrameworkLeak {
  framework: 'nextjs' | 'react-router' | 'redux' | 'context' | 'react' | 'vue' | 'angular' | 'unknown';
  leakType: 'route_retention' | 'state_subscription' | 'context_provider' | 'middleware_retention' | 'hydration_mismatch' | 'component_retention';
  nodes: HeapNode[];
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fixRecommendation: string;
  retainedSize: number;
}

export interface FrameworkDetectionResult {
  primary?: FrameworkInfo;
  secondary: FrameworkInfo[];
  buildTools: string[];
  libraries: string[];
  totalFrameworkMemory: number;
  recommendations: string[];
  frameworkLeaks: FrameworkLeak[];
}

export class FrameworkDetector {
  private nodes: HeapNode[];
  private nodeNames: Set<string>;
  private nodeTypes: Set<string>;
  private allNodeNames: string[]; // Store all node names for better analysis
  private minifiedPatterns: Map<string, number> = new Map(); // Track minified code patterns
  private frameworkLeaks: FrameworkLeak[] = [];

  constructor(nodes: HeapNode[]) {
    this.nodes = nodes;
    this.nodeNames = new Set(nodes.map(n => n.name).filter(Boolean));
    this.nodeTypes = new Set(nodes.map(n => n.type).filter(Boolean));
    this.allNodeNames = nodes.map(n => n.name || '').filter(Boolean);
    this.analyzeMinifiedPatterns();
    this.analyzeFrameworkLeaks();
  }

  /**
   * Analyze patterns in minified/obfuscated code to better detect frameworks
   */
  private analyzeMinifiedPatterns(): void {
    // Look for common minified framework patterns
    const minifiedIndicators = [
      { pattern: /^[a-z]$/, framework: 'react' }, // Single char variables common in React builds
      { pattern: /^[A-Z][a-z]*[A-Z]/, framework: 'vue' }, // PascalCase common in Vue
      { pattern: /\$[a-z]+/, framework: 'jquery' }, // jQuery-style variables
      { pattern: /ng[A-Z]/, framework: 'angular' }, // Angular naming convention
      { pattern: /_[a-z]+_/, framework: 'webpack' }, // Webpack mangled names
    ];

    for (const name of this.allNodeNames) {
      for (const { pattern, framework } of minifiedIndicators) {
        if (pattern.test(name)) {
          const count = this.minifiedPatterns.get(framework) || 0;
          this.minifiedPatterns.set(framework, count + 1);
        }
      }
    }
  }

  public detectFrameworks(): FrameworkDetectionResult {
    const frameworks: FrameworkInfo[] = [];
    const buildTools: string[] = [];
    const libraries: string[] = [];
    let totalFrameworkMemory = 0;

    // Detect major frameworks
    const reactInfo = this.detectReact();
    if (reactInfo) {
      frameworks.push(reactInfo);
      totalFrameworkMemory += this.calculateFrameworkMemory('react');
    }

    const vueInfo = this.detectVue();
    if (vueInfo) {
      frameworks.push(vueInfo);
      totalFrameworkMemory += this.calculateFrameworkMemory('vue');
    }

    const angularInfo = this.detectAngular();
    if (angularInfo) {
      frameworks.push(angularInfo);
      totalFrameworkMemory += this.calculateFrameworkMemory('angular');
    }

    const nextInfo = this.detectNext();
    if (nextInfo) {
      frameworks.push(nextInfo);
      totalFrameworkMemory += this.calculateFrameworkMemory('next');
    }

    const svelteInfo = this.detectSvelte();
    if (svelteInfo) {
      frameworks.push(svelteInfo);
      totalFrameworkMemory += this.calculateFrameworkMemory('svelte');
    }

    // Detect build tools and bundlers
    buildTools.push(...this.detectBuildTools());

    // Detect common libraries
    libraries.push(...this.detectLibraries());

    // Sort frameworks by confidence
    frameworks.sort((a, b) => b.confidence - a.confidence);

    const primary = frameworks[0];
    const secondary = frameworks.slice(1);

    return {
      primary,
      secondary,
      buildTools,
      libraries,
      totalFrameworkMemory,
      recommendations: this.generateRecommendations(primary, secondary, totalFrameworkMemory),
      frameworkLeaks: this.frameworkLeaks
    };
  }

  private detectReact(): FrameworkInfo | null {
    const indicators: string[] = [];
    let confidence = 0;
    let version: string | undefined;

    // Enhanced detection using broader node analysis
    const allNames = this.allNodeNames.join(' ').toLowerCase();
    const reactKeywords = ['react', 'fiber', 'reactdom', 'jsx', 'createelement'];

    // Count occurrences across ALL nodes, not just checking for presence
    const reactOccurrences = reactKeywords.reduce((count, keyword) => {
      const matches = (allNames.match(new RegExp(keyword, 'g')) || []).length;
      if (matches > 0) {
        indicators.push(`Found '${keyword}' ${matches} times`);
        confidence += Math.min(matches * 0.05, 0.3); // Cap contribution per keyword
      }
      return count + matches;
    }, 0);

    // Look for React-specific objects and patterns
    const reactPatterns = [
      'React', 'ReactDOM', 'react-dom', 'react',
      'Fiber', 'FiberNode', 'FiberRoot',
      '__reactInternalInstance', '__reactInternalCache',
      'createReactClass', 'Component', 'PureComponent',
      'createElement', 'useEffect', 'useState'
    ];

    for (const pattern of reactPatterns) {
      if (this.hasPattern(pattern)) {
        indicators.push(`Found ${pattern}`);
        confidence += 0.1;
      }
    }

    // Check minified code patterns that suggest React
    const minifiedReactCount = this.minifiedPatterns.get('react') || 0;
    if (minifiedReactCount > 10) {
      confidence += 0.2;
      indicators.push(`Minified React patterns detected (${minifiedReactCount} instances)`);
    }

    // Strong React indicators
    if (this.hasPattern('FiberNode') || this.hasPattern('Fiber')) {
      confidence += 0.4;
      indicators.push('React Fiber detected (strong indicator)');
    }

    if (this.hasPattern('ReactDOM')) {
      confidence += 0.3;
      indicators.push('ReactDOM detected');
    }

    // Check for React hooks patterns
    const hookPatterns = ['useState', 'useEffect', 'useContext', 'useReducer'];
    const hooksFound = hookPatterns.filter(hook => this.hasPattern(hook));
    if (hooksFound.length > 0) {
      confidence += 0.2;
      indicators.push(`React hooks detected: ${hooksFound.join(', ')}`);
    }

    // Memory size-based heuristics - React apps tend to have specific memory patterns
    const largeObjects = this.nodes.filter(n => n.selfSize > 100 * 1024);
    const reactLikeObjects = largeObjects.filter(n => 
      n.name?.toLowerCase().includes('react') || 
      n.name?.toLowerCase().includes('fiber') ||
      n.name?.toLowerCase().includes('component')
    );
    
    if (reactLikeObjects.length > 0) {
      confidence += 0.15;
      indicators.push(`Large React-related objects found (${reactLikeObjects.length})`);
    }

    // --- Structural React Fiber detection ---
    const fiberLikeNodes = this.nodes.filter(n =>
      n && typeof n === 'object' && n !== null &&
      ['child', 'sibling', 'return', 'tag'].every(k => k in n)
    );
    if (fiberLikeNodes.length > 50) { // Threshold can be tuned
      confidence += 0.4;
      indicators.push(`Detected ${fiberLikeNodes.length} React Fiber-like nodes (structural match)`);
    }

    // Try to detect version
    version = this.extractVersion('react') || this.extractVersion('React');

    if (confidence > 0.3) {
      return {
        name: 'React',
        version,
        confidence: Math.min(confidence, 1.0),
        indicators,
        memoryPattern: confidence > 0.7 ? 'heavy' : 'moderate',
        commonLeakPatterns: [
          'Uncleared useEffect dependencies',
          'Event listeners not removed on unmount',
          'Stale closures in hooks',
          'Large component trees not garbage collected',
          'Memory leaks in React DevTools',
          'Fiber nodes not being released',
          'Context providers holding stale references'
        ]
      };
    }

    return null;
  }

  private detectVue(): FrameworkInfo | null {
    const indicators: string[] = [];
    let confidence = 0;
    let version: string | undefined;

    const vuePatterns = [
      'Vue', 'vue', 'VueComponent', 'VNode',
      '$mount', '$el', '$data', '$props',
      'defineComponent', 'createApp',
      'reactive', 'ref', 'computed'
    ];

    for (const pattern of vuePatterns) {
      if (this.hasPattern(pattern)) {
        indicators.push(`Found ${pattern}`);
        confidence += 0.1;
      }
    }

    // Strong Vue indicators
    if (this.hasPattern('VNode') || this.hasPattern('VueComponent')) {
      confidence += 0.4;
      indicators.push('Vue components detected');
    }

    // Vue 3 specific
    if (this.hasPattern('createApp') || this.hasPattern('reactive')) {
      confidence += 0.3;
      indicators.push('Vue 3 composition API detected');
      version = '3.x';
    }

    // Vue 2 specific
    if (this.hasPattern('$mount') && !version) {
      confidence += 0.2;
      indicators.push('Vue 2 options API detected');
      version = '2.x';
    }

    version = version || this.extractVersion('vue') || this.extractVersion('Vue');

    if (confidence > 0.3) {
      return {
        name: 'Vue.js',
        version,
        confidence: Math.min(confidence, 1.0),
        indicators,
        memoryPattern: 'moderate',
        commonLeakPatterns: [
          'Event listeners in mounted hooks',
          'Watchers not properly destroyed',
          'Large reactive objects',
          'Component instances not cleaned up',
          'Third-party plugin memory leaks'
        ]
      };
    }

    return null;
  }

  private detectAngular(): FrameworkInfo | null {
    const indicators: string[] = [];
    let confidence = 0;
    let version: string | undefined;

    const angularPatterns = [
      'Angular', 'angular', 'ng-', 'AngularJS',
      'platformBrowserDynamic', 'NgModule',
      'Component', 'Injectable', 'Directive',
      'ChangeDetector', 'ApplicationRef'
    ];

    for (const pattern of angularPatterns) {
      if (this.hasPattern(pattern)) {
        indicators.push(`Found ${pattern}`);
        confidence += 0.1;
      }
    }

    // Angular specific
    if (this.hasPattern('NgModule') || this.hasPattern('platformBrowserDynamic')) {
      confidence += 0.4;
      indicators.push('Angular framework detected');
      version = '2+';
    }

    // AngularJS specific
    if (this.hasPattern('AngularJS') || this.hasPattern('$scope')) {
      confidence += 0.3;
      indicators.push('AngularJS (1.x) detected');
      version = '1.x';
    }

    version = version || this.extractVersion('angular') || this.extractVersion('Angular');

    if (confidence > 0.3) {
      return {
        name: version?.startsWith('1') ? 'AngularJS' : 'Angular',
        version,
        confidence: Math.min(confidence, 1.0),
        indicators,
        memoryPattern: 'heavy',
        commonLeakPatterns: [
          'Change detection cycles not optimized',
          'Subscriptions not unsubscribed',
          'DOM listeners in directives',
          'Large dependency injection trees',
          'Zone.js memory overhead'
        ]
      };
    }

    return null;
  }

  private detectNext(): FrameworkInfo | null {
    const indicators: string[] = [];
    let confidence = 0;
    let version: string | undefined;

    const nextPatterns = [
      'Next.js', 'next', '_next', '__NEXT_DATA__',
      'getServerSideProps', 'getStaticProps',
      'NextScript', 'NextHead', 'NextApp'
    ];

    for (const pattern of nextPatterns) {
      if (this.hasPattern(pattern)) {
        indicators.push(`Found ${pattern}`);
        confidence += 0.15;
      }
    }

    // Strong Next.js indicators
    if (this.hasPattern('__NEXT_DATA__')) {
      confidence += 0.4;
      indicators.push('Next.js data injection detected');
    }

    if (this.hasPattern('getServerSideProps') || this.hasPattern('getStaticProps')) {
      confidence += 0.3;
      indicators.push('Next.js data fetching methods detected');
    }

    version = this.extractVersion('next');

    if (confidence > 0.3) {
      return {
        name: 'Next.js',
        version,
        confidence: Math.min(confidence, 1.0),
        indicators,
        memoryPattern: 'heavy',
        commonLeakPatterns: [
          'Server-side rendering memory leaks',
          'Static generation build-up',
          'Client-side hydration issues',
          'Image optimization memory usage',
          'API route memory leaks'
        ]
      };
    }

    return null;
  }

  private detectSvelte(): FrameworkInfo | null {
    const indicators: string[] = [];
    let confidence = 0;
    let version: string | undefined;

    const sveltePatterns = [
      'Svelte', 'svelte', 'SvelteComponent',
      'createComponent', 'mountComponent',
      'subscribe', 'unsubscribe'
    ];

    for (const pattern of sveltePatterns) {
      if (this.hasPattern(pattern)) {
        indicators.push(`Found ${pattern}`);
        confidence += 0.15;
      }
    }

    if (this.hasPattern('SvelteComponent')) {
      confidence += 0.4;
      indicators.push('Svelte components detected');
    }

    version = this.extractVersion('svelte');

    if (confidence > 0.3) {
      return {
        name: 'Svelte',
        version,
        confidence: Math.min(confidence, 1.0),
        indicators,
        memoryPattern: 'light',
        commonLeakPatterns: [
          'Store subscriptions not unsubscribed',
          'Event listeners in component lifecycle',
          'Reactive statements creating cycles',
          'Large reactive objects'
        ]
      };
    }

    return null;
  }

  private detectBuildTools(): string[] {
    const tools: string[] = [];
    
    const buildToolPatterns = {
      'Webpack': ['webpack', '__webpack_require__', 'webpackJsonp'],
      'Vite': ['vite', '__vite__', 'import.meta'],
      'Rollup': ['rollup', '__rollup__'],
      'Parcel': ['parcel', '__parcel__'],
      'Browserify': ['browserify', '__browserify__'],
      'ESBuild': ['esbuild', '__esbuild__'],
      'Turbopack': ['turbopack', '__turbopack__']
    };

    for (const [tool, patterns] of Object.entries(buildToolPatterns)) {
      if (patterns.some(pattern => this.hasPattern(pattern))) {
        tools.push(tool);
      }
    }

    return tools;
  }

  private detectLibraries(): string[] {
    const libraries: string[] = [];
    
    const libraryPatterns = {
      'Lodash': ['lodash', '_', '_.'],
      'jQuery': ['jQuery', '$', 'jquery'],
      'Axios': ['axios'],
      'Redux': ['redux', 'createStore', 'combineReducers'],
      'MobX': ['mobx', 'observable', 'makeObservable'],
      'RxJS': ['rxjs', 'Observable', 'Subject'],
      'Three.js': ['THREE', 'three'],
      'D3.js': ['d3', 'D3'],
      'Chart.js': ['Chart', 'chartjs'],
      'Socket.IO': ['socket.io', 'io']
    };

    for (const [library, patterns] of Object.entries(libraryPatterns)) {
      if (patterns.some(pattern => this.hasPattern(pattern))) {
        libraries.push(library);
      }
    }

    return libraries;
  }

  private hasPattern(pattern: string): boolean {
    // Check both exact matches and partial matches
    return this.nodeNames.has(pattern) || 
           Array.from(this.nodeNames).some(name => name.includes(pattern)) ||
           Array.from(this.nodeTypes).some(type => type.includes(pattern));
  }

  private extractVersion(frameworkName: string): string | undefined {
    // Look for version patterns in node names
    const versionRegex = /(\d+\.\d+\.\d+)/;
    
    for (const name of this.nodeNames) {
      if (name.toLowerCase().includes(frameworkName.toLowerCase())) {
        const match = name.match(versionRegex);
        if (match) {
          return match[1];
        }
      }
    }
    
    return undefined;
  }

  private calculateFrameworkMemory(framework: string): number {
    // Estimate memory usage for framework-related objects
    const frameworkNodes = this.nodes.filter(node => {
      const name = (node.name || '').toLowerCase();
      const type = (node.type || '').toLowerCase();
      
      switch (framework) {
        case 'react':
          return name.includes('react') || name.includes('fiber') || 
                 type.includes('react') || type.includes('fiber');
        case 'vue':
          return name.includes('vue') || name.includes('vnode') || 
                 type.includes('vue');
        case 'angular':
          return name.includes('angular') || name.includes('ng') || 
                 type.includes('angular');
        case 'next':
          return name.includes('next') || name.includes('_next');
        case 'svelte':
          return name.includes('svelte');
        default:
          return false;
      }
    });

    return frameworkNodes.reduce((sum, node) => sum + node.selfSize, 0);
  }

  private generateRecommendations(
    primary?: FrameworkInfo, 
    secondary: FrameworkInfo[] = [], 
    totalMemory: number = 0
  ): string[] {
    const recommendations: string[] = [];

    if (!primary) {
      recommendations.push('💡 No major framework detected - consider framework-specific optimizations if using one');
      return recommendations;
    }

    // Framework-specific recommendations
    recommendations.push(`🎯 Detected ${primary.name} (${(primary.confidence * 100).toFixed(0)}% confidence)`);

    if (primary.memoryPattern === 'heavy') {
      recommendations.push(`⚠️  ${primary.name} has a heavy memory footprint - monitor for framework-specific leaks`);
    }

    // Add framework-specific leak prevention advice
    recommendations.push(`🔧 Common ${primary.name} leak patterns to watch:`);
    primary.commonLeakPatterns.slice(0, 3).forEach(pattern => {
      recommendations.push(`   • ${pattern}`);
    });

    // Memory usage recommendations
    if (totalMemory > 5 * 1024 * 1024) { // > 5MB
      recommendations.push(`📊 Framework memory usage: ${(totalMemory / (1024 * 1024)).toFixed(1)}MB - consider optimization`);
    }

    // Multiple framework warning
    if (secondary.length > 0) {
      recommendations.push(`⚠️  Multiple frameworks detected: ${secondary.map(f => f.name).join(', ')} - this can increase memory usage`);
    }

    return recommendations;
  }

  /**
   * Analyzes framework-specific memory leaks
   */
  private analyzeFrameworkLeaks(): void {
    this.analyzeReactLeaks();
    this.analyzeNextJsLeaks();
    this.analyzeReactRouterLeaks();
    this.analyzeReduxLeaks();
    this.analyzeContextLeaks();
  }

  /**
   * Analyzes React-specific memory leaks
   */
  private analyzeReactLeaks(): void {
    const reactNodes = this.nodes.filter(node => 
      node.name?.includes('React') || 
      node.name?.includes('react') ||
      node.name?.includes('Component') ||
      node.name?.includes('Hook')
    );

    // Check for large React components
    const largeComponents = reactNodes.filter(node => node.selfSize > 1024 * 50); // > 50KB
    largeComponents.forEach(node => {
      this.frameworkLeaks.push({
        framework: 'react',
        leakType: 'component_retention',
        nodes: [node],
        description: `Large React component retained: ${node.name} (${(node.selfSize / 1024).toFixed(1)}KB)`,
        severity: node.selfSize > 1024 * 200 ? 'critical' : 'high',
        fixRecommendation: 'Check for refs, event listeners, or state that prevents component cleanup',
        retainedSize: node.selfSize
      });
    });
  }

  /**
   * Analyzes Next.js-specific memory leaks
   */
  private analyzeNextJsLeaks(): void {
    const nextNodes = this.nodes.filter(node => 
      node.name?.includes('next/') ||
      node.name?.includes('Next') ||
      node.name?.includes('_app') ||
      node.name?.includes('getServerSideProps')
    );

    if (nextNodes.length > 10) {
      const retainedSize = nextNodes.reduce((sum, n) => sum + n.selfSize, 0);
      this.frameworkLeaks.push({
        framework: 'nextjs',
        leakType: 'route_retention',
        nodes: nextNodes,
        description: `${nextNodes.length} Next.js routes/pages retained in memory`,
        severity: nextNodes.length > 50 ? 'critical' : 'high',
        fixRecommendation: 'Check for route caching issues, ensure proper cleanup in SSR functions',
        retainedSize
      });
    }
  }

  /**
   * Analyzes React Router memory leaks
   */
  private analyzeReactRouterLeaks(): void {
    const routerNodes = this.nodes.filter(node => 
      node.name?.includes('react-router') ||
      node.name?.includes('Router') ||
      node.name?.includes('Route')
    );

    const historyNodes = routerNodes.filter(node => 
      node.name?.includes('history') || node.name?.includes('History')
    );

    if (historyNodes.length > 20) {
      this.frameworkLeaks.push({
        framework: 'react-router',
        leakType: 'route_retention',
        nodes: historyNodes,
        description: `React Router history retention: ${historyNodes.length} history entries`,
        severity: historyNodes.length > 100 ? 'critical' : 'high',
        fixRecommendation: 'Limit browser history size, use replace instead of push',
        retainedSize: historyNodes.reduce((sum, n) => sum + n.selfSize, 0)
      });
    }
  }

  /**
   * Analyzes Redux memory leaks
   */
  private analyzeReduxLeaks(): void {
    const reduxNodes = this.nodes.filter(node => 
      node.name?.includes('redux') ||
      node.name?.includes('Redux') ||
      node.name?.includes('store')
    );

    const subscriberNodes = reduxNodes.filter(node =>
      node.name?.includes('subscribe') || node.name?.includes('Subscriber')
    );

    if (subscriberNodes.length > 10) {
      this.frameworkLeaks.push({
        framework: 'redux',
        leakType: 'state_subscription',
        nodes: subscriberNodes,
        description: `Redux subscription leak: ${subscriberNodes.length} active subscriptions`,
        severity: subscriberNodes.length > 50 ? 'critical' : 'high',
        fixRecommendation: 'Ensure useSelector subscriptions are cleaned up properly',
        retainedSize: subscriberNodes.reduce((sum, n) => sum + n.selfSize, 0)
      });
    }
  }

  /**
   * Analyzes React Context memory leaks
   */
  private analyzeContextLeaks(): void {
    const contextNodes = this.nodes.filter(node => 
      node.name?.includes('Context') ||
      node.name?.includes('Provider') ||
      node.name?.includes('Consumer')
    );

    const largeProviders = contextNodes.filter(node => node.selfSize > 1024 * 100); // > 100KB
    largeProviders.forEach(node => {
      this.frameworkLeaks.push({
        framework: 'context',
        leakType: 'context_provider',
        nodes: [node],
        description: `Large React Context Provider: ${node.name} (${(node.selfSize / 1024).toFixed(1)}KB)`,
        severity: node.selfSize > 1024 * 500 ? 'critical' : 'high',
        fixRecommendation: 'Optimize context value, avoid large objects, use context splitting',
        retainedSize: node.selfSize
      });
    });
  }
}

// Helper function to format framework detection results
export function formatFrameworkDetection(result: FrameworkDetectionResult): string {
  let output = '\n🔍 FRAMEWORK DETECTION RESULTS\n';
  output += '='.repeat(50) + '\n\n';

  if (result.primary) {
    output += `🎯 Primary Framework: ${result.primary.name}\n`;
    if (result.primary.version) {
      output += `   Version: ${result.primary.version}\n`;
    }
    output += `   Confidence: ${(result.primary.confidence * 100).toFixed(0)}%\n`;
    output += `   Memory Pattern: ${result.primary.memoryPattern}\n\n`;
  } else {
    output += '🤷 No major framework detected\n\n';
  }

  if (result.secondary.length > 0) {
    output += '🔧 Additional Frameworks:\n';
    result.secondary.forEach(framework => {
      output += `   • ${framework.name} (${(framework.confidence * 100).toFixed(0)}%)\n`;
    });
    output += '\n';
  }

  if (result.buildTools.length > 0) {
    output += `🛠️  Build Tools: ${result.buildTools.join(', ')}\n`;
  }

  if (result.libraries.length > 0) {
    output += `📚 Libraries: ${result.libraries.join(', ')}\n`;
  }

  if (result.totalFrameworkMemory > 0) {
    output += `💾 Framework Memory: ${(result.totalFrameworkMemory / (1024 * 1024)).toFixed(1)}MB\n`;
  }

  if (result.recommendations.length > 0) {
    output += '\n💡 Recommendations:\n';
    result.recommendations.forEach(rec => {
      output += `   ${rec}\n`;
    });
  }

  if (result.frameworkLeaks.length > 0) {
    output += '\n🚨 FRAMEWORK-SPECIFIC MEMORY LEAKS\n';
    output += '='.repeat(40) + '\n';
    
    const criticalLeaks = result.frameworkLeaks.filter(l => l.severity === 'critical');
    const highLeaks = result.frameworkLeaks.filter(l => l.severity === 'high');
    const mediumLeaks = result.frameworkLeaks.filter(l => l.severity === 'medium');
    
    if (criticalLeaks.length > 0) {
      output += '\n🔥 CRITICAL LEAKS:\n';
      criticalLeaks.forEach(leak => {
        const sizeMB = (leak.retainedSize / (1024 * 1024)).toFixed(1);
        output += `   • ${leak.framework.toUpperCase()}: ${leak.description} (${sizeMB}MB)\n`;
        output += `     Fix: ${leak.fixRecommendation}\n`;
      });
    }
    
    if (highLeaks.length > 0) {
      output += '\n⚠️  HIGH PRIORITY:\n';
      highLeaks.forEach(leak => {
        const sizeMB = (leak.retainedSize / (1024 * 1024)).toFixed(1);
        output += `   • ${leak.framework.toUpperCase()}: ${leak.description} (${sizeMB}MB)\n`;
        output += `     Fix: ${leak.fixRecommendation}\n`;
      });
    }
    
    if (mediumLeaks.length > 0) {
      output += '\n📋 MEDIUM PRIORITY:\n';
      mediumLeaks.forEach(leak => {
        const sizeKB = (leak.retainedSize / 1024).toFixed(1);
        output += `   • ${leak.framework.toUpperCase()}: ${leak.description} (${sizeKB}KB)\n`;
      });
    }
    
    const totalLeakSize = result.frameworkLeaks.reduce((sum, l) => sum + l.retainedSize, 0);
    output += `\n📊 Total Framework Leak Size: ${(totalLeakSize / (1024 * 1024)).toFixed(1)}MB\n`;
  }

  return output;
}
