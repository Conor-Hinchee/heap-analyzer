/**
 * Command Registry
 *
 * Maps CLI command names to their handler functions.
 * Each handler receives the parsed positionals, option values, and shared
 * options (e.g. subprocessTimeout) extracted by the CLI entry point.
 */

import { analyzeHeapSnapshot, listSnapshots, compareSnapshots, runMemlabTrace, runMemlabHeap, runMemlabViewHeap, runMemlabAnalyze, runMemlabLens } from './analyzer.js';
import { monitorApplication } from './monitor.js';
import path from 'node:path';

const SNAPSHOTS_DIR = './snapshots';

export interface ParsedValues {
  file?: string;
  baseline?: string;
  target?: string;
  final?: string;
  'snapshot-dir'?: string;
  'node-id'?: string;
  'trace-all-objects'?: boolean;
  'object-id'?: string;
  depth?: string;
  'max-children'?: string;
  'max-nodes'?: string;
  'time-budget'?: string;
  'output-format'?: string;
  'output-file'?: string;
  plugin?: string;
  interval?: string;
  duration?: string;
  scenarios?: string;
  'inject-script'?: string;
  pid?: string;
  endpoint?: string;
  threshold?: string;
  'webhook-url'?: string;
  concurrency?: string;
  'snapshot-file'?: string;
  'max-objects'?: string;
  backup?: boolean;
  devtools?: boolean;
  'output-dir'?: string;
  'wait-until'?: string;
  headful?: boolean;
  'disable-csp'?: boolean;
  'no-sandbox'?: boolean;
  'user-agent'?: string;
  'memlab-reports'?: boolean;
  'subprocess-timeout'?: string;
  help?: boolean;
}

export interface CommonOpts {
  subprocessTimeout?: number;
}

export type CommandHandler = (
  positionals: string[],
  values: ParsedValues,
  opts: CommonOpts
) => Promise<void>;

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleList(
  _positionals: string[],
  _values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
  console.log('\n📂 Available snapshots:');
  await listSnapshots(SNAPSHOTS_DIR);
}

async function handleCompare(
  positionals: string[],
  _values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
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
}

async function handleInspectObject(
  positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
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

  const { inspectMemlabObject } = await import('./memlabObjectInspectorSimple.js');
  const result = await inspectMemlabObject(file, objectId);

  if (!result) {
    console.log('\n💡 Tip: Make sure the object ID comes from memlab find-leaks output');
    console.log('   Example: npx heap-analyzer browser <url> (generates reports with object IDs)');
  }
}

async function handleMemlabInspect(
  positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
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
}

async function handleTrace(
  positionals: string[],
  values: ParsedValues,
  opts: CommonOpts
): Promise<void> {
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
  await runMemlabTrace(file, nodeId, opts.subprocessTimeout);
}

async function handleInvestigate(
  positionals: string[],
  values: ParsedValues,
  opts: CommonOpts
): Promise<void> {
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
  const traceResult = await runMemlabTraceCapture(invFile, nodeId, opts.subprocessTimeout);
  const traceLines = traceResult.raw.split(/\r?\n/).filter((l: string) => l.trim());
  const displayLines = traceLines.filter((l: string) => l.startsWith('[') || l.trim().startsWith('--'));
  displayLines.forEach((l: string) => console.log(l));
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

  // Attempt to update corresponding JSON analysis report
  try {
    const fs = await import('node:fs');
    const pathMod2 = await import('node:path');
    const reportDir = pathMod2.default.dirname(invFile);
    const files = fs.default.readdirSync(reportDir).filter((f: string) => f.startsWith('ANALYSIS-DATA-') && f.endsWith('.json'));
    if (files.length > 0) {
      const filesWithTime = files.map((f: string) => ({
        name: f,
        time: fs.default.statSync(pathMod2.default.join(reportDir, f)).mtimeMs
      })).sort((a: { name: string; time: number }, b: { name: string; time: number }) => b.time - a.time);
      const jsonPath = pathMod2.default.join(reportDir, filesWithTime[0].name);
      const raw = fs.default.readFileSync(jsonPath, 'utf8');
      let data: any = JSON.parse(raw);

      if (Array.isArray(data.memoryObjects)) {
        const targetObj = data.memoryObjects.find((o: any) => o.id === nodeId);
        if (targetObj) {
          targetObj.investigated = true;
        }
      }

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
          topReferences: (objectData.references || []).slice(0, 10).map((r: any) => ({ name: r.name, toNode: r.toNode, type: r.type })),
          topReferrers: (objectData.referrers || []).slice(0, 10).map((r: any) => ({ name: r.name, fromNode: r.fromNode, type: r.type }))
        };
      }

      if (traceResult.path && traceResult.path.length) {
        investigationEntry.retentionPath = traceResult.path;
      }

      investigationEntry.deepDiveFile = `deep-dive-${nodeId}.json`;

      const idx = data.investigations.findIndex((entry: any) => entry.objectId === investigationEntry.objectId && entry.snapshot === investigationEntry.snapshot);
      if (idx !== -1) {
        data.investigations[idx] = investigationEntry;
      } else {
        data.investigations.push(investigationEntry);
      }

      if (data.schema && typeof data.schema.version === 'string') {
        const parts = data.schema.version.split('.');
        if (parts.length === 3) {
          const minor = parseInt(parts[1]) || 0;
          parts[1] = String(minor + 1);
          data.schema.version = parts.join('.');
        }
      }

      fs.default.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
      console.log(`\n📝 Updated JSON report: ${pathMod2.default.basename(jsonPath)} (marked @${nodeId} investigated)`);

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
}

async function handleDeepDive(
  positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
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
}

async function handleHeap(
  positionals: string[],
  _values: ParsedValues,
  opts: CommonOpts
): Promise<void> {
  const heapFile = positionals[1];
  if (!heapFile) {
    console.error('❌ Error: heap requires a snapshot file');
    console.log('Usage: heap-analyzer heap <file>');
    process.exit(1);
  }
  console.log(`\n🔍 Starting interactive heap exploration`);
  await runMemlabHeap(heapFile, opts.subprocessTimeout);
}

async function handleViewHeap(
  positionals: string[],
  values: ParsedValues,
  opts: CommonOpts
): Promise<void> {
  const file = positionals[1];
  const nodeId = values['node-id'];

  if (!file) {
    console.error('❌ Error: view-heap requires a snapshot file');
    console.log('Usage: heap-analyzer view-heap <file> [--node-id <id>]');
    process.exit(1);
  }

  console.log(`\n👀 Starting heap visualization`);
  await runMemlabViewHeap(file, nodeId, opts.subprocessTimeout);
}

async function handleLens(
  positionals: string[],
  _values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
  const file = positionals[1];

  if (!file) {
    console.error('❌ Error: lens requires a snapshot file');
    console.log('Usage: heap-analyzer lens <file>');
    console.log('💡 This opens a web-based visualization interface');
    process.exit(1);
  }

  console.log(`\n🌐 Starting MemLens web visualization`);
  await runMemlabLens(file);
}

async function handleMonitor(
  positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
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
}

async function handleBrowser(
  positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
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
    headful: values['headful'] || undefined,
    disableCSP: values['disable-csp'] || undefined,
    noSandbox: values['no-sandbox'] || undefined,
    userAgent: values['user-agent'] || undefined
  });
}

async function handleAnalyzePlugin(
  positionals: string[],
  _values: ParsedValues,
  opts: CommonOpts
): Promise<void> {
  const pluginName = positionals[1];

  if (!pluginName) {
    console.error('❌ Error: analyze-plugin requires a plugin name');
    console.log('Usage: heap-analyzer analyze-plugin <plugin>');
    console.log('💡 Available plugins depend on your memlab installation');
    process.exit(1);
  }

  console.log(`\n🔬 Running analysis plugin: ${pluginName}`);
  await runMemlabAnalyze(pluginName, undefined, opts.subprocessTimeout);
}

async function handleFindLeaks(
  _positionals: string[],
  values: ParsedValues,
  opts: CommonOpts
): Promise<void> {
  const { runMemlabFindLeaks } = await import('./analyzer.js');

  let memlabOutput = '';
  let snapshotFile = '';

  if (values['snapshot-dir']) {
    console.log(`\n🔍 Running memlab leak detection on directory: ${values['snapshot-dir']}`);
    memlabOutput = await runMemlabFindLeaks({
      snapshotDir: values['snapshot-dir'],
      traceAllObjects: values['trace-all-objects'],
      subprocessTimeout: opts.subprocessTimeout
    });
    snapshotFile = values['snapshot-dir'];
  } else if (values.baseline && values.target) {
    console.log('\n🔍 Running memlab leak detection...');
    memlabOutput = await runMemlabFindLeaks({
      baseline: values.baseline,
      target: values.target,
      final: values.final,
      traceAllObjects: values['trace-all-objects'],
      subprocessTimeout: opts.subprocessTimeout
    });
    snapshotFile = values.final || values.target;
  } else {
    console.error('❌ Error: find-leaks requires either:');
    console.log('   --snapshot-dir <directory>');
    console.log('   OR --baseline <file> --target <file> [--final <file>]');
    console.log('\n💡 Final snapshot is optional - 2 snapshots are enough for leak detection');
    process.exit(1);
  }

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
}

async function handleEnrich(
  positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
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
}

async function handleGenerateReport(
  positionals: string[],
  _values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
  const jsonPath = positionals[1];

  if (!jsonPath) {
    console.error('❌ Error: generate-report requires a JSON file path');
    console.log('Usage: heap-analyzer generate-report <ANALYSIS-DATA-*.json>');
    console.log('Example: heap-analyzer generate-report ./snapshots/browser-*/ANALYSIS-DATA-*.json');
    process.exit(1);
  }

  const { generateMarkdownReport } = await import('./reportGenerator.js');
  await generateMarkdownReport(jsonPath);
}

async function handleTimeline(
  positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
  const directory = positionals[1] || values['snapshot-dir'] || '.';
  const leakThreshold = values.threshold ? parseFloat(values.threshold) : 10;

  const { timelineCLI } = await import('./timelineAnalyzer.js');
  await timelineCLI(directory, { leakThreshold });
}

async function handleAnalyze(
  positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
  let file = values.file || positionals[1];

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
}

async function handleNodeSnapshot(
  _positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
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
}

async function handleNodeMonitor(
  _positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
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
}

async function handleNodeLoadTest(
  positionals: string[],
  values: ParsedValues,
  opts: CommonOpts
): Promise<void> {
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
      traceAllObjects: true,
      subprocessTimeout: opts.subprocessTimeout
    });
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const commandRegistry: Record<string, CommandHandler> = {
  list: handleList,
  compare: handleCompare,
  'inspect-object': handleInspectObject,
  'memlab-inspect': handleMemlabInspect,
  trace: handleTrace,
  investigate: handleInvestigate,
  'deep-dive': handleDeepDive,
  heap: handleHeap,
  'view-heap': handleViewHeap,
  lens: handleLens,
  monitor: handleMonitor,
  browser: handleBrowser,
  'analyze-plugin': handleAnalyzePlugin,
  'find-leaks': handleFindLeaks,
  enrich: handleEnrich,
  'generate-report': handleGenerateReport,
  timeline: handleTimeline,
  analyze: handleAnalyze,
  'node-snapshot': handleNodeSnapshot,
  'node-monitor': handleNodeMonitor,
  'node-load-test': handleNodeLoadTest,
};
