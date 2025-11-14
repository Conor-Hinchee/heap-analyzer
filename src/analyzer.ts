import pkg from '@memlab/core';
const { utils } = pkg;
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

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.heapsnapshot'));
      
      // Try to find standard names or use first 3 files
      baseline = path.join(dir, files.find(f => f.includes('baseline')) || files[0]);
      target = path.join(dir, files.find(f => f.includes('target')) || files[1]);
      final = path.join(dir, files.find(f => f.includes('final')) || files[2]);

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
    
    console.log('\n💡 This is basic analysis. For detailed leak traces, memlab provides more advanced features.');
    
  } catch (error) {
    console.error('❌ Error detecting memory leaks:', error);
    process.exit(1);
  }
}

function calculateHeapSize(heap: any): number {
  let totalSize = 0;
  heap.nodes.forEach((node: any) => {
    totalSize += node.self_size || 0;
  });
  return totalSize;
}