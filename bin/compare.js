#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the enhanced BeforeAfterAnalyzer
import { BeforeAfterAnalyzer } from '../dist/utils/beforeAfterAnalyzer.js';

async function main() {
  const args = process.argv.slice(2);
  
  // Default paths
  let beforePath = 'snapshots/before.heapsnapshot';
  let afterPath = 'snapshots/after.heapsnapshot';
  let outputPath = null;
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--before':
        beforePath = args[++i];
        break;
      case '--after':
        afterPath = args[++i];
        break;
      case '--output':
        outputPath = args[++i];
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      default:
        if (!arg.startsWith('--')) {
          // Assume it's a snapshot file path
          if (!beforePath.includes('before')) {
            beforePath = arg;
          } else {
            afterPath = arg;
          }
        }
        break;
    }
  }

  console.log('🔬 Enhanced Heap Comparison Analysis');
  console.log('====================================');
  console.log(`📊 Before: ${beforePath}`);
  console.log(`📊 After: ${afterPath}`);
  console.log('');

  // Check if files exist
  if (!fs.existsSync(beforePath)) {
    console.error(`❌ Before snapshot not found: ${beforePath}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(afterPath)) {
    console.error(`❌ After snapshot not found: ${afterPath}`);
    process.exit(1);
  }

  try {
    console.log('🔍 Loading snapshots...');
    
    // Load snapshot data
    const beforeData = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
    const afterData = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
    
    console.log('🧪 Running enhanced analysis...');
    
    // Create analyzer and run analysis
    const analyzer = new BeforeAfterAnalyzer(beforeData, afterData);
    const results = await analyzer.analyze();
    
    console.log('✅ Analysis complete!\n');
    
    // Display results
    displayResults(results);
    
    // Save detailed report if requested
    if (outputPath) {
      const reportData = {
        timestamp: new Date().toISOString(),
        beforeSnapshot: beforePath,
        afterSnapshot: afterPath,
        analysis: results,
        toolVersion: 'enhanced-comparison-v1.0'
      };
      
      fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
      console.log(`💾 Detailed report saved to: ${outputPath}`);
    } else {
      // Auto-save with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const autoOutputPath = `reports/enhanced-comparison-${timestamp}.json`;
      
      // Ensure reports directory exists
      if (!fs.existsSync('reports')) {
        fs.mkdirSync('reports', { recursive: true });
      }
      
      const reportData = {
        timestamp: new Date().toISOString(),
        beforeSnapshot: beforePath,
        afterSnapshot: afterPath,
        analysis: results,
        toolVersion: 'enhanced-comparison-v1.0'
      };
      
      fs.writeFileSync(autoOutputPath, JSON.stringify(reportData, null, 2));
      console.log(`💾 Detailed report auto-saved to: ${autoOutputPath}`);
    }
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  }
}

function displayResults(results) {
  const { memoryGrowth, newObjects, grownObjects, potentialLeaks, summary } = results;
  
  // Memory Growth Summary
  console.log('📊 MEMORY GROWTH ANALYSIS');
  console.log('========================');
  console.log(`Memory: ${(memoryGrowth.beforeSize / 1024 / 1024).toFixed(2)}MB → ${(memoryGrowth.afterSize / 1024 / 1024).toFixed(2)}MB (+${(memoryGrowth.totalGrowth / 1024 / 1024).toFixed(2)}MB | ${memoryGrowth.percentageGrowth.toFixed(1)}%)`);
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
    
    potentialLeaks.forEach((leak, index) => {
      const confidenceBar = '█'.repeat(Math.floor(leak.confidence / 10)) + '░'.repeat(10 - Math.floor(leak.confidence / 10));
      console.log(`${index + 1}. ${getLeakEmoji(leak.type)} ${leak.type.toUpperCase().replace('_', ' ')}`);
      console.log(`   Confidence: ${leak.confidence}% [${confidenceBar}]`);
      console.log(`   Description: ${leak.description}`);
      console.log(`   Fix: ${leak.suggestedFix}`);
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
    summary.primaryConcerns.forEach(concern => {
      console.log(`• ${concern}`);
    });
    console.log('');
  }
  
  // Recommendations
  console.log('💡 RECOMMENDATIONS');
  console.log('==================');
  summary.recommendations.forEach(rec => {
    console.log(`• ${rec}`);
  });
  console.log('');
  
  // Top New Objects by Size
  if (newObjects.length > 0) {
    console.log('📈 TOP NEW OBJECTS (by size)');
    console.log('============================');
    const topNewObjects = newObjects
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
      
    topNewObjects.forEach((obj, index) => {
      console.log(`${index + 1}. ${obj.category} - ${obj.node.name || obj.node.type} (${(obj.size / 1024).toFixed(1)}KB)`);
    });
    console.log('');
  }
  
  // Top Grown Objects
  if (grownObjects.length > 0) {
    console.log('📊 TOP GROWN OBJECTS');
    console.log('====================');
    const topGrownObjects = grownObjects
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 5);
      
    topGrownObjects.forEach((obj, index) => {
      console.log(`${index + 1}. ${obj.node.name || obj.node.type}`);
      console.log(`   ${(obj.beforeSize / 1024).toFixed(1)}KB → ${(obj.afterSize / 1024).toFixed(1)}KB (+${(obj.growth / 1024).toFixed(1)}KB)`);
    });
    console.log('');
  }
}

function getLeakEmoji(type) {
  const emojiMap = {
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

function showHelp() {
  console.log(`
🔬 Enhanced Heap Comparison Analysis Tool

USAGE:
  npx heap-compare [options]
  node bin/compare.js [options]

OPTIONS:
  --before <path>     Path to before snapshot (default: snapshots/before.heapsnapshot)
  --after <path>      Path to after snapshot (default: snapshots/after.heapsnapshot)
  --output <path>     Save detailed JSON report to specified path
  --help, -h          Show this help message

EXAMPLES:
  # Analyze default snapshots
  npx heap-compare

  # Analyze specific snapshots
  npx heap-compare --before app-start.heapsnapshot --after app-after-leak.heapsnapshot

  # Save detailed report
  npx heap-compare --output detailed-analysis.json

  # Quick analysis of custom files
  npx heap-compare snapshot1.heapsnapshot snapshot2.heapsnapshot

FEATURES:
  ✅ Collection Growth Detection (Arrays, Maps, Sets, Objects)
  ✅ Global Variable Leak Detection
  ✅ DOM Retention Analysis
  ✅ React Component Lifecycle Leaks
  ✅ Image/Canvas Processing Leaks
  ✅ Closure Paradox Detection
  ✅ Event Listener Accumulation
  ✅ Confidence Scoring & Prioritization

The enhanced analyzer provides deep insights that complement the quick agent analysis.
Use this tool when you need detailed leak pattern analysis and specific recommendations.
`);
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
