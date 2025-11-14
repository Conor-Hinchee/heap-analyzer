#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { analyzeHeapSnapshot, listSnapshots } from './analyzer.js';
import path from 'node:path';

const SNAPSHOTS_DIR = './snapshots';

console.log("Heap Analyzer CLI 🚀");

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
  find-leaks               Find memory leaks using 3 snapshots
  list                     List available snapshots in ./snapshots directory

Single Snapshot Analysis:
  -f, --file <path>        Path to .heapsnapshot file

Memory Leak Detection:
  --baseline <file>        Baseline snapshot (initial state)
  --target <file>          Target snapshot (after action)
  --final <file>           Final snapshot (after cleanup)
  --snapshot-dir <dir>     Directory with baseline/target/final snapshots

General:
  -h, --help               Show this help message

Examples:
  # Single snapshot analysis
  heap-analyzer analyze snapshot.heapsnapshot
  heap-analyzer list
  
  # Memory leak detection
  heap-analyzer find-leaks --baseline baseline.heapsnapshot --target target.heapsnapshot --final final.heapsnapshot
  heap-analyzer find-leaks --snapshot-dir ./snapshots/leak-test/

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
} else if (command === 'find-leaks') {
  const { findMemoryLeaks } = await import('./analyzer.js');
  
  if (values['snapshot-dir']) {
    console.log(`\n🔍 Finding leaks in directory: ${values['snapshot-dir']}`);
    await findMemoryLeaks({ snapshotDir: values['snapshot-dir'] });
  } else if (values.baseline && values.target && values.final) {
    console.log('\n🔍 Finding leaks using specified snapshots...');
    await findMemoryLeaks({
      baseline: values.baseline,
      target: values.target,
      final: values.final
    });
  } else {
    console.error('❌ Error: find-leaks requires either:');
    console.log('   --snapshot-dir <directory>');
    console.log('   OR --baseline <file> --target <file> --final <file>');
    process.exit(1);
  }
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
} else {
  console.log('\n💡 Use --help to see available commands');
  console.log('💡 Use "list" to see available snapshots');
}