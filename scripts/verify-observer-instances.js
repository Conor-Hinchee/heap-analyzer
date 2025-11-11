#!/usr/bin/env node

/**
 * Verify Observer Instances - More accurate detection
 * Focuses on actual object instances vs string mentions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeObserverInstances(filePath, label) {
  console.log(`\n🔍 Analyzing ${label}...`);
  
  const stats = {
    // Look for actual constructor patterns
    constructorCalls: 0,
    // Look for class/constructor definitions
    classDefinitions: 0,
    // Look for native code (actual browser implementations)
    nativeObservers: 0,
    // Total string matches (includes false positives)
    totalMatches: 0,
    // Specific patterns
    mutationObserverObjects: 0,
    intersectionObserverObjects: 0,
    resizeObserverObjects: 0,
    performanceObserverObjects: 0
  };
  
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let buffer = '';
    let inNodesSection = false;
    
    stream.on('data', (chunk) => {
      buffer += chunk;
      
      // Count total string matches
      stats.totalMatches += (buffer.match(/PerformanceObserver/gi) || []).length;
      
      // Look for actual object type indicators in heap
      // These patterns are more likely to be real instances:
      
      // Pattern: "type":"object" near "PerformanceObserver"
      const objectTypePattern = /"type":"object"[^}]{0,200}"name":"[^"]*PerformanceObserver/g;
      stats.performanceObserverObjects += (buffer.match(objectTypePattern) || []).length;
      
      // Pattern: Native code implementations
      const nativePattern = /"name":"PerformanceObserver"[^}]{0,100}"type":"native"/g;
      stats.nativeObservers += (buffer.match(nativePattern) || []).length;
      
      // Pattern: Constructor/class in nodes section
      const constructorPattern = /"type":"hidden class"[^}]{0,200}Observer/g;
      stats.classDefinitions += (buffer.match(constructorPattern) || []).length;
      
      // Keep buffer manageable
      if (buffer.length > 200000) {
        buffer = buffer.slice(-100000);
      }
    });
    
    stream.on('end', () => {
      resolve(stats);
    });
    
    stream.on('error', reject);
  });
}

async function main() {
  const beforePath = path.join(__dirname, '../snapshots/before.heapsnapshot');
  const afterPath = path.join(__dirname, '../snapshots/after.heapsnapshot');
  
  console.log('🧪 OBSERVER FALSE POSITIVE ANALYSIS');
  console.log('=' .repeat(70));
  
  const beforeStats = await analyzeObserverInstances(beforePath, 'BEFORE');
  const afterStats = await analyzeObserverInstances(afterPath, 'AFTER');
  
  console.log('\n📊 RAW STRING MATCHES (includes false positives):');
  console.log('=' .repeat(70));
  console.log(`Total "PerformanceObserver" strings:`);
  console.log(`  Before: ${beforeStats.totalMatches}`);
  console.log(`  After:  ${afterStats.totalMatches}`);
  console.log(`  Growth: +${afterStats.totalMatches - beforeStats.totalMatches} (+${(((afterStats.totalMatches - beforeStats.totalMatches) / beforeStats.totalMatches) * 100).toFixed(1)}%)`);
  
  console.log('\n🎯 OBJECT TYPE MATCHES (likely real instances):');
  console.log('=' .repeat(70));
  console.log(`PerformanceObserver objects:`);
  console.log(`  Before: ${beforeStats.performanceObserverObjects}`);
  console.log(`  After:  ${afterStats.performanceObserverObjects}`);
  console.log(`  Growth: +${afterStats.performanceObserverObjects - beforeStats.performanceObserverObjects}`);
  
  console.log('\n🔧 NATIVE CODE IMPLEMENTATIONS:');
  console.log('=' .repeat(70));
  console.log(`Native PerformanceObserver:`);
  console.log(`  Before: ${beforeStats.nativeObservers}`);
  console.log(`  After:  ${afterStats.nativeObservers}`);
  console.log(`  Growth: +${afterStats.nativeObservers - beforeStats.nativeObservers}`);
  
  console.log('\n📐 CLASS DEFINITIONS:');
  console.log('=' .repeat(70));
  console.log(`Observer class definitions:`);
  console.log(`  Before: ${beforeStats.classDefinitions}`);
  console.log(`  After:  ${afterStats.classDefinitions}`);
  console.log(`  Growth: +${afterStats.classDefinitions - beforeStats.classDefinitions}`);
  
  console.log('\n💡 INTERPRETATION:');
  console.log('=' .repeat(70));
  
  const stringGrowth = afterStats.totalMatches - beforeStats.totalMatches;
  const objectGrowth = afterStats.performanceObserverObjects - beforeStats.performanceObserverObjects;
  const nativeGrowth = afterStats.nativeObservers - beforeStats.nativeObservers;
  
  if (stringGrowth > 50 && objectGrowth > 5) {
    console.log('🔴 HIGH CONFIDENCE LEAK:');
    console.log('   Both string matches AND object type matches are growing.');
    console.log('   This indicates real PerformanceObserver instances accumulating.');
  } else if (stringGrowth > 50 && objectGrowth <= 2) {
    console.log('🟡 POSSIBLE FALSE POSITIVE:');
    console.log('   String matches growing but object types stable.');
    console.log('   Could be code strings, not actual instances.');
  } else if (stringGrowth <= 10) {
    console.log('🟢 LIKELY FALSE POSITIVE:');
    console.log('   Minimal growth detected.');
    console.log('   Original detection may have been too sensitive.');
  }
  
  if (nativeGrowth > 10) {
    console.log('\n⚠️  NATIVE OBSERVER GROWTH:');
    console.log('   Native implementations growing = REAL LEAK confirmed!');
  }
  
  console.log('\n📋 RECOMMENDATION:');
  console.log('=' .repeat(70));
  
  const growthRatio = objectGrowth / stringGrowth;
  console.log(`Growth correlation: ${(growthRatio * 100).toFixed(1)}%`);
  
  if (growthRatio > 0.3) {
    console.log('✅ High correlation between strings and objects.');
    console.log('   The leak is REAL. Focus on finding observer creation code.');
  } else if (growthRatio < 0.1 && growthRatio > 0) {
    console.log('⚠️  Low correlation between strings and objects.');
    console.log('   May have some false positives, but growth is still concerning.');
  } else {
    console.log('🤔 Unclear pattern.');
    console.log('   Need to investigate further with Chrome DevTools directly.');
  }
  
  console.log('\n✅ Analysis complete!\n');
}

main().catch(console.error);
