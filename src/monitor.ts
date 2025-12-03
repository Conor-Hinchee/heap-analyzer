import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createFloatingUI, type FloatingUICallbacks } from './ui/index.js';

export interface MonitorOptions {
  url: string;
  interval?: string; // DEPRECATED: Manual mode only - user controls timing
  duration?: string; // DEPRECATED: Manual mode only - user controls timing
  scenarios?: string; // 'shopping-flow', 'navigation', 'forms'
  actions?: string[]; // ['click', 'navigate', 'scroll']
  outputDir?: string;
  headless?: boolean;
}

export async function monitorApplication(options: MonitorOptions): Promise<void> {
  console.log('🚀 Starting heap monitoring for:', options.url);
  console.log('⚡ Manual mode: User controls all snapshots via UI');
  
  // Install puppeteer if needed
  await ensurePuppeteerInstalled();
  
  // Create output directory
  const outputDir = options.outputDir || `./snapshots/monitor-${Date.now()}`;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('📁 Snapshots will be saved to:', outputDir);
  
  // Launch browser monitoring
  await launchBrowserMonitoring(options, outputDir);
}

async function ensurePuppeteerInstalled(): Promise<void> {
  try {
    await import('puppeteer');
    console.log('✅ Puppeteer available');
  } catch (error) {
    console.log('📦 Installing Puppeteer...');
    
    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['install', 'puppeteer'], {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          console.log('✅ Puppeteer installed successfully');
          resolve();
        } else {
          reject(new Error(`Failed to install Puppeteer (exit code: ${code})`));
        }
      });
    });
  }
}

async function launchBrowserMonitoring(options: MonitorOptions, outputDir: string): Promise<void> {
  const puppeteer = await import('puppeteer');
  
  console.log('🌐 Launching browser...');
  const browser = await puppeteer.default.launch({
    headless: false,  // Always visible browser
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  
  // Inject heap monitoring script
  await injectHeapMonitoringScript(page);
  
  console.log('📡 Navigating to:', options.url);
  await page.goto(options.url, { waitUntil: 'networkidle0' });
  
  // Take initial snapshot
  console.log('📸 Taking baseline snapshot...');
  await takeHeapSnapshot(page, path.join(outputDir, 'baseline.heapsnapshot'));
  
  // Execute monitoring scenarios
  if (options.scenarios) {
    await executeScenarios(page, options.scenarios, outputDir);
  } else {
    await executeDefaultMonitoring(page, options, outputDir);
  }
  
  console.log('🔄 Monitoring complete. Analysis handled by browser workflow.');
}

async function injectHeapMonitoringScript(page: any): Promise<void> {
  console.log('💉 Injecting heap monitoring script...');
  
  // Inject memory monitoring utilities
  await page.evaluateOnNewDocument(() => {
    // Memory monitoring utilities
    (window as any).heapMonitor = {
      getMemoryInfo: () => {
        if ('memory' in performance) {
          return (performance as any).memory;
        }
        return null;
      },
      
      trackDOMNodes: () => {
        return {
          totalNodes: document.querySelectorAll('*').length,
          scripts: document.scripts.length,
          stylesheets: document.styleSheets.length,
          images: document.images.length
        };
      },
      
      trackEventListeners: () => {
        // Simple heuristic for event listeners
        const elements = document.querySelectorAll('*');
        let listenerCount = 0;
        
        elements.forEach(el => {
          // Check for common event attributes
          const events = ['onclick', 'onload', 'onmouseover', 'onkeydown'];
          events.forEach(event => {
            if (el.getAttribute(event)) listenerCount++;
          });
        });
        
        return { estimatedListeners: listenerCount };
      },
      
      forceGarbageCollection: async () => {
        // Force GC if available (requires --enable-precise-memory-info)
        if ('gc' in window) {
          (window as any).gc();
        }
        
        // Create and discard large objects to pressure GC
        for (let i = 0; i < 10; i++) {
          const temp = new Array(100000).fill(0);
        }
        
        // Wait a bit for GC to potentially run
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    };
    
    console.log('🔧 Heap monitoring utilities injected');
  });
}

async function takeHeapSnapshot(page: any, filename: string): Promise<void> {
  try {
    // Force garbage collection before snapshot
    await page.evaluate(() => (window as any).heapMonitor.forceGarbageCollection());
    
    // Get memory info
    const memoryInfo = await page.evaluate(() => (window as any).heapMonitor.getMemoryInfo());
    const domInfo = await page.evaluate(() => (window as any).heapMonitor.trackDOMNodes());
    
    console.log('💾 Memory info:', memoryInfo);
    console.log('🏗️  DOM info:', domInfo);
    
    // Use Chrome DevTools Protocol to take heap snapshot
    const client = await page.target().createCDPSession();
    await client.send('HeapProfiler.enable');
    await client.send('HeapProfiler.collectGarbage');
    
    // Capture heap snapshot data
    const chunks: string[] = [];
    
    client.on('HeapProfiler.addHeapSnapshotChunk', (data: any) => {
      chunks.push(data.chunk);
    });
    
    await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    
    // Save the snapshot
    const snapshotData = chunks.join('');
    fs.writeFileSync(filename, snapshotData);
    console.log('📸 Snapshot saved:', filename);
    
    await client.detach();
  } catch (error) {
    console.error('❌ Error taking heap snapshot:', error);
  }
}

async function executeScenarios(page: any, scenarios: string, outputDir: string): Promise<void> {
  console.log('🎬 Executing scenarios:', scenarios);
  
  switch (scenarios) {
    case 'shopping-flow':
      await executeShoppingFlow(page, outputDir);
      break;
    case 'navigation':
      await executeNavigationFlow(page, outputDir);
      break;
    case 'forms':
      await executeFormFlow(page, outputDir);
      break;
    default:
      console.log('⚠️  Unknown scenario, using default monitoring');
      await executeDefaultMonitoring(page, { url: page.url() }, outputDir);
  }
}

async function executeShoppingFlow(page: any, outputDir: string): Promise<void> {
  console.log('🛒 Executing shopping flow...');
  
  const steps = [
    { name: 'product-search', action: () => page.type('input[type="search"]', 'shirt').catch(() => {}) },
    { name: 'search-results', action: () => page.click('button[type="submit"]').catch(() => {}) },
    { name: 'product-detail', action: () => page.click('a[href*="product"]').catch(() => {}) },
    { name: 'add-to-cart', action: () => page.click('button[data-testid*="cart"], .add-to-cart, .btn-add-cart').catch(() => {}) },
    { name: 'cart-view', action: () => page.click('a[href*="cart"], .cart-link').catch(() => {}) }
  ];
  
  for (const step of steps) {
    try {
      console.log(`🎯 Step: ${step.name}`);
      await step.action();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for interactions to complete
      
      const filename = path.join(outputDir, `${step.name}.heapsnapshot`);
      await takeHeapSnapshot(page, filename);
    } catch (error) {
      console.log(`⚠️  Step ${step.name} failed:`, error instanceof Error ? error.message : String(error));
    }
  }
}

async function executeNavigationFlow(page: any, outputDir: string): Promise<void> {
  console.log('🧭 Executing navigation flow...');
  
  const links = await page.$$eval('a[href]', (links: any[]) => 
    links.slice(0, 5).map(link => link.href)
  );
  
  for (let i = 0; i < Math.min(links.length, 3); i++) {
    try {
      console.log(`🔗 Navigating to: ${links[i]}`);
      await page.goto(links[i], { waitUntil: 'networkidle0' });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const filename = path.join(outputDir, `navigation-${i + 1}.heapsnapshot`);
      await takeHeapSnapshot(page, filename);
    } catch (error) {
      console.log(`⚠️  Navigation ${i + 1} failed:`, error instanceof Error ? error.message : String(error));
    }
  }
}

async function executeFormFlow(page: any, outputDir: string): Promise<void> {
  console.log('📝 Executing form flow...');
  
  // Find and interact with forms
  const forms = await page.$$('form');
  
  for (let i = 0; i < Math.min(forms.length, 2); i++) {
    try {
      console.log(`📋 Interacting with form ${i + 1}`);
      
      // Fill text inputs
      await page.$$eval('input[type="text"], input[type="email"]', (inputs: any[]) => {
        inputs.slice(0, 3).forEach((input, idx) => {
          input.value = `test${idx}@example.com`;
        });
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const filename = path.join(outputDir, `form-${i + 1}.heapsnapshot`);
      await takeHeapSnapshot(page, filename);
    } catch (error) {
      console.log(`⚠️  Form ${i + 1} failed:`, error instanceof Error ? error.message : String(error));
    }
  }
}

async function executeDefaultMonitoring(page: any, options: MonitorOptions, outputDir: string): Promise<void> {
  console.log('⏱️  User-controlled monitoring - browser will stay open until you close it...');
  
  // Duration and interval are ignored - user controls timing
  console.log('💡 Interact with the page, then close the browser when ready for analysis');
  
  // No automatic snapshots - user controls via UI
}

function parseTimeString(timeStr: string): number {
  const match = timeStr.match(/^(\d+)([smh])$/);
  if (!match) return 30000; // default 30s
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return 30000;
  }
}

export async function analyzeMonitoringResults(outputDir: string, generateReports: boolean = true): Promise<void> {
  console.log('📊 Analyzing monitoring results...');
  
  const { listSnapshots, compareSnapshots, runMemlabFindLeaks } = await import('./analyzer.js');
  
  // List all captured snapshots
  console.log('\n📂 Captured snapshots:');
  await listSnapshots(outputDir);
  
  // Find snapshot files
  const snapshotFiles = fs.readdirSync(outputDir)
    .filter(file => file.endsWith('.heapsnapshot'))
    .sort();
  
  if (snapshotFiles.length >= 2) {
    console.log('\n🔍 Running comparative analysis...');
    
    // Compare first and last snapshots
    const baseline = path.join(outputDir, snapshotFiles[0]);
    const final = path.join(outputDir, snapshotFiles[snapshotFiles.length - 1]);
    
    await compareSnapshots(baseline, final);
    
    // If we have 3+ snapshots, run leak detection
    if (snapshotFiles.length >= 3) {
      console.log('\n🔍 Running leak detection...');
      const target = path.join(outputDir, snapshotFiles[Math.floor(snapshotFiles.length / 2)]);
      
      // Capture memlab output for analysis report
      const originalConsoleLog = console.log;
      let memlabOutput = '';
      console.log = (...args) => {
        memlabOutput += args.join(' ') + '\n';
        originalConsoleLog(...args);
      };
      
      await runMemlabFindLeaks({
        baseline,
        target,
        final,
        traceAllObjects: true
      });
      
      // Restore console.log
      console.log = originalConsoleLog;
      
      // Show native memlab analysis commands for manual use
      console.log('\n🔍 Use these memlab commands for additional analysis:');
      console.log(`\n📊 Object Size Analysis:`);
      console.log(`   npx memlab analyze object-size --snapshot "${final}"`);
      
      console.log(`\n🔍 Detailed Leak Analysis:`);
      console.log(`   npx memlab find-leaks --trace-all-objects \\`);
      console.log(`     --baseline "${baseline}" \\`);
      console.log(`     --target "${target}" \\`);
      console.log(`     --final "${final}"`);
      
      console.log(`\n🌐 Global Variables:`);
      console.log(`   npx memlab analyze global-variable --snapshot "${final}"`);
      
      console.log(`\n🏗️ Detached DOM:`);
      console.log(`   npx memlab analyze detached-DOM --snapshot "${final}"`);
      
      console.log(`\n💡 For JSON output, add --output json to any analyze command`);
    }
  }
  
  console.log('✅ Monitoring analysis complete!');
  console.log(`📁 Results saved in: ${outputDir}`);
}

export interface BrowserOptions {
  url: string;
  injectScript?: string;
  devtools?: boolean;
  headless?: boolean;
  autoDownload?: boolean; // DEPRECATED: Manual mode only - always disabled
  downloadInterval?: string; // DEPRECATED: Manual mode only - not used
  outputDir?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  generateReports?: boolean;
  // Advanced launch flags
  headful?: boolean; // explicit visible mode toggle
  disableCSP?: boolean; // add flags to relax web security (CSP bypass)
  noSandbox?: boolean; // control sandbox flags
  userAgent?: string; // override UA string
}

export async function launchBrowserWithMonitoring(options: BrowserOptions): Promise<void> {
  console.log('🚀 Starting browser with heap monitoring for:', options.url);
  console.log('⚡ Manual mode: User controls all snapshots via UI buttons');
  
  // Install puppeteer if needed
  await ensurePuppeteerInstalled();
  
  const puppeteer = await import('puppeteer');
  
  console.log('🌐 Launching browser...');
  const browser = await puppeteer.default.launch({
    headless: options.headful === true ? false : (options.headless ?? false),
    devtools: options.devtools || false,
    // Remove automation indicators for clean UI
    ignoreDefaultArgs: ['--enable-automation'],
    // Set default viewport to null so it matches window size
    defaultViewport: null,
    args: (() => {
      const args: string[] = [
        '--disable-infobars',
        '--window-size=1920,1080',
        '--enable-precise-memory-info'
      ];
      // Sandbox control
      if (options.noSandbox !== false) {
        args.push('--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage');
      }
      // Disable CSP / relax web security if requested
      if (options.disableCSP) {
        args.push('--disable-web-security', '--disable-features=IsolateOrigins,site-per-process');
      }
      return args;
    })()
  });
  
  // Close the default about:blank page that Puppeteer creates
  const pages = await browser.pages();
  if (pages.length > 0) {
    await pages[0].close();
  }
  
  const page = await browser.newPage();

  // Override User-Agent if provided
  if (options.userAgent) {
    try {
      await page.setUserAgent(options.userAgent);
      console.log('🆔 Using custom User-Agent');
    } catch (err) {
      console.log('⚠️ Failed to set User-Agent, continuing with default');
    }
  }
  
  // defaultViewport: null means viewport automatically matches window size
  // No manual viewport setting needed - this prevents scrollbars
  
  // No timeout - let user control when to close
  const waitUntil = options.waitUntil || 'load'; // Default to 'load' - most compatible for complex sites
  
  console.log(`⏱️ Wait condition: ${waitUntil} (no timeout - user controlled)`);
  
  // No timeout limits - user controls timing
  page.setDefaultTimeout(0);  // No timeout
  page.setDefaultNavigationTimeout(0);  // No navigation timeout
  
  // Inject heap monitoring script
  await injectHeapMonitoringScript(page);
  
  // Inject custom script if provided
  if (options.injectScript) {
    console.log('💉 Injecting custom script...');
    await page.evaluateOnNewDocument((script: string) => {
      console.log('🎯 Custom script executing:', script);
      try {
        eval(script);
      } catch (error) {
        console.error('❌ Custom script error:', error);
      }
    }, options.injectScript);
  }
  
  // Add default hello world script and UI for demo
  await page.evaluateOnNewDocument(() => {
    console.log('🎉 Hello World from heap-analyzer!');
    console.log('🔧 Heap monitoring utilities available at window.heapMonitor');
    
    // Add some interactive debugging utilities
    (window as any).heapAnalyzer = {
      takeSnapshot: async () => {
        console.log('📸 Taking heap snapshot...');
        const memInfo = (window as any).heapMonitor?.getMemoryInfo();
        console.log('💾 Current memory:', memInfo);
        return memInfo;
      },
      
      getDOMInfo: () => {
        const info = (window as any).heapMonitor?.trackDOMNodes();
        console.log('🏗️ DOM Info:', info);
        return info;
      },
      
      forceGC: async () => {
        console.log('🗑️ Forcing garbage collection...');
        await (window as any).heapMonitor?.forceGarbageCollection();
        console.log('✅ GC completed');
      },
      
      startMemoryWatcher: (intervalMs = 5000) => {
        console.log(`⏱️ Starting memory watcher (${intervalMs}ms intervals)`);
        return setInterval(() => {
          const memInfo = (window as any).heapMonitor?.getMemoryInfo();
          const domInfo = (window as any).heapMonitor?.trackDOMNodes();
          console.log('📊 Memory Update:', { memory: memInfo, dom: domInfo });
        }, intervalMs);
      }
    };
    
    console.log('🎮 Interactive commands available:');
    console.log('  heapAnalyzer.takeSnapshot() - Get current memory info');
    console.log('  heapAnalyzer.getDOMInfo() - Get DOM statistics');
    console.log('  heapAnalyzer.forceGC() - Force garbage collection');
    console.log('  heapAnalyzer.startMemoryWatcher() - Start monitoring');
  });

  // Generate floating UI script using imported module
  const callbacks: FloatingUICallbacks = {
    onSnapshotRequested: async (type) => {
      console.log(`📸 UI requested ${type} snapshot`);
      // Snapshot handling is done via event listeners below
    },
    onCloseRequested: () => {
      console.log('🚪 UI requested browser close');
    },
    onGarbageCollection: async () => {
      console.log('🗑️ UI requested garbage collection');
    },
    onDOMAnalysis: () => {
      console.log('🏗️ UI requested DOM analysis');
    }
  };
  
  const floatingUIScript = createFloatingUI({}, callbacks);

  await page.evaluateOnNewDocument(floatingUIScript);

  console.log('📡 Navigating to:', options.url);
  
  // Try navigation with progressive fallback strategy
  let navigationSuccess = false;
  let lastError = null;

  // Progressive wait conditions from strictest to most lenient
  const waitStrategies: Array<{condition: any, timeout: number, description: string}> = [
    { condition: waitUntil, timeout: 30000, description: `${waitUntil} (30s timeout)` },
    { condition: 'domcontentloaded', timeout: 20000, description: 'domcontentloaded (20s timeout)' },
    { condition: 'domcontentloaded', timeout: 10000, description: 'domcontentloaded (10s timeout - fastest)' }
  ];

  for (let attempt = 0; attempt < waitStrategies.length; attempt++) {
    const strategy = waitStrategies[attempt];
    try {
      console.log(`🔄 Navigation attempt ${attempt + 1}/${waitStrategies.length}: ${strategy.description}`);
      
      await page.goto(options.url, { 
        waitUntil: strategy.condition,
        timeout: strategy.timeout
      });
      
      navigationSuccess = true;
      console.log(`✅ Navigation successful with ${strategy.description}`);
      break;
    } catch (error) {
      lastError = error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ Attempt ${attempt + 1} failed: ${errorMsg.substring(0, 100)}`);
      
      if (attempt < waitStrategies.length - 1) {
        console.log('🔄 Trying next fallback strategy...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  if (!navigationSuccess) {
    console.error('❌ All navigation strategies failed');
    console.log('💡 The page may have loaded despite errors - checking page state...');
    
    // Check if page actually loaded despite timeout
    try {
      const pageTitle = await page.title();
      const pageUrl = page.url();
      
      if (pageTitle && pageUrl.includes(new URL(options.url).hostname)) {
        console.log(`✅ Page appears to be loaded: "${pageTitle}"`);
        console.log('📝 Continuing with heap monitoring despite navigation timeout...');
        navigationSuccess = true;
      }
    } catch (checkError) {
      console.error('❌ Page verification failed');
      throw lastError;
    }
    
    if (!navigationSuccess) {
      console.log('💡 Try: --wait-until domcontentloaded or --disable-csp');
      throw lastError;
    }
  }
  
  console.log('🎉 Browser launched successfully!');
  console.log('🔧 Open DevTools console to see heap monitoring utilities');
  console.log('💡 Use heapAnalyzer.* commands for interactive monitoring');
  
  // Set up unified snapshot downloading (for both auto and UI clicks)
  const sessionId = Date.now();
  
  // Extract domain from URL for directory naming
  const urlObj = new URL(options.url);
  const domain = urlObj.hostname.replace(/^www\./, ''); // Remove www. prefix
  const cleanDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '_'); // Replace invalid filename chars
  
  const outputDir = options.outputDir || `./snapshots/browser-snapshots-${sessionId}-${cleanDomain}`;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('📁 Snapshot directory:', outputDir);
  console.log('📸 Manual mode: Use UI buttons to take snapshots when ready');

  // Listen for custom events from the UI (including close requests)
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('browser-close-requested', (event) => {
      console.log('🚪 BROWSER_CLOSE_REQUESTED:', JSON.stringify((event as CustomEvent).detail));
    });
  });

  // Flag to prevent duplicate analysis runs
  let analysisCompleted = false;

  // Listen for snapshot events and close requests from the UI
  page.on('console', async (msg) => {
    const text = msg.text();
    
    // Handle browser close request - just log, let polling handler do the analysis
    if (text.includes('🚪 BROWSER_CLOSE_REQUESTED:')) {
      console.log('🚪 Browser close requested by UI, triggering analysis...');
      return; // Let the polling handler do the full analysis
    }
    
    // Look for our snapshot completion messages
    if (text.includes('✅') && text.includes('snapshot completed')) {
      const type = text.includes('before') ? 'before' : 
                   text.includes('after') ? 'after' : 
                   text.includes('final') ? 'final' : null;
      
      if (type) {
        try {
          const filename = `ui-${type}-${Date.now()}.heapsnapshot`;
          const filepath = path.join(outputDir, filename);
          
          console.log(`💾 Auto-downloading ${type} snapshot...`);
          await downloadHeapSnapshot(page, filepath);
          
          // Get page metadata
          const title = await page.title();
          const url = page.url();
          const size = fs.statSync(filepath).size;
          const sizeMB = (size / (1024 * 1024)).toFixed(2);
          
          console.log(`✅ Snapshot saved: ${filename} (${sizeMB} MB)`);
          console.log(`📄 Metadata: ${url} - "${title}"`);
          
        } catch (error) {
          console.error('❌ Failed to auto-download snapshot:', error);
        }
      }
    }
  });

  // Set up CDP session for advanced monitoring
  try {
    const client = await page.target().createCDPSession();
    await client.send('HeapProfiler.enable');
    await client.send('Runtime.enable');
    
    console.log('🔬 Advanced heap profiling enabled');
    console.log('💡 You can use Chrome DevTools Memory tab for detailed analysis');
    console.log('📸 Click UI buttons to automatically download snapshots!');
    
    // Add runtime console API
    await client.send('Runtime.evaluate', {
      expression: `
        console.log('%c🚀 Heap Analyzer Ready!', 'color: #00ff00; font-size: 16px; font-weight: bold;');
        console.log('%c📸 Click Before/After/Final buttons for auto-download!', 'color: #0066cc;');
      `
    });
    
  } catch (error) {
    console.log('⚠️ Advanced monitoring setup failed, basic monitoring still available');
  }
  
  // Keep the process alive until browser is manually closed
  return new Promise((resolve) => {
    browser.on('disconnected', () => {
      console.log('👋 Browser closed');
      resolve();
    });
    
    // Poll for close requests from the UI
    const closePolling = setInterval(async () => {
      try {
        const closeRequested = await page.evaluate(() => {
          return (window as any).heapAnalyzerCloseRequested === true;
        });
        
        if (closeRequested) {
          if (analysisCompleted) return; // Skip if analysis already completed
          analysisCompleted = true;
          
          console.log('🚪 Browser close requested by UI, starting shutdown...');
          clearInterval(closePolling);
          
          // Give a moment for any final operations
          setTimeout(async () => {
            try {
              console.log('📊 Running automatic analysis...');
              
              // List snapshots in the directory for analysis
              const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.heapsnapshot')).sort();
              
              if (files.length >= 2) {
                console.log(`📁 Found ${files.length} snapshots: ${files.join(', ')}`);
                
                // Import analysis functions
                const { compareSnapshots, runMemlabFindLeaks } = await import('./analyzer.js');
                
                try {
                  // Run comparison analysis between first and last snapshots
                  const firstSnapshot = path.join(outputDir, files[0]);
                  const lastSnapshot = path.join(outputDir, files[files.length - 1]);
                  
                  console.log('\n🔍 Running comparison analysis...');
                  console.log(`📊 Comparing: ${files[0]} → ${files[files.length - 1]}`);
                  await compareSnapshots(firstSnapshot, lastSnapshot);
                  
                  // Run leak detection if we have a proper workflow (before/after/final)
                  const beforeFile = files.find(f => f.includes('before'));
                  const afterFile = files.find(f => f.includes('after'));  
                  const finalFile = files.find(f => f.includes('final'));
                  
                  if (beforeFile && afterFile) {
                    console.log('\n🔍 Running memory leak detection...');
                    console.log(`🧪 Analyzing: ${beforeFile} → ${afterFile}${finalFile ? ' → ' + finalFile : ''}`);
                    
                    // Capture memlab output for analysis report
                    const originalConsoleLog = console.log;
                    let memlabOutput = '';
                    console.log = (...args) => {
                      memlabOutput += args.join(' ') + '\n';
                      originalConsoleLog(...args);
                    };
                    
                    await runMemlabFindLeaks({
                      baseline: path.join(outputDir, beforeFile),
                      target: path.join(outputDir, afterFile),
                      final: finalFile ? path.join(outputDir, finalFile) : undefined,
                      traceAllObjects: true
                    });
                    
                    // Restore console.log
                    console.log = originalConsoleLog;
                    
                    // Generate memlab analysis reports if enabled (default: true)
                    if (options.generateReports !== false) {
                      try {
                        console.log('\n🔍 Generating memlab analysis reports...');
                        
                        // Create memlab-analysis-raw subdirectory
                        const fs = await import('fs');
                        const rawAnalysisDir = path.join(outputDir, 'memlab-analysis-raw');
                        if (!fs.existsSync(rawAnalysisDir)) {
                          fs.mkdirSync(rawAnalysisDir, { recursive: true });
                        }
                        
                        // Run memlab find-leaks and save raw output
                        const { spawn } = await import('child_process');
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const reportPath = path.join(rawAnalysisDir, `memlab-analysis-${timestamp}.txt`);
                        
                        console.log('📊 Running memlab find-leaks analysis...');
                        const findLeaksProcess = spawn('npx', [
                          'memlab', 'find-leaks',
                          '--baseline', path.join(outputDir, beforeFile),
                          '--target', path.join(outputDir, afterFile), 
                          '--final', finalFile ? path.join(outputDir, finalFile) : path.join(outputDir, afterFile),
                          '--trace-all-objects'
                        ]);
                        
                        let output = '';
                        findLeaksProcess.stdout?.on('data', (data) => {
                          output += data.toString();
                        });
                        
                        findLeaksProcess.stderr?.on('data', (data) => {
                          output += data.toString();
                        });
                        
                        await new Promise((resolve) => {
                          findLeaksProcess.on('close', resolve);
                        });
                        
                        // Save the raw memlab output
                        fs.writeFileSync(reportPath, output);
                        
                        console.log(`\n📋 Memlab analysis report saved: ${reportPath}`);
                        
                        // Also run object-size analysis
                        const finalSnapshot = finalFile ? path.join(outputDir, finalFile) : path.join(outputDir, afterFile);
                        const objectSizeProcess = spawn('npx', [
                          'memlab', 'analyze', 'object-size',
                          '--snapshot', finalSnapshot
                        ]);
                        
                        let objectSizeOutput = '';
                        objectSizeProcess.stdout?.on('data', (data) => {
                          objectSizeOutput += data.toString();
                        });
                        
                        await new Promise((resolve) => {
                          objectSizeProcess.on('close', resolve);
                        });
                        
                        const objectSizePath = path.join(rawAnalysisDir, `object-size-${timestamp}.txt`);
                        fs.writeFileSync(objectSizePath, objectSizeOutput);
                        
                        console.log(`📊 Object size analysis saved: ${objectSizePath}`);
                        
                        // Phase 1: Run additional memlab analyze commands
                        console.log('🔍 Running Phase 1 analysis: global-variable, detached-DOM, unbound-collection...');
                        
                        // Global variable analysis
                        const globalVarProcess = spawn('npx', [
                          'memlab', 'analyze', 'global-variable',
                          '--snapshot', finalSnapshot
                        ]);
                        
                        let globalVarOutput = '';
                        globalVarProcess.stdout?.on('data', (data) => {
                          globalVarOutput += data.toString();
                        });
                        globalVarProcess.stderr?.on('data', (data) => {
                          globalVarOutput += data.toString();
                        });
                        
                        await new Promise((resolve) => {
                          globalVarProcess.on('close', resolve);
                        });
                        
                        const globalVarPath = path.join(rawAnalysisDir, `global-variable-${timestamp}.txt`);
                        fs.writeFileSync(globalVarPath, globalVarOutput);
                        console.log(`🌐 Global variable analysis saved: ${globalVarPath}`);
                        
                        // Detached DOM analysis
                        const detachedDOMProcess = spawn('npx', [
                          'memlab', 'analyze', 'detached-DOM',
                          '--snapshot', finalSnapshot
                        ]);
                        
                        let detachedDOMOutput = '';
                        detachedDOMProcess.stdout?.on('data', (data) => {
                          detachedDOMOutput += data.toString();
                        });
                        detachedDOMProcess.stderr?.on('data', (data) => {
                          detachedDOMOutput += data.toString();
                        });
                        
                        await new Promise((resolve) => {
                          detachedDOMProcess.on('close', resolve);
                        });
                        
                        const detachedDOMPath = path.join(rawAnalysisDir, `detached-dom-${timestamp}.txt`);
                        fs.writeFileSync(detachedDOMPath, detachedDOMOutput);
                        console.log(`🏗️  Detached DOM analysis saved: ${detachedDOMPath}`);
                        
                        // Unbound collection analysis
                        const unboundCollectionProcess = spawn('npx', [
                          'memlab', 'analyze', 'unbound-collection',
                          '--snapshot-dir', outputDir
                        ]);
                        
                        let unboundCollectionOutput = '';
                        unboundCollectionProcess.stdout?.on('data', (data) => {
                          unboundCollectionOutput += data.toString();
                        });
                        unboundCollectionProcess.stderr?.on('data', (data) => {
                          unboundCollectionOutput += data.toString();
                        });
                        
                        await new Promise((resolve) => {
                          unboundCollectionProcess.on('close', resolve);
                        });
                        
                        const unboundCollectionPath = path.join(rawAnalysisDir, `unbound-collection-${timestamp}.txt`);
                        fs.writeFileSync(unboundCollectionPath, unboundCollectionOutput);
                        console.log(`📈 Unbound collection analysis saved: ${unboundCollectionPath}`);
                        
                        // Generate readable markdown report
                        console.log('📝 Generating readable report...');
                        const reportGenerator = await import('./reportGenerator.js');
                        await reportGenerator.generateReadableReport(outputDir, rawAnalysisDir, timestamp);
                        
                      } catch (error) {
                        console.error('⚠️  Failed to generate memlab reports:', error);
                      }
                    }
                  } else {
                    console.log('\n💡 For detailed leak detection, ensure you have before/after snapshots');
                    console.log(`🔍 Manual analysis: heap-analyzer find-leaks --snapshot-dir "${outputDir}"`);
                  }
                  
                } catch (analysisError) {
                  console.error('❌ Analysis failed:', analysisError instanceof Error ? analysisError.message : String(analysisError));
                  console.log(`💡 Manual analysis: heap-analyzer find-leaks --snapshot-dir "${outputDir}"`);
                }
              } else {
                console.log('⚠️ Need at least 2 snapshots for meaningful analysis');
                console.log(`💡 Manual check: heap-analyzer list`);
              }
              
              console.log('\n🎉 Analysis workflow complete!');
              console.log('👋 Closing browser...');
              
              await browser.close();
              resolve();
            } catch (error) {
              console.error('❌ Error during shutdown:', error);
              await browser.close();
              resolve();
            }
          }, 2000);
        }
      } catch (error) {
        // Page might be closed or navigation happened, ignore
      }
    }, 1000); // Check every second
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down browser...');
      analysisCompleted = true; // Mark as completed to prevent duplicate analysis
      clearInterval(closePolling);
      await browser.close();
      resolve();
    });
  });
}

// setupAutoDownload function removed - manual mode only

async function downloadHeapSnapshot(page: any, filename: string): Promise<void> {
  try {
    console.log(`📸 Taking snapshot: ${path.basename(filename)}`);
    
    // Force garbage collection before snapshot
    await page.evaluate(() => (window as any).heapMonitor?.forceGarbageCollection?.());
    
    // Get current page info
    const url = page.url();
    const title = await page.title().catch(() => 'Unknown');
    
    // Use CDP to take heap snapshot
    const client = await page.target().createCDPSession();
    await client.send('HeapProfiler.enable');
    await client.send('HeapProfiler.collectGarbage');
    
    // Capture heap snapshot data
    const chunks: string[] = [];
    
    client.on('HeapProfiler.addHeapSnapshotChunk', (data: any) => {
      chunks.push(data.chunk);
    });
    
    await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    
    // Save the snapshot with metadata
    const snapshotData = chunks.join('');
    const metadata = {
      timestamp: new Date().toISOString(),
      url,
      title,
      filename: path.basename(filename),
      size: snapshotData.length
    };
    
    fs.writeFileSync(filename, snapshotData);
    
    // Also save metadata
    const metadataFile = filename.replace('.heapsnapshot', '.meta.json');
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    
    console.log(`✅ Snapshot saved: ${path.basename(filename)} (${(snapshotData.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`📄 Metadata: ${url} - "${title}"`);
    
    await client.detach();
  } catch (error) {
    console.error('❌ Error downloading snapshot:', error instanceof Error ? error.message : String(error));
  }
}