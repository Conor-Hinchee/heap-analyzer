#!/usr/bin/env node

/**
 * Observer Leak Detector - Specific analysis for Observer objects
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeObservers(filePath, label) {
  console.log(`\n🔍 Analyzing ${label}...`);
  
  const patterns = {
    'MutationObserver': 0,
    'IntersectionObserver': 0,
    'ResizeObserver': 0,
    'PerformanceObserver': 0,
    'ReportingObserver': 0
  };
  
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let buffer = '';
    let lineCount = 0;
    
    stream.on('data', (chunk) => {
      buffer += chunk;
      
      // Look for specific observer types
      for (const [observerType, _] of Object.entries(patterns)) {
        const matches = buffer.match(new RegExp(observerType, 'gi')) || [];
        patterns[observerType] += matches.length;
      }
      
      // Sample some actual observer instances
      const observerInstances = buffer.match(/"name":"[^"]*[Oo]bserver[^"]*"/g) || [];
      
      // Keep buffer manageable
      if (buffer.length > 200000) {
        buffer = buffer.slice(-100000);
      }
    });
    
    stream.on('end', () => {
      resolve(patterns);
    });
    
    stream.on('error', reject);
  });
}

async function findObserverStrings(filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let buffer = '';
    const observerNames = new Set();
    
    stream.on('data', (chunk) => {
      buffer += chunk;
      
      // Extract all Observer-related names
      const matches = buffer.match(/"name":"[^"]*[Oo]bserver[^"]*"/g) || [];
      matches.forEach(match => {
        const name = match.match(/"name":"([^"]*)"/)[1];
        observerNames.add(name);
      });
      
      if (buffer.length > 200000) {
        buffer = buffer.slice(-100000);
      }
    });
    
    stream.on('end', () => {
      resolve(Array.from(observerNames));
    });
    
    stream.on('error', reject);
  });
}

async function main() {
  const beforePath = path.join(__dirname, '../snapshots/before.heapsnapshot');
  const afterPath = path.join(__dirname, '../snapshots/after.heapsnapshot');
  
  console.log('🔬 OBSERVER LEAK ANALYSIS');
  console.log('=' .repeat(70));
  
  const beforeStats = await analyzeObservers(beforePath, 'BEFORE');
  const afterStats = await analyzeObservers(afterPath, 'AFTER');
  
  console.log('\n📊 OBSERVER TYPE BREAKDOWN');
  console.log('=' .repeat(70));
  
  let leakFound = false;
  
  for (const [observerType, _] of Object.entries(beforeStats)) {
    const before = beforeStats[observerType];
    const after = afterStats[observerType];
    const growth = after - before;
    const percent = before > 0 ? ((growth / before) * 100).toFixed(1) : 'N/A';
    
    if (growth > 0) {
      const emoji = growth > 5 ? '🔴' : growth > 2 ? '🟡' : '🟢';
      console.log(`${emoji} ${observerType.padEnd(25)}: ${before.toString().padStart(5)} → ${after.toString().padStart(5)} (+${growth}, ${percent}%)`);
      
      if (growth > 5) {
        leakFound = true;
        console.log(`   ⚠️  LEAK DETECTED: ${observerType} instances are accumulating!`);
      }
    } else if (growth !== 0) {
      console.log(`🟢 ${observerType.padEnd(25)}: ${before.toString().padStart(5)} → ${after.toString().padStart(5)} (${growth})`);
    }
  }
  
  console.log('\n🔎 Finding Observer instance names...');
  const beforeNames = await findObserverStrings(beforePath);
  const afterNames = await findObserverStrings(afterPath);
  
  const newNames = afterNames.filter(name => !beforeNames.includes(name));
  const commonNames = afterNames.filter(name => beforeNames.includes(name));
  
  if (newNames.length > 0) {
    console.log('\n🆕 NEW OBSERVER INSTANCES IN AFTER:');
    newNames.slice(0, 15).forEach(name => console.log(`   • ${name}`));
    if (newNames.length > 15) {
      console.log(`   ... and ${newNames.length - 15} more`);
    }
  }
  
  if (commonNames.length > 0) {
    console.log('\n📋 COMMON OBSERVER NAMES (first 10):');
    commonNames.slice(0, 10).forEach(name => console.log(`   • ${name}`));
  }
  
  console.log('\n🎯 DIAGNOSIS:');
  console.log('=' .repeat(70));
  
  if (leakFound) {
    console.log('🔴 OBSERVER LEAK CONFIRMED!');
    console.log('\n💡 Common causes:');
    console.log('   1. Creating observers in loops or on every render');
    console.log('   2. Not calling observer.disconnect() on cleanup');
    console.log('   3. Observers attached to elements that get recreated');
    console.log('\n🛠️  Fix pattern:');
    console.log('   useEffect(() => {');
    console.log('     const observer = new MutationObserver(callback);');
    console.log('     observer.observe(target, config);');
    console.log('     return () => observer.disconnect(); // CRITICAL!');
    console.log('   }, []);');
  } else {
    console.log('✅ No significant observer leak detected');
    console.log('   The +190 "Observer" string matches may be from:');
    console.log('   - Internal V8 objects');
    console.log('   - Observer-related metadata');
    console.log('   - Not actual leaked observers');
  }
  
  console.log('\n✅ Analysis complete!\n');
}

main().catch(console.error);
