/**
 * Simplified Memlab Object Inspector
 * Uses memlab analyze object with JSON output and nice formatting
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

interface MemlabObjectReference {
  name?: string;
  type?: string;
  fromNode?: number;
  toNode?: number;
}

export interface MemlabObjectData {
  id: number;
  name: string;
  type: string;
  selfsize: number;
  retainedSize: number;
  references?: MemlabObjectReference[];
  referrers?: MemlabObjectReference[];
}

/**
 * Inspect an object using memlab analyze object command
 */
export async function inspectMemlabObject(
  snapshotFile: string, 
  memlabId: string
): Promise<boolean> {
  try {
    console.log(`\n🔍 Inspecting memlab object ${memlabId} in ${path.basename(snapshotFile)}`);
    
    // Remove @ prefix if present
    const nodeId = memlabId.replace('@', '');
    
    // Run memlab analyze object command with JSON output
    const objectData = await runMemlabAnalyzeObjectJson(snapshotFile, nodeId);
    
    if (objectData) {
      displayFormattedObjectData(objectData);
      
      console.log('\n💡 For retention path analysis, run:');
      console.log(`   npx memlab trace --node-id ${nodeId} --snapshot ${snapshotFile}`);
      return true;
    }
    
    return false;

  } catch (error) {
    console.error('❌ Error inspecting memlab object:', error);
    return false;
  }
}

/**
 * Run memlab analyze object with JSON output and parse result
 */
async function runMemlabAnalyzeObjectJson(snapshotFile: string, nodeId: string): Promise<MemlabObjectData | null> {
  return new Promise<MemlabObjectData | null>((resolve) => {
    let jsonOutput = '';
    
    const childProcess = spawn('npx', [
      'memlab', 'analyze', 'object',
      '--node-id', nodeId,
      '--snapshot', snapshotFile,
      '--output', 'json'
    ], {
      stdio: ['pipe', 'pipe', 'inherit'] // Capture stdout for JSON parsing
    });

    childProcess.stdout.on('data', (data: Buffer) => {
      jsonOutput += data.toString();
    });

    childProcess.on('close', (code: number | null) => {
      if (code === 0 && jsonOutput.trim()) {
        try {
          const objectData = JSON.parse(jsonOutput.trim()) as MemlabObjectData;
          resolve(objectData);
        } catch (parseError) {
          console.error('❌ Failed to parse JSON output:', parseError);
          resolve(null);
        }
      } else {
        console.error(`❌ Memlab analyze failed (exit code ${code})`);
        resolve(null);
      }
    });

    childProcess.on('error', (error: Error) => {
      console.error('❌ Failed to run memlab analyze:', error);
      resolve(null);
    });
  });
}

// Export a direct data fetcher (no console formatting) for programmatic enrichment
export async function fetchMemlabObjectData(snapshotFile: string, memlabId: string): Promise<MemlabObjectData | null> {
  const nodeId = memlabId.replace('@', '');
  return runMemlabAnalyzeObjectJson(snapshotFile, nodeId);
}

/**
 * Display formatted object data in a readable way
 */
function displayFormattedObjectData(data: MemlabObjectData): void {
  console.log('\n📊 Object Analysis Results:');
  console.log('─'.repeat(50));
  
  // Basic info
  console.log(`🆔 Node ID: ${data.id}`);
  console.log(`📝 Name: ${data.name}`);
  console.log(`🏷️  Type: ${data.type}`);
  console.log(`📏 Self Size: ${formatBytes(data.selfsize)}`);
  console.log(`💾 Retained Size: ${formatBytes(data.retainedSize)}`);
  
  // References (objects this points to)
  if (data.references && data.references.length > 0) {
    console.log('\n👉 References (objects this points to):');
    data.references.slice(0, 10).forEach((ref, index) => {
      const name = ref.name || 'unnamed';
      const type = ref.type ? ` (${ref.type})` : '';
      const toNode = ref.toNode ? ` → @${ref.toNode}` : '';
      console.log(`   ${index + 1}. ${name}${type}${toNode}`);
    });
    if (data.references.length > 10) {
      console.log(`   ... and ${data.references.length - 10} more references`);
    }
  }
  
  // Referrers (objects pointing to this)
  if (data.referrers && data.referrers.length > 0) {
    console.log('\n👈 Referrers (objects pointing to this):');
    data.referrers.slice(0, 10).forEach((ref, index) => {
      const name = ref.name || 'unnamed';
      const fromNode = ref.fromNode ? ` @${ref.fromNode} →` : '';
      console.log(`   ${index + 1}.${fromNode} ${name}`);
    });
    if (data.referrers.length > 10) {
      console.log(`   ... and ${data.referrers.length - 10} more referrers`);
    }
  }
  
  console.log('─'.repeat(50));
}

/**
 * Format bytes in a human-readable way
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Legacy function for compatibility - just calls the simplified version
export function displayMemlabInspectionResult(): void {
  // This is now handled directly by the memlab command output
}