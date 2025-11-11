#!/usr/bin/env node

/**
 * Quick Timer Check - Lightweight analysis
 */

import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeSnapshot(filePath, label) {
  console.log(`\n📊 Analyzing ${label}...`);
  
  const stats = {
    timers: 0,
    intervals: 0,
    timeouts: 0,
    animationFrames: 0,
    microtasks: 0,
    weakArrays: 0,
    closures: 0,
    promises: 0,
    observers: 0
  };
  
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let buffer = '';
    
    stream.on('data', (chunk) => {
      buffer += chunk;
      
      // Count patterns (case insensitive)
      stats.timers += (buffer.match(/timer/gi) || []).length;
      stats.intervals += (buffer.match(/interval/gi) || []).length;
      stats.timeouts += (buffer.match(/timeout/gi) || []).length;
      stats.animationFrames += (buffer.match(/animationframe|requestanimationframe/gi) || []).length;
      stats.microtasks += (buffer.match(/microtask/gi) || []).length;
      stats.weakArrays += (buffer.match(/WeakArrayList/gi) || []).length;
      stats.closures += (buffer.match(/"type":"closure"/gi) || []).length;
      stats.promises += (buffer.match(/Promise/gi) || []).length;
      stats.observers += (buffer.match(/Observer/gi) || []).length;
      
      // Keep only last 100KB in buffer to prevent memory issues
      if (buffer.length > 100000) {
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
  
  console.log('🔍 Quick Timer Leak Analysis');
  console.log('=' .repeat(60));
  
  const beforeStats = await analyzeSnapshot(beforePath, 'BEFORE snapshot');
  const afterStats = await analyzeSnapshot(afterPath, 'AFTER snapshot');
  
  console.log('\n📊 COMPARISON RESULTS');
  console.log('=' .repeat(60));
  
  const patterns = Object.keys(beforeStats);
  
  patterns.forEach(pattern => {
    const before = beforeStats[pattern];
    const after = afterStats[pattern];
    const growth = after - before;
    const percent = before > 0 ? ((growth / before) * 100).toFixed(1) : 'N/A';
    
    if (growth !== 0) {
      const emoji = growth > 0 ? '🔴' : '🟢';
      const sign = growth > 0 ? '+' : '';
      const label = pattern.charAt(0).toUpperCase() + pattern.slice(1);
      
      console.log(`${emoji} ${label.padEnd(20)}: ${before.toString().padStart(6)} → ${after.toString().padStart(6)} (${sign}${growth}, ${percent}%)`);
      
      if (growth > 0 && growth > 10) {
        console.log(`   ⚠️  Significant growth detected!`);
      }
    }
  });
  
  console.log('\n🎯 VERDICT:');
  console.log('=' .repeat(60));
  
  if (afterStats.intervals > beforeStats.intervals + 5) {
    console.log('🔴 LIKELY: setInterval leak detected');
    console.log('   → Search your code for setInterval() without clearInterval()');
  }
  
  if (afterStats.timeouts > beforeStats.timeouts + 10) {
    console.log('🔴 LIKELY: setTimeout leak detected');
    console.log('   → Check for recursive setTimeout() calls');
  }
  
  if (afterStats.animationFrames > beforeStats.animationFrames + 5) {
    console.log('🔴 LIKELY: requestAnimationFrame leak detected');
    console.log('   → Look for animation loops without cancelAnimationFrame()');
  }
  
  if (afterStats.microtasks > beforeStats.microtasks + 50) {
    console.log('🔴 LIKELY: Microtask/Promise accumulation');
    console.log('   → Check for promise chains or async operations');
  }
  
  if (afterStats.weakArrays > beforeStats.weakArrays + 5) {
    console.log('🟡 POSSIBLE: Event listener or timer accumulation');
    console.log('   → WeakArrayList growth often indicates listener leaks');
  }
  
  if (afterStats.closures > beforeStats.closures + 100) {
    console.log('🔴 CONFIRMED: Closure retention');
    console.log('   → Callbacks/event handlers not being cleaned up');
  }
  
  console.log('\n✅ Analysis complete!\n');
}

main().catch(console.error);
