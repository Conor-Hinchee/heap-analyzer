#!/usr/bin/env node

import util from 'node:util';
import { analyzeHeapSnapshot, listSnapshots, compareSnapshots, runMemlabTrace, runMemlabHeap, runMemlabViewHeap, runMemlabAnalyze, runMemlabLens } from './analyzer.js';
import { monitorApplication } from './monitor.js';
import path from 'node:path';

const SNAPSHOTS_DIR = './snapshots';

console.log("Heap Analyzer CLI 🚀");

// Polyfill for Node.js < 18.3.0
const parseArgs = util.parseArgs || function(config: any) {
  const values: any = {};
  const positionals: string[] = [];
  const args = config.args || process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const option = config.options?.[key];
      
      if (option?.type === 'boolean') {
        values[key] = true;
      } else {
        values[key] = args[++i];
      }
    } else if (arg.startsWith('-')) {
      const short = arg.slice(1);
      // Find option with matching short flag
      const optionKey = Object.keys(config.options || {}).find(
        k => config.options[k].short === short
      );
      
      if (optionKey) {
        const option = config.options[optionKey];
        if (option.type === 'boolean') {
          values[optionKey] = true;
        } else {
          values[optionKey] = args[++i];
        }
      }
    } else {
      positionals.push(arg);
    }
  }
  
  return { values, positionals };
};

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    file: {
      type: 'string',
      short: 'f',
      description: 'Path to .heapsnapshot file'
    },
    baseline: {
      type: 'string',
      description: 'Baseline snapshot for leak detection'
    },
    target: {
      type: 'string',
      description: 'Target snapshot (after action)'
    },
    final: {
      type: 'string',
      description: 'Final snapshot (after cleanup)'
    },
    'snapshot-dir': {
      type: 'string',
      description: 'Directory containing baseline, target, final snapshots'
    },
    'node-id': {
      type: 'string',
      description: 'Node ID for trace analysis'
    },
    'trace-all-objects': {
      type: 'boolean',
      description: 'Enable detailed object tracing in leak detection'
    },
    'object-id': {
      type: 'string',
      description: 'Object ID to inspect (for inspect-object command)'
    },
    depth: {
      type: 'string',
      description: 'Depth for deep-dive analysis (default: 3)'
    },
    'max-children': {
      type: 'string',
      description: 'Max children per level for deep-dive (default: 10)'
    },
    'max-nodes': {
      type: 'string',
      description: 'Hard cap on total nodes inspected during deep-dive (default: 100)'
    },
    'time-budget': {
      type: 'string',
      description: 'Time budget in ms for deep-dive before aborting (default: 15000)'
    },
    'output-format': {
      type: 'string',
      description: 'Output format for deep-dive: tree or json (default: tree)'
    },
    'output-file': {
      type: 'string',
      description: 'Output file path for deep-dive JSON results'
    },
    plugin: {
      type: 'string',
      description: 'Analysis plugin name'
    },
    interval: {
      type: 'string',
      description: 'Monitoring interval (e.g., 30s, 1m)'
    },
    duration: {
      type: 'string',
      description: 'Monitoring duration (e.g., 5m, 10m)'
    },
    scenarios: {
      type: 'string',
      description: 'Predefined scenarios (shopping-flow, navigation, forms)'
    },

    'inject-script': {
      type: 'string',
      description: 'Custom JavaScript to inject into the page'
    },
    pid: {
      type: 'string',
      description: 'Node.js process ID to monitor or snapshot'
    },
    endpoint: {
      type: 'string',
      description: 'HTTP endpoint for taking heap snapshots'
    },
    threshold: {
      type: 'string',
      description: 'Memory threshold in MB for automatic snapshots'
    },
    'webhook-url': {
      type: 'string',
      description: 'Webhook URL for memory alerts'
    },
    concurrency: {
      type: 'string',
      description: 'Number of concurrent connections for load testing'
    },
    'snapshot-file': {
      type: 'string',
      description: 'Snapshot file path for report enrichment'
    },
    'max-objects': {
      type: 'string',
      description: 'Maximum number of objects to inspect for enrichment'
    },
    backup: {
      type: 'boolean',
      description: 'Create backup before enriching report'
    },
    devtools: {
      type: 'boolean',
      description: 'Open browser with DevTools'
    },

    'output-dir': {
      type: 'string',
      description: 'Directory to save snapshots'
    },

    'wait-until': {
      type: 'string',
      description: 'Wait condition (load, domcontentloaded, networkidle0, networkidle2)'
    },
    'headful': {
      type: 'boolean',
      description: 'Launch browser in headful (visible) mode'
    },
    'disable-csp': {
      type: 'boolean',
      description: 'Disable web security to bypass CSP (use carefully)'
    },
    'no-sandbox': {
      type: 'boolean',
      description: 'Launch Chrome without sandbox (CI/containers)'
    },
    'user-agent': {
      type: 'string',
      description: 'Override browser User-Agent string'
    },
    'memlab-reports': {
      type: 'boolean',
      default: true,
      description: 'Generate memlab analysis reports (default: true, use --no-memlab-reports to disable)'
    },
    help: {
      type: 'boolean',
      short: 'h',
      description: 'Show help'
    }
  },
  allowPositionals: true
});

if (values.help) {
  console.log(`
Usage: heap-analyzer [options] [command]

Commands:
  analyze <file>           Analyze a single heap snapshot file
  compare <baseline> <target>  Compare two snapshots (memory growth analysis)
  timeline <directory>     Analyze sequential snapshots for memory trends over time
  find-leaks               Run memlab leak detection (wrapper for memlab find-leaks)
  trace <file>             Analyze retainer traces (wrapper for memlab trace --node-id)
  heap <file>              Interactive heap exploration (wrapper for memlab heap)
  view-heap <file>         Heap visualization (wrapper for memlab view-heap)
  lens <file>              Web-based heap visualization with MemLens
  monitor <url>            Monitor running application with heap snapshots
  browser <url>            Launch browser with manual heap monitoring (UI-controlled snapshots)
  analyze-plugin <plugin>  Run analysis plugin (wrapper for memlab analyze)
  inspect-object <file>    Inspect specific objects using memlab IDs (enhanced)
  memlab-inspect <file>    Native memlab object inspection with detailed analysis
  investigate <file>       Inspect object then trace its retention path
  node-snapshot            Take heap snapshot from running Node.js process  
  node-monitor             Monitor Node.js process memory and auto-snapshot
  node-load-test <url>     Run load test with automatic heap snapshot collection
  enrich <report>          Enrich analysis report with detailed object inspections
  generate-report <json>   Generate markdown report from JSON analysis data
  list                     List available snapshots in ./snapshots directory

Complete memlab wrapper - all memlab functionality with better dev experience!

Single Snapshot Analysis:
  -f, --file <path>        Path to .heapsnapshot file

Timeline Analysis:
  --snapshot-dir <dir>     Directory containing multiple snapshots
  --threshold <mb>         Memory growth threshold in MB (default: 10)

Memory Leak Detection:
  --baseline <file>        Baseline snapshot (initial state)
  --target <file>          Target snapshot (after action)
  --final <file>           Final snapshot (after cleanup)
  --snapshot-dir <dir>     Directory with baseline/target/final snapshots
  --trace-all-objects      Enable detailed object tracing (shows node IDs)

Object Inspection:
  --object-id <id>         Object ID to inspect (from find-leaks output)
  --node-id <id>           Node ID for trace analysis

General:
  -h, --help               Show this help message

Examples:
  # Single snapshot analysis
  heap-analyzer analyze snapshot.heapsnapshot
  heap-analyzer list
  
  # Compare two snapshots
  heap-analyzer compare before.heapsnapshot after.heapsnapshot
  heap-analyzer compare sim-1.heapsnapshot sim-2.heapsnapshot
  
  # Memory leak detection (3 snapshots)
  heap-analyzer find-leaks --baseline baseline.heapsnapshot --target target.heapsnapshot --final final.heapsnapshot
  heap-analyzer find-leaks --snapshot-dir ./snapshots/leak-test/
  
  # Object inspection (investigate specific leaked objects)
  heap-analyzer inspect-object after.heapsnapshot --object-id @39263
  heap-analyzer memlab-inspect after.heapsnapshot --object-id @39263
  heap-analyzer trace after.heapsnapshot --node-id 6485
  
  # Deep dive analysis - automatically explore object hierarchies
  heap-analyzer deep-dive snapshot.heapsnapshot --object-id @1096221
  heap-analyzer deep-dive snapshot.heapsnapshot --object-id @1096221 --depth 5 --max-children 20
  heap-analyzer deep-dive snapshot.heapsnapshot --object-id @1096221 --output-format json --output-file ./analysis/deep-dive.json
  
  # Memory leak detection with detailed tracing
  heap-analyzer find-leaks --baseline sim-1.heapsnapshot --target sim-2.heapsnapshot --trace-all-objects
  
  # Inspect specific objects by ID (from memlab find-leaks output)
  heap-analyzer inspect-object snapshot.heapsnapshot --object-id @39263
  heap-analyzer memlab-inspect after.heapsnapshot --object-id @39263

  # Monitor running applications  
  heap-analyzer monitor http://localhost:3000
  heap-analyzer monitor http://localhost:3000 --scenarios shopping-flow --duration 5m
  heap-analyzer monitor http://localhost:3000 --interval 30s --duration 2m
  
  # Node.js heap analysis
  heap-analyzer node-snapshot --endpoint http://localhost:3000/debug/heap-snapshot
  heap-analyzer node-snapshot --pid 12345
  heap-analyzer node-monitor --pid 12345 --threshold 500 --interval 5
  heap-analyzer node-load-test http://localhost:3000/api/heavy --endpoint http://localhost:3000/debug/heap-snapshot --concurrency 50 --duration 60
  
  # Report enrichment with detailed object analysis
  heap-analyzer enrich ANALYSIS-SUMMARY.md
  heap-analyzer enrich ANALYSIS-SUMMARY.md --snapshot-file final.heapsnapshot --max-objects 15
  
  # Generate markdown report from JSON
  heap-analyzer generate-report ANALYSIS-DATA-2025-01-01T12-00-00-000Z.json
  heap-analyzer generate-report ./snapshots/*/ANALYSIS-DATA-*.json
  
  # Launch browser with script injection
  heap-analyzer browser http://localhost:3000
  heap-analyzer browser http://localhost:3000 --inject-script "console.log('Hello World!')"
  heap-analyzer browser http://localhost:3000 --devtools --inject-script "window.myDebugger = true"
  heap-analyzer browser https://slow-site.com --wait-until load
  heap-analyzer browser https://app.com --devtools --inject-script "window.debugMode = true"

Snapshots Directory:
  Place .heapsnapshot files in ./snapshots/ for easy access
  `);
  process.exit(0);
}

const command = positionals[0];
let file = values.file || positionals[1];

if (command === 'list') {
  console.log('\n📂 Available snapshots:');
  await listSnapshots(SNAPSHOTS_DIR);
} else if (command === 'compare') {
  const baseline = positionals[1];
  const target = positionals[2];
  
  if (!baseline || !target) {
    console.error('❌ Error: compare requires two snapshot files');
    console.log('Usage: heap-analyzer compare <baseline> <target>');
    console.log('Example: heap-analyzer compare before.heapsnapshot after.heapsnapshot');
    process.exit(1);
  }
  
  console.log(`\n📊 Comparing snapshots: ${baseline} → ${target}`);
  await compareSnapshots(baseline, target);
} else if (command === 'inspect-object') {
  const file = positionals[1];
  const objectId = values['object-id'];
  
  if (!file) {
    console.error('❌ Error: inspect-object requires a snapshot file');
    console.log('Usage: heap-analyzer inspect-object <file> --object-id <id>');
    console.log('💡 Get object IDs from memlab find-leaks output (e.g., @39263)');
    process.exit(1);
  }
  
  if (!objectId) {
    console.error('❌ Error: inspect-object requires an object ID');
    console.log('Usage: heap-analyzer inspect-object <file> --object-id <id>');
    console.log('💡 Object IDs are shown in memlab find-leaks output (e.g., @39263)');
    process.exit(1);
  }
  
  // Use memlab-native inspection with JSON formatting
  const { inspectMemlabObject } = await import('./memlabObjectInspectorSimple.js');
  const result = await inspectMemlabObject(file, objectId);
  
  if (!result) {
    console.log('\n💡 Tip: Make sure the object ID comes from memlab find-leaks output');
    console.log('   Example: npx heap-analyzer browser <url> (generates reports with object IDs)');
  }
} else if (command === 'memlab-inspect') {
  const file = positionals[1];
  const objectId = values['object-id'];
  
  if (!file) {
    console.error('❌ Error: memlab-inspect requires a snapshot file');
    console.log('Usage: heap-analyzer memlab-inspect <file> --object-id <@id>');
    console.log('💡 Use object IDs from memlab reports (e.g., @39263)');
    process.exit(1);
  }
  
  if (!objectId) {
    console.error('❌ Error: memlab-inspect requires an object ID');
    console.log('Usage: heap-analyzer memlab-inspect <file> --object-id <@id>');
    console.log('💡 Object IDs are shown in memlab find-leaks output (e.g., @39263)');
    process.exit(1);
  }
  
  const { inspectMemlabObject } = await import('./memlabObjectInspectorSimple.js');
  const result = await inspectMemlabObject(file, objectId);
  
  if (!result) {
    console.log('\n💡 Tip: Make sure the object ID comes from memlab find-leaks output');
  }
} else if (command === 'trace') {
  const file = positionals[1];
  const nodeId = values['node-id'];
  
  if (!file) {
    console.error('❌ Error: trace requires a snapshot file');
    console.log('Usage: heap-analyzer trace <file> --node-id <id>');
    process.exit(1);
  }
  
  if (!nodeId) {
    console.error('❌ Error: trace requires a node ID');
    console.log('Usage: heap-analyzer trace <file> --node-id <id>');
    console.log('💡 Get node IDs from heap exploration or previous analysis');
    process.exit(1);
  }
  
  console.log(`\n🔍 Analyzing retainer trace for node ${nodeId}`);
  await runMemlabTrace(file, nodeId);
} else if (command === 'investigate') {
  const invFile = positionals[1];
  const objectId = values['object-id'];

  if (!invFile) {
    console.error('❌ Error: investigate requires a snapshot file');
    console.log('Usage: heap-analyzer investigate <file> --object-id <@id>');
    process.exit(1);
  }
  if (!objectId) {
    console.error('❌ Error: investigate requires an object ID');
    console.log('Usage: heap-analyzer investigate <file> --object-id <@id>');
    console.log('\n💡 Runs comprehensive analysis:');
    console.log('   1. Object inspection (details, references, referrers)');
    console.log('   2. Retention path tracing (why it\'s held in memory)');
    console.log('   3. Deep-dive structure (recursive exploration)');
    console.log('\n📊 Outputs: console logs + JSON report + deep-dive-{id}.json');
    process.exit(1);
  }

  console.log(`\n🔎 Investigating object ${objectId} in ${invFile}`);
  console.log('📋 Running comprehensive analysis: inspect + trace + deep-dive\n');
  
  // Step 1: Inspect object
  console.log('🔍 Step 1/3: Inspecting object details...');
  const { inspectMemlabObject, fetchMemlabObjectData } = await import('./memlabObjectInspectorSimple.js');
  const objectData = await fetchMemlabObjectData(invFile, objectId);
  if (objectData) {
    await inspectMemlabObject(invFile, objectId);
  } else {
    console.log('⚠️ Failed to fetch object data for enrichment');
  }

  // Step 2: Trace retention path
  const nodeId = String(objectId).replace(/^@/, '');
  console.log(`\n🧭 Step 2/3: Tracing retention path for ${objectId}...`);
  const { runMemlabTraceCapture } = await import('./analyzer.js');
  const traceResult = await runMemlabTraceCapture(invFile, nodeId);
  const traceLines = traceResult.raw.split(/\r?\n/).filter(l => l.trim());
  const displayLines = traceLines.filter(l => l.startsWith('[') || l.trim().startsWith('--'));
  displayLines.forEach(l => console.log(l));
  console.log('\n✅ Retention path analysis complete!');
  
  // Step 3: Deep-dive into structure
  console.log(`\n🔬 Step 3/3: Deep-diving into object structure...`);
  const pathMod = await import('node:path');
  const dir = pathMod.default.dirname(invFile);
  const deepDiveFile = pathMod.default.join(dir, `deep-dive-${nodeId}.json`);
  
  const { deepDiveCLI } = await import('./deepDive.js');
  await deepDiveCLI(invFile, objectId, {
    maxDepth: 2,
    maxChildrenPerLevel: 5,
    maxNodes: 50,
    timeBudgetMs: 10000,
    outputFormat: 'json',
    outputFile: deepDiveFile
  });
  console.log(`📁 Deep-dive saved: ${pathMod.default.basename(deepDiveFile)}`);

  console.log('\n✅ Investigation complete');
  // Attempt to update corresponding JSON analysis report in same directory (add investigation details)
  try {
    const fs = await import('node:fs');
    const pathMod = await import('node:path');
    const dir = pathMod.default.dirname(invFile);
    const files = fs.default.readdirSync(dir).filter(f => f.startsWith('ANALYSIS-DATA-') && f.endsWith('.json'));
    if (files.length > 0) {
      // Use the most recent JSON (sort by mtime)
      const filesWithTime = files.map(f => ({
        name: f,
        time: fs.default.statSync(pathMod.default.join(dir, f)).mtimeMs
      })).sort((a,b) => b.time - a.time);
      const jsonPath = pathMod.default.join(dir, filesWithTime[0].name);
      const raw = fs.default.readFileSync(jsonPath, 'utf8');
      let data: any = JSON.parse(raw);
      // Mark memory object as investigated
      if (Array.isArray(data.memoryObjects)) {
        const targetObj = data.memoryObjects.find((o: any) => o.id === nodeId);
        if (targetObj) {
          targetObj.investigated = true;
        }
      }
      // Append investigation history
      if (!Array.isArray(data.investigations)) {
        data.investigations = [];
      }
      const investigationEntry: any = {
        objectId: '@' + nodeId,
        snapshot: invFile,
        investigatedAt: new Date().toISOString()
      };
      if (objectData) {
        investigationEntry.objectDetails = {
          id: objectData.id,
          name: objectData.name,
          type: objectData.type,
          selfSizeBytes: objectData.selfsize,
          retainedSizeBytes: objectData.retainedSize,
          topReferences: (objectData.references || []).slice(0, 10).map(r => ({ name: r.name, toNode: r.toNode, type: r.type })),
          topReferrers: (objectData.referrers || []).slice(0, 10).map(r => ({ name: r.name, fromNode: r.fromNode, type: r.type }))
        };
      }
      if (traceResult.path && traceResult.path.length) {
        investigationEntry.retentionPath = traceResult.path;
      }
      
      // Add deep-dive reference
      investigationEntry.deepDiveFile = `deep-dive-${nodeId}.json`;
      
      // Deduplicate: replace any previous investigation for this objectId+snapshot
      const idx = data.investigations.findIndex((entry: any) => entry.objectId === investigationEntry.objectId && entry.snapshot === investigationEntry.snapshot);
      if (idx !== -1) {
        data.investigations[idx] = investigationEntry;
      } else {
        data.investigations.push(investigationEntry);
      }
      // Bump schema version minor if present
      if (data.schema && typeof data.schema.version === 'string') {
        const parts = data.schema.version.split('.');
        if (parts.length === 3) {
          const minor = parseInt(parts[1]) || 0;
          parts[1] = String(minor + 1); // increment minor
          data.schema.version = parts.join('.');
        }
      }
      fs.default.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
      console.log(`\n📝 Updated JSON report: ${pathMod.default.basename(jsonPath)} (marked @${nodeId} investigated)`);
      
      // Auto-generate markdown report after investigation
      console.log('\n📊 Auto-generating updated markdown report...');
      try {
        const { generateMarkdownReport } = await import('./reportGenerator.js');
        await generateMarkdownReport(jsonPath);
        console.log('✅ Markdown report regenerated with investigation data');
      } catch (reportErr) {
        console.log('⚠️ Failed to regenerate markdown report:', reportErr);
      }
    } else {
      console.log('\nℹ️ No JSON analysis report found in snapshot directory to update');
    }
  } catch (err) {
    console.log('\n⚠️ Failed to update JSON report:', err);
  }
  process.exit(0);
} else if (command === 'deep-dive') {
  const ddFile = positionals[1];
  const objectId = values['object-id'];
  
  if (!ddFile) {
    console.error('❌ Error: deep-dive requires a snapshot file');
    console.log('Usage: heap-analyzer deep-dive <file> --object-id <@id>');
    console.log('Options:');
    console.log('  --depth <num>         Max depth to explore (default: 2)');
    console.log('  --max-children <num>  Max children per level (default: 5)');
    console.log('  --max-nodes <num>     Hard cap on nodes visited (default: 100)');
    console.log('  --time-budget <ms>    Time budget in ms (default: 15000)');
    console.log('  --output-format <fmt> Output format: tree or json (default: tree)');
    console.log('  --output-file <path>  Save JSON output to file');
    console.log('\n💡 Automatically explores object hierarchies to understand data structures');
    process.exit(1);
  }
  
  if (!objectId) {
    console.error('❌ Error: deep-dive requires an object ID');
    console.log('Usage: heap-analyzer deep-dive <file> --object-id <@id>');
    console.log('💡 Get object IDs from analysis reports or memlab output');
    process.exit(1);
  }
  
  const { deepDiveCLI } = await import('./deepDive.js');
  await deepDiveCLI(ddFile, objectId, {
    maxDepth: values.depth ? parseInt(values.depth) : 2,
    maxChildrenPerLevel: values['max-children'] ? parseInt(values['max-children']) : 5,
    maxNodes: values['max-nodes'] ? parseInt(values['max-nodes']) : 100,
    timeBudgetMs: values['time-budget'] ? parseInt(values['time-budget']) : 15000,
    outputFormat: (values['output-format'] as 'tree' | 'json') || 'tree',
    outputFile: values['output-file']
  });
  process.exit(0);
} else if (command === 'heap') {
  const heapFile = positionals[1];
  if (!heapFile) {
    console.error('❌ Error: heap requires a snapshot file');
    console.log('Usage: heap-analyzer heap <file>');
    process.exit(1);
  }
  console.log(`\n🔍 Starting interactive heap exploration`);
  await runMemlabHeap(heapFile);
} else if (command === 'view-heap') {
  const file = positionals[1];
  const nodeId = values['node-id'];
  
  if (!file) {
    console.error('❌ Error: view-heap requires a snapshot file');
    console.log('Usage: heap-analyzer view-heap <file> [--node-id <id>]');
    process.exit(1);
  }
  
  console.log(`\n👀 Starting heap visualization`);
  await runMemlabViewHeap(file, nodeId);
} else if (command === 'lens') {
  const file = positionals[1];
  
  if (!file) {
    console.error('❌ Error: lens requires a snapshot file');
    console.log('Usage: heap-analyzer lens <file>');
    console.log('💡 This opens a web-based visualization interface');
    process.exit(1);
  }
  
  console.log(`\n🌐 Starting MemLens web visualization`);
  await runMemlabLens(file);
} else if (command === 'monitor') {
  const url = positionals[1];
  
  if (!url) {
    console.error('❌ Error: monitor requires a URL');
    console.log('Usage: heap-analyzer monitor <url>');
    console.log('Example: heap-analyzer monitor http://localhost:3000');
    console.log('Options: --scenarios, --interval, --duration, --headless');
    process.exit(1);
  }
  
  console.log(`\n📊 Starting application monitoring`);
  await monitorApplication({
    url,
    interval: values.interval,
    duration: values.duration,
    scenarios: values.scenarios
  });
} else if (command === 'browser') {
  const url = positionals[1];
  
  if (!url) {
    console.error('❌ Error: browser requires a URL');
    console.log('Usage: heap-analyzer browser <url>');
    console.log('Example: heap-analyzer browser http://localhost:3000');
    console.log('Options: --inject-script, --devtools, --wait-until');
    console.log('💡 Manual mode: Use floating UI buttons to control snapshots');
    process.exit(1);
  }
  
  console.log(`\n🌐 Launching browser with heap monitoring`);
  const { launchBrowserWithMonitoring } = await import('./monitor.js');
  await launchBrowserWithMonitoring({
    url,
    injectScript: values['inject-script'],
    devtools: values.devtools,

    outputDir: values['output-dir'],
    waitUntil: values['wait-until'] as any,
    generateReports: values['memlab-reports'],
    // New advanced flags
    headful: values['headful'] || undefined,
    disableCSP: values['disable-csp'] || undefined,
    noSandbox: values['no-sandbox'] || undefined,
    userAgent: values['user-agent'] || undefined
  });
} else if (command === 'analyze-plugin') {
  const pluginName = positionals[1];
  
  if (!pluginName) {
    console.error('❌ Error: analyze-plugin requires a plugin name');
    console.log('Usage: heap-analyzer analyze-plugin <plugin>');
    console.log('💡 Available plugins depend on your memlab installation');
    process.exit(1);
  }
  
  console.log(`\n🔬 Running analysis plugin: ${pluginName}`);
  await runMemlabAnalyze(pluginName);
} else if (command === 'find-leaks') {
  const { runMemlabFindLeaks } = await import('./analyzer.js');
  
  let memlabOutput = '';
  let snapshotFile = '';
  
  if (values['snapshot-dir']) {
    console.log(`\n🔍 Running memlab leak detection on directory: ${values['snapshot-dir']}`);
    memlabOutput = await runMemlabFindLeaks({ 
      snapshotDir: values['snapshot-dir'],
      traceAllObjects: values['trace-all-objects']
    });
    snapshotFile = values['snapshot-dir'];
  } else if (values.baseline && values.target) {
    console.log('\n🔍 Running memlab leak detection...');
    memlabOutput = await runMemlabFindLeaks({
      baseline: values.baseline,
      target: values.target,
      final: values.final, // optional
      traceAllObjects: values['trace-all-objects']
    });
    snapshotFile = values.final || values.target;
  } else {
    console.error('❌ Error: find-leaks requires either:');
    console.log('   --snapshot-dir <directory>');
    console.log('   OR --baseline <file> --target <file> [--final <file>]');
    console.log('\n💡 Final snapshot is optional - 2 snapshots are enough for leak detection');
    process.exit(1);
  }

  
  // Show memlab commands for analysis
  if (snapshotFile) {
    console.log(`\n🔍 Use these memlab commands for detailed analysis:`);
    console.log(`\n📊 Object Size Analysis:`);
    console.log(`   npx memlab analyze object-size --snapshot "${snapshotFile}"`);
    
    if (values.baseline && values.target) {
      console.log(`\n🔍 Detailed Leak Analysis:`);
      console.log(`   npx memlab find-leaks --trace-all-objects \\`);
      console.log(`     --baseline "${values.baseline}" \\`);
      console.log(`     --target "${values.target}" \\`);
      console.log(`     --final "${snapshotFile}"`);
    }
    
    console.log(`\n💡 For JSON output, add --output json to any analyze command`);
  }
} else if (command === 'enrich') {
  const reportPath = positionals[1];
  
  if (!reportPath) {
    console.error('❌ Error: enrich requires a report file path');
    console.log('Usage: heap-analyzer enrich <report.md>');
    console.log('Options:');
    console.log('  --snapshot-file <file>  Specify snapshot file if not auto-detected');
    console.log('  --max-objects <num>     Maximum objects to inspect (default: 10)');
    console.log('  --backup               Create backup before enriching (default: true)');
    process.exit(1);
  }
  
  const { enrichReportFromCLI } = await import('./reportEnricher.js');
  await enrichReportFromCLI(reportPath, {
    snapshotFile: values['snapshot-file'],
    maxObjects: values['max-objects'] ? parseInt(values['max-objects']) : 10,
    backup: values.backup !== false
  });
} else if (command === 'generate-report') {
  const jsonPath = positionals[1];
  
  if (!jsonPath) {
    console.error('❌ Error: generate-report requires a JSON file path');
    console.log('Usage: heap-analyzer generate-report <ANALYSIS-DATA-*.json>');
    console.log('Example: heap-analyzer generate-report ./snapshots/browser-*/ANALYSIS-DATA-*.json');
    process.exit(1);
  }
  
  const { generateMarkdownReport } = await import('./reportGenerator.js');
  await generateMarkdownReport(jsonPath);
} else if (command === 'analyze' || file) {
  if (!file) {
    console.error('❌ Error: Please provide a heap snapshot file');
    console.log('Usage: heap-analyzer analyze <file>');
    console.log('   or: heap-analyzer list  (to see available snapshots)');
    process.exit(1);
  }
  
  // Smart path resolution - if file doesn't exist, try snapshots directory
  if (!file.includes('/') && !file.includes('\\')) {
    const snapshotPath = path.join(SNAPSHOTS_DIR, file);
    try {
      const fs = await import('node:fs');
      if (fs.default.existsSync(snapshotPath)) {
        file = snapshotPath;
        console.log(`📁 Found snapshot in snapshots directory: ${file}`);
      }
    } catch (e) {
      // Continue with original file path
    }
  }
  
  console.log(`\n🔍 Analyzing heap snapshot: ${file}`);
  await analyzeHeapSnapshot(file);
} else if (command === 'node-snapshot') {
  const endpoint = values.endpoint;
  const pid = values.pid ? parseInt(values.pid) : undefined;
  
  if (!endpoint && !pid) {
    console.error('❌ Error: node-snapshot requires either --endpoint or --pid');
    console.log('Usage: heap-analyzer node-snapshot --endpoint <url>');
    console.log('   OR: heap-analyzer node-snapshot --pid <process-id>');
    process.exit(1);
  }
  
  const { takeNodeSnapshot } = await import('./nodeAnalyzer.js');
  const snapshot = await takeNodeSnapshot({ endpoint, pid });
  
  if (snapshot) {
    console.log(`\n🔍 Analyze with: npx heap-analyzer analyze ${snapshot}`);
  }
} else if (command === 'node-monitor') {
  const pid = values.pid ? parseInt(values.pid) : undefined;
  const interval = values.interval ? parseInt(values.interval) : undefined;
  const threshold = values.threshold ? parseInt(values.threshold) : undefined;
  const webhookUrl = values['webhook-url'];
  
  console.log('🖥️ Starting Node.js process monitoring...');
  
  const { monitorNodeProcess } = await import('./nodeAnalyzer.js');
  await monitorNodeProcess({
    pid,
    interval,
    threshold,
    webhookUrl
  });
} else if (command === 'node-load-test') {
  const targetUrl = positionals[1];
  const endpoint = values.endpoint;
  const duration = values.duration ? parseInt(values.duration.replace(/[^\d]/g, '')) : 60;
  const concurrency = values.concurrency ? parseInt(values.concurrency) : 10;
  
  if (!targetUrl) {
    console.error('❌ Error: node-load-test requires a target URL');
    console.log('Usage: heap-analyzer node-load-test <url> --endpoint <snapshot-endpoint>');
    process.exit(1);
  }
  
  if (!endpoint) {
    console.error('❌ Error: node-load-test requires --endpoint for heap snapshots');
    console.log('Usage: heap-analyzer node-load-test <url> --endpoint <snapshot-endpoint>');
    process.exit(1);
  }
  
  console.log('🎯 Starting load test with heap snapshot collection...');
  
  const { loadTestWithSnapshots } = await import('./nodeAnalyzer.js');
  const snapshots = await loadTestWithSnapshots({
    targetUrl,
    snapshotEndpoint: endpoint,
    duration,
    concurrency
  });
  
  if (snapshots.length >= 2) {
    console.log('\n🔍 Running automatic leak analysis...');
    const { runMemlabFindLeaks } = await import('./analyzer.js');
    await runMemlabFindLeaks({
      baseline: snapshots[0],
      target: snapshots[snapshots.length - 1],
      traceAllObjects: true
    });
  }
} else if (command === 'timeline') {
  const directory = positionals[1] || values['snapshot-dir'] || '.';
  const leakThreshold = values.threshold ? parseFloat(values.threshold) : 10;
  
  const { timelineCLI } = await import('./timelineAnalyzer.js');
  await timelineCLI(directory, { leakThreshold });
} else {
  console.log('\n💡 Use --help to see available commands');
  console.log('💡 Use "list" to see available snapshots');
}