import { render } from 'ink';
import React from 'react';
import { App } from './App.js';
import { runAgentMode, runContinuousAgent } from './utils/agentMode.js';

// Parse command line arguments
const args = process.argv.slice(2);
const isAgentMode = args.includes('--agent') || args.includes('-a');
const isWatchMode = args.includes('--watch') || args.includes('-w');
const showHelp = args.includes('--help') || args.includes('-h');
const markdownOutput = args.includes('--markdown') || args.includes('-md');
let snapshotPath = args.find(arg => arg.endsWith('.heapsnapshot'));

// Show help if requested
if (showHelp) {
  console.log(`
🔍 Heap Analyzer CLI

Usage:
  heap-analyzer                           # Interactive mode
  heap-analyzer --agent [snapshot]       # Agent mode (automated analysis)
  heap-analyzer --watch [directory]      # Watch mode (continuous monitoring)
  heap-analyzer --help                   # Show this help

Options:
  -a, --agent                           Run in agent mode for automated analysis
  -w, --watch                           Run in watch mode for continuous monitoring
  -md, --markdown                       Output analysis as markdown in reports directory
  -h, --help                            Show help information

Examples:
  heap-analyzer --agent                 # Analyze ./snapshots/single.heapsnapshot
  heap-analyzer --agent my-app.heapsnapshot    # Analyze specific file
  heap-analyzer --agent --markdown     # Analyze and output as markdown report
  heap-analyzer --watch ./snapshots    # Monitor snapshots directory for new files
  `);
  process.exit(0);
}

// If no specific snapshot provided, look for one in snapshots directory
if (isAgentMode && !snapshotPath) {
  snapshotPath = './snapshots/single.heapsnapshot';
}

if (isWatchMode) {
  // Run in watch mode
  const watchDirectory = args.find(arg => !arg.startsWith('-') && !arg.endsWith('.heapsnapshot')) || './snapshots';
  runContinuousAgent(watchDirectory);
} else if (isAgentMode) {
  // Run in agent mode
  if (snapshotPath) {
    runAgentMode(snapshotPath, { markdownOutput });
  } else {
    console.error('❌ No heap snapshot file found. Please specify a .heapsnapshot file or place one in ./snapshots/');
    process.exit(1);
  }
} else {
  // Run interactive CLI
  render(React.createElement(App));
}
