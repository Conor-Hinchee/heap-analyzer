#!/usr/bin/env node

/**
 * Closure Leak Detector
 * Identifies patterns in heap snapshots that indicate closure retention issues
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeClosureLeaks(filePath, label) {
  console.log(`\n🔍 Analyzing ${label} for closure patterns...`);
  
  const patterns = {
    // Closure indicators
    closures: 0,
    boundFunctions: 0,
    
    // Event listener patterns (major closure source)
    addEventListener: 0,
    removeEventListener: 0,
    onClick: 0,
    onEvent: 0,
    
    // Timer patterns (create closures)
    setInterval: 0,
    setTimeout: 0,
    clearInterval: 0,
    clearTimeout: 0,
    
    // React patterns
    useEffect: 0,
    useCallback: 0,
    useMemo: 0,
    useState: 0,
    
    // Common closure creators
    map: 0,
    filter: 0,
    forEach: 0,
    reduce: 0,
    
    // Callback patterns
    callback: 0,
    handler: 0,
    listener: 0
  };
  
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let buffer = '';
    
    stream.on('data', (chunk) => {
      buffer += chunk;
      
      // Count patterns
      patterns.closures += (buffer.match(/"type":"closure"/g) || []).length;
      patterns.boundFunctions += (buffer.match(/"name":"bound /g) || []).length;
      
      patterns.addEventListener += (buffer.match(/addEventListener/gi) || []).length;
      patterns.removeEventListener += (buffer.match(/removeEventListener/gi) || []).length;
      patterns.onClick += (buffer.match(/onClick|on[A-Z][a-z]+/g) || []).length;
      
      patterns.setInterval += (buffer.match(/setInterval/gi) || []).length;
      patterns.setTimeout += (buffer.match(/setTimeout/gi) || []).length;
      patterns.clearInterval += (buffer.match(/clearInterval/gi) || []).length;
      patterns.clearTimeout += (buffer.match(/clearTimeout/gi) || []).length;
      
      patterns.useEffect += (buffer.match(/useEffect/g) || []).length;
      patterns.useCallback += (buffer.match(/useCallback/g) || []).length;
      patterns.useMemo += (buffer.match(/useMemo/g) || []).length;
      patterns.useState += (buffer.match(/useState/g) || []).length;
      
      patterns.map += (buffer.match(/\.map\(/g) || []).length;
      patterns.filter += (buffer.match(/\.filter\(/g) || []).length;
      patterns.forEach += (buffer.match(/\.forEach\(/g) || []).length;
      patterns.reduce += (buffer.match(/\.reduce\(/g) || []).length;
      
      patterns.callback += (buffer.match(/callback/gi) || []).length;
      patterns.handler += (buffer.match(/handler/gi) || []).length;
      patterns.listener += (buffer.match(/listener/gi) || []).length;
      
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

async function main() {
  const beforePath = path.join(__dirname, '../snapshots/before.heapsnapshot');
  const afterPath = path.join(__dirname, '../snapshots/after.heapsnapshot');
  
  console.log('🔒 CLOSURE LEAK ANALYSIS');
  console.log('=' .repeat(70));
  
  const before = await analyzeClosureLeaks(beforePath, 'BEFORE');
  const after = await analyzeClosureLeaks(afterPath, 'AFTER');
  
  console.log('\n📊 CLOSURE & BOUND FUNCTION ANALYSIS:');
  console.log('=' .repeat(70));
  
  const closureGrowth = after.closures - before.closures;
  const boundGrowth = after.boundFunctions - before.boundFunctions;
  
  console.log(`Closures:         ${before.closures.toString().padStart(6)} → ${after.closures.toString().padStart(6)} (${closureGrowth >= 0 ? '+' : ''}${closureGrowth})`);
  console.log(`Bound Functions:  ${before.boundFunctions.toString().padStart(6)} → ${after.boundFunctions.toString().padStart(6)} (${boundGrowth >= 0 ? '+' : ''}${boundGrowth})`);
  
  if (closureGrowth > 100) {
    console.log('\n🔴 CRITICAL: +' + closureGrowth + ' closures retained!');
  }
  
  console.log('\n🎯 EVENT LISTENER ANALYSIS:');
  console.log('=' .repeat(70));
  
  const addGrowth = after.addEventListener - before.addEventListener;
  const removeGrowth = after.removeEventListener - before.removeEventListener;
  const ratio = removeGrowth / addGrowth;
  
  console.log(`addEventListener:    ${before.addEventListener.toString().padStart(6)} → ${after.addEventListener.toString().padStart(6)} (${addGrowth >= 0 ? '+' : ''}${addGrowth})`);
  console.log(`removeEventListener: ${before.removeEventListener.toString().padStart(6)} → ${after.removeEventListener.toString().padStart(6)} (${removeGrowth >= 0 ? '+' : ''}${removeGrowth})`);
  console.log(`onClick patterns:    ${before.onClick.toString().padStart(6)} → ${after.onClick.toString().padStart(6)} (${after.onClick - before.onClick >= 0 ? '+' : ''}${after.onClick - before.onClick})`);
  
  if (addGrowth > 0 && removeGrowth <= 0) {
    console.log('\n🔴 LEAK DETECTED: Adding listeners but NOT removing them!');
    console.log('   Action: Search for addEventListener without removeEventListener');
  } else if (ratio < 0.5 && addGrowth > 10) {
    console.log('\n🟡 WARNING: More adds than removes');
    console.log('   Cleanup ratio: ' + (ratio * 100).toFixed(1) + '%');
  }
  
  console.log('\n⏰ TIMER ANALYSIS:');
  console.log('=' .repeat(70));
  
  const intervalGrowth = after.setInterval - before.setInterval;
  const timeoutGrowth = after.setTimeout - before.setTimeout;
  const clearIntervalGrowth = after.clearInterval - before.clearInterval;
  const clearTimeoutGrowth = after.clearTimeout - before.clearTimeout;
  
  console.log(`setInterval:   ${before.setInterval.toString().padStart(6)} → ${after.setInterval.toString().padStart(6)} (${intervalGrowth >= 0 ? '+' : ''}${intervalGrowth})`);
  console.log(`clearInterval: ${before.clearInterval.toString().padStart(6)} → ${after.clearInterval.toString().padStart(6)} (${clearIntervalGrowth >= 0 ? '+' : ''}${clearIntervalGrowth})`);
  console.log(`setTimeout:    ${before.setTimeout.toString().padStart(6)} → ${after.setTimeout.toString().padStart(6)} (${timeoutGrowth >= 0 ? '+' : ''}${timeoutGrowth})`);
  console.log(`clearTimeout:  ${before.clearTimeout.toString().padStart(6)} → ${after.clearTimeout.toString().padStart(6)} (${clearTimeoutGrowth >= 0 ? '+' : ''}${clearTimeoutGrowth})`);
  
  if (intervalGrowth > 0 && clearIntervalGrowth <= 0) {
    console.log('\n🔴 INTERVAL LEAK: setInterval without clearInterval!');
  }
  if (timeoutGrowth > clearTimeoutGrowth && timeoutGrowth > 20) {
    console.log('\n🟡 TIMEOUT IMBALANCE: More setTimeout than clearTimeout');
  }
  
  console.log('\n⚛️  REACT HOOK ANALYSIS:');
  console.log('=' .repeat(70));
  
  console.log(`useEffect:   ${before.useEffect.toString().padStart(6)} → ${after.useEffect.toString().padStart(6)} (${after.useEffect - before.useEffect >= 0 ? '+' : ''}${after.useEffect - before.useEffect})`);
  console.log(`useCallback: ${before.useCallback.toString().padStart(6)} → ${after.useCallback.toString().padStart(6)} (${after.useCallback - before.useCallback >= 0 ? '+' : ''}${after.useCallback - before.useCallback})`);
  console.log(`useMemo:     ${before.useMemo.toString().padStart(6)} → ${after.useMemo.toString().padStart(6)} (${after.useMemo - before.useMemo >= 0 ? '+' : ''}${after.useMemo - before.useMemo})`);
  console.log(`useState:    ${before.useState.toString().padStart(6)} → ${after.useState.toString().padStart(6)} (${after.useState - before.useState >= 0 ? '+' : ''}${after.useState - before.useState})`);
  
  console.log('\n🔍 CALLBACK PATTERN ANALYSIS:');
  console.log('=' .repeat(70));
  
  console.log(`"callback":  ${before.callback.toString().padStart(6)} → ${after.callback.toString().padStart(6)} (${after.callback - before.callback >= 0 ? '+' : ''}${after.callback - before.callback})`);
  console.log(`"handler":   ${before.handler.toString().padStart(6)} → ${after.handler.toString().padStart(6)} (${after.handler - before.handler >= 0 ? '+' : ''}${after.handler - before.handler})`);
  console.log(`"listener":  ${before.listener.toString().padStart(6)} → ${after.listener.toString().padStart(6)} (${after.listener - before.listener >= 0 ? '+' : ''}${after.listener - before.listener})`);
  
  console.log('\n📋 ACTIONABLE RECOMMENDATIONS:');
  console.log('=' .repeat(70));
  
  const actions = [];
  
  if (closureGrowth > 100) {
    actions.push({
      priority: 1,
      issue: `🔴 CRITICAL: +${closureGrowth} closures retained`,
      command: `grep -rn "useEffect\\|addEventListener\\|setInterval" . --include="*.jsx" --include="*.tsx" --exclude-dir=node_modules | grep -v "removeEventListener\\|clearInterval" | head -20`,
      description: 'Find useEffect/listeners without cleanup'
    });
  }
  
  if (addGrowth > 0 && removeGrowth <= 0) {
    actions.push({
      priority: 1,
      issue: '🔴 Event listeners not being removed',
      command: `grep -rn "addEventListener" . --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules`,
      description: 'Check each addEventListener has matching removeEventListener'
    });
  }
  
  if (intervalGrowth > 0 && clearIntervalGrowth <= 0) {
    actions.push({
      priority: 1,
      issue: '🔴 setInterval without clearInterval',
      command: `grep -rn "setInterval" . --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules`,
      description: 'Ensure every setInterval has clearInterval in cleanup'
    });
  }
  
  if (boundGrowth > 50) {
    actions.push({
      priority: 2,
      issue: `🟡 Bound functions growing (+${boundGrowth})`,
      command: `grep -rn "\\.bind(" . --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules | head -20`,
      description: 'Check if .bind() is being called in render'
    });
  }
  
  if (actions.length === 0) {
    console.log('\n✅ No obvious closure leak patterns detected.');
    console.log('   The leak may be more subtle. Consider:');
    console.log('   1. Check for closure capture in loops');
    console.log('   2. Review component re-render patterns');
    console.log('   3. Look for accumulating arrays/objects in closures');
  } else {
    actions.sort((a, b) => a.priority - b.priority);
    
    actions.forEach((action, i) => {
      console.log(`\n${i + 1}. ${action.issue}`);
      console.log(`   📝 ${action.description}`);
      console.log(`   💻 Run this command:`);
      console.log(`   ${action.command}`);
    });
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ Analysis complete!\n');
}

main().catch(console.error);
