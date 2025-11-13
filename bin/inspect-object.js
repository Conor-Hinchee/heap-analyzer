#!/usr/bin/env node

/**
 * Object Inspection CLI
 * 
 * Analyze specific objects in heap snapshots using the ObjectContentAnalyzer
 * Usage: npm run inspect-object <snapshot-file> <node-id>
 */

import { readFileSync } from 'fs';
import { ObjectContentAnalyzer } from '../dist/utils/objectContentAnalyzer.js';

function parseHeapSnapshot(filePath) {
  try {
    const data = readFileSync(filePath, 'utf8');
    
    // Parse the heap snapshot (simplified for demo)
    // In a real implementation, you'd need proper V8 heap snapshot parsing
    const parsed = JSON.parse(data);
    
    return {
      nodes: parsed.nodes || [],
      edges: parsed.edges || [],
      strings: parsed.strings || []
    };
  } catch (error) {
    console.error('Error parsing heap snapshot:', error);
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('📋 Object Content Analyzer');
    console.log('==========================');
    console.log('Usage: npm run inspect-object <snapshot-file> <node-id>');
    console.log('');
    console.log('Example:');
    console.log('  npm run inspect-object snapshots/after.heapsnapshot 12345');
    console.log('');
    console.log('This tool provides detailed analysis of specific objects in heap snapshots,');
    console.log('including their properties, references, referrers, and memory relationships.');
    return;
  }

  const [snapshotFile, nodeIdStr] = args;
  const nodeId = parseInt(nodeIdStr, 10);

  if (isNaN(nodeId)) {
    console.error('❌ Invalid node ID. Please provide a numeric node ID.');
    return;
  }

  console.log('🔍 Object Content Analysis');
  console.log('==========================');
  console.log(`📊 Snapshot: ${snapshotFile}`);
  console.log(`🎯 Target Node ID: ${nodeId}`);
  console.log('');

  const snapshot = parseHeapSnapshot(snapshotFile);
  if (!snapshot) {
    console.error('❌ Failed to parse heap snapshot');
    return;
  }

  const analyzer = new ObjectContentAnalyzer();
  const result = analyzer.analyzeObject(snapshot, nodeId);

  if (!result) {
    console.error(`❌ Object with ID ${nodeId} not found in snapshot`);
    return;
  }

  // Display analysis results
  console.log('📊 OBJECT SUMMARY');
  console.log('=================');
  console.log(result.summary);
  console.log('');

  const obj = result.targetObject;
  console.log('🔍 OBJECT DETAILS');
  console.log('=================');
  console.log(`📛 Name: ${obj.name}`);
  console.log(`🏷️  Type: ${obj.type}`);
  console.log(`📏 Shallow Size: ${formatBytes(obj.shallowSize)}`);
  console.log(`📦 Retained Size: ${formatBytes(obj.retainedSize)}`);
  console.log(`📤 References: ${obj.referenceCount}`);
  console.log(`📥 Referrers: ${obj.referrerCount}`);
  console.log(`💾 Memory Impact: ${obj.memoryImpact}`);
  console.log('');

  // Show properties
  if (Object.keys(obj.properties).length > 0) {
    console.log('🏷️  OBJECT PROPERTIES');
    console.log('=====================');
    Object.entries(obj.properties).slice(0, 10).forEach(([name, prop]) => {
      console.log(`  ${name}: ${prop.type} (${formatBytes(prop.size)})`);
    });
    console.log('');
  }

  // Show top references
  if (obj.references.length > 0) {
    console.log('📤 TOP REFERENCES');
    console.log('=================');
    obj.references.slice(0, 5).forEach((ref, index) => {
      console.log(`${index + 1}. [${ref.edgeType}] ${ref.propertyName} → ${ref.targetType}`);
      console.log(`   Size: ${formatBytes(ref.targetSize)} | Node ID: ${ref.targetNode.id}`);
    });
    console.log('');
  }

  // Show top referrers
  if (obj.referrers.length > 0) {
    console.log('📥 TOP REFERRERS');
    console.log('================');
    obj.referrers.slice(0, 5).forEach((ref, index) => {
      console.log(`${index + 1}. ${ref.sourceType} [${ref.edgeType}] ${ref.propertyName}`);
      console.log(`   Size: ${formatBytes(ref.sourceSize)} | Node ID: ${ref.sourceNode.id}`);
    });
    console.log('');
  }

  // Show retainer chain
  if (result.retainerChain.length > 1) {
    console.log('🔗 RETAINER CHAIN');
    console.log('=================');
    result.retainerChain.forEach((node, index) => {
      const arrow = index === 0 ? '🎯' : '⬆️';
      console.log(`${arrow} ${node.type} "${node.name}" (ID: ${node.id})`);
    });
    console.log('');
  }

  // Show circular references
  if (result.circularReferences.length > 0) {
    console.log('🔄 CIRCULAR REFERENCES');
    console.log('======================');
    result.circularReferences.forEach((ref, index) => {
      console.log(`${index + 1}. [${ref.edgeType}] ${ref.propertyName} → ${ref.targetType}`);
    });
    console.log('');
  }

  // Show insights
  if (result.insights.length > 0) {
    console.log('💡 INSIGHTS');
    console.log('===========');
    result.insights.forEach(insight => {
      console.log(`• ${insight}`);
    });
    console.log('');
  }

  // Show suspicious patterns
  if (obj.suspiciousPatterns.length > 0) {
    console.log('⚠️  SUSPICIOUS PATTERNS');
    console.log('=======================');
    obj.suspiciousPatterns.forEach(pattern => {
      console.log(`• ${pattern}`);
    });
    console.log('');
  }

  // Show recommendations
  if (result.recommendations.length > 0) {
    console.log('🎯 RECOMMENDATIONS');
    console.log('==================');
    result.recommendations.forEach(rec => {
      console.log(`• ${rec}`);
    });
    console.log('');
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

main();