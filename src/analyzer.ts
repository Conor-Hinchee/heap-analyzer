import pkg from '@memlab/core';
const { utils, analysis } = pkg;
import fs from 'node:fs';
import path from 'node:path';

export async function analyzeHeapSnapshot(filePath: string): Promise<void> {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }

    // Check if it's a heapsnapshot file
    if (!filePath.endsWith('.heapsnapshot')) {
      console.error('❌ File must be a .heapsnapshot file');
      process.exit(1);
    }

    console.log('📊 Loading heap snapshot...');
    
    // Load the heap snapshot using memlab
    const heap = await utils.getSnapshotFromFile(filePath, {tabType: 'main'});
    
    console.log('\n✅ Heap snapshot loaded successfully!');
    console.log('\n📈 Basic Statistics:');
    console.log(`   Total nodes: ${heap.nodes.length.toLocaleString()}`);
    console.log(`   Total edges: ${heap.edges.length.toLocaleString()}`);
    
    // Get some basic analysis
    const nodesByType = new Map<string, number>();
    let totalSize = 0;
    
    // Use forEach to iterate over heap nodes
    heap.nodes.forEach((node: any) => {
      const type = node.type || 'unknown';
      nodesByType.set(type, (nodesByType.get(type) || 0) + 1);
      totalSize += node.self_size || 0;
    });
    
    console.log(`   Total heap size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\n🔍 Node Types:');
    const sortedTypes = Array.from(nodesByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
      
    for (const [type, count] of sortedTypes) {
      console.log(`   ${type}: ${count.toLocaleString()}`);
    }
    
    console.log('\n🎉 Analysis complete!');
    
  } catch (error) {
    console.error('❌ Error analyzing heap snapshot:', error);
    process.exit(1);
  }
}

export async function listSnapshots(snapshotsDir: string): Promise<void> {
  try {
    if (!fs.existsSync(snapshotsDir)) {
      console.log(`📁 Snapshots directory not found: ${snapshotsDir}`);
      console.log('💡 Create the directory and add .heapsnapshot files to get started');
      return;
    }

    const files = fs.readdirSync(snapshotsDir);
    const heapFiles = files.filter(file => file.endsWith('.heapsnapshot'));

    if (heapFiles.length === 0) {
      console.log(`📂 No .heapsnapshot files found in ${snapshotsDir}`);
      console.log('💡 Add some .heapsnapshot files to analyze them');
      return;
    }

    console.log(`📊 Found ${heapFiles.length} snapshot file(s):\n`);
    
    for (const file of heapFiles) {
      const filePath = path.join(snapshotsDir, file);
      const stats = fs.statSync(filePath);
      const size = (stats.size / 1024 / 1024).toFixed(2);
      const modified = stats.mtime.toLocaleDateString();
      
      console.log(`   📄 ${file}`);
      console.log(`      Size: ${size} MB`);
      console.log(`      Modified: ${modified}`);
      console.log(`      Analyze: heap-analyzer analyze ${file}\n`);
    }
    
  } catch (error) {
    console.error('❌ Error listing snapshots:', error);
  }
}

interface LeakDetectionOptions {
  snapshotDir?: string;
  baseline?: string;
  target?: string;
  final?: string;
  traceAllObjects?: boolean;
  subprocessTimeout?: number;
}

export async function findMemoryLeaks(options: LeakDetectionOptions): Promise<void> {
  try {
    let baseline: string, target: string, final: string;

    if (options.snapshotDir) {
      // Look for standard filenames in directory
      const dir = options.snapshotDir;
      if (!fs.existsSync(dir)) {
        console.error(`❌ Directory not found: ${dir}`);
        process.exit(1);
      }

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.heapsnapshot')).sort();
      
      // Try to find standard names (baseline/target/final or before/after/final)
      const beforeFile = files.find(f => f.includes('before'));
      const afterFile = files.find(f => f.includes('after'));
      const finalFile = files.find(f => f.includes('final'));
      const baselineFile = files.find(f => f.includes('baseline')) || beforeFile;
      const targetFile = files.find(f => f.includes('target')) || afterFile;
      
      baseline = path.join(dir, baselineFile || files[0]);
      target = path.join(dir, targetFile || files[1]);
      final = path.join(dir, finalFile || files[files.length - 1]);

      if (!baseline || !target || !final) {
        console.error('❌ Need at least 3 .heapsnapshot files in directory');
        console.log('💡 Expected: baseline, target, final snapshots');
        process.exit(1);
      }
    } else {
      baseline = options.baseline!;
      target = options.target!;
      final = options.final!;
      
      // Smart path resolution for individual files too
      if (!baseline.includes('/') && !baseline.includes('\\')) {
        const baselinePath = path.join('./snapshots', baseline);
        if (fs.existsSync(baselinePath)) baseline = baselinePath;
      }
      if (!target.includes('/') && !target.includes('\\')) {
        const targetPath = path.join('./snapshots', target);
        if (fs.existsSync(targetPath)) target = targetPath;
      }
      if (!final.includes('/') && !final.includes('\\')) {
        const finalPath = path.join('./snapshots', final);
        if (fs.existsSync(finalPath)) final = finalPath;
      }
    }

    // Resolve to absolute paths
    baseline = path.resolve(baseline);
    target = path.resolve(target);
    final = path.resolve(final);

    console.log('📊 Loading snapshots for leak detection...');
    console.log(`   Baseline: ${path.basename(baseline)}`);
    console.log(`   Target:   ${path.basename(target)}`);
    console.log(`   Final:    ${path.basename(final)}`);

    // Load all three snapshots
    const baselineHeap = await utils.getSnapshotFromFile(baseline, {tabType: 'main'});
    const targetHeap = await utils.getSnapshotFromFile(target, {tabType: 'main'});
    const finalHeap = await utils.getSnapshotFromFile(final, {tabType: 'main'});

    console.log('\\n✅ All snapshots loaded successfully!');
    
    // Basic leak detection logic
    console.log('\n🔍 Analyzing memory growth...');
    
    const baselineSize = calculateHeapSize(baselineHeap);
    const targetSize = calculateHeapSize(targetHeap);
    const finalSize = calculateHeapSize(finalHeap);
    
    console.log(`\n📈 Memory Usage:`);
    console.log(`   Baseline: ${(baselineSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Target:   ${(targetSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Final:    ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
    
    const growth = targetSize - baselineSize;
    const retention = finalSize - baselineSize;
    
    console.log(`\n🧮 Analysis:`);
    console.log(`   Growth (baseline → target): ${(growth / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Retained (baseline → final): ${(retention / 1024 / 1024).toFixed(2)} MB`);
    
    if (retention > growth * 0.1) {
      console.log('\n⚠️  Potential Memory Leak Detected!');
      console.log(`   Expected most memory to be freed, but ${(retention / 1024 / 1024).toFixed(2)} MB was retained`);
    } else {
      console.log('\n✅ Memory usage looks healthy!');
      console.log('   Most allocated memory was properly freed');
    }
    
    
  } catch (error) {
    console.error('❌ Error detecting memory leaks:', error);
    process.exit(1);
  }
}

// Simple 2-snapshot comparison function
export async function compareSnapshots(baselineFile: string, targetFile: string): Promise<void> {
  try {
    // Smart path resolution
    if (!baselineFile.includes('/') && !baselineFile.includes('\\')) {
      const baselinePath = path.join('./snapshots', baselineFile);
      if (fs.existsSync(baselinePath)) baselineFile = baselinePath;
    }
    if (!targetFile.includes('/') && !targetFile.includes('\\')) {
      const targetPath = path.join('./snapshots', targetFile);
      if (fs.existsSync(targetPath)) targetFile = targetPath;
    }

    // Check files exist
    if (!fs.existsSync(baselineFile)) {
      console.error(`❌ Baseline file not found: ${baselineFile}`);
      process.exit(1);
    }
    if (!fs.existsSync(targetFile)) {
      console.error(`❌ Target file not found: ${targetFile}`);
      process.exit(1);
    }

    console.log('📊 Loading snapshots for comparison...');
    console.log(`   Baseline: ${path.basename(baselineFile)}`);
    console.log(`   Target:   ${path.basename(targetFile)}`);

    // Load both snapshots
    const baselineHeap = await utils.getSnapshotFromFile(baselineFile, {tabType: 'main'});
    const targetHeap = await utils.getSnapshotFromFile(targetFile, {tabType: 'main'});

    console.log('\n✅ Both snapshots loaded successfully!');
    
    // Basic comparison
    console.log('\n🔍 Comparing snapshots...');
    
    const baselineSize = calculateHeapSize(baselineHeap);
    const targetSize = calculateHeapSize(targetHeap);
    
    console.log(`\n📈 Memory Comparison:`);
    console.log(`   Baseline: ${(baselineSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Target:   ${(targetSize / 1024 / 1024).toFixed(2)} MB`);
    
    const growth = targetSize - baselineSize;
    const growthPercent = (growth / baselineSize) * 100;
    
    console.log(`\n📊 Growth Analysis:`);
    console.log(`   Memory growth: ${(growth / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Growth percentage: ${growthPercent.toFixed(1)}%`);
    
    if (Math.abs(growthPercent) > 10) {
      console.log('\n⚠️  Significant memory change detected!');
      if (growthPercent > 0) {
        console.log(`   📈 Memory increased by ${(growth / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.log(`   📉 Memory decreased by ${Math.abs(growth / 1024 / 1024).toFixed(2)} MB`);
      }
    } else {
      console.log('\n✅ Memory usage is relatively stable');
    }

    // Node count comparison
    const baselineNodes = baselineHeap.nodes.length;
    const targetNodes = targetHeap.nodes.length;
    const nodeGrowth = targetNodes - baselineNodes;
    const nodeGrowthPercent = (nodeGrowth / baselineNodes) * 100;

    console.log(`\n🔢 Object Count Comparison:`);
    console.log(`   Baseline: ${baselineNodes.toLocaleString()} objects`);
    console.log(`   Target:   ${targetNodes.toLocaleString()} objects`);
    console.log(`   Change:   ${nodeGrowth > 0 ? '+' : ''}${nodeGrowth.toLocaleString()} objects (${nodeGrowthPercent.toFixed(1)}%)`);

    // Analyze object type growth
    console.log('\n🔍 Object Type Analysis:');
    await analyzeObjectTypeGrowth(baselineHeap, targetHeap);
    
    console.log('\n🎉 Comparison complete!');
    
    // Smart recommendations based on growth patterns
    if (Math.abs(growthPercent) > 50 && Math.abs(nodeGrowthPercent) < 20) {
      console.log('\n💡 Growth Pattern Analysis:');
      console.log('   📊 High memory growth with low object count growth');
      console.log('   🎯 This suggests existing objects got larger (data accumulation)');
      console.log('   🔍 Check: Arrays growing, string concatenation, cache buildup');
    } else if (Math.abs(nodeGrowthPercent) > 50) {
      console.log('\n💡 Growth Pattern Analysis:');
      console.log('   📊 High object count growth detected');
      console.log('   🎯 Many new objects created - check object creation patterns');
    }
    
    console.log('\n🔬 For comprehensive leak detection, use: heap-analyzer find-leaks --baseline file1 --target file2 --final file3');
    
  } catch (error) {
    console.error('❌ Error comparing snapshots:', error);
    process.exit(1);
  }
}

// Generic memlab command runner
async function runMemlabCommand(command: string, args: string[], description: string, subprocessTimeout?: number): Promise<void> {
  const { spawn } = await import('child_process');

  console.log(`🚀 Running MemLab ${description}...`);
  console.log('');

  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['memlab', command, ...args], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (subprocessTimeout !== undefined && subprocessTimeout > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`MemLab ${description} timed out after ${subprocessTimeout}ms`));
      }, subprocessTimeout);
    }

    child.on('close', (code) => {
      if (timer !== undefined) clearTimeout(timer);
      console.log(`\n✅ MemLab ${description} complete!`);
      if (code === 0) {
        resolve();
      } else {
        console.log('\n⚠️  MemLab finished with warnings - check output above');
        resolve(); // Don't reject, memlab often exits with non-zero for valid reasons
      }
    });

    child.on('error', (error) => {
      if (timer !== undefined) clearTimeout(timer);
      console.error('❌ Error running memlab:', error.message);
      console.log('\n💡 Make sure memlab is installed: npm install -g @memlab/cli');
      reject(error);
    });
  });
}

// Memlab wrapper - run memlab find-leaks with our snapshots
export async function runMemlabFindLeaks(options: LeakDetectionOptions): Promise<string> {
  const { spawn } = await import('child_process');
  
  try {
    let baseline: string, target: string, final: string | undefined;

    // Resolve file paths (same logic as before)
    if (options.snapshotDir) {
      const dir = options.snapshotDir;
      if (!fs.existsSync(dir)) {
        console.error(`❌ Directory not found: ${dir}`);
        process.exit(1);
      }

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.heapsnapshot')).sort();
      if (files.length < 2) {
        console.error('❌ Need at least 2 .heapsnapshot files for leak detection');
        process.exit(1);
      }

      // Try to find standard names (baseline/target/final or before/after/final)
      const beforeFile = files.find(f => f.includes('before'));
      const afterFile = files.find(f => f.includes('after'));
      const finalFile = files.find(f => f.includes('final'));
      const baselineFile = files.find(f => f.includes('baseline')) || beforeFile;
      const targetFile = files.find(f => f.includes('target')) || afterFile;
      
      baseline = path.join(dir, baselineFile || files[0]);
      target = path.join(dir, targetFile || files[1]);
      final = files.length >= 3 ? path.join(dir, finalFile || files[files.length - 1]) : undefined;
    } else {
      if (!options.baseline || !options.target) {
        console.error('❌ Need at least baseline and target snapshots');
        process.exit(1);
      }
      
      baseline = options.baseline;
      target = options.target;
      final = options.final;
      
      // Smart path resolution
      if (!baseline.includes('/') && !baseline.includes('\\')) {
        const baselinePath = path.join('./snapshots', baseline);
        if (fs.existsSync(baselinePath)) baseline = baselinePath;
      }
      if (!target.includes('/') && !target.includes('\\')) {
        const targetPath = path.join('./snapshots', target);
        if (fs.existsSync(targetPath)) target = targetPath;
      }
      if (final && !final.includes('/') && !final.includes('\\')) {
        const finalPath = path.join('./snapshots', final);
        if (fs.existsSync(finalPath)) final = finalPath;
      }
    }

    // Verify files exist
    if (!fs.existsSync(baseline)) {
      console.error(`❌ Baseline file not found: ${baseline}`);
      process.exit(1);
    }
    if (!fs.existsSync(target)) {
      console.error(`❌ Target file not found: ${target}`);
      process.exit(1);
    }
    if (final && !fs.existsSync(final)) {
      console.error(`❌ Final file not found: ${final}`);
      process.exit(1);
    }

    console.log('🚀 Running MemLab leak detection...');
    console.log(`   Baseline: ${path.basename(baseline)}`);
    console.log(`   Target:   ${path.basename(target)}`);
    if (final) {
      console.log(`   Final:    ${path.basename(final)}`);
    }
    console.log('');

    // Build memlab command
    const args = [
      'memlab', 'find-leaks',
      '--baseline', path.resolve(baseline),
      '--target', path.resolve(target)
    ];
    
    if (final) {
      args.push('--final', path.resolve(final));
    }
    
    if (options.traceAllObjects) {
      args.push('--trace-all-objects');
    }

    // Run memlab command
    return new Promise((resolve, reject) => {
      const child = spawn('npx', args, {
        stdio: ['inherit', 'pipe', 'pipe'], // Capture stdout and stderr
        cwd: process.cwd()
      });

      let output = '';
      let errorOutput = '';

      let timer: ReturnType<typeof setTimeout> | undefined;
      if (options.subprocessTimeout !== undefined && options.subprocessTimeout > 0) {
        timer = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`MemLab find-leaks timed out after ${options.subprocessTimeout}ms`));
        }, options.subprocessTimeout);
      }

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text); // Pass through to terminal
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        process.stderr.write(text); // Pass through to terminal
      });

      child.on('close', (code) => {
        if (timer !== undefined) clearTimeout(timer);
        if (code !== 0) {
          console.log('\n⚠️  MemLab finished with warnings - check output above');
        }
        resolve(output); // Don't reject, memlab often exits with non-zero for valid reasons
      });

      child.on('error', (error) => {
        if (timer !== undefined) clearTimeout(timer);
        console.error('❌ Error running memlab:', error.message);
        console.log('\n💡 Make sure memlab is installed: npm install -g @memlab/cli');
        reject(error);
      });
    });

  } catch (error) {
    console.error('❌ Error setting up memlab analysis:', error);
    process.exit(1);
  }
}

// Memlab trace wrapper - analyze retainer traces for specific objects
export async function runMemlabTrace(snapshotFile: string, nodeId: string, subprocessTimeout?: number): Promise<void> {
  // Smart path resolution
  if (!snapshotFile.includes('/') && !snapshotFile.includes('\\')) {
    const snapshotPath = path.join('./snapshots', snapshotFile);
    if (fs.existsSync(snapshotPath)) snapshotFile = snapshotPath;
  }

  if (!fs.existsSync(snapshotFile)) {
    console.error(`❌ Snapshot file not found: ${snapshotFile}`);
    process.exit(1);
  }

  console.log(`📊 Analyzing retainer trace for node ${nodeId}...`);
  console.log(`   Snapshot: ${path.basename(snapshotFile)}`);

  const args = ['--snapshot', path.resolve(snapshotFile), '--node-id', nodeId];
  await runMemlabCommand('trace', args, 'retainer trace analysis', subprocessTimeout);
}

// Capture retention trace output programmatically for enrichment
export async function runMemlabTraceCapture(snapshotFile: string, nodeId: string, subprocessTimeout?: number): Promise<{raw: string, path: any[]}> {
  const { spawn } = await import('node:child_process');
  // Smart path resolution
  if (!snapshotFile.includes('/') && !snapshotFile.includes('\\')) {
    const snapshotPath = path.join('./snapshots', snapshotFile);
    if (fs.existsSync(snapshotPath)) snapshotFile = snapshotPath;
  }
  if (!fs.existsSync(snapshotFile)) {
    throw new Error(`Snapshot file not found: ${snapshotFile}`);
  }
  const args = ['memlab', 'trace', '--snapshot', path.resolve(snapshotFile), '--node-id', nodeId];
  return new Promise((resolve) => {
    let output = '';
    const child = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (subprocessTimeout !== undefined && subprocessTimeout > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ raw: output, path: [] }); // Resolve with partial output on timeout
      }, subprocessTimeout);
    }

    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('close', () => {
      if (timer !== undefined) clearTimeout(timer);
      // Parse retention path lines
      const pathEntries: any[] = [];
      const lines = output.split(/\r?\n/);
      const pathLineRegexRoot = /^\[(.+?)\] \((.+?)\) @(\d+) \[(.+?)\]$/;
      const pathLineRegex = /^\s+--([^ ]+) \(([^)]+)\)--->\s+\[(.+?)\] \((.+?)\) @(\d+) \[(.+?)\]$/;
      let rootAdded = false;
      for (const line of lines) {
        const rootMatch = line.match(pathLineRegexRoot);
        if (rootMatch && !rootAdded) {
          pathEntries.push({
            edge: 'root',
            edgeType: 'root',
            object: rootMatch[1],
            type: rootMatch[2],
            nodeId: rootMatch[3],
            size: rootMatch[4]
          });
          rootAdded = true;
          continue;
        }
        const m = line.match(pathLineRegex);
        if (m) {
          pathEntries.push({
            edge: m[1],
            edgeType: m[2],
            object: m[3],
            type: m[4],
            nodeId: m[5],
            size: m[6]
          });
        }
      }
      resolve({ raw: output, path: pathEntries });
    });
    child.on('error', () => {
      if (timer !== undefined) clearTimeout(timer);
      resolve({ raw: output, path: [] });
    });
  });
}

// Memlab heap wrapper - interactive heap exploration
export async function runMemlabHeap(snapshotFile: string, subprocessTimeout?: number): Promise<void> {
  // Smart path resolution
  if (!snapshotFile.includes('/') && !snapshotFile.includes('\\')) {
    const snapshotPath = path.join('./snapshots', snapshotFile);
    if (fs.existsSync(snapshotPath)) snapshotFile = snapshotPath;
  }

  if (!fs.existsSync(snapshotFile)) {
    console.error(`❌ Snapshot file not found: ${snapshotFile}`);
    process.exit(1);
  }

  console.log(`🔍 Starting interactive heap exploration...`);
  console.log(`   Snapshot: ${path.basename(snapshotFile)}`);

  const args = ['--snapshot', path.resolve(snapshotFile)];
  await runMemlabCommand('heap', args, 'interactive heap exploration', subprocessTimeout);
}

// Memlab view-heap wrapper - heap visualization
export async function runMemlabViewHeap(snapshotFile: string, nodeId?: string, subprocessTimeout?: number): Promise<void> {
  // Smart path resolution
  if (!snapshotFile.includes('/') && !snapshotFile.includes('\\')) {
    const snapshotPath = path.join('./snapshots', snapshotFile);
    if (fs.existsSync(snapshotPath)) snapshotFile = snapshotPath;
  }

  if (!fs.existsSync(snapshotFile)) {
    console.error(`❌ Snapshot file not found: ${snapshotFile}`);
    process.exit(1);
  }

  console.log(`👀 Starting heap visualization...`);
  console.log(`   Snapshot: ${path.basename(snapshotFile)}`);
  if (nodeId) console.log(`   Focus Node: ${nodeId}`);

  const args = ['--snapshot', path.resolve(snapshotFile)];
  if (nodeId) args.push('--node-id', nodeId);

  await runMemlabCommand('view-heap', args, 'heap visualization', subprocessTimeout);
}

// Memlab analyze wrapper - run analysis plugins
export async function runMemlabAnalyze(pluginName: string, snapshotFile?: string, subprocessTimeout?: number): Promise<void> {
  const args = [pluginName];

  if (snapshotFile) {
    // Smart path resolution
    if (!snapshotFile.includes('/') && !snapshotFile.includes('\\')) {
      const snapshotPath = path.join('./snapshots', snapshotFile);
      if (fs.existsSync(snapshotPath)) snapshotFile = snapshotPath;
    }

    if (!fs.existsSync(snapshotFile)) {
      console.error(`❌ Snapshot file not found: ${snapshotFile}`);
      process.exit(1);
    }

    console.log(`🔬 Running analysis plugin: ${pluginName}`);
    console.log(`   Snapshot: ${path.basename(snapshotFile)}`);
    // Note: Different plugins may have different argument structures
  } else {
    console.log(`🔬 Running analysis plugin: ${pluginName}`);
  }

  await runMemlabCommand('analyze', args, `analysis with ${pluginName} plugin`, subprocessTimeout);
}

async function analyzeObjectTypeGrowth(baselineHeap: any, targetHeap: any): Promise<void> {
  // Analyze baseline object types
  const baselineTypes = new Map<string, { count: number, size: number }>();
  baselineHeap.nodes.forEach((node: any) => {
    const type = node.type || 'unknown';
    const current = baselineTypes.get(type) || { count: 0, size: 0 };
    baselineTypes.set(type, {
      count: current.count + 1,
      size: current.size + (node.self_size || 0)
    });
  });

  // Analyze target object types
  const targetTypes = new Map<string, { count: number, size: number }>();
  targetHeap.nodes.forEach((node: any) => {
    const type = node.type || 'unknown';
    const current = targetTypes.get(type) || { count: 0, size: 0 };
    targetTypes.set(type, {
      count: current.count + 1,
      size: current.size + (node.self_size || 0)
    });
  });

  // Calculate growth by type
  const growthData: Array<{
    type: string,
    countGrowth: number,
    sizeGrowth: number,
    sizeGrowthPercent: number
  }> = [];

  // Collect all types from both snapshots
  const allTypes = new Set([...baselineTypes.keys(), ...targetTypes.keys()]);
  
  for (const type of allTypes) {
    const baseline = baselineTypes.get(type) || { count: 0, size: 0 };
    const target = targetTypes.get(type) || { count: 0, size: 0 };
    
    const countGrowth = target.count - baseline.count;
    const sizeGrowth = target.size - baseline.size;
    const sizeGrowthPercent = baseline.size > 0 ? (sizeGrowth / baseline.size) * 100 : (target.size > 0 ? 100 : 0);
    
    if (Math.abs(sizeGrowth) > 100000) { // Only show types with >100KB change
      growthData.push({
        type,
        countGrowth,
        sizeGrowth,
        sizeGrowthPercent
      });
    }
  }

  // Sort by absolute size growth
  growthData.sort((a, b) => Math.abs(b.sizeGrowth) - Math.abs(a.sizeGrowth));

  // Display top growing types
  console.log('   Top memory changes by object type:');
  const topTypes = growthData.slice(0, 8);
  
  for (const item of topTypes) {
    const sizeChange = (item.sizeGrowth / 1024 / 1024).toFixed(2);
    const sign = item.sizeGrowth >= 0 ? '+' : '';
    const emoji = item.sizeGrowth >= 0 ? '📈' : '📉';
    
    console.log(`   ${emoji} ${item.type}: ${sign}${sizeChange} MB (${sign}${item.countGrowth.toLocaleString()} objects)`);
  }
}

function calculateHeapSize(heap: any): number {
  let totalSize = 0;
  heap.nodes.forEach((node: any) => {
    totalSize += node.self_size || 0;
  });
  return totalSize;
}

export async function runMemlabLens(file: string): Promise<void> {
  const { spawn } = await import('node:child_process');
  const path = await import('node:path');
  
  // Smart path resolution - if file doesn't exist, try snapshots directory
  let resolvedFile = file;
  if (!file.includes('/') && !file.includes('\\')) {
    const snapshotPath = path.join('./snapshots', file);
    try {
      if (fs.existsSync(snapshotPath)) {
        resolvedFile = snapshotPath;
        console.log(`📁 Found snapshot in snapshots directory: ${resolvedFile}`);
      }
    } catch (e) {
      // Continue with original file path
    }
  }
  
  // Check if file exists
  if (!fs.existsSync(resolvedFile)) {
    console.error(`❌ File not found: ${resolvedFile}`);
    process.exit(1);
  }
  
  console.log(`📊 Starting MemLens for: ${resolvedFile}`);
  console.log('🚀 Starting MemLens web visualization...');
  
  try {
    // Use MemLens - it should start a web server
    console.log('🌐 Opening MemLens in your browser...');
    console.log('💡 This will start a local web server for heap visualization');
    console.log('⏹  Press Ctrl+C to stop the server when done');
    
    // Try to use MemLens programmatically first
    try {
      const lensModule = await import('@memlab/lens');
      
      // Check if it has server functionality (avoiding TypeScript errors)
      if (lensModule && (lensModule as any).startServer) {
        await (lensModule as any).startServer({ snapshotFile: resolvedFile });
        return;
      }
    } catch (importError) {
      console.log('📋 Using simplified web interface...');
    }
    
    // Fallback to Node.js script approach
    const nodeScript = `
import fs from 'fs';
import path from 'path';
import http from 'http';
import url from 'url';
import { spawn } from 'child_process';

const snapshotFile = '${resolvedFile}';

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  if (parsedUrl.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(\`
<!DOCTYPE html>
<html>
<head>
    <title>MemLens - Heap Visualization</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 8px; }
        .info { margin: 20px 0; }
        .button { 
            background: #007acc; color: white; padding: 10px 20px; 
            border: none; border-radius: 4px; cursor: pointer; margin: 5px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 MemLens - Heap Visualization</h1>
        <p>Analyzing: <strong>${path.basename(resolvedFile)}</strong></p>
    </div>
    
    <div class="info">
        <h2>📊 Heap Analysis Options</h2>
        <p>This is a simplified MemLens interface. For full functionality, use the complete MemLab suite.</p>
        
        <button class="button" onclick="window.open('/api/snapshot-info')">📈 Snapshot Info</button>
        <button class="button" onclick="window.open('/api/node-types')">🏷️  Node Types</button>
        <button class="button" onclick="alert('Feature coming soon!')">🔍 Memory Graph</button>
        
        <h3>💡 Next Steps:</h3>
        <ul>
            <li>Use <code>heap-analyzer trace &lt;file&gt; --node-id &lt;id&gt;</code> for specific object tracing</li>
            <li>Use <code>heap-analyzer compare &lt;before&gt; &lt;after&gt;</code> for memory growth analysis</li>
            <li>Use <code>heap-analyzer find-leaks</code> for automated leak detection</li>
        </ul>
    </div>
    
    <div class="info">
        <h3>🛠️ Available Commands:</h3>
        <code>
        heap-analyzer list<br>
        heap-analyzer analyze ${path.basename(resolvedFile)}<br>
        heap-analyzer trace ${path.basename(resolvedFile)} --node-id &lt;id&gt;
        </code>
    </div>
</body>
</html>
    \`);
  } else if (parsedUrl.pathname === '/api/snapshot-info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      file: snapshotFile,
      size: fs.statSync(snapshotFile).size,
      message: 'Use heap-analyzer CLI for detailed analysis'
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const port = 3000;
server.listen(port, () => {
  console.log(\`🚀 MemLens server running at http://localhost:\${port}\`);
  console.log(\`📊 Analyzing: \${snapshotFile}\`);
  console.log(\`⏹  Press Ctrl+C to stop the server\`);
  
  // Try to open browser
  const url = \`http://localhost:\${port}\`;
  
  let command;
  switch (process.platform) {
    case 'darwin': command = 'open'; break;
    case 'win32': command = 'start'; break;
    default: command = 'xdg-open'; break;
  }
  
  spawn(command, [url], { detached: true, stdio: 'ignore' }).unref();
});

process.on('SIGINT', () => {
  console.log('\\n👋 Shutting down MemLens server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});
`;
    
    // Write and execute the script
    const scriptPath = path.join(process.cwd(), 'temp-memlens.mjs');
    fs.writeFileSync(scriptPath, nodeScript);
    
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    // Clean up temp file when done
    const cleanup = () => {
      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    };
    
    return new Promise((resolve, reject) => {
      child.on('error', (error) => {
        cleanup();
        console.error('❌ Error launching MemLens:', error.message);
        reject(error);
      });
      
      child.on('exit', (code) => {
        cleanup();
        if (code === 0) {
          console.log('✅ MemLens session complete!');
          resolve();
        } else {
          console.error(`❌ MemLens exited with code ${code}`);
          resolve(); // Don't reject on user exit
        }
      });
      
      // Handle SIGINT for cleanup
      process.on('SIGINT', () => {
        cleanup();
        child.kill('SIGINT');
      });
    });
    
  } catch (error: any) {
    console.error('❌ Error running MemLens:', error.message);
    console.log('💡 MemLens provides web-based heap visualization');
    console.log('💡 For now, use other heap-analyzer commands for analysis');
    process.exit(1);
  }
}