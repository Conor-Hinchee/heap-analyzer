/**
 * Node.js-specific heap analysis utilities
 * Extends heap-analyzer with Node.js server monitoring capabilities
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

export interface NodeSnapshotOptions {
  endpoint?: string;
  output?: string;
  pid?: number;
  signal?: string;
}

export interface NodeMonitorOptions {
  pid?: number;
  interval?: number; // minutes
  threshold?: number; // MB
  outputDir?: string;
  webhookUrl?: string;
}

/**
 * Take a heap snapshot from a running Node.js process
 */
export async function takeNodeSnapshot(options: NodeSnapshotOptions): Promise<string | null> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultOutput = `node-heap-${timestamp}.heapsnapshot`;
    const outputFile = options.output || defaultOutput;

    if (options.endpoint) {
      // Method 1: HTTP endpoint
      console.log(`📸 Taking heap snapshot via HTTP endpoint: ${options.endpoint}`);
      
      const response = await fetch(options.endpoint);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`✅ Snapshot created: ${result.snapshot || outputFile}`);
      return result.snapshot || outputFile;
      
    } else if (options.pid) {
      // Method 2: Process signal
      console.log(`📸 Sending ${options.signal || 'SIGUSR2'} to PID ${options.pid}`);
      
      process.kill(options.pid, options.signal || 'SIGUSR2');
      
      // Wait a moment for snapshot to be written
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Look for newly created snapshot files
      const snapshotDir = './';
      const files = fs.readdirSync(snapshotDir)
        .filter(f => f.endsWith('.heapsnapshot'))
        .map(f => ({ 
          name: f, 
          path: path.join(snapshotDir, f),
          mtime: fs.statSync(path.join(snapshotDir, f)).mtime 
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      
      if (files.length > 0) {
        const latestSnapshot = files[0].name;
        console.log(`✅ Latest snapshot: ${latestSnapshot}`);
        return latestSnapshot;
      } else {
        console.log('⚠️ No snapshot file found. Make sure the Node.js process supports heap snapshots.');
        return null;
      }
    } else {
      throw new Error('Either endpoint or pid must be specified');
    }
    
  } catch (error) {
    console.error('❌ Error taking Node.js heap snapshot:', error);
    return null;
  }
}

/**
 * Monitor a Node.js process and automatically take snapshots when memory usage is high
 */
export async function monitorNodeProcess(options: NodeMonitorOptions): Promise<void> {
  const pid = options.pid || await findNodeProcess();
  if (!pid) {
    console.error('❌ No Node.js process found. Specify --pid or ensure a Node.js process is running.');
    return;
  }

  const interval = (options.interval || 5) * 60 * 1000; // Convert minutes to ms
  const threshold = (options.threshold || 500) * 1024 * 1024; // Convert MB to bytes
  const outputDir = options.outputDir || './node-snapshots';

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`🖥️ Monitoring Node.js process PID ${pid}`);
  console.log(`⏰ Check interval: ${options.interval || 5} minutes`);
  console.log(`📊 Memory threshold: ${options.threshold || 500} MB`);
  console.log(`📁 Output directory: ${outputDir}`);

  let baselineMemory: number | null = null;

  const checkMemory = async () => {
    try {
      // Get process memory info (this is simplified - in reality you'd need to connect to the process)
      const memoryInfo = await getProcessMemoryInfo(pid);
      
      if (!memoryInfo) {
        console.log(`⚠️ Could not get memory info for PID ${pid}`);
        return;
      }

      const currentMemory = memoryInfo.heapUsed;
      const memoryMB = Math.round(currentMemory / 1024 / 1024);

      console.log(`📊 Current heap usage: ${memoryMB} MB`);

      // Check if we need to take a snapshot
      let shouldTakeSnapshot = false;
      let reason = '';

      if (currentMemory > threshold) {
        shouldTakeSnapshot = true;
        reason = `Memory usage (${memoryMB} MB) exceeds threshold (${options.threshold || 500} MB)`;
      } else if (baselineMemory && currentMemory > baselineMemory * 1.5) {
        shouldTakeSnapshot = true;
        reason = `Memory growth: ${Math.round(((currentMemory - baselineMemory) / baselineMemory) * 100)}% increase`;
      }

      if (shouldTakeSnapshot) {
        console.log(`🚨 ${reason}`);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const snapshotFile = path.join(outputDir, `node-heap-${timestamp}.heapsnapshot`);
        
        const snapshot = await takeNodeSnapshot({ 
          pid, 
          output: snapshotFile 
        });
        
        if (snapshot && options.webhookUrl) {
          // Send alert webhook
          await sendAlert(options.webhookUrl, {
            type: 'memory_alert',
            pid,
            reason,
            memoryMB,
            snapshot: snapshot,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Update baseline
      if (!baselineMemory) {
        baselineMemory = currentMemory;
        console.log(`📏 Baseline memory set: ${memoryMB} MB`);
      }

    } catch (error) {
      console.error('❌ Error during memory check:', error);
    }
  };

  // Initial check
  await checkMemory();

  // Set up interval monitoring
  const monitorInterval = setInterval(checkMemory, interval);

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping Node.js process monitoring...');
    clearInterval(monitorInterval);
    process.exit(0);
  });

  console.log('✅ Monitoring started. Press Ctrl+C to stop.');
}

/**
 * Find running Node.js processes
 */
async function findNodeProcess(): Promise<number | null> {
  try {
    // This is a simplified version - in reality you'd use ps or similar
    const processes = spawn('pgrep', ['-f', 'node'], { stdio: 'pipe' });
    
    return new Promise((resolve) => {
      let output = '';
      
      processes.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      processes.on('close', (code) => {
        if (code === 0 && output.trim()) {
          const pids = output.trim().split('\n').map(p => parseInt(p));
          // Return the first non-current process PID
          const targetPid = pids.find(pid => pid !== process.pid);
          resolve(targetPid || null);
        } else {
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('Error finding Node.js process:', error);
    return null;
  }
}

/**
 * Get memory information for a process (simplified - would need actual implementation)
 */
async function getProcessMemoryInfo(pid: number): Promise<{ heapUsed: number; heapTotal: number } | null> {
  // This is a placeholder - in reality you'd need to:
  // 1. Connect to the Node.js inspector
  // 2. Use the Runtime.getHeapUsage API
  // 3. Or parse /proc/{pid}/status on Linux
  
  try {
    // Simplified mock - replace with actual implementation
    return {
      heapUsed: Math.random() * 500 * 1024 * 1024, // 0-500MB
      heapTotal: 512 * 1024 * 1024 // 512MB
    };
  } catch (error) {
    return null;
  }
}

/**
 * Send alert webhook
 */
async function sendAlert(webhookUrl: string, alert: any): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(alert)
    });
    
    if (response.ok) {
      console.log('📢 Alert sent successfully');
    } else {
      console.log(`⚠️ Alert webhook failed: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Error sending alert:', error);
  }
}

/**
 * Generate heap snapshots during load test
 */
export async function loadTestWithSnapshots(options: {
  targetUrl: string;
  snapshotEndpoint: string;
  duration: number; // seconds
  concurrency: number;
  outputDir?: string;
}): Promise<string[]> {
  const outputDir = options.outputDir || './load-test-snapshots';
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const snapshots: string[] = [];

  try {
    console.log('🎯 Starting load test with heap snapshot collection');
    
    // Take baseline snapshot
    console.log('📸 Taking baseline snapshot...');
    const baseline = await takeNodeSnapshot({
      endpoint: options.snapshotEndpoint,
      output: path.join(outputDir, 'baseline.heapsnapshot')
    });
    if (baseline) snapshots.push(baseline);

    // Start load test
    console.log(`🚀 Starting load test: ${options.concurrency} concurrent users, ${options.duration}s duration`);
    
    const loadTest = spawn('npx', [
      'autocannon',
      '-c', options.concurrency.toString(),
      '-d', options.duration.toString(),
      '--json',
      options.targetUrl
    ], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    // Take snapshots during load test
    const snapshotInterval = setInterval(async () => {
      const timestamp = Date.now();
      const snapshot = await takeNodeSnapshot({
        endpoint: options.snapshotEndpoint,
        output: path.join(outputDir, `during-load-${timestamp}.heapsnapshot`)
      });
      if (snapshot) snapshots.push(snapshot);
    }, 10000); // Every 10 seconds

    // Wait for load test to complete
    await new Promise((resolve) => {
      let output = '';
      
      loadTest.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      loadTest.on('close', (code) => {
        clearInterval(snapshotInterval);
        
        if (code === 0) {
          try {
            const results = JSON.parse(output);
            console.log(`✅ Load test completed:`);
            console.log(`   Requests: ${results.requests.total}`);
            console.log(`   Duration: ${results.duration}s`);
            console.log(`   RPS: ${results.requests.average}`);
          } catch (e) {
            console.log('✅ Load test completed');
          }
        }
        
        resolve(code);
      });
    });

    // Take final snapshot
    console.log('📸 Taking final snapshot...');
    const final = await takeNodeSnapshot({
      endpoint: options.snapshotEndpoint,
      output: path.join(outputDir, 'final.heapsnapshot')
    });
    if (final) snapshots.push(final);

    console.log(`📊 Generated ${snapshots.length} heap snapshots in ${outputDir}`);
    console.log('🔍 Run analysis with:');
    console.log(`   npx heap-analyzer find-leaks --baseline ${snapshots[0]} --target ${snapshots[snapshots.length - 1]} --trace-all-objects`);

    return snapshots;

  } catch (error) {
    console.error('❌ Error during load test with snapshots:', error);
    return snapshots;
  }
}