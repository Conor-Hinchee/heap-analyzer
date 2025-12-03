/**
 * Timeline Analysis - Compare sequential heap snapshots to detect memory trends
 */

import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

interface SnapshotInfo {
  filename: string;
  filepath: string;
  timestamp: Date;
  operation?: string;
  requestId?: string;
  heapSize?: number;
}

interface ComparisonResult {
  from: string;
  to: string;
  operation?: string;
  memoryGrowthMB: number;
  memoryGrowthPercent: number;
  fromSizeMB: number;
  toSizeMB: number;
  objectCountChange: number;
}

interface TimelineReport {
  snapshots: SnapshotInfo[];
  comparisons: ComparisonResult[];
  totalGrowthMB: number;
  totalGrowthPercent: number;
  startSizeMB: number;
  endSizeMB: number;
  leakDetected: boolean;
  leakThreshold: number;
  problematicOperations: string[];
}

/**
 * Parse snapshot filename to extract metadata
 */
function parseSnapshotFilename(filename: string): SnapshotInfo {
  const filepath = filename;
  const basename = path.basename(filename);
  
  // Pattern: heap-2025-12-03T19-32-37-260Z-startup.heapsnapshot
  // Pattern: heap-2025-12-03T19-42-55-976Z-request-start-op-beatHeartbeat_id-vsjvl25n.heapsnapshot
  const timestampMatch = basename.match(/heap-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
  const operationMatch = basename.match(/op-([^_]+)/);
  const requestIdMatch = basename.match(/id-([^.]+)/);
  
  let timestamp = new Date();
  if (timestampMatch) {
    const isoTimestamp = timestampMatch[1].replace(/(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');
    timestamp = new Date(isoTimestamp);
  }
  
  return {
    filename: basename,
    filepath,
    timestamp,
    operation: operationMatch?.[1],
    requestId: requestIdMatch?.[1],
  };
}

/**
 * Find all heap snapshots in a directory
 */
export async function findSnapshots(directory: string): Promise<SnapshotInfo[]> {
  const files = await fs.readdir(directory);
  const snapshotFiles = files
    .filter(f => f.endsWith('.heapsnapshot'))
    .map(f => path.join(directory, f));
  
  const snapshots = snapshotFiles.map(parseSnapshotFilename);
  
  // Sort by timestamp
  snapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  return snapshots;
}

/**
 * Load a heap snapshot and get basic stats using memlab
 */
async function loadSnapshotStats(filepath: string): Promise<{ heapSizeMB: number; objectCount: number }> {
  console.log(`   Loading ${path.basename(filepath)}...`);
  
  return new Promise((resolve, reject) => {
    const memlabProcess = spawn('npx', ['memlab', 'analyze', 'object-size', '--snapshot', filepath, '--output', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    memlabProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    memlabProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    memlabProcess.on('close', (code) => {
      if (code !== 0) {
        // Fallback: estimate from file size
        fs.stat(filepath).then(stats => {
          const heapSizeMB = stats.size / (1024 * 1024);
          resolve({ heapSizeMB, objectCount: 0 });
        }).catch(() => {
          resolve({ heapSizeMB: 0, objectCount: 0 });
        });
        return;
      }
      
      try {
        // Parse memlab output for heap size
        const lines = output.split('\n');
        let heapSizeMB = 0;
        let objectCount = 0;
        
        // Look for summary info in memlab output
        const sizeMatch = output.match(/(\d+(?:\.\d+)?)\s*MB/i);
        if (sizeMatch) {
          heapSizeMB = parseFloat(sizeMatch[1]);
        }
        
        const objMatch = output.match(/(\d+(?:,\d+)*)\s*objects/i);
        if (objMatch) {
          objectCount = parseInt(objMatch[1].replace(/,/g, ''));
        }
        
        // If still no data, estimate from file size
        if (heapSizeMB === 0) {
          fs.stat(filepath).then(stats => {
            heapSizeMB = stats.size / (1024 * 1024);
            resolve({ heapSizeMB, objectCount });
          }).catch(() => {
            resolve({ heapSizeMB: 0, objectCount });
          });
          return;
        }
        
        resolve({ heapSizeMB, objectCount });
      } catch (error) {
        // Fallback to file size
        fs.stat(filepath).then(stats => {
          const heapSizeMB = stats.size / (1024 * 1024);
          resolve({ heapSizeMB, objectCount: 0 });
        }).catch(() => {
          resolve({ heapSizeMB: 0, objectCount: 0 });
        });
      }
    });
  });
}

/**
 * Compare two snapshots
 */
async function compareSnapshots(
  from: SnapshotInfo,
  to: SnapshotInfo
): Promise<ComparisonResult> {
  const fromStats = await loadSnapshotStats(from.filepath);
  const toStats = await loadSnapshotStats(to.filepath);
  
  const memoryGrowthMB = toStats.heapSizeMB - fromStats.heapSizeMB;
  const memoryGrowthPercent = (memoryGrowthMB / fromStats.heapSizeMB) * 100;
  const objectCountChange = toStats.objectCount - fromStats.objectCount;
  
  return {
    from: from.filename,
    to: to.filename,
    operation: to.operation,
    memoryGrowthMB,
    memoryGrowthPercent,
    fromSizeMB: fromStats.heapSizeMB,
    toSizeMB: toStats.heapSizeMB,
    objectCountChange,
  };
}

/**
 * Analyze timeline of snapshots
 */
export async function analyzeTimeline(
  directory: string,
  options: { leakThreshold?: number } = {}
): Promise<TimelineReport> {
  const leakThreshold = options.leakThreshold || 10; // MB growth considered problematic
  
  console.log('📊 Timeline Analysis\n');
  console.log(`📁 Analyzing snapshots in: ${directory}\n`);
  
  const snapshots = await findSnapshots(directory);
  
  if (snapshots.length < 2) {
    throw new Error(`Need at least 2 snapshots for timeline analysis. Found: ${snapshots.length}`);
  }
  
  console.log(`✅ Found ${snapshots.length} snapshots\n`);
  console.log('🔍 Comparing sequential snapshots...\n');
  
  const comparisons: ComparisonResult[] = [];
  
  for (let i = 0; i < snapshots.length - 1; i++) {
    const from = snapshots[i];
    const to = snapshots[i + 1];
    
    console.log(`   [${i + 1}/${snapshots.length - 1}] ${from.filename} → ${to.filename}`);
    const comparison = await compareSnapshots(from, to);
    comparisons.push(comparison);
  }
  
  // Calculate total growth
  const firstSnapshot = snapshots[0];
  const lastSnapshot = snapshots[snapshots.length - 1];
  const firstStats = await loadSnapshotStats(firstSnapshot.filepath);
  const lastStats = await loadSnapshotStats(lastSnapshot.filepath);
  
  const totalGrowthMB = lastStats.heapSizeMB - firstStats.heapSizeMB;
  const totalGrowthPercent = (totalGrowthMB / firstStats.heapSizeMB) * 100;
  
  // Detect problematic operations
  const problematicOperations = comparisons
    .filter(c => c.memoryGrowthMB > leakThreshold)
    .map(c => c.operation || c.to)
    .filter((op): op is string => !!op);
  
  const leakDetected = totalGrowthMB > leakThreshold && problematicOperations.length > 0;
  
  return {
    snapshots,
    comparisons,
    totalGrowthMB,
    totalGrowthPercent,
    startSizeMB: firstStats.heapSizeMB,
    endSizeMB: lastStats.heapSizeMB,
    leakDetected,
    leakThreshold,
    problematicOperations,
  };
}

/**
 * Format bytes to human-readable size
 */
function formatMB(mb: number): string {
  return `${mb >= 0 ? '+' : ''}${mb.toFixed(2)} MB`;
}

/**
 * Print timeline report
 */
export function printTimelineReport(report: TimelineReport): void {
  console.log('\n📈 Timeline Report\n');
  console.log('═'.repeat(80));
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Start memory:  ${report.startSizeMB.toFixed(2)} MB`);
  console.log(`   End memory:    ${report.endSizeMB.toFixed(2)} MB`);
  console.log(`   Total growth:  ${formatMB(report.totalGrowthMB)} (${report.totalGrowthPercent.toFixed(1)}%)`);
  console.log(`   Snapshots:     ${report.snapshots.length}`);
  console.log(`   Comparisons:   ${report.comparisons.length}`);
  
  // Leak detection
  console.log('\n🔍 Leak Detection:');
  if (report.leakDetected) {
    console.log(`   ⚠️  Potential leak detected!`);
    console.log(`   🎯 Threshold: ${report.leakThreshold} MB growth`);
    console.log(`   📈 Total growth: ${formatMB(report.totalGrowthMB)}`);
    
    if (report.problematicOperations.length > 0) {
      console.log(`\n   🚨 Problematic operations:`);
      report.problematicOperations.forEach(op => {
        console.log(`      - ${op}`);
      });
    }
  } else {
    console.log(`   ✅ No significant leaks detected`);
    console.log(`   🎯 Threshold: ${report.leakThreshold} MB growth`);
  }
  
  // Detailed comparisons
  console.log('\n📋 Sequential Comparisons:\n');
  console.log('┌─────┬────────────────────────────────┬──────────────┬───────────────┬─────────────┐');
  console.log('│  #  │ Operation                      │ Memory Growth│ Total Size    │ Objects     │');
  console.log('├─────┼────────────────────────────────┼──────────────┼───────────────┼─────────────┤');
  
  report.comparisons.forEach((comp, i) => {
    const num = String(i + 1).padStart(3);
    const op = (comp.operation || 'unknown').padEnd(30).slice(0, 30);
    const growth = formatMB(comp.memoryGrowthMB).padStart(12);
    const size = `${comp.toSizeMB.toFixed(2)} MB`.padStart(13);
    const objects = (comp.objectCountChange >= 0 ? '+' : '') + comp.objectCountChange.toLocaleString();
    const objStr = objects.padStart(11);
    
    // Highlight problematic rows
    const marker = comp.memoryGrowthMB > report.leakThreshold ? '⚠️ ' : '   ';
    
    console.log(`│ ${marker}${num} │ ${op} │ ${growth} │ ${size} │ ${objStr} │`);
  });
  
  console.log('└─────┴────────────────────────────────┴──────────────┴───────────────┴─────────────┘');
  
  // Recommendations
  console.log('\n💡 Recommendations:\n');
  
  if (report.leakDetected) {
    console.log('   1. Investigate problematic operations listed above');
    console.log('   2. Run detailed analysis on snapshots with high growth:');
    report.comparisons
      .filter(c => c.memoryGrowthMB > report.leakThreshold)
      .slice(0, 3)
      .forEach(c => {
        console.log(`      npx heap-analyzer analyze "${c.to}"`);
      });
    console.log('   3. Compare problematic snapshots:');
    const problematic = report.comparisons.find(c => c.memoryGrowthMB > report.leakThreshold);
    if (problematic) {
      console.log(`      npx heap-analyzer compare "${problematic.from}" "${problematic.to}"`);
    }
  } else {
    console.log('   ✅ Memory usage appears healthy');
    console.log('   📊 Continue monitoring with more snapshots over time');
  }
  
  console.log('\n═'.repeat(80));
}

/**
 * CLI entry point for timeline analysis
 */
export async function timelineCLI(directory: string, options: { leakThreshold?: number } = {}): Promise<void> {
  try {
    const report = await analyzeTimeline(directory, options);
    printTimelineReport(report);
  } catch (error) {
    console.error('❌ Timeline analysis failed:', error);
    throw error;
  }
}
