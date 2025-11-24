import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface MonitorOptions {
  url: string;
  interval?: string; // e.g., '30s', '1m'
  duration?: string; // e.g., '5m', '10m'
  scenarios?: string; // 'shopping-flow', 'navigation', 'forms'
  actions?: string[]; // ['click', 'navigate', 'scroll']
  outputDir?: string;
  headless?: boolean;
}

export async function monitorApplication(options: MonitorOptions): Promise<void> {
  console.log('🚀 Starting heap monitoring for:', options.url);
  
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
  autoDownload?: boolean;
  downloadInterval?: string;
  outputDir?: string;
  timeout?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  generateReports?: boolean;
}

export async function launchBrowserWithMonitoring(options: BrowserOptions): Promise<void> {
  console.log('🚀 Starting browser with heap monitoring for:', options.url);
  
  // Install puppeteer if needed
  await ensurePuppeteerInstalled();
  
  const puppeteer = await import('puppeteer');
  
  console.log('🌐 Launching browser...');
  const browser = await puppeteer.default.launch({
    headless: false,  // Always visible browser for best user experience
    devtools: options.devtools || false,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--enable-precise-memory-info'  // Enable detailed memory info
    ]
  });
  
  const page = await browser.newPage();
  
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

  // Inject a simple floating UI panel
  const floatingUIScript = `
    // Simple floating UI for heap analysis
    function createFloatingUI() {
      // Only create once
      if (document.getElementById('heap-analyzer-ui')) return;

      // Create the floating panel
      const panel = document.createElement('div');
      panel.id = 'heap-analyzer-ui';
      panel.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        width: 280px;
        background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999;
        color: white;
        font-size: 14px;
        padding: 16px;
      \`;

      // Create the UI content
      panel.innerHTML = \`
        <div id="drag-header" style="margin-bottom: 16px; text-align: center; cursor: move; padding: 4px; border-radius: 8px; transition: background-color 0.2s; position: relative;">
          <div style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); opacity: 0.5; font-size: 12px;">⋮⋮</div>
          <h3 style="margin: 0; font-size: 16px;">🚀 Heap Analyzer</h3>
          <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); opacity: 0.5; font-size: 12px;">⋮⋮</div>
        </div>
        
        <div style="margin-bottom: 16px;">
          <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin-bottom: 8px;">
            <div id="memory-bar" style="height: 100%; background: linear-gradient(90deg, #4ade80 0%, #f59e0b 70%, #ef4444 100%); width: 0%; transition: width 0.3s ease; border-radius: 3px;"></div>
          </div>
          <div id="memory-text" style="font-size: 12px; opacity: 0.8; text-align: center;">
            Memory: 0 MB / 0 MB
          </div>
        </div>

        <div id="workflow-status" style="margin-bottom: 12px; padding: 8px 12px; background: rgba(255,255,255,0.05); border-radius: 6px; font-size: 12px; text-align: center;">
          <div id="workflow-text">Ready to start heap analysis</div>
          <div id="workflow-progress" style="height: 2px; background: rgba(255,255,255,0.1); margin-top: 6px; border-radius: 1px;">
            <div id="progress-bar" style="height: 100%; background: #4ade80; width: 0%; transition: width 0.3s ease; border-radius: 1px;"></div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
          <button id="snapshot-before" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(59,130,246,0.2); border: 1px solid rgba(59,130,246,0.4); border-left: 4px solid #3b82f6; border-radius: 8px; color: white; cursor: pointer; font-size: 14px; min-height: 44px;">
            <span>📷</span>
            <div style="flex: 1; text-align: left;">
              <div style="font-weight: 500;">1. Take Before Snapshot</div>
              <div id="before-time" style="opacity: 0.7; font-size: 11px;">Click to start</div>
            </div>
          </button>
          
          <button id="snapshot-after" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-left: 4px solid #6b7280; border-radius: 8px; color: #9ca3af; cursor: not-allowed; font-size: 14px; min-height: 44px;" disabled>
            <span>📊</span>
            <div style="flex: 1; text-align: left;">
              <div style="font-weight: 500;">2. Perform Actions</div>
              <div id="after-time" style="opacity: 0.7; font-size: 11px;">Take before snapshot first</div>
            </div>
          </button>
          
          <button id="snapshot-final" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-left: 4px solid #6b7280; border-radius: 8px; color: #9ca3af; cursor: not-allowed; font-size: 14px; min-height: 44px;" disabled>
            <span>🎯</span>
            <div style="flex: 1; text-align: left;">
              <div style="font-weight: 500;">3. Final + Analysis</div>
              <div id="final-time" style="opacity: 0.7; font-size: 11px;">Complete previous steps</div>
            </div>
          </button>

          <button id="close-browser" style="display: none; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); border-left: 4px solid #ef4444; border-radius: 8px; color: white; cursor: pointer; font-size: 14px; min-height: 44px;">
            <span>🚪</span>
            <div style="flex: 1; text-align: left;">
              <div style="font-weight: 500;">4. Close & Analyze</div>
              <div style="opacity: 0.7; font-size: 11px;">Analysis complete!</div>
            </div>
          </button>
        </div>

        <div style="display: flex; gap: 8px;">
          <button id="gc-btn" style="flex: 1; padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-left: 3px solid #ef4444; border-radius: 6px; color: white; cursor: pointer; font-size: 12px;">
            🗑️ GC
          </button>
          <button id="dom-btn" style="flex: 1; padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-left: 3px solid #8b5cf6; border-radius: 6px; color: white; cursor: pointer; font-size: 12px;">
            🏗️ DOM
          </button>
        </div>
      \`;

      document.body.appendChild(panel);

      // Add drag functionality
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let panelStartX = 0;
      let panelStartY = 0;

      const dragHeader = document.getElementById('drag-header');
      
      if (dragHeader) {
        dragHeader.addEventListener('mousedown', (e) => {
          isDragging = true;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          
          // Get current panel position
          const rect = panel.getBoundingClientRect();
          panelStartX = rect.left;
          panelStartY = rect.top;
          
          // Change cursor and header appearance
          document.body.style.cursor = 'grabbing';
          dragHeader.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
          
          // Prevent text selection
          e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          
          const deltaX = e.clientX - dragStartX;
          const deltaY = e.clientY - dragStartY;
          
          const newX = panelStartX + deltaX;
          const newY = panelStartY + deltaY;
          
          // Keep panel within viewport bounds
          const maxX = window.innerWidth - panel.offsetWidth;
          const maxY = window.innerHeight - panel.offsetHeight;
          
          const constrainedX = Math.max(0, Math.min(newX, maxX));
          const constrainedY = Math.max(0, Math.min(newY, maxY));
          
          panel.style.left = constrainedX + 'px';
          panel.style.top = constrainedY + 'px';
          panel.style.right = 'auto'; // Remove right positioning when dragging
        });

        document.addEventListener('mouseup', () => {
          if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            dragHeader.style.backgroundColor = '';
          }
        });

        // Handle touch events for mobile support
        dragHeader.addEventListener('touchstart', (e) => {
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            isDragging = true;
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            
            const rect = panel.getBoundingClientRect();
            panelStartX = rect.left;
            panelStartY = rect.top;
            
            dragHeader.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.preventDefault();
          }
        });

        document.addEventListener('touchmove', (e) => {
          if (!isDragging || e.touches.length !== 1) return;
          
          const touch = e.touches[0];
          const deltaX = touch.clientX - dragStartX;
          const deltaY = touch.clientY - dragStartY;
          
          const newX = panelStartX + deltaX;
          const newY = panelStartY + deltaY;
          
          const maxX = window.innerWidth - panel.offsetWidth;
          const maxY = window.innerHeight - panel.offsetHeight;
          
          const constrainedX = Math.max(0, Math.min(newX, maxX));
          const constrainedY = Math.max(0, Math.min(newY, maxY));
          
          panel.style.left = constrainedX + 'px';
          panel.style.top = constrainedY + 'px';
          panel.style.right = 'auto';
          
          e.preventDefault();
        });

        document.addEventListener('touchend', () => {
          if (isDragging) {
            isDragging = false;
            dragHeader.style.backgroundColor = '';
          }
        });
      }

      // Workflow state management
      let workflowStep = 0;
      const steps = ['before', 'after', 'final', 'complete'];

      function updateWorkflowUI() {
        const workflowText = document.getElementById('workflow-text');
        const progressBar = document.getElementById('progress-bar');
        const beforeBtn = document.getElementById('snapshot-before');
        const afterBtn = document.getElementById('snapshot-after');
        const finalBtn = document.getElementById('snapshot-final');
        const closeBtn = document.getElementById('close-browser');

        const messages = [
          'Ready to start heap analysis',
          'Perform your actions, then click "After Snapshot"',
          'Ready for final snapshot with garbage collection',
          'Analysis complete! Review results and close browser'
        ];

        if (workflowText && progressBar) {
          workflowText.textContent = messages[workflowStep] || messages[0];
          progressBar.style.width = ((workflowStep / 3) * 100) + '%';
        }

        // Update button states
        if (beforeBtn && afterBtn && finalBtn && closeBtn) {
          // Reset all buttons first
          [beforeBtn, afterBtn, finalBtn].forEach(btn => {
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.borderColor = 'rgba(255,255,255,0.1)';
            btn.style.borderLeftColor = '#6b7280';
            btn.style.color = '#9ca3af';
            btn.style.cursor = 'not-allowed';
            btn.disabled = true;
          });

          // Enable current step
          if (workflowStep === 0) {
            beforeBtn.style.background = 'rgba(59,130,246,0.2)';
            beforeBtn.style.borderColor = 'rgba(59,130,246,0.4)';
            beforeBtn.style.borderLeftColor = '#3b82f6';
            beforeBtn.style.color = 'white';
            beforeBtn.style.cursor = 'pointer';
            beforeBtn.disabled = false;
          } else if (workflowStep === 1) {
            afterBtn.style.background = 'rgba(245,158,11,0.2)';
            afterBtn.style.borderColor = 'rgba(245,158,11,0.4)';
            afterBtn.style.borderLeftColor = '#f59e0b';
            afterBtn.style.color = 'white';
            afterBtn.style.cursor = 'pointer';
            afterBtn.disabled = false;
          } else if (workflowStep === 2) {
            finalBtn.style.background = 'rgba(239,68,68,0.2)';
            finalBtn.style.borderColor = 'rgba(239,68,68,0.4)';
            finalBtn.style.borderLeftColor = '#ef4444';
            finalBtn.style.color = 'white';
            finalBtn.style.cursor = 'pointer';
            finalBtn.disabled = false;
          } else if (workflowStep === 3) {
            closeBtn.style.display = 'flex';
          }
        }
      }

      // Add functionality
      function updateMemory() {
        if (performance.memory) {
          const memory = performance.memory;
          const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
          const usedMB = (memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
          const limitMB = (memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
          
          const memoryBar = document.getElementById('memory-bar');
          const memoryText = document.getElementById('memory-text');
          if (memoryBar && memoryText) {
            memoryBar.style.width = usagePercent + '%';
            memoryText.textContent = \`Memory: \${usedMB} MB / \${limitMB} MB\`;
          }
        }
      }

      async function takeSnapshot(type) {
        const btn = document.getElementById(\`snapshot-\${type}\`);
        const timeDiv = document.getElementById(\`\${type}-time\`);
        
        if (btn && timeDiv) {
          btn.disabled = true;
          btn.style.opacity = '0.6';
          
          try {
            // Special handling for final snapshot - run garbage collection first
            if (type === 'final') {
              console.log('🗑️ Running garbage collection before final snapshot...');
              timeDiv.textContent = 'Running GC...';
              
              // Force garbage collection
              if (window.heapAnalyzer && window.heapAnalyzer.forceGC) {
                await window.heapAnalyzer.forceGC();
              } else {
                // Fallback GC pressure
                if ('gc' in window) {
                  window.gc();
                }
                // Create memory pressure to encourage GC
                for (let i = 0; i < 10; i++) {
                  const temp = new Array(100000).fill(0);
                  temp.length = 0;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              
              console.log('✅ Garbage collection completed');
            }
            
            console.log(\`📸 Taking \${type} snapshot...\`);
            timeDiv.textContent = 'Taking snapshot...';
            
            // Dispatch event for monitor to handle
            window.dispatchEvent(new CustomEvent('heap-snapshot-requested', {
              detail: { type, timestamp: Date.now(), memInfo: performance.memory }
            }));
            
            // Call heap analyzer if available
            if (window.heapAnalyzer && window.heapAnalyzer.takeSnapshot) {
              await window.heapAnalyzer.takeSnapshot();
            }
            
            // Update UI with completion
            timeDiv.textContent = new Date().toLocaleTimeString();
            btn.style.background = 'rgba(34, 197, 94, 0.2)';
            btn.style.borderColor = 'rgba(34, 197, 94, 0.4)';
            btn.style.borderLeftColor = '#22c55e';
            
            console.log(\`✅ \${type} snapshot completed\`);
            
            // Progress workflow
            if (type === 'before') {
              workflowStep = 1;
              timeDiv.textContent = 'Completed - ' + timeDiv.textContent;
            } else if (type === 'after') {
              workflowStep = 2;
              timeDiv.textContent = 'Completed - ' + timeDiv.textContent;
            } else if (type === 'final') {
              workflowStep = 3;
              timeDiv.textContent = 'Completed - ' + timeDiv.textContent;
            }
            
            updateWorkflowUI();
            
          } catch (error) {
            console.error(\`❌ Failed to take \${type} snapshot:\`, error);
            timeDiv.textContent = 'Error - try again';
          } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
          }
        }
      }

      // Event listeners
      const beforeBtn = document.getElementById('snapshot-before');
      const afterBtn = document.getElementById('snapshot-after');
      const finalBtn = document.getElementById('snapshot-final');
      const closeBtn = document.getElementById('close-browser');
      const gcBtn = document.getElementById('gc-btn');
      const domBtn = document.getElementById('dom-btn');
      
      if (beforeBtn) beforeBtn.onclick = () => {
        if (workflowStep === 0) takeSnapshot('before');
      };
      if (afterBtn) afterBtn.onclick = () => {
        if (workflowStep === 1) takeSnapshot('after');
      };
      if (finalBtn) finalBtn.onclick = () => {
        if (workflowStep === 2) takeSnapshot('final');
      };
      
      if (closeBtn) closeBtn.onclick = () => {
        console.log('🚪 Closing browser and running analysis...');
        
        // Set global flag for monitor to detect
        window.heapAnalyzerCloseRequested = true;
        
        // Dispatch close event for monitor to handle
        window.dispatchEvent(new CustomEvent('browser-close-requested', {
          detail: { timestamp: Date.now(), reason: 'workflow-complete' }
        }));
        
        // Show confirmation
        const workflowText = document.getElementById('workflow-text');
        if (workflowText) {
          workflowText.textContent = 'Closing browser and analyzing results...';
        }
        
        console.log('🚪 BROWSER_CLOSE_REQUESTED: Workflow complete, requesting shutdown');
      };
      
      if (gcBtn) gcBtn.onclick = () => {
        if (window.heapAnalyzer && window.heapAnalyzer.forceGC) {
          window.heapAnalyzer.forceGC();
        }
      };
      
      if (domBtn) domBtn.onclick = () => {
        if (window.heapAnalyzer && window.heapAnalyzer.getDOMInfo) {
          window.heapAnalyzer.getDOMInfo();
        }
      };

      // Initialize workflow UI
      updateWorkflowUI();

      // Update memory every 2 seconds
      setInterval(updateMemory, 2000);
      updateMemory();

      // Add to global heapAnalyzer
      if (window.heapAnalyzer) {
        window.heapAnalyzer.ui = {
          show: () => panel.style.display = 'block',
          hide: () => panel.style.display = 'none',
          toggle: () => panel.style.display = panel.style.display === 'none' ? 'block' : 'none',
          nextStep: () => {
            if (workflowStep < 3) {
              workflowStep++;
              updateWorkflowUI();
            }
          },
          resetWorkflow: () => {
            workflowStep = 0;
            updateWorkflowUI();
          }
        };
      }

      console.log('✅ Heap Analyzer UI injected!');
      console.log('🎮 Step-by-step workflow: Before → After → Final → Close');
      console.log('📋 Follow the guided workflow for proper heap analysis!');
    }

    // Initialize UI
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createFloatingUI);
    } else {
      createFloatingUI();
    }
  `;

  await page.evaluateOnNewDocument(floatingUIScript);

  console.log('📡 Navigating to:', options.url);
  
  // Try navigation with retries
  let navigationSuccess = false;
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`🔄 Navigation attempt ${attempt}/3...`);
      await page.goto(options.url, { 
        waitUntil
      });
      navigationSuccess = true;
      console.log('✅ Navigation successful');
      break;
    } catch (error) {
      lastError = error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ Attempt ${attempt} failed: ${errorMsg}`);
      
      if (attempt < 3) {
        console.log('🔄 Retrying with more lenient settings...');
        // Try with more lenient wait condition
        try {
          await page.goto(options.url, { 
            waitUntil: 'load' // Even more lenient
          });
          navigationSuccess = true;
          console.log('✅ Navigation successful with fallback settings');
          break;
        } catch (retryError) {
          console.log(`⚠️ Fallback also failed, will retry...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
        }
      }
    }
  }

  if (!navigationSuccess) {
    console.error('❌ Navigation failed after 3 attempts');
    console.log('💡 Try using --timeout 2m or --wait-until load for slower sites');
    throw lastError;
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
  
  // Set up automatic timed snapshots if enabled
  if (options.autoDownload) {
    console.log('🔄 Auto-download enabled for timed snapshots');
    await setupAutoDownload(page, outputDir, options.downloadInterval);
  }
  
  console.log('📸 UI button snapshots will also be auto-downloaded');

  // Listen for custom events from the UI (including close requests)
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('browser-close-requested', (event) => {
      console.log('🚪 BROWSER_CLOSE_REQUESTED:', JSON.stringify((event as CustomEvent).detail));
    });
  });

  // Listen for snapshot events and close requests from the UI
  page.on('console', async (msg) => {
    const text = msg.text();
    
    // Handle browser close request
    if (text.includes('🚪 BROWSER_CLOSE_REQUESTED:')) {
      console.log('🚪 Browser close requested by UI, starting shutdown...');
      
      // Give a moment for any final operations
      setTimeout(async () => {
        try {
          console.log('📊 Running final analysis...');
          
          // List snapshots in the directory for analysis
          const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.heapsnapshot'));
          if (files.length >= 2) {
            console.log(`📁 Found ${files.length} snapshots for analysis`);
            console.log('💡 Use: heap-analyzer find-leaks --snapshot-dir "${outputDir}"');
          }
          
          // Close browser without duplicate completion message
          await browser.close();
        } catch (error) {
          console.error('❌ Error during shutdown:', error);
          await browser.close();
        }
      }, 2000);
      
      return;
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
      clearInterval(closePolling);
      await browser.close();
      resolve();
    });
  });
}

async function setupAutoDownload(page: any, outputDir: string, intervalStr?: string): Promise<void> {
  const interval = parseTimeString(intervalStr || '30s');
  let snapshotCount = 0;
  
  console.log(`🔄 Starting automatic snapshot downloads every ${intervalStr || '30s'}`);
  
  // Take an initial snapshot
  await downloadHeapSnapshot(page, path.join(outputDir, `initial-${Date.now()}.heapsnapshot`));
  snapshotCount++;
  
  // Set up periodic snapshots
  const downloadTimer = setInterval(async () => {
    try {
      const filename = path.join(outputDir, `auto-${snapshotCount}-${Date.now()}.heapsnapshot`);
      await downloadHeapSnapshot(page, filename);
      snapshotCount++;
    } catch (error) {
      console.error('❌ Error during auto-download:', error instanceof Error ? error.message : String(error));
    }
  }, interval);
  
  // Enhanced interactive controls with download capabilities
  await page.evaluateOnNewDocument((outputDir: string) => {
    // Override the heapAnalyzer with download capabilities
    (window as any).heapAnalyzer = {
      ...((window as any).heapAnalyzer || {}),
      
      downloadSnapshot: async (filename?: string) => {
        console.log('📥 Downloading heap snapshot...');
        const name = filename || `manual-${Date.now()}.heapsnapshot`;
        
        // Trigger download via CDP
        console.log(`💾 Snapshot download triggered: ${name}`);
        
        // We'll handle the actual download in the Node.js context
        (window as any)._triggerSnapshotDownload = name;
        return name;
      },
      
      startAutoDownload: (intervalMs = 30000) => {
        console.log(`⏰ Starting auto-download every ${intervalMs}ms`);
        return setInterval(() => {
          (window as any).heapAnalyzer.downloadSnapshot();
        }, intervalMs);
      },
      
      stopAutoDownload: (timerId: number) => {
        console.log('⏹️ Stopping auto-download');
        clearInterval(timerId);
      }
    };
    
    console.log('📥 Download commands available:');
    console.log('  heapAnalyzer.downloadSnapshot() - Download snapshot now');
    console.log('  heapAnalyzer.startAutoDownload(30000) - Start auto-download');
    console.log('  heapAnalyzer.stopAutoDownload(id) - Stop auto-download');
  }, outputDir);
  
  // Monitor for manual download triggers
  const checkForDownloads = setInterval(async () => {
    try {
      const triggerName = await page.evaluate(() => {
        const name = (window as any)._triggerSnapshotDownload;
        delete (window as any)._triggerSnapshotDownload;
        return name;
      });
      
      if (triggerName) {
        const filename = path.join(outputDir, triggerName);
        await downloadHeapSnapshot(page, filename);
        console.log(`✅ Manual snapshot downloaded: ${triggerName}`);
      }
    } catch (error) {
      // Ignore errors from checking triggers
    }
  }, 1000);
  
  // Clean up timers when browser closes
  page.on('close', () => {
    clearInterval(downloadTimer);
    clearInterval(checkForDownloads);
  });
  
  console.log('🎮 Interactive download controls injected into browser console');
}

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