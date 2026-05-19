#!/usr/bin/env node

import util from 'node:util';
import { commandRegistry } from './registry.js';

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
    'subprocess-timeout': {
      type: 'string',
      description: 'Timeout in ms for memlab subprocess calls (default: no timeout)'
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
  --subprocess-timeout <ms>  Kill memlab subprocess after this many milliseconds
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
const subprocessTimeout = values['subprocess-timeout'] ? parseInt(values['subprocess-timeout']) : undefined;
const opts = { subprocessTimeout };

// Resolve command: explicit "analyze" command OR bare file argument
const resolvedCommand = command ?? (values.file ? 'analyze' : undefined);

const handler = resolvedCommand ? commandRegistry[resolvedCommand] : undefined;

if (handler) {
  await handler(positionals, values, opts);
} else {
  console.log('\n💡 Use --help to see available commands');
  console.log('💡 Use "list" to see available snapshots');
}
