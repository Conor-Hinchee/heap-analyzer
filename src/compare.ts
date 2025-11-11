#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { BeforeAfterAnalyzer } from './utils/beforeAfterAnalyzer.js';
import { analyzeCatastrophicLeak, generateCatastrophicReport } from './utils/catastrophicAnalyzer.js';

interface CompareOptions {
  beforePath: string;
  afterPath: string;
  outputPath?: string;
  verbose: boolean;
}

export async function runEnhancedComparison() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const options = parseArguments(args);
  
  if (!options) {
    showHelp();
    process.exit(1);
  }

  console.log('🔬 Enhanced Heap Comparison Analysis');
  console.log('====================================');
  console.log(`📊 Before: ${options.beforePath}`);
  console.log(`📊 After: ${options.afterPath}`);
  console.log('');

  // Check if files exist
  if (!fs.existsSync(options.beforePath)) {
    console.error(`❌ Before snapshot not found: ${options.beforePath}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(options.afterPath)) {
    console.error(`❌ After snapshot not found: ${options.afterPath}`);
    process.exit(1);
  }

  // Check file sizes for memory estimation
  const beforeStats = fs.statSync(options.beforePath);
  const afterStats = fs.statSync(options.afterPath);
  const totalSizeMB = (beforeStats.size + afterStats.size) / 1024 / 1024;
  const beforeSizeMB = beforeStats.size / 1024 / 1024;
  const afterSizeMB = afterStats.size / 1024 / 1024;
  
  console.log(`📂 Total snapshot size: ${totalSizeMB.toFixed(1)} MB`);
  
  if (totalSizeMB > 200) {
    console.log('⚠️  Large snapshots detected - analysis may take time...');
  }

  // If either snapshot is > 500MB or total > 800MB, use catastrophic analysis
  if (afterSizeMB > 500 || totalSizeMB > 800) {
    console.log('🚨 CATASTROPHIC LEAK DETECTED - Switching to specialized analysis...');
    
    try {
      const catastrophicAnalysis = await analyzeCatastrophicLeak(options.beforePath, options.afterPath);
      const report = generateCatastrophicReport(catastrophicAnalysis);
      
      console.log('\n' + report);
      
      // Save catastrophic report
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = options.outputPath || `./reports/catastrophic-enhanced-${timestamp}.json`;
      
      // Ensure reports directory exists
      const reportsDir = path.dirname(outputPath);
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      
      // Save both text and JSON versions
      const textPath = outputPath.replace('.json', '.txt');
      fs.writeFileSync(textPath, report);
      fs.writeFileSync(outputPath, JSON.stringify(catastrophicAnalysis, null, 2));
      
      console.log(`\n💾 Catastrophic analysis saved to: ${textPath}`);
      console.log(`📊 JSON data saved to: ${outputPath}`);
      
      return;
    } catch (catastrophicError) {
      console.error('❌ Even catastrophic analysis failed:', catastrophicError);
      console.log('📏 Falling back to basic file size analysis...');
      
      const basicAnalysis = {
        severity: 'CATASTROPHIC',
        beforeSizeMB,
        afterSizeMB,
        growthMB: afterSizeMB - beforeSizeMB,
        growthPercentage: ((afterSizeMB / beforeSizeMB - 1) * 100),
        error: 'Snapshots too large to analyze - basic metrics only',
        recommendations: [
          'Search for setInterval without clearInterval',
          'Search for addEventListener without removeEventListener',
          'Check for array.push in loops without clearing',
          'Look for global object accumulation patterns'
        ]
      };
      
      const basicReport = `
🚨 CATASTROPHIC MEMORY LEAK - ENHANCED ANALYSIS IMPOSSIBLE
========================================================

Snapshot Analysis Results:
• Before: ${beforeSizeMB.toFixed(1)}MB
• After: ${afterSizeMB.toFixed(1)}MB  
• Growth: +${basicAnalysis.growthMB.toFixed(1)}MB (+${basicAnalysis.growthPercentage.toFixed(0)}%)

🔴 SEVERITY: CATASTROPHIC

This memory leak is too large for detailed analysis but requires immediate attention.
      `;
      
      console.log(basicReport);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = options.outputPath || `./reports/catastrophic-fallback-${timestamp}.json`;
      const textPath = outputPath.replace('.json', '.txt');
      
      const reportsDir = path.dirname(outputPath);
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      
      fs.writeFileSync(textPath, basicReport);
      fs.writeFileSync(outputPath, JSON.stringify(basicAnalysis, null, 2));
      
      console.log(`\n💾 Basic analysis saved to: ${textPath}`);
      return;
    }
  }

  try {
    console.log('🔍 Loading snapshots...');
    
    // Load snapshot data with memory management
    const beforeData = await loadSnapshotSafely(options.beforePath);
    const afterData = await loadSnapshotSafely(options.afterPath);
    
    console.log('🧪 Running enhanced analysis...');
    
    // Create analyzer and run analysis
    const analyzer = new BeforeAfterAnalyzer(beforeData, afterData);
    const results = await analyzer.analyze();
    
    console.log('✅ Analysis complete!\n');
    
    // Display results
    displayResults(results, options.verbose);
    
    // Save report
    await saveReport(results, options);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('heap out of memory')) {
      console.error('❌ Out of memory during analysis!');
      console.error('💡 Try running with more memory:');
      console.error('   node --max-old-space-size=16384 bin/cli.js compare');
    } else {
      console.error('❌ Analysis failed:', errorMessage);
    }
    process.exit(1);
  }
}

function parseArguments(args: string[]): CompareOptions | null {
  let beforePath = 'snapshots/before.heapsnapshot';
  let afterPath = 'snapshots/after.heapsnapshot';
  let outputPath: string | undefined;
  let verbose = false;
  let positionalIndex = 0;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--before':
        beforePath = args[++i];
        if (!beforePath) {
          console.error('❌ --before requires a file path');
          return null;
        }
        break;
      case '--after':
        afterPath = args[++i];
        if (!afterPath) {
          console.error('❌ --after requires a file path');
          return null;
        }
        break;
      case '--output':
        outputPath = args[++i];
        if (!outputPath) {
          console.error('❌ --output requires a file path');
          return null;
        }
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--help':
      case '-h':
        return null;
      default:
        if (!arg.startsWith('--')) {
          // Handle positional arguments in order
          if (positionalIndex === 0) {
            beforePath = arg;
            positionalIndex++;
          } else if (positionalIndex === 1) {
            afterPath = arg;
            positionalIndex++;
          } else {
            console.error(`❌ Too many positional arguments: ${arg}`);
            return null;
          }
        }
        break;
    }
  }

  return { beforePath, afterPath, outputPath, verbose };
}

async function loadSnapshotSafely(filePath: string): Promise<any> {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(data);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    return parsed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${filePath}: ${errorMessage}`);
  }
}

function displayResults(results: any, verbose: boolean) {
  const { memoryGrowth, newObjects, grownObjects, potentialLeaks, summary } = results;
  
  // Memory Growth Summary
  console.log('📊 MEMORY GROWTH ANALYSIS');
  console.log('========================');
  console.log(`Memory: ${formatBytes(memoryGrowth.beforeSize)} → ${formatBytes(memoryGrowth.afterSize)} (+${formatBytes(memoryGrowth.totalGrowth)} | ${memoryGrowth.percentageGrowth.toFixed(1)}%)`);
  console.log(`New Objects: ${newObjects.length.toLocaleString()}`);
  console.log(`Grown Objects: ${grownObjects.length.toLocaleString()}`);
  console.log('');
  
  // Leak Confidence
  const severityEmoji = summary.leakConfidence === 'high' ? '🔴' : summary.leakConfidence === 'medium' ? '🟠' : '🟢';
  console.log(`${severityEmoji} LEAK CONFIDENCE: ${summary.leakConfidence.toUpperCase()}`);
  console.log('');
  
  // Potential Leaks
  if (potentialLeaks.length > 0) {
    console.log('🚨 POTENTIAL LEAKS DETECTED');
    console.log('===========================');
    
    potentialLeaks.forEach((leak: any, index: number) => {
      const confidenceBar = '█'.repeat(Math.floor(leak.confidence / 10)) + '░'.repeat(10 - Math.floor(leak.confidence / 10));
      console.log(`${index + 1}. ${getLeakEmoji(leak.type)} ${leak.type.toUpperCase().replace('_', ' ')}`);
      console.log(`   Confidence: ${leak.confidence}% [${confidenceBar}]`);
      console.log(`   Description: ${leak.description}`);
      console.log(`   Fix: ${leak.suggestedFix}`);
      
      if (verbose && leak.details) {
        console.log(`   Details: ${JSON.stringify(leak.details, null, 2)}`);
      }
      console.log('');
    });
  } else {
    console.log('✅ NO MAJOR LEAKS DETECTED');
    console.log('==========================');
    console.log('Memory usage appears stable with no significant leak patterns.');
    console.log('');
  }
  
  // Primary Concerns
  if (summary.primaryConcerns.length > 0) {
    console.log('⚠️  PRIMARY CONCERNS');
    console.log('===================');
    summary.primaryConcerns.forEach((concern: string) => {
      console.log(`• ${concern}`);
    });
    console.log('');
  }
  
  // Recommendations
  console.log('💡 RECOMMENDATIONS');
  console.log('==================');
  summary.recommendations.forEach((rec: string) => {
    console.log(`• ${rec}`);
  });
  console.log('');
  
  // Top New Objects by Size
  if (newObjects.length > 0) {
    console.log('📈 TOP NEW OBJECTS (by size)');
    console.log('============================');
    const topNewObjects = newObjects
      .sort((a: any, b: any) => b.size - a.size)
      .slice(0, verbose ? 20 : 10);
      
    topNewObjects.forEach((obj: any, index: number) => {
      const emoji = getCategoryEmoji(obj.category);
      console.log(`${index + 1}. ${emoji} ${obj.category} - ${obj.node.name || obj.node.type} (${formatBytes(obj.size)})`);
    });
    console.log('');
  }
  
  // Top Grown Objects
  if (grownObjects.length > 0) {
    console.log('📊 TOP GROWN OBJECTS');
    console.log('====================');
    const topGrownObjects = grownObjects
      .sort((a: any, b: any) => b.growth - a.growth)
      .slice(0, verbose ? 10 : 5);
      
    topGrownObjects.forEach((obj: any, index: number) => {
      console.log(`${index + 1}. ${obj.node.name || obj.node.type}`);
      console.log(`   ${formatBytes(obj.beforeSize)} → ${formatBytes(obj.afterSize)} (+${formatBytes(obj.growth)})`);
    });
    console.log('');
  }

  if (verbose) {
    displayDetailedBreakdown(newObjects, potentialLeaks);
  }
}

function displayDetailedBreakdown(newObjects: any[], potentialLeaks: any[]) {
  console.log('🔍 DETAILED BREAKDOWN');
  console.log('=====================');
  
  // Category breakdown
  const categories: { [key: string]: { count: number, size: number } } = {};
  newObjects.forEach(obj => {
    if (!categories[obj.category]) {
      categories[obj.category] = { count: 0, size: 0 };
    }
    categories[obj.category].count++;
    categories[obj.category].size += obj.size;
  });
  
  console.log('📊 Object Categories:');
  Object.entries(categories)
    .sort(([,a], [,b]) => b.size - a.size)
    .forEach(([category, data]) => {
      const emoji = getCategoryEmoji(category);
      console.log(`   ${emoji} ${category}: ${data.count.toLocaleString()} objects (${formatBytes(data.size)})`);
    });
  console.log('');
  
  // Leak type breakdown
  if (potentialLeaks.length > 0) {
    console.log('🚨 Leak Types Found:');
    const leakTypes: { [key: string]: number } = {};
    potentialLeaks.forEach(leak => {
      leakTypes[leak.type] = (leakTypes[leak.type] || 0) + 1;
    });
    
    Object.entries(leakTypes).forEach(([type, count]) => {
      const emoji = getLeakEmoji(type);
      console.log(`   ${emoji} ${type.replace('_', ' ').toUpperCase()}: ${count} detected`);
    });
    console.log('');
  }
}

function getCategoryEmoji(category: string): string {
  const emojiMap: { [key: string]: string } = {
    'DOM': '🔴',
    'REACT': '⚛️',
    'CLOSURE': '🟡',
    'ARRAY': '🟠',
    'OBJECT': '⚫',
    'FUNCTION': '🔵',
    'ASYNC': '🟣',
    'IMAGE_CANVAS': '🖼️',
    'DATA_URL': '💾',
    'BASE64_DATA': '💾',
    'GLOBAL_VARIABLE': '🌐'
  };
  return emojiMap[category] || '⚪';
}

function getLeakEmoji(type: string): string {
  const emojiMap: { [key: string]: string } = {
    'collection_growth': '🗃️',
    'global_variable': '🌐',
    'detached_dom': '🔗',
    'closure': '🔒',
    'closure_paradox': '🔗',
    'image_canvas': '🖼️',
    'data_url': '💾',
    'event_listener': '🎧',
    'react_component_lifecycle': '⚛️',
    'image_processing': '🖼️',
    'array': '📋',
    'object': '📦',
    'timer': '⏱️'
  };
  return emojiMap[type] || '🔍';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function saveReport(results: any, options: CompareOptions) {
  let outputPath = options.outputPath;
  
  if (!outputPath) {
    // Auto-save with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    outputPath = `reports/enhanced-comparison-${timestamp}.json`;
  }
  
  // Ensure reports directory exists
  const reportsDir = path.dirname(outputPath);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const reportData = {
    timestamp: new Date().toISOString(),
    beforeSnapshot: options.beforePath,
    afterSnapshot: options.afterPath,
    analysis: results,
    toolVersion: 'enhanced-comparison-v1.0',
    summary: {
      memoryGrowth: `${formatBytes(results.memoryGrowth.totalGrowth)} (${results.memoryGrowth.percentageGrowth.toFixed(1)}%)`,
      newObjects: results.newObjects.length,
      potentialLeaks: results.potentialLeaks.length,
      confidence: results.summary.leakConfidence
    }
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
  console.log(`💾 Detailed report saved to: ${outputPath}`);
}

function showHelp() {
  console.log(`
🔬 Enhanced Heap Comparison Analysis Tool

USAGE:
  npx heap-analyzer compare [options]
  node bin/cli.js compare [options]

OPTIONS:
  --before <path>     Path to before snapshot (default: snapshots/before.heapsnapshot)
  --after <path>      Path to after snapshot (default: snapshots/after.heapsnapshot)
  --output <path>     Save detailed JSON report to specified path
  --verbose, -v       Show detailed breakdown and extra information
  --help, -h          Show this help message

EXAMPLES:
  # Analyze default snapshots
  npx heap-analyzer compare

  # Analyze specific snapshots
  npx heap-analyzer compare --before app-start.heapsnapshot --after app-after-leak.heapsnapshot

  # Save detailed report with verbose output
  npx heap-analyzer compare --output detailed-analysis.json --verbose

  # Quick analysis of custom files
  npx heap-analyzer compare snapshot1.heapsnapshot snapshot2.heapsnapshot

FEATURES:
  ✅ Collection Growth Detection (Arrays, Maps, Sets, Objects)
  ✅ Global Variable Leak Detection (window.* collections)
  ✅ DOM Retention Analysis (detached nodes)
  ✅ React Component Lifecycle Leaks (useEffect cleanup)
  ✅ Image/Canvas Processing Leaks (base64, data URLs)
  ✅ Closure Paradox Detection (object explosion without closures)
  ✅ Event Listener Accumulation (global retainers)
  ✅ Confidence Scoring & Prioritization

MEMORY USAGE:
  For large snapshots (>100MB), consider running with more memory:
  node --max-old-space-size=16384 bin/cli.js compare

The enhanced analyzer provides deep insights that complement the quick agent analysis.
Use this tool when you need detailed leak pattern analysis and specific recommendations.
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEnhancedComparison().catch((error: unknown) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
