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

  // Global Variable Analysis (if available from before or after analysis)
  displayGlobalVariableAnalysis(results);

  // Stale Collection Analysis (if available from before or after analysis)
  displayStaleCollectionAnalysis(results);

  // Unbound Growth Analysis (cross-snapshot analysis)
  displayUnboundGrowthAnalysis(results);

  // Detached DOM Analysis (if available from before or after analysis)
  displayDetachedDomAnalysis(results);

  // Object Fanout Analysis (high reference count objects)
  displayObjectFanoutAnalysis(results);

  // Object Shallow Analysis (duplicated objects)
  displayObjectShallowAnalysis(results);

  // Object Shape Analysis (shape-based memory consumption)
  displayObjectShapeAnalysis(results);

  // Object Size Rank Analysis (largest objects)
  displayObjectSizeRankAnalysis(results);

  // Object Unbound Growth Analysis (individual growing objects)
  displayObjectUnboundGrowthAnalysis(results);

  // Shape Unbound Growth Analysis (object shape growth patterns)
  displayShapeUnboundGrowthAnalysis(results);

  // String Analysis (string duplication patterns)
  displayStringAnalysis(results);

  // Unmounted Fiber Analysis (React Fiber node cleanup issues)
  displayUnmountedFiberAnalysis(results);

  // React Component & Hook Analysis (React-specific memory patterns)
  displayReactComponentHookAnalysis(results);
  
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

function displayGlobalVariableAnalysis(results: any) {
  // Check if we have global variable analysis from either before or after snapshots
  const beforeGlobals = results.beforeAnalysis?.globalVariableAnalysis;
  const afterGlobals = results.afterAnalysis?.globalVariableAnalysis;
  
  if (!beforeGlobals && !afterGlobals) return;
  
  console.log('🌐 GLOBAL VARIABLE ANALYSIS');
  console.log('===========================');
  
  if (afterGlobals && afterGlobals.suspiciousGlobals.length > 0) {
    console.log(afterGlobals.summary);
    console.log(`Total Impact: ${formatBytes(afterGlobals.totalMemoryImpact)}`);
    console.log('');
    
    console.log('🚨 TOP GLOBAL VARIABLE LEAKS:');
    afterGlobals.topLeaks.slice(0, 5).forEach((leak: any, index: number) => {
      const severityIcon = leak.severity === 'CRITICAL' ? '🔥' : 
                          leak.severity === 'HIGH' ? '🔴' : 
                          leak.severity === 'MEDIUM' ? '🟠' : '🟡';
      console.log(`${index + 1}. ${severityIcon} ${leak.name} (${leak.severity})`);
      console.log(`   Size: ${formatBytes(leak.selfSize)} | Confidence: ${leak.confidence}%`);
      console.log(`   Fix: ${leak.suggestedFix}`);
      console.log('');
    });
    
    if (afterGlobals.recommendations.length > 0) {
      console.log('💡 GLOBAL VARIABLE RECOMMENDATIONS:');
      afterGlobals.recommendations.forEach((rec: string) => {
        console.log(`• ${rec}`);
      });
      console.log('');
    }
  } else {
    console.log('✅ No significant global variable leaks detected');
    console.log('');
  }
}

function displayStaleCollectionAnalysis(results: any) {
  // Check if we have stale collection analysis from either before or after snapshots
  const beforeStale = results.beforeAnalysis?.staleCollectionAnalysis;
  const afterStale = results.afterAnalysis?.staleCollectionAnalysis;
  
  if (!beforeStale && !afterStale) return;
  
  console.log('🗂️  STALE COLLECTION ANALYSIS');
  console.log('============================');
  
  if (afterStale && afterStale.staleCollections.length > 0) {
    console.log(afterStale.summary);
    console.log(`Total Stale Objects: ${afterStale.totalStaleObjects.toLocaleString()}`);
    console.log(`Memory Impact: ${formatBytes(afterStale.totalStaleMemory)}`);
    console.log('');
    
    console.log('🚨 TOP COLLECTIONS WITH STALE OBJECTS:');
    afterStale.topOffenders.slice(0, 5).forEach((collection: any, index: number) => {
      const severityIcon = collection.severity === 'CRITICAL' ? '🔥' : 
                          collection.severity === 'HIGH' ? '🔴' : 
                          collection.severity === 'MEDIUM' ? '🟠' : '🟡';
      const staleRatio = Math.round((collection.staleChildren.length / collection.childrenSize) * 100);
      
      console.log(`${index + 1}. ${severityIcon} ${collection.collection.name || 'Unknown Collection'} (${collection.severity})`);
      console.log(`   Type: ${collection.collectionType} | Confidence: ${collection.confidence}%`);
      console.log(`   Stale: ${collection.staleChildren.length}/${collection.childrenSize} objects (${staleRatio}%)`);
      console.log(`   Memory: ${formatBytes(collection.staleRetainedSize)}`);
      console.log(`   Fix: ${collection.suggestedFix}`);
      console.log('');
    });
    
    if (afterStale.recommendations.length > 0) {
      console.log('💡 STALE COLLECTION RECOMMENDATIONS:');
      afterStale.recommendations.forEach((rec: string) => {
        console.log(`• ${rec}`);
      });
      console.log('');
    }
  } else {
    console.log('✅ No collections holding stale objects detected');
    console.log('');
  }
}

function displayUnboundGrowthAnalysis(results: any) {
  const unboundAnalysis = results.unboundGrowthAnalysis;
  
  if (!unboundAnalysis || unboundAnalysis.totalGrowingCollections === 0) {
    console.log('📈 UNBOUND GROWTH ANALYSIS');
    console.log('=========================');
    console.log('✅ No unbounded collection growth detected');
    console.log('');
    return;
  }
  
  console.log('📈 UNBOUND GROWTH ANALYSIS');
  console.log('=========================');
  console.log(unboundAnalysis.summary);
  console.log(`Growing Collections: ${unboundAnalysis.totalGrowingCollections}`);
  console.log(`Total Memory Growth: ${formatBytes(unboundAnalysis.totalMemoryGrowth)}`);
  console.log(`Average Growth Rate: ${(unboundAnalysis.averageGrowthRate * 100).toFixed(1)}% per snapshot`);
  console.log('');
  
  if (unboundAnalysis.topGrowers.length > 0) {
    console.log('🚨 TOP GROWING COLLECTIONS:');
    unboundAnalysis.topGrowers.slice(0, 5).forEach((collection: any, index: number) => {
      const severityIcon = collection.severity === 'CRITICAL' ? '🔥' : 
                          collection.severity === 'HIGH' ? '🔴' : 
                          collection.severity === 'MEDIUM' ? '🟠' : '🟡';
      const growthIcon = collection.isMonotonic ? '📈' : '📊';
      const growth = collection.totalGrowth > 0 ? `+${collection.totalGrowth}` : `${collection.totalGrowth}`;
      
      console.log(`${index + 1}. ${severityIcon}${growthIcon} ${collection.name || 'Unknown Collection'} (${collection.severity})`);
      console.log(`   Type: ${collection.collectionType} | Confidence: ${collection.confidence}%`);
      console.log(`   Growth: ${collection.initialSize} → ${collection.currentSize} elements (${growth})`);
      console.log(`   Rate: ${(collection.growthRate * 100).toFixed(1)}% avg | Pattern: ${collection.isMonotonic ? 'Monotonic' : 'Fluctuating'}`);
      console.log(`   Memory: ${formatBytes(collection.node.selfSize || 0)}`);
      console.log(`   Fix: ${collection.suggestedFix}`);
      console.log('');
    });
    
    if (unboundAnalysis.recommendations.length > 0) {
      console.log('💡 UNBOUND GROWTH RECOMMENDATIONS:');
      unboundAnalysis.recommendations.forEach((rec: string) => {
        console.log(`• ${rec}`);
      });
      console.log('');
    }

    // Show growth history for critical collections
    if (unboundAnalysis.criticalCollections.length > 0) {
      console.log('🔥 CRITICAL COLLECTIONS GROWTH HISTORY:');
      unboundAnalysis.criticalCollections.slice(0, 3).forEach((collection: any) => {
        const history = collection.growthHistory.join(' → ');
        console.log(`   ${collection.name}: ${history} elements`);
      });
      console.log('');
    }
  }
}

function displayDetachedDomAnalysis(results: any) {
  // Check if we have detached DOM analysis from either before or after snapshots
  const beforeDetached = results.beforeAnalysis?.detachedDomAnalysis;
  const afterDetached = results.afterAnalysis?.detachedDomAnalysis;
  
  // Use the analysis with more detached elements, or after if equal
  const detachedAnalysis = (!beforeDetached || !afterDetached) 
    ? (afterDetached || beforeDetached)
    : (afterDetached.totalDetachedElements >= beforeDetached.totalDetachedElements ? afterDetached : beforeDetached);
  
  if (!detachedAnalysis || detachedAnalysis.totalDetachedElements === 0) {
    console.log('🔌 DETACHED DOM ANALYSIS');
    console.log('========================');
    console.log('✅ No detached DOM elements detected');
    console.log('');
    return;
  }
  
  console.log('🔌 DETACHED DOM ANALYSIS');
  console.log('========================');
  console.log(detachedAnalysis.summary);
  console.log(`Total Detached Elements: ${detachedAnalysis.totalDetachedElements}`);
  console.log(`Memory Wasted: ${formatBytes(detachedAnalysis.totalMemoryWasted)}`);
  console.log('');
  
  // Show severity breakdown
  const critical = detachedAnalysis.severityBreakdown.CRITICAL || 0;
  const high = detachedAnalysis.severityBreakdown.HIGH || 0;
  const medium = detachedAnalysis.severityBreakdown.MEDIUM || 0;
  const low = detachedAnalysis.severityBreakdown.LOW || 0;
  
  if (critical > 0 || high > 0) {
    console.log('🚨 SEVERITY BREAKDOWN:');
    if (critical > 0) console.log(`• 🔥 CRITICAL: ${critical} elements`);
    if (high > 0) console.log(`• 🔴 HIGH: ${high} elements`);
    if (medium > 0) console.log(`• 🟡 MEDIUM: ${medium} elements`);
    if (low > 0) console.log(`• 🟢 LOW: ${low} elements`);
    console.log('');
  }
  
  // Show largest detached elements
  if (detachedAnalysis.largestDetached && detachedAnalysis.largestDetached.length > 0) {
    console.log('🔍 LARGEST DETACHED ELEMENTS:');
    detachedAnalysis.largestDetached.slice(0, 5).forEach((element: any, index: number) => {
      const severityEmoji = element.severity === 'CRITICAL' ? '🔥' : 
                           element.severity === 'HIGH' ? '🔴' : 
                           element.severity === 'MEDIUM' ? '🟡' : '🟢';
      
      console.log(`${index + 1}. ${severityEmoji} <${element.tagName}> ${element.confidence}% confidence`);
      console.log(`   Memory: ${formatBytes(element.retainedSize)} | Reason: ${element.detachmentReason}`);
      if (element.className) {
        console.log(`   Class: "${element.className}"`);
      }
    });
    console.log('');
  }
  
  // Show recommendations
  if (detachedAnalysis.recommendations && detachedAnalysis.recommendations.length > 0) {
    console.log('💡 DETACHED DOM RECOMMENDATIONS:');
    detachedAnalysis.recommendations.forEach((rec: string) => {
      console.log(`• ${rec}`);
    });
    console.log('');
  }
}

function displayObjectFanoutAnalysis(results: any) {
  // Check if we have fanout analysis from either before or after snapshots
  const beforeFanout = results.beforeAnalysis?.fanoutAnalysis;
  const afterFanout = results.afterAnalysis?.fanoutAnalysis;
  
  // Use the analysis with more high fanout objects, or after if equal
  const fanoutAnalysis = (!beforeFanout || !afterFanout) 
    ? (afterFanout || beforeFanout)
    : (afterFanout.suspiciousCollections?.length >= (beforeFanout.suspiciousCollections?.length || 0) ? afterFanout : beforeFanout);
  
  if (!fanoutAnalysis || fanoutAnalysis.topFanoutObjects?.length === 0) {
    console.log('📊 OBJECT FANOUT ANALYSIS');
    console.log('=========================');
    console.log('✅ No objects with high fanout detected');
    console.log('');
    return;
  }
  
  console.log('📊 OBJECT FANOUT ANALYSIS');
  console.log('=========================');
  console.log(fanoutAnalysis.summary);
  console.log(`Objects Analyzed: ${fanoutAnalysis.totalAnalyzedObjects}`);
  console.log(`Max Fanout: ${fanoutAnalysis.maxFanout} references`);
  console.log(`Average Fanout: ${fanoutAnalysis.averageFanout.toFixed(1)} references`);
  console.log('');
  
  // Show fanout distribution
  if (fanoutAnalysis.fanoutDistribution) {
    const dist = fanoutAnalysis.fanoutDistribution;
    const critical = dist['Critical (200+)'] || 0;
    const high = dist['High (51-200)'] || 0;
    
    if (critical > 0 || high > 0) {
      console.log('🚨 FANOUT DISTRIBUTION:');
      if (critical > 0) console.log(`• 🔥 Critical (200+): ${critical} objects`);
      if (high > 0) console.log(`• 🔴 High (51-200): ${high} objects`);
      if (dist['Medium (11-50)']) console.log(`• 🟡 Medium (11-50): ${dist['Medium (11-50)']} objects`);
      if (dist['Low (1-10)']) console.log(`• 🟢 Low (1-10): ${dist['Low (1-10)']} objects`);
      console.log('');
    }
  }
  
  // Show top high fanout objects
  if (fanoutAnalysis.topFanoutObjects && fanoutAnalysis.topFanoutObjects.length > 0) {
    console.log('🔍 TOP HIGH FANOUT OBJECTS:');
    fanoutAnalysis.topFanoutObjects.slice(0, 5).forEach((obj: any, index: number) => {
      const severityEmoji = obj.severity === 'CRITICAL' ? '🔥' : 
                           obj.severity === 'HIGH' ? '🔴' : 
                           obj.severity === 'MEDIUM' ? '🟡' : '🟢';
      
      console.log(`${index + 1}. ${severityEmoji} ${obj.node.name} (${obj.category})`);
      console.log(`   Fanout: ${obj.fanoutCount} refs | Confidence: ${obj.confidence}%`);
      console.log(`   Memory: ${formatBytes(obj.memoryImpact)} | Severity: ${obj.severity}`);
      
      // Show reference type breakdown
      const refTypes = Object.entries(obj.referenceTypes || {})
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 3)
        .map(([type, count]) => `${type}(${count})`)
        .join(', ');
      if (refTypes) {
        console.log(`   Types: ${refTypes}`);
      }
      
      // Show suspicious patterns
      if (obj.suspiciousPatterns && obj.suspiciousPatterns.length > 0) {
        console.log(`   ⚠️ ${obj.suspiciousPatterns[0]}`);
      }
      
      console.log('');
    });
  }
  
  // Show category breakdown
  if (fanoutAnalysis.highFanoutByCategory && Object.keys(fanoutAnalysis.highFanoutByCategory).length > 1) {
    console.log('📊 HIGH FANOUT BY CATEGORY:');
    Object.entries(fanoutAnalysis.highFanoutByCategory).forEach(([category, objects]: [string, any]) => {
      if (objects.length > 0) {
        const avgFanout = objects.reduce((sum: number, obj: any) => sum + obj.fanoutCount, 0) / objects.length;
        console.log(`• ${category}: ${objects.length} objects (avg ${avgFanout.toFixed(0)} refs)`);
      }
    });
    console.log('');
  }
  
  // Show insights
  if (fanoutAnalysis.insights && fanoutAnalysis.insights.length > 0) {
    console.log('💡 FANOUT INSIGHTS:');
    fanoutAnalysis.insights.forEach((insight: string) => {
      console.log(`• ${insight}`);
    });
    console.log('');
  }
  
  // Show recommendations
  if (fanoutAnalysis.recommendations && fanoutAnalysis.recommendations.length > 0) {
    console.log('💡 FANOUT RECOMMENDATIONS:');
    fanoutAnalysis.recommendations.forEach((rec: string) => {
      console.log(`• ${rec}`);
    });
    console.log('');
  }
}

function displayObjectShallowAnalysis(results: any) {
  // Check if we have shallow analysis from either before or after snapshots
  const beforeShallow = results.beforeAnalysis?.shallowAnalysis;
  const afterShallow = results.afterAnalysis?.shallowAnalysis;
  
  // Use the analysis with more duplicated objects, or after if equal
  const shallowAnalysis = (!beforeShallow || !afterShallow) 
    ? (afterShallow || beforeShallow)
    : (afterShallow.totalDuplicatedObjects >= beforeShallow.totalDuplicatedObjects ? afterShallow : beforeShallow);
  
  if (!shallowAnalysis || shallowAnalysis.totalDuplicatedObjects === 0) {
    console.log('📋 OBJECT SHALLOW ANALYSIS');
    console.log('==========================');
    console.log('✅ No significant object duplication detected');
    console.log('');
    return;
  }
  
  console.log('📋 OBJECT SHALLOW ANALYSIS');
  console.log('==========================');
  console.log(shallowAnalysis.summary);
  console.log(`Objects Analyzed: ${shallowAnalysis.totalAnalyzedObjects}`);
  console.log(`Duplicated Objects: ${shallowAnalysis.totalDuplicatedObjects}`);
  console.log(`Memory Wasted: ${formatBytes(shallowAnalysis.totalWastedMemory)}`);
  console.log(`Duplication Rate: ${shallowAnalysis.duplicationRate.toFixed(1)}%`);
  console.log('');
  
  // Show pattern statistics
  if (shallowAnalysis.patternStatistics && shallowAnalysis.patternStatistics['All Objects']) {
    const stats = shallowAnalysis.patternStatistics['All Objects'];
    if (stats.duplicationRate > 10 || stats.wasteRate > 5) {
      console.log('📊 DUPLICATION STATISTICS:');
      console.log(`• Objects: ${stats.totalObjects} (${stats.duplicationRate.toFixed(1)}% are duplicates)`);
      console.log(`• Memory: ${formatBytes(stats.totalSize)} (${stats.wasteRate.toFixed(1)}% is wasted)`);
      console.log('');
    }
  }
  
  // Show top duplicated objects by count
  if (shallowAnalysis.topDuplicatedByCount && shallowAnalysis.topDuplicatedByCount.length > 0) {
    console.log('🔢 TOP DUPLICATED OBJECTS BY COUNT:');
    shallowAnalysis.topDuplicatedByCount.slice(0, 5).forEach((obj: any, index: number) => {
      const countIcon = obj.count >= 50 ? '🔥' : obj.count >= 20 ? '🔴' : obj.count >= 10 ? '🟡' : '🟢';
      
      console.log(`${index + 1}. ${countIcon} ${obj.className}`);
      console.log(`   Count: ${obj.count} duplicates | Total: ${formatBytes(obj.totalSize)}`);
      console.log(`   Avg Size: ${formatBytes(obj.averageSize)} | Wasted: ${formatBytes(obj.wastedMemory)}`);
      
      // Show truncated object pattern
      const pattern = JSON.stringify(obj.sampleObject, null, 0);
      const truncatedPattern = pattern.length > 100 ? pattern.substring(0, 100) + '...' : pattern;
      console.log(`   Pattern: ${truncatedPattern}`);
      
      // Show some example node IDs
      const exampleIds = obj.ids.slice(0, 3).map((id: number) => `@${id}`).join(', ');
      const moreIds = obj.ids.length > 3 ? ` + ${obj.ids.length - 3} more` : '';
      console.log(`   Examples: ${exampleIds}${moreIds}`);
      console.log('');
    });
  }
  
  // Show top duplicated objects by size
  if (shallowAnalysis.topDuplicatedBySize && shallowAnalysis.topDuplicatedBySize.length > 0) {
    const topBySize = shallowAnalysis.topDuplicatedBySize.slice(0, 3);
    if (topBySize.some((obj: any) => obj.totalSize > 1024 * 1024)) { // Only show if >1MB
      console.log('💾 TOP MEMORY WASTERS:');
      topBySize.forEach((obj: any, index: number) => {
        if (obj.totalSize > 1024 * 1024) { // Only show >1MB
          const sizeIcon = obj.totalSize > 10 * 1024 * 1024 ? '🔥' : obj.totalSize > 5 * 1024 * 1024 ? '🔴' : '🟡';
          
          console.log(`${index + 1}. ${sizeIcon} ${obj.className}`);
          console.log(`   Total Size: ${formatBytes(obj.totalSize)} | Count: ${obj.count} objects`);
          console.log(`   Wasted: ${formatBytes(obj.wastedMemory)} (${((obj.wastedMemory / obj.totalSize) * 100).toFixed(1)}%)`);
        }
      });
      console.log('');
    }
  }
  
  // Show most wasteful classes
  if (shallowAnalysis.mostWastedClasses && shallowAnalysis.mostWastedClasses.length > 0) {
    const significantWaste = shallowAnalysis.mostWastedClasses.filter((cls: any) => cls.wastedMemory > 1024 * 1024);
    if (significantWaste.length > 0) {
      console.log('🎯 MOST WASTEFUL CLASSES:');
      significantWaste.slice(0, 3).forEach((cls: any) => {
        const wasteIcon = cls.wastedMemory > 10 * 1024 * 1024 ? '🔥' : cls.wastedMemory > 5 * 1024 * 1024 ? '🔴' : '🟡';
        console.log(`• ${wasteIcon} ${cls.className}: ${formatBytes(cls.wastedMemory)} wasted (${cls.count} duplicates)`);
      });
      console.log('');
    }
  }
  
  // Show insights
  if (shallowAnalysis.insights && shallowAnalysis.insights.length > 0) {
    console.log('💡 DUPLICATION INSIGHTS:');
    shallowAnalysis.insights.forEach((insight: string) => {
      console.log(`• ${insight}`);
    });
    console.log('');
  }
  
  // Show recommendations
  if (shallowAnalysis.recommendations && shallowAnalysis.recommendations.length > 0) {
    console.log('💡 DEDUPLICATION RECOMMENDATIONS:');
    shallowAnalysis.recommendations.forEach((rec: string) => {
      console.log(`• ${rec}`);
    });
    console.log('');
  }
}

function displayObjectShapeAnalysis(results: any) {
  // Check if we have shape analysis from either before or after snapshots
  const beforeShape = results.beforeAnalysis?.shapeAnalysis;
  const afterShape = results.afterAnalysis?.shapeAnalysis;
  
  // Use the analysis with more memory consumption, or after if equal
  const shapeAnalysis = (!beforeShape || !afterShape) 
    ? (afterShape || beforeShape)
    : (afterShape.totalMemoryAnalyzed >= beforeShape.totalMemoryAnalyzed ? afterShape : beforeShape);
  
  if (!shapeAnalysis || shapeAnalysis.totalShapesAnalyzed === 0) {
    console.log('📐 OBJECT SHAPE ANALYSIS');
    console.log('========================');
    console.log('✅ No significant object shapes detected');
    console.log('');
    return;
  }
  
  console.log('📐 OBJECT SHAPE ANALYSIS');
  console.log('========================');
  console.log(shapeAnalysis.summary);
  console.log(`Shapes Analyzed: ${shapeAnalysis.totalShapesAnalyzed}`);
  console.log(`Objects Analyzed: ${shapeAnalysis.totalObjectsAnalyzed}`);
  console.log(`Memory Analyzed: ${formatBytes(shapeAnalysis.totalMemoryAnalyzed)}`);
  console.log('');
  
  // Show shape distribution
  if (shapeAnalysis.shapeDistribution) {
    const hasCriticalOrHigh = (shapeAnalysis.shapeDistribution['Critical (>10MB)'] || 0) > 0 || 
                             (shapeAnalysis.shapeDistribution['High (5-10MB)'] || 0) > 0;
    
    if (hasCriticalOrHigh) {
      console.log('📊 MEMORY DISTRIBUTION BY SHAPE SIZE:');
      Object.entries(shapeAnalysis.shapeDistribution).forEach(([category, count]) => {
        if ((count as number) > 0) {
          const icon = category.includes('Critical') ? '🔥' : 
                      category.includes('High') ? '🔴' : 
                      category.includes('Medium') ? '🟡' : '🟢';
          console.log(`• ${icon} ${category}: ${count} shapes`);
        }
      });
      console.log('');
    }
  }
  
  // Show critical shapes
  if (shapeAnalysis.criticalShapes && shapeAnalysis.criticalShapes.length > 0) {
    console.log('🚨 CRITICAL MEMORY SHAPES:');
    shapeAnalysis.criticalShapes.slice(0, 5).forEach((shape: any, index: number) => {
      console.log(`${index + 1}. 🔥 ${shape.shapeSignature}`);
      console.log(`   Memory: ${formatBytes(shape.totalRetainedSize)} across ${shape.objectCount} objects`);
      console.log(`   Avg Size: ${formatBytes(shape.averageSize)} | Confidence: ${shape.confidence}%`);
      
      // Show examples
      if (shape.examples && shape.examples.length > 0) {
        const topExamples = shape.examples.slice(0, 3);
        const exampleStrs = topExamples.map((ex: any) => `@${ex.nodeId} [${formatBytes(ex.retainedSize)}]`);
        console.log(`   Examples: ${exampleStrs.join(' | ')}`);
      }
      console.log('');
    });
  }
  
  // Show top shapes by size
  if (shapeAnalysis.topShapesBySize && shapeAnalysis.topShapesBySize.length > 0) {
    const topShapes = shapeAnalysis.topShapesBySize.slice(0, 5);
    const significantShapes = topShapes.filter((shape: any) => shape.totalRetainedSize > 1024 * 1024); // >1MB
    
    if (significantShapes.length > 0) {
      console.log('💾 TOP SHAPES BY MEMORY CONSUMPTION:');
      significantShapes.forEach((shape: any, index: number) => {
        const sizeIcon = shape.memoryImpact === 'CRITICAL' ? '🔥' : 
                        shape.memoryImpact === 'HIGH' ? '🔴' : 
                        shape.memoryImpact === 'MEDIUM' ? '🟡' : '🟢';
        
        console.log(`${index + 1}. ${sizeIcon} ${shape.shapeSignature}`);
        console.log(`   Total: ${formatBytes(shape.totalRetainedSize)} | Objects: ${shape.objectCount}`);
        console.log(`   Avg: ${formatBytes(shape.averageSize)} | Impact: ${shape.memoryImpact}`);
        
        // Show referrer breakdown if available
        if (shape.referrerBreakdown && shape.referrerBreakdown.length > 0) {
          const topReferrer = shape.referrerBreakdown[0];
          console.log(`   Primary Referrer: ${topReferrer.referrerPattern} (${topReferrer.count} refs)`);
        }
        console.log('');
      });
    }
  }
  
  // Show top shapes by object count  
  if (shapeAnalysis.topShapesByCount && shapeAnalysis.topShapesByCount.length > 0) {
    const topByCount = shapeAnalysis.topShapesByCount.slice(0, 3);
    const highCountShapes = topByCount.filter((shape: any) => shape.objectCount > 100);
    
    if (highCountShapes.length > 0) {
      console.log('🔢 SHAPES WITH HIGH OBJECT COUNT:');
      highCountShapes.forEach((shape: any) => {
        const countIcon = shape.objectCount > 1000 ? '🔥' : shape.objectCount > 500 ? '🔴' : '🟡';
        console.log(`• ${countIcon} ${shape.shapeSignature}: ${shape.objectCount} objects (${formatBytes(shape.totalRetainedSize)})`);
      });
      console.log('');
    }
  }
  
  // Show insights
  if (shapeAnalysis.insights && shapeAnalysis.insights.length > 0) {
    console.log('💡 SHAPE INSIGHTS:');
    shapeAnalysis.insights.forEach((insight: string) => {
      console.log(`• ${insight}`);
    });
    console.log('');
  }
  
  // Show recommendations
  if (shapeAnalysis.recommendations && shapeAnalysis.recommendations.length > 0) {
    console.log('🛠️ SHAPE OPTIMIZATION RECOMMENDATIONS:');
    shapeAnalysis.recommendations.forEach((rec: string) => {
      console.log(`• ${rec}`);
    });
    console.log('');
  }
}

function displayObjectSizeRankAnalysis(results: any) {
  // Check if we have size rank analysis from either before or after snapshots
  const beforeSizeRank = results.beforeAnalysis?.sizeRankAnalysis;
  const afterSizeRank = results.afterAnalysis?.sizeRankAnalysis;
  
  // Use the analysis with more memory analyzed, or after if equal
  const sizeRankAnalysis = (!beforeSizeRank || !afterSizeRank) 
    ? (afterSizeRank || beforeSizeRank)
    : (afterSizeRank.totalMemoryAnalyzed >= beforeSizeRank.totalMemoryAnalyzed ? afterSizeRank : beforeSizeRank);
  
  if (!sizeRankAnalysis || sizeRankAnalysis.totalAnalyzed === 0) {
    console.log('📏 OBJECT SIZE RANK ANALYSIS');
    console.log('============================');
    console.log('✅ No large objects detected');
    console.log('');
    return;
  }
  
  console.log('📏 OBJECT SIZE RANK ANALYSIS');
  console.log('============================');
  console.log(sizeRankAnalysis.summary);
  console.log(`Objects Analyzed: ${sizeRankAnalysis.totalAnalyzed}`);
  console.log(`Memory Analyzed: ${formatBytes(sizeRankAnalysis.totalMemoryAnalyzed)}`);
  console.log('');
  
  // Show significance breakdown
  if (sizeRankAnalysis.significanceBreakdown) {
    const breakdown = sizeRankAnalysis.significanceBreakdown;
    const hasCriticalOrHigh = (breakdown.CRITICAL || 0) > 0 || (breakdown.HIGH || 0) > 0;
    
    if (hasCriticalOrHigh) {
      console.log('📊 OBJECT SIGNIFICANCE BREAKDOWN:');
      if (breakdown.CRITICAL > 0) console.log(`• 🔥 Critical: ${breakdown.CRITICAL} objects (>10MB each)`);
      if (breakdown.HIGH > 0) console.log(`• 🔴 High: ${breakdown.HIGH} objects (5-10MB each)`);
      if (breakdown.MEDIUM > 0) console.log(`• 🟡 Medium: ${breakdown.MEDIUM} objects (1-5MB each)`);
      if (breakdown.LOW > 0) console.log(`• 🟢 Low: ${breakdown.LOW} objects (100KB-1MB each)`);
      console.log('');
    }
  }
  
  // Show critical objects
  const criticalObjects = sizeRankAnalysis.largestObjects?.filter((obj: any) => obj.significance === 'CRITICAL') || [];
  if (criticalObjects.length > 0) {
    console.log('🚨 CRITICAL OBJECTS (>10MB):');
    criticalObjects.slice(0, 5).forEach((obj: any) => {
      console.log(`${obj.rank}. 🔥 ${obj.node.name} (${obj.node.type})`);
      console.log(`   Size: ${formatBytes(obj.retainedSize)} (${obj.sizePercentage.toFixed(1)}% of heap)`);
      console.log(`   Category: ${obj.category} | Confidence: ${obj.confidence}%`);
      
      // Show top optimization suggestions
      if (obj.optimization && obj.optimization.length > 0) {
        console.log(`   Fix: ${obj.optimization[0]}`);
      }
      console.log('');
    });
  }
  
  // Show top largest objects
  if (sizeRankAnalysis.largestObjects && sizeRankAnalysis.largestObjects.length > 0) {
    const topObjects = sizeRankAnalysis.largestObjects.slice(0, 10);
    const significantObjects = topObjects.filter((obj: any) => obj.retainedSize > 1024 * 1024); // >1MB
    
    if (significantObjects.length > 0) {
      console.log('💾 TOP LARGEST OBJECTS:');
      significantObjects.forEach((obj: any) => {
        const sizeIcon = obj.significance === 'CRITICAL' ? '🔥' : 
                        obj.significance === 'HIGH' ? '🔴' : 
                        obj.significance === 'MEDIUM' ? '🟡' : '🟢';
        
        console.log(`${obj.rank}. ${sizeIcon} ${obj.node.name} (${obj.node.type})`);
        console.log(`   Size: ${formatBytes(obj.retainedSize)} | Category: ${obj.category}`);
        console.log(`   Heap %: ${obj.sizePercentage.toFixed(2)}% | Significance: ${obj.significance}`);
        
        // Show node ID for further investigation
        console.log(`   Node ID: @${obj.node.id} (use inspect-object for details)`);
        console.log('');
      });
    }
  }
  
  // Show top categories by memory consumption
  if (sizeRankAnalysis.topCategories && sizeRankAnalysis.topCategories.length > 0) {
    const topCategories = sizeRankAnalysis.topCategories.slice(0, 5);
    const significantCategories = topCategories.filter((cat: any) => cat.totalSize > 1024 * 1024); // >1MB total
    
    if (significantCategories.length > 0) {
      console.log('📂 TOP MEMORY-CONSUMING CATEGORIES:');
      significantCategories.forEach((cat: any, index: number) => {
        const categoryIcon = cat.percentage > 25 ? '🔥' : cat.percentage > 10 ? '🔴' : cat.percentage > 5 ? '🟡' : '🟢';
        
        console.log(`${index + 1}. ${categoryIcon} ${cat.category}`);
        console.log(`   Total: ${formatBytes(cat.totalSize)} (${cat.percentage.toFixed(1)}% of analyzed)`);
        console.log(`   Objects: ${cat.count} | Avg Size: ${formatBytes(cat.averageSize)}`);
      });
      console.log('');
    }
  }
  
  // Show insights
  if (sizeRankAnalysis.insights && sizeRankAnalysis.insights.length > 0) {
    console.log('💡 SIZE ANALYSIS INSIGHTS:');
    sizeRankAnalysis.insights.forEach((insight: string) => {
      console.log(`• ${insight}`);
    });
    console.log('');
  }
  
  // Show recommendations
  if (sizeRankAnalysis.recommendations && sizeRankAnalysis.recommendations.length > 0) {
    console.log('🎯 SIZE OPTIMIZATION RECOMMENDATIONS:');
    sizeRankAnalysis.recommendations.forEach((rec: string) => {
      console.log(`• ${rec}`);
    });
    console.log('');
  }
}

function displayShapeUnboundGrowthAnalysis(results: any) {
  const shapeUnboundGrowthAnalysis = results.shapeUnboundGrowthAnalysis;
  
  if (!shapeUnboundGrowthAnalysis) {
    console.log('📐 SHAPE UNBOUND GROWTH ANALYSIS');
    console.log('================================');
    console.log('⚠️ Analysis not available - need multiple snapshots');
    console.log('');
    return;
  }
  
  console.log('📐 SHAPE UNBOUND GROWTH ANALYSIS');
  console.log('================================');
  console.log(shapeUnboundGrowthAnalysis.summary);
  console.log(`Shapes Tracked: ${shapeUnboundGrowthAnalysis.totalShapesTracked}`);
  console.log(`Snapshots Analyzed: ${shapeUnboundGrowthAnalysis.snapshotsAnalyzed}`);
  
  if (shapeUnboundGrowthAnalysis.totalGrowthDetected > 0) {
    console.log(`Total Growth Detected: ${formatBytes(shapeUnboundGrowthAnalysis.totalGrowthDetected)}`);
  }
  console.log('');
  
  // Show severity breakdown if we have significant growth
  const significantShapes = shapeUnboundGrowthAnalysis.significantGrowthShapes || [];
  if (significantShapes.length > 0) {
    console.log('📊 SHAPE GROWTH SEVERITY BREAKDOWN:');
    const breakdown = shapeUnboundGrowthAnalysis.severityBreakdown;
    if (breakdown.CRITICAL > 0) console.log(`• 🔥 Critical: ${breakdown.CRITICAL} shapes (>50MB growth)`);
    if (breakdown.HIGH > 0) console.log(`• 🔴 High: ${breakdown.HIGH} shapes (10-50MB growth)`);
    if (breakdown.MEDIUM > 0) console.log(`• 🟡 Medium: ${breakdown.MEDIUM} shapes (5-10MB growth)`);
    if (breakdown.LOW > 0) console.log(`• 🟢 Low: ${breakdown.LOW} shapes (1-5MB growth)`);
    console.log('');
  }
  
  // Show critical growing shapes
  const criticalShapes = significantShapes.filter((shape: any) => shape.severity === 'CRITICAL');
  if (criticalShapes.length > 0) {
    console.log('🚨 CRITICAL GROWING SHAPES:');
    criticalShapes.slice(0, 5).forEach((shape: any) => {
      console.log(`🔥 ${shape.shape}`);
      console.log(`   Growth: ${formatBytes(shape.sizes[0])} → ${formatBytes(shape.sizes[shape.sizes.length - 1])} (+${formatBytes(shape.totalGrowth)})`);
      console.log(`   Pattern: ${shape.growthPattern} | Rate: +${formatBytes(shape.growthRate)}/snapshot`);
      console.log(`   Peak: ${shape.peakCount} instances (${formatBytes(shape.peakSize)})`);
      console.log(`   Confidence: ${shape.confidence}% | Last Seen: Snapshot ${shape.lastSeenSnapshot + 1}`);
      
      // Show top recommendation
      if (shape.recommendations && shape.recommendations.length > 0) {
        console.log(`   Fix: ${shape.recommendations[0]}`);
      }
      console.log('');
    });
  }
  
  // Show monotonic growth shapes
  const monotonicShapes = shapeUnboundGrowthAnalysis.monotonicallyGrowingShapes || [];
  if (monotonicShapes.length > 0 && criticalShapes.length === 0) {
    console.log('📈 MONOTONIC GROWING SHAPES:');
    monotonicShapes.slice(0, 5).forEach((shape: any) => {
      const sizeIcon = shape.severity === 'HIGH' ? '🔴' : shape.severity === 'MEDIUM' ? '🟡' : '🟢';
      
      console.log(`${sizeIcon} ${shape.shape}`);
      console.log(`   Growth: ${formatBytes(shape.sizes[0])} → ${formatBytes(shape.sizes[shape.sizes.length - 1])} (+${formatBytes(shape.totalGrowth)})`);
      console.log(`   Snapshots: ${shape.snapshots} | Pattern: Always Increasing`);
      console.log(`   Examples: @${shape.examples.join(', @')}`);
    });
    console.log('');
  }
  
  // Show top growing shapes by total growth
  const shapesWithGrowth = shapeUnboundGrowthAnalysis.shapesWithGrowth || [];
  if (shapesWithGrowth.length > 0) {
    const topGrowing = shapesWithGrowth.slice(0, 8);
    if (topGrowing.some((shape: any) => shape.totalGrowth > 1024 * 1024)) { // Only show if >1MB growth
      console.log('📊 TOP GROWING SHAPES BY SIZE:');
      topGrowing
        .filter((shape: any) => shape.totalGrowth > 1024 * 1024)
        .slice(0, 5)
        .forEach((shape: any, index: number) => {
          const growthIcon = shape.severity === 'CRITICAL' ? '🔥' : 
                           shape.severity === 'HIGH' ? '🔴' : 
                           shape.severity === 'MEDIUM' ? '🟡' : '🟢';
          
          console.log(`${index + 1}. ${growthIcon} ${shape.shape}`);
          console.log(`   Total Growth: +${formatBytes(shape.totalGrowth)} | Peak: ${formatBytes(shape.peakSize)}`);
          console.log(`   Pattern: ${shape.growthPattern} | Rate: +${formatBytes(shape.growthRate)}/snapshot`);
          console.log(`   Instances: Peak ${shape.peakCount} | Examples: @${shape.examples.slice(0, 3).join(', @')}`);
        });
      console.log('');
    }
  }
  
  // Show growth pattern breakdown  
  if (shapeUnboundGrowthAnalysis.growthPatternBreakdown) {
    const patterns = shapeUnboundGrowthAnalysis.growthPatternBreakdown;
    const hasSignificantPatterns = patterns.MONOTONIC > 0 || patterns.SIGNIFICANT > 0;
    
    if (hasSignificantPatterns) {
      console.log('📊 SHAPE GROWTH PATTERNS:');
      if (patterns.MONOTONIC > 0) console.log(`• 📈 Monotonic: ${patterns.MONOTONIC} shapes (always increasing)`);
      if (patterns.SIGNIFICANT > 0) console.log(`• 📊 Significant: ${patterns.SIGNIFICANT} shapes (large growth with fluctuation)`);
      if (patterns.FLUCTUATING > 0) console.log(`• 🔄 Fluctuating: ${patterns.FLUCTUATING} shapes (growing but with decreases)`);
      console.log('');
    }
  }
  
  // Show insights
  if (shapeUnboundGrowthAnalysis.insights && shapeUnboundGrowthAnalysis.insights.length > 0) {
    console.log('💡 SHAPE GROWTH INSIGHTS:');
    shapeUnboundGrowthAnalysis.insights.forEach((insight: string) => {
      console.log(`• ${insight}`);
    });
    console.log('');
  }
  
  // Show recommendations
  if (shapeUnboundGrowthAnalysis.recommendations && shapeUnboundGrowthAnalysis.recommendations.length > 0) {
    console.log('🛠️ SHAPE GROWTH RECOMMENDATIONS:');
    shapeUnboundGrowthAnalysis.recommendations.forEach((rec: string) => {
      console.log(`• ${rec}`);
    });
    console.log('');
  }
}

function displayStringAnalysis(results: any) {
  const beforeStringAnalysis = results.beforeAnalysis?.stringAnalysis;
  const afterStringAnalysis = results.afterAnalysis?.stringAnalysis;
  
  if (!beforeStringAnalysis && !afterStringAnalysis) {
    return; // Skip if no string analysis
  }
  
  console.log('📝 STRING DUPLICATION ANALYSIS');
  console.log('==============================');
  
  // Before/After comparison
  if (beforeStringAnalysis && afterStringAnalysis) {
    const wasteBefore = beforeStringAnalysis.totalWastedMemory;
    const wasteAfter = afterStringAnalysis.totalWastedMemory;
    const wasteGrowth = wasteAfter - wasteBefore;
    
    console.log(`Wasted Memory: ${formatBytes(wasteBefore)} → ${formatBytes(wasteAfter)} (${wasteGrowth > 0 ? '+' : ''}${formatBytes(wasteGrowth)})`);
    console.log(`Duplicated Strings: ${beforeStringAnalysis.totalDuplicatedStrings} → ${afterStringAnalysis.totalDuplicatedStrings}`);
    console.log(`Waste Percentage: ${beforeStringAnalysis.wastePercentage.toFixed(1)}% → ${afterStringAnalysis.wastePercentage.toFixed(1)}%`);
    
    if (wasteGrowth > 1024 * 1024) {
      console.log('⚠️ Significant string waste growth detected!');
    }
  } else {
    // Show single snapshot analysis
    const analysis = afterStringAnalysis || beforeStringAnalysis;
    console.log(analysis.summary);
    console.log(`Total Strings: ${analysis.totalStringsAnalyzed}`);
    console.log(`Duplicated: ${analysis.totalDuplicatedStrings}`);
    console.log(`Wasted Memory: ${formatBytes(analysis.totalWastedMemory)}`);
    console.log(`Waste Percentage: ${analysis.wastePercentage.toFixed(1)}%`);
  }
  console.log('');
  
  // Show string analysis from after snapshot (or before if after not available)
  const analysis = afterStringAnalysis || beforeStringAnalysis;
  
  // Show top duplicated strings by size
  if (analysis.topDuplicatedBySize && analysis.topDuplicatedBySize.length > 0) {
    console.log('📊 TOP DUPLICATED STRINGS BY SIZE:');
    analysis.topDuplicatedBySize.slice(0, 5).forEach((str: any, index: number) => {
      const sizeIcon = str.severity === 'CRITICAL' ? '🔥' : str.severity === 'HIGH' ? '🔴' : str.severity === 'MEDIUM' ? '🟡' : '🟢';
      const wastedMemory = (str.count - 1) * str.averageSize;
      
      console.log(`${index + 1}. ${sizeIcon} "${str.content.substring(0, 60)}${str.content.length > 60 ? '...' : ''}"`);
      console.log(`   Instances: ${str.count} | Total Size: ${formatBytes(str.totalSize)}`);
      console.log(`   Wasted: ${formatBytes(wastedMemory)} | Avg Size: ${formatBytes(str.averageSize)}`);
      console.log(`   Confidence: ${str.confidence}% | Severity: ${str.severity}`);
      
      if (str.recommendations && str.recommendations.length > 0) {
        console.log(`   Fix: ${str.recommendations[0]}`);
      }
      console.log('');
    });
  }
  
  // Show top duplicated strings by count
  if (analysis.topDuplicatedByCount && analysis.topDuplicatedByCount.length > 0) {
    const topByCount = analysis.topDuplicatedByCount.filter((str: any) => str.count > 10);
    if (topByCount.length > 0) {
      console.log('🔢 TOP DUPLICATED STRINGS BY COUNT:');
      topByCount.slice(0, 5).forEach((str: any, index: number) => {
        const countIcon = str.count > 100 ? '🔥' : str.count > 50 ? '🔴' : str.count > 20 ? '🟡' : '🟢';
        
        console.log(`${index + 1}. ${countIcon} "${str.content.substring(0, 50)}${str.content.length > 50 ? '...' : ''}"`);
        console.log(`   Count: ${str.count} | Size: ${formatBytes(str.totalSize)} | Examples: @${str.nodeIds.slice(0, 3).join(', @')}`);
      });
      console.log('');
    }
  }
  
  // Show string patterns with significant waste
  if (analysis.stringPatterns && analysis.stringPatterns.length > 0) {
    const significantPatterns = analysis.stringPatterns.filter((p: any) => p.duplicatedSize > 100 * 1024);
    if (significantPatterns.length > 0) {
      console.log('🔍 STRING PATTERNS WITH SIGNIFICANT WASTE:');
      significantPatterns.slice(0, 5).forEach((pattern: any) => {
        console.log(`• ${pattern.patternName}:`);
        console.log(`  Duplicated: ${pattern.duplicatedCount}/${pattern.totalCount} instances (${pattern.wastePercentage.toFixed(1)}% waste)`);
        console.log(`  Wasted Memory: ${formatBytes(pattern.duplicatedSize)}`);
        if (pattern.examples && pattern.examples.length > 0) {
          console.log(`  Examples: "${pattern.examples.join('", "')}"`);
        }
      });
      console.log('');
    }
  }
  
  // Show insights
  if (analysis.insights && analysis.insights.length > 0) {
    console.log('💡 STRING DUPLICATION INSIGHTS:');
    analysis.insights.forEach((insight: string) => {
      console.log(`• ${insight}`);
    });
    console.log('');
  }
  
  // Show recommendations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    console.log('🛠️ STRING OPTIMIZATION RECOMMENDATIONS:');
    analysis.recommendations.forEach((rec: string) => {
      console.log(`• ${rec}`);
    });
    console.log('');
  }
}

function displayUnmountedFiberAnalysis(results: any) {
  const beforeFiberAnalysis = results.beforeAnalysis?.unmountedFiberAnalysis;
  const afterFiberAnalysis = results.afterAnalysis?.unmountedFiberAnalysis;
  
  if (!beforeFiberAnalysis && !afterFiberAnalysis) {
    return; // Skip if no fiber analysis
  }
  
  console.log('🧬 UNMOUNTED FIBER NODE ANALYSIS');
  console.log('===============================');
  
  // Check if React app
  const analysis = afterFiberAnalysis || beforeFiberAnalysis;
  if (!analysis.isReactApp) {
    console.log('🚫 No React application detected in heap snapshot');
    console.log('');
    return;
  }
  
  // Before/After comparison
  if (beforeFiberAnalysis && afterFiberAnalysis) {
    const fibersBefore = beforeFiberAnalysis.totalUnmountedFibers;
    const fibersAfter = afterFiberAnalysis.totalUnmountedFibers;
    const memoryBefore = beforeFiberAnalysis.totalRetainedMemory;
    const memoryAfter = afterFiberAnalysis.totalRetainedMemory;
    const fiberGrowth = fibersAfter - fibersBefore;
    const memoryGrowth = memoryAfter - memoryBefore;
    
    console.log(`Unmounted Fibers: ${fibersBefore} → ${fibersAfter} (${fiberGrowth > 0 ? '+' : ''}${fiberGrowth})`);
    console.log(`Retained Memory: ${formatBytes(memoryBefore)} → ${formatBytes(memoryAfter)} (${formatBytes(memoryGrowth)})`);
    console.log(`Detached Fibers: ${beforeFiberAnalysis.detachedFiberCount} → ${afterFiberAnalysis.detachedFiberCount}`);
    
    if (fiberGrowth > 5 || memoryGrowth > 5 * 1024 * 1024) {
      console.log('⚠️ Significant Fiber node growth detected - potential React memory leak!');
    }
  } else {
    // Show single snapshot analysis
    console.log(analysis.summary);
    console.log(`Total Unmounted Fibers: ${analysis.totalUnmountedFibers}`);
    console.log(`Retained Memory: ${formatBytes(analysis.totalRetainedMemory)}`);
    console.log(`Detached Fibers: ${analysis.detachedFiberCount}`);
    if (analysis.averageFiberSize > 0) {
      console.log(`Average Fiber Size: ${formatBytes(analysis.averageFiberSize)}`);
    }
  }
  console.log('');
  
  // Show critical unmounted fibers
  if (analysis.unmountedFibers && analysis.unmountedFibers.length > 0) {
    const criticalFibers = analysis.unmountedFibers.filter((f: any) => f.severity === 'CRITICAL');
    if (criticalFibers.length > 0) {
      console.log('🚨 CRITICAL UNMOUNTED FIBERS:');
      criticalFibers.slice(0, 5).forEach((fiber: any, index: number) => {
        console.log(`${index + 1}. 🔥 ${fiber.componentName}`);
        console.log(`   Retained Size: ${formatBytes(fiber.retainedSize)}`);
        console.log(`   State Size: ${formatBytes(fiber.stateSize)} | Props Size: ${formatBytes(fiber.propsSize)}`);
        console.log(`   Detached: ${fiber.isDetached ? 'Yes' : 'No'} | Has Children: ${fiber.hasChildren ? 'Yes' : 'No'}`);
        console.log(`   Confidence: ${fiber.confidence}%`);
        
        if (fiber.recommendations && fiber.recommendations.length > 0) {
          console.log(`   Fix: ${fiber.recommendations[0]}`);
        }
        console.log('');
      });
    } else {
      // Show top unmounted fibers by size
      const topFibers = analysis.unmountedFibers.slice(0, 5);
      if (topFibers.length > 0) {
        console.log('📊 TOP UNMOUNTED FIBERS BY SIZE:');
        topFibers.forEach((fiber: any, index: number) => {
          const sizeIcon = fiber.severity === 'HIGH' ? '🔴' : fiber.severity === 'MEDIUM' ? '🟡' : '🟢';
          
          console.log(`${index + 1}. ${sizeIcon} ${fiber.componentName}`);
          console.log(`   Size: ${formatBytes(fiber.retainedSize)} | Confidence: ${fiber.confidence}%`);
          console.log(`   Detached: ${fiber.isDetached ? 'Yes' : 'No'} | Depth: ${fiber.depth}`);
        });
        console.log('');
      }
    }
  }
  
  // Show severity breakdown
  if (analysis.severityBreakdown) {
    const breakdown = analysis.severityBreakdown;
    const hasSignificantIssues = breakdown.CRITICAL > 0 || breakdown.HIGH > 0;
    
    if (hasSignificantIssues) {
      console.log('📊 FIBER SEVERITY BREAKDOWN:');
      if (breakdown.CRITICAL > 0) console.log(`• 🔥 Critical: ${breakdown.CRITICAL} fibers (>10MB or detached)`);
      if (breakdown.HIGH > 0) console.log(`• 🔴 High: ${breakdown.HIGH} fibers (5-10MB retained)`);
      if (breakdown.MEDIUM > 0) console.log(`• 🟡 Medium: ${breakdown.MEDIUM} fibers (1-5MB retained)`);
      if (breakdown.LOW > 0) console.log(`• 🟢 Low: ${breakdown.LOW} fibers (<1MB retained)`);
      console.log('');
    }
  }
  
  // Show fibers by component
  if (analysis.fibersByComponent && analysis.fibersByComponent.size > 0) {
    const problematicComponents = Array.from(analysis.fibersByComponent.entries())
      .filter((entry: any) => entry[1].length > 2)
      .sort((a: any, b: any) => b[1].length - a[1].length)
      .slice(0, 5);
    
    if (problematicComponents.length > 0) {
      console.log('🎯 COMPONENTS WITH MULTIPLE UNMOUNTED FIBERS:');
      problematicComponents.forEach((entry: any) => {
        const [componentName, fibers] = entry;
        const totalSize = fibers.reduce((sum: number, f: any) => sum + f.retainedSize, 0);
        console.log(`• ${componentName}: ${fibers.length} unmounted fibers (${formatBytes(totalSize)})`);
      });
      console.log('');
    }
  }
  
  // Show largest unmounted fiber
  if (analysis.largestFiber) {
    const largest = analysis.largestFiber;
    if (largest.retainedSize > 1024 * 1024) {
      console.log('🔍 LARGEST UNMOUNTED FIBER:');
      console.log(`• Component: ${largest.componentName}`);
      console.log(`• Size: ${formatBytes(largest.retainedSize)}`);
      console.log(`• Severity: ${largest.severity} | Confidence: ${largest.confidence}%`);
      console.log(`• Detached: ${largest.isDetached ? 'Yes' : 'No'}`);
      console.log('');
    }
  }
  
  // Show insights
  if (analysis.insights && analysis.insights.length > 0) {
    console.log('💡 UNMOUNTED FIBER INSIGHTS:');
    analysis.insights.forEach((insight: string) => {
      console.log(`• ${insight}`);
    });
    console.log('');
  }
  
  // Show recommendations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    console.log('🛠️ FIBER CLEANUP RECOMMENDATIONS:');
    analysis.recommendations.forEach((rec: string) => {
      console.log(`• ${rec}`);
    });
    console.log('');
  }
}

function displayReactComponentHookAnalysis(results: any) {
  const beforeReactAnalysis = results.beforeAnalysis?.reactAnalysis;
  const afterReactAnalysis = results.afterAnalysis?.reactAnalysis;
  
  if (!beforeReactAnalysis && !afterReactAnalysis) {
    return; // Skip if no React analysis
  }
  
  console.log('⚛️  REACT COMPONENT & HOOK ANALYSIS');
  console.log('===================================');
  
  // Before/After comparison
  if (beforeReactAnalysis && afterReactAnalysis) {
    const componentGrowth = afterReactAnalysis.totalComponents - beforeReactAnalysis.totalComponents;
    const memoryGrowth = afterReactAnalysis.totalReactMemory - beforeReactAnalysis.totalReactMemory;
    
    console.log(`Components: ${beforeReactAnalysis.totalComponents} → ${afterReactAnalysis.totalComponents} (${componentGrowth > 0 ? '+' : ''}${componentGrowth})`);
    console.log(`Fiber Nodes: ${beforeReactAnalysis.totalFiberNodes} → ${afterReactAnalysis.totalFiberNodes}`);
    console.log(`React Memory: ${formatBytes(beforeReactAnalysis.totalReactMemory)} → ${formatBytes(afterReactAnalysis.totalReactMemory)} (${formatBytes(memoryGrowth)})`);
    
    if (componentGrowth > 10) {
      console.log('⚠️  Significant component growth detected - potential React memory leak!');
    }
  } else {
    // Show single snapshot analysis
    const analysis = afterReactAnalysis || beforeReactAnalysis;
    console.log(`Total Components: ${analysis.totalComponents}`);
    console.log(`Total Fiber Nodes: ${analysis.totalFiberNodes}`);
    console.log(`React Memory Usage: ${formatBytes(analysis.totalReactMemory)}`);
    console.log(`Minified React: ${analysis.isMinified ? 'Yes' : 'No'}`);
  }
  console.log('');
  
  // Show significant components from after analysis
  const analysis = afterReactAnalysis || beforeReactAnalysis;
  if (analysis.significantComponents && analysis.significantComponents.length > 0) {
    console.log('🎯 SIGNIFICANT REACT COMPONENTS:');
    analysis.significantComponents.slice(0, 5).forEach((comp: any, index: number) => {
      const sizeIcon = comp.significance === 'HIGH' ? '🔴' : comp.significance === 'MEDIUM' ? '🟡' : '🟢';
      
      console.log(`${index + 1}. ${sizeIcon} ${comp.name}`);
      console.log(`   Instances: ${comp.instanceCount} | Total Size: ${formatBytes(comp.totalSize)}`);
      console.log(`   Avg Size: ${formatBytes(comp.averageInstanceSize)} | Hooks: ${comp.hooks.length}`);
      console.log(`   Props: ${formatBytes(comp.propsSize)} | State: ${formatBytes(comp.stateSize)}`);
      
      if (comp.hooks.length > 0) {
        const topHook = comp.hooks.reduce((max: any, hook: any) => hook.size > max.size ? hook : max);
        console.log(`   Largest Hook: ${topHook.type} (${formatBytes(topHook.size)})`);
      }
      
      console.log(`   Confidence: ${comp.confidence}%`);
    });
    console.log('');
  }
  
  // Show hook breakdown
  if (analysis.hookBreakdown && Object.keys(analysis.hookBreakdown).length > 0) {
    console.log('🪝 HOOK USAGE BREAKDOWN:');
    Object.entries(analysis.hookBreakdown)
      .sort(([,a]: any, [,b]: any) => b.totalSize - a.totalSize)
      .slice(0, 8)
      .forEach(([hookType, stats]: any) => {
        console.log(`• ${hookType}: ${stats.count} instances, ${formatBytes(stats.totalSize)}`);
      });
    console.log('');
  }
  
  // Show memory distribution
  if (analysis.memoryDistribution && analysis.totalReactMemory > 0) {
    const dist = analysis.memoryDistribution;
    console.log('📊 REACT MEMORY DISTRIBUTION:');
    console.log(`• Components: ${formatBytes(dist.componentMemory || 0)} (${(dist.componentPercentage || 0).toFixed(1)}%)`);
    console.log(`• Props: ${formatBytes(dist.propsMemory || 0)} (${(dist.propsPercentage || 0).toFixed(1)}%)`);
    console.log(`• State: ${formatBytes(dist.stateMemory || 0)} (${(dist.statePercentage || 0).toFixed(1)}%)`);
    console.log(`• Hooks: ${formatBytes(dist.hookMemory || 0)} (${(dist.hookPercentage || 0).toFixed(1)}%)`);
    console.log(`• Children: ${formatBytes(dist.childrenMemory || 0)} (${(dist.childrenPercentage || 0).toFixed(1)}%)`);
    console.log('');
  } else if (analysis.totalReactMemory === 0) {
    console.log('📊 No React components detected in this heap snapshot');
    console.log('');
  }
  
  // Show recommendations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    console.log('💡 REACT OPTIMIZATION RECOMMENDATIONS:');
    analysis.recommendations.forEach((rec: string) => {
      console.log(`• ${rec}`);
    });
    console.log('');
  }
}

function displayObjectUnboundGrowthAnalysis(results: any) {
  const objectUnboundGrowthAnalysis = results.objectUnboundGrowthAnalysis;
  
  if (!objectUnboundGrowthAnalysis) {
    console.log('📈 OBJECT UNBOUND GROWTH ANALYSIS');
    console.log('=================================');
    console.log('⚠️ Analysis not available - need multiple snapshots');
    console.log('');
    return;
  }
  
  console.log('📈 OBJECT UNBOUND GROWTH ANALYSIS');
  console.log('=================================');
  console.log(objectUnboundGrowthAnalysis.summary);
  console.log(`Objects Tracked: ${objectUnboundGrowthAnalysis.totalObjectsTracked}`);
  console.log(`Snapshots Analyzed: ${objectUnboundGrowthAnalysis.snapshotsAnalyzed}`);
  
  if (objectUnboundGrowthAnalysis.totalGrowthDetected > 0) {
    console.log(`Total Growth Detected: ${formatBytes(objectUnboundGrowthAnalysis.totalGrowthDetected)}`);
  }
  console.log('');
  
  // Show severity breakdown if we have significant growth
  const significantObjects = objectUnboundGrowthAnalysis.significantGrowthObjects || [];
  if (significantObjects.length > 0) {
    console.log('📊 GROWTH SEVERITY BREAKDOWN:');
    const breakdown = objectUnboundGrowthAnalysis.severityBreakdown;
    if (breakdown.CRITICAL > 0) console.log(`• 🔥 Critical: ${breakdown.CRITICAL} objects (>10MB growth)`);
    if (breakdown.HIGH > 0) console.log(`• 🔴 High: ${breakdown.HIGH} objects (5-10MB growth)`);
    if (breakdown.MEDIUM > 0) console.log(`• 🟡 Medium: ${breakdown.MEDIUM} objects (1-5MB growth)`);
    if (breakdown.LOW > 0) console.log(`• 🟢 Low: ${breakdown.LOW} objects (100KB-1MB growth)`);
    console.log('');
  }
  
  // Show critical growing objects
  const criticalObjects = significantObjects.filter((obj: any) => obj.severity === 'CRITICAL');
  if (criticalObjects.length > 0) {
    console.log('🚨 CRITICAL GROWING OBJECTS:');
    criticalObjects.slice(0, 5).forEach((obj: any) => {
      console.log(`🔥 ${obj.objectName} (${obj.objectType})`);
      console.log(`   Growth: ${formatBytes(obj.startSize)} → ${formatBytes(obj.currentSize)} (+${formatBytes(obj.totalGrowth)})`);
      console.log(`   Pattern: ${obj.growthPattern} | Rate: +${formatBytes(obj.growthRate)}/snapshot`);
      console.log(`   Confidence: ${obj.confidence}% | Still Exists: ${obj.lastSeen ? 'Yes' : 'No'}`);
      
      // Show top recommendation
      if (obj.recommendations && obj.recommendations.length > 0) {
        console.log(`   Fix: ${obj.recommendations[0]}`);
      }
      console.log('');
    });
  }
  
  // Show monotonic growth objects
  const monotonicObjects = objectUnboundGrowthAnalysis.monotonicallyGrowingObjects || [];
  if (monotonicObjects.length > 0 && criticalObjects.length === 0) {
    console.log('📈 MONOTONIC GROWTH OBJECTS:');
    monotonicObjects.slice(0, 5).forEach((obj: any) => {
      const sizeIcon = obj.severity === 'HIGH' ? '🔴' : obj.severity === 'MEDIUM' ? '🟡' : '🟢';
      
      console.log(`${sizeIcon} ${obj.objectName} (${obj.objectType})`);
      console.log(`   Growth: ${formatBytes(obj.startSize)} → ${formatBytes(obj.currentSize)} (+${obj.growthPercentage.toFixed(1)}%)`);
      console.log(`   Snapshots: ${obj.snapshots} | Pattern: Always Increasing`);
      console.log(`   Node ID: @${obj.nodeId} (use inspect-object for details)`);
    });
    console.log('');
  }
  
  // Show top growing objects by total growth
  if (significantObjects.length > 0) {
    const topGrowing = significantObjects.slice(0, 8);
    if (topGrowing.some((obj: any) => obj.totalGrowth > 1024 * 1024)) { // Only show if >1MB growth
      console.log('📊 TOP GROWING OBJECTS BY SIZE:');
      topGrowing
        .filter((obj: any) => obj.totalGrowth > 1024 * 1024)
        .slice(0, 5)
        .forEach((obj: any, index: number) => {
          const growthIcon = obj.severity === 'CRITICAL' ? '🔥' : 
                           obj.severity === 'HIGH' ? '🔴' : 
                           obj.severity === 'MEDIUM' ? '🟡' : '🟢';
          
          console.log(`${index + 1}. ${growthIcon} ${obj.objectName}`);
          console.log(`   Total Growth: +${formatBytes(obj.totalGrowth)} (${obj.growthPercentage.toFixed(1)}% increase)`);
          console.log(`   Current Size: ${formatBytes(obj.currentSize)} | Peak: ${formatBytes(obj.peakSize)}`);
          console.log(`   Pattern: ${obj.growthPattern} | Rate: +${formatBytes(obj.growthRate)}/snapshot`);
        });
      console.log('');
    }
  }
  
  // Show growth pattern breakdown  
  if (objectUnboundGrowthAnalysis.growthPatternBreakdown) {
    const patterns = objectUnboundGrowthAnalysis.growthPatternBreakdown;
    const hasSignificantPatterns = patterns.MONOTONIC > 0 || patterns.SIGNIFICANT > 0;
    
    if (hasSignificantPatterns) {
      console.log('📊 GROWTH PATTERNS:');
      if (patterns.MONOTONIC > 0) console.log(`• 📈 Monotonic: ${patterns.MONOTONIC} objects (always increasing)`);
      if (patterns.SIGNIFICANT > 0) console.log(`• 📊 Significant: ${patterns.SIGNIFICANT} objects (large growth with fluctuation)`);
      if (patterns.FLUCTUATING > 0) console.log(`• 🔄 Fluctuating: ${patterns.FLUCTUATING} objects (growing but with decreases)`);
      console.log('');
    }
  }
  
  // Show insights
  if (objectUnboundGrowthAnalysis.insights && objectUnboundGrowthAnalysis.insights.length > 0) {
    console.log('💡 OBJECT GROWTH INSIGHTS:');
    objectUnboundGrowthAnalysis.insights.forEach((insight: string) => {
      console.log(`• ${insight}`);
    });
    console.log('');
  }
  
  // Show recommendations
  if (objectUnboundGrowthAnalysis.recommendations && objectUnboundGrowthAnalysis.recommendations.length > 0) {
    console.log('🛠️ OBJECT GROWTH RECOMMENDATIONS:');
    objectUnboundGrowthAnalysis.recommendations.forEach((rec: string) => {
      console.log(`• ${rec}`);
    });
    console.log('');
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
