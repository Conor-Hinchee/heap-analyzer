#!/usr/bin/env node

/**
 * Timer Leak Analyzer
 * Examines heap snapshots to identify specific timer types and their growth
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function analyzeTimerLeaks(beforePath, afterPath) {
  console.log('🔍 Loading snapshots for timer analysis...\n');
  
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
  
  // Extract node data
  const beforeNodes = extractNodes(before);
  const afterNodes = extractNodes(after);
  
  console.log('📊 TIMER & ASYNC ANALYSIS\n');
  console.log('='.repeat(50));
  
  // Analyze timer-related objects
  analyzeTimerTypes(beforeNodes, afterNodes);
  
  // Analyze microtasks and async patterns
  analyzeMicrotasks(beforeNodes, afterNodes);
  
  // Analyze closure patterns
  analyzeClosures(beforeNodes, afterNodes);
  
  // Analyze WeakArrayList growth (often associated with timers)
  analyzeWeakArrays(beforeNodes, afterNodes);
  
  // Look for specific timer patterns
  findTimerPatterns(beforeNodes, afterNodes);
}

function extractNodes(snapshot) {
  const nodes = [];
  const { nodes: nodeFields, node_types, strings } = snapshot.snapshot.meta;
  const nodeFieldCount = nodeFields.length;
  
  for (let i = 0; i < snapshot.nodes.length; i += nodeFieldCount) {
    const typeIndex = snapshot.nodes[i + nodeFields.indexOf('type')];
    const nameIndex = snapshot.nodes[i + nodeFields.indexOf('name')];
    const selfSize = snapshot.nodes[i + nodeFields.indexOf('self_size')];
    
    nodes.push({
      type: node_types[0][typeIndex] || 'unknown',
      name: strings[nameIndex] || 'unknown',
      selfSize: selfSize,
      nodeIndex: i
    });
  }
  
  return nodes;
}

function analyzeTimerTypes(before, after) {
  const timerPatterns = {
    'setInterval': [],
    'setTimeout': [],
    'requestAnimationFrame': [],
    'Promise': [],
    'MutationObserver': [],
    'IntersectionObserver': [],
    'ResizeObserver': []
  };
  
  console.log('\n⏰ TIMER & ASYNC OBJECT ANALYSIS:');
  console.log('-'.repeat(50));
  
  // Search for timer-related objects in both snapshots
  const beforeTimers = findPatternInNodes(before, timerPatterns);
  const afterTimers = findPatternInNodes(after, timerPatterns);
  
  for (const [pattern, _] of Object.entries(timerPatterns)) {
    const beforeCount = beforeTimers[pattern]?.length || 0;
    const afterCount = afterTimers[pattern]?.length || 0;
    const growth = afterCount - beforeCount;
    const growthPercent = beforeCount > 0 ? ((growth / beforeCount) * 100).toFixed(1) : 'N/A';
    
    if (growth !== 0) {
      const emoji = growth > 0 ? '📈' : '📉';
      const sign = growth > 0 ? '+' : '';
      console.log(`${emoji} ${pattern}: ${beforeCount} → ${afterCount} (${sign}${growth}, ${growthPercent}%)`);
    }
  }
}

function analyzeMicrotasks(before, after) {
  console.log('\n🔄 MICROTASK ANALYSIS:');
  console.log('-'.repeat(50));
  
  const beforeMicro = before.filter(n => n.type === '(Micro tasks)' || n.name.includes('microtask'));
  const afterMicro = after.filter(n => n.type === '(Micro tasks)' || n.name.includes('microtask'));
  
  console.log(`Microtask objects: ${beforeMicro.length} → ${afterMicro.length} (${afterMicro.length - beforeMicro.length > 0 ? '+' : ''}${afterMicro.length - beforeMicro.length})`);
  
  // Group by name
  const beforeGroups = groupByName(beforeMicro);
  const afterGroups = groupByName(afterMicro);
  
  const allNames = new Set([...Object.keys(beforeGroups), ...Object.keys(afterGroups)]);
  
  allNames.forEach(name => {
    const beforeCount = beforeGroups[name]?.length || 0;
    const afterCount = afterGroups[name]?.length || 0;
    const growth = afterCount - beforeCount;
    
    if (growth > 0) {
      console.log(`  📌 ${name}: ${beforeCount} → ${afterCount} (+${growth})`);
    }
  });
}

function analyzeClosures(before, after) {
  console.log('\n🔒 CLOSURE ANALYSIS:');
  console.log('-'.repeat(50));
  
  const beforeClosures = before.filter(n => n.type === 'closure' || n.name.includes('bound'));
  const afterClosures = after.filter(n => n.type === 'closure' || n.name.includes('bound'));
  
  console.log(`Total closures: ${beforeClosures.length} → ${afterClosures.length} (+${afterClosures.length - beforeClosures.length})`);
  
  // Find closure patterns that might indicate timer callbacks
  const timerClosurePatterns = ['bound', 'tick', 'update', 'check', 'poll', 'refresh', 'interval', 'timeout', 'animate'];
  
  timerClosurePatterns.forEach(pattern => {
    const beforeMatches = beforeClosures.filter(n => n.name.toLowerCase().includes(pattern));
    const afterMatches = afterClosures.filter(n => n.name.toLowerCase().includes(pattern));
    const growth = afterMatches.length - beforeMatches.length;
    
    if (growth > 0) {
      console.log(`  🎯 "${pattern}" closures: ${beforeMatches.length} → ${afterMatches.length} (+${growth})`);
    }
  });
}

function analyzeWeakArrays(before, after) {
  console.log('\n📦 WEAKARRAYLIST ANALYSIS (Timer Storage):');
  console.log('-'.repeat(50));
  
  const beforeWeak = before.filter(n => n.name.includes('WeakArrayList'));
  const afterWeak = after.filter(n => n.name.includes('WeakArrayList'));
  
  const beforeSize = beforeWeak.reduce((sum, n) => sum + n.selfSize, 0);
  const afterSize = afterWeak.reduce((sum, n) => sum + n.selfSize, 0);
  
  console.log(`WeakArrayList objects: ${beforeWeak.length} → ${afterWeak.length} (+${afterWeak.length - beforeWeak.length})`);
  console.log(`WeakArrayList memory: ${(beforeSize / 1024).toFixed(2)}KB → ${(afterSize / 1024).toFixed(2)}KB (+${((afterSize - beforeSize) / 1024).toFixed(2)}KB)`);
  
  if (afterWeak.length - beforeWeak.length > 5) {
    console.log('⚠️  ALERT: WeakArrayList growth often indicates timer or event listener accumulation');
  }
}

function findTimerPatterns(before, after) {
  console.log('\n🔎 TIMER-RELATED PATTERN SEARCH:');
  console.log('-'.repeat(50));
  
  const suspiciousPatterns = [
    'Timeout',
    'Interval', 
    'AnimationFrame',
    'ScheduledTask',
    'Timer',
    'Callback',
    'DelayedTask'
  ];
  
  suspiciousPatterns.forEach(pattern => {
    const beforeMatches = before.filter(n => n.name.includes(pattern));
    const afterMatches = after.filter(n => n.name.includes(pattern));
    const growth = afterMatches.length - beforeMatches.length;
    
    if (growth > 0) {
      console.log(`🔴 "${pattern}": ${beforeMatches.length} → ${afterMatches.length} (+${growth})`);
      
      // Show sample names
      const sampleNames = [...new Set(afterMatches.slice(0, 5).map(n => n.name))];
      if (sampleNames.length > 0) {
        console.log(`   Sample names: ${sampleNames.join(', ')}`);
      }
    }
  });
}

function findPatternInNodes(nodes, patterns) {
  const results = {};
  
  for (const [pattern, _] of Object.entries(patterns)) {
    results[pattern] = nodes.filter(n => 
      n.name.toLowerCase().includes(pattern.toLowerCase()) ||
      n.type.toLowerCase().includes(pattern.toLowerCase())
    );
  }
  
  return results;
}

function groupByName(nodes) {
  return nodes.reduce((groups, node) => {
    const name = node.name;
    if (!groups[name]) groups[name] = [];
    groups[name].push(node);
    return groups;
  }, {});
}

// Main execution
const beforePath = path.join(__dirname, '../snapshots/before.heapsnapshot');
const afterPath = path.join(__dirname, '../snapshots/after.heapsnapshot');

if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) {
  console.error('❌ Snapshot files not found!');
  process.exit(1);
}

console.log('🚀 Timer Leak Analysis Starting...');
console.log(`📁 Before: ${beforePath}`);
console.log(`📁 After: ${afterPath}\n`);

analyzeTimerLeaks(beforePath, afterPath);

console.log('\n' + '='.repeat(50));
console.log('✅ Analysis Complete!\n');
