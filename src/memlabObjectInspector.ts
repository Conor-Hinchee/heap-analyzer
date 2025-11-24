/**
 * Memlab Object Inspector
 * 
 * Uses memlab's native APIs to inspect objects by their memlab IDs (@XXXXX format).
 * This bridges the gap between memlab's object identification and our detailed inspection.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

interface MemlabObjectInfo {
  id: string;
  name: string;
  type: string;
  selfSize: number;
  retainedSize: number;
  traceDetails: string[];
  retainerTrace: string[];
  edgeCount?: number;
}

interface MemlabInspectionResult {
  objectInfo: MemlabObjectInfo;
  retainerTrace: string[];
  rawOutput: string;
  insights: string[];
  recommendations: string[];
}

/**
 * Inspect an object using memlab's native trace command
 */
export async function inspectMemlabObject(
  snapshotFile: string, 
  memlabId: string
): Promise<MemlabInspectionResult | null> {
  try {
    console.log(`\n🔍 Inspecting memlab object ${memlabId} in ${path.basename(snapshotFile)}`);
    
    // Remove @ prefix if present, memlab trace expects just the number
    const nodeId = memlabId.replace('@', '');
    
    // Run memlab analyze object command to get detailed object information
    const analyzeOutput = await runMemlabAnalyzeObject(snapshotFile, nodeId);
    
    if (!analyzeOutput) {
      console.error(`❌ Failed to analyze object ${memlabId}`);
      return null;
    }

    // Also try to get retainer trace for additional context
    const traceOutput = await runMemlabTrace(snapshotFile, nodeId);

    // Parse the analyze output to extract object information
    const objectInfo = parseMemlabAnalyzeOutput(analyzeOutput, memlabId);
    const retainerTrace = traceOutput ? extractRetainerTrace(traceOutput) : [];
    const insights = generateMemlabInsights(objectInfo, retainerTrace);
    const recommendations = generateMemlabRecommendations(objectInfo, retainerTrace);

    return {
      objectInfo,
      retainerTrace,
      rawOutput: analyzeOutput,
      insights,
      recommendations
    };

  } catch (error) {
    console.error('❌ Error inspecting memlab object:', error);
    return null;
  }
}

/**
 * Run memlab analyze object command to get detailed object information
 */
async function runMemlabAnalyzeObject(snapshotFile: string, nodeId: string): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    const childProcess = spawn('npx', ['memlab', 'analyze', 'object', '--node-id', nodeId, '--snapshot', snapshotFile], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    childProcess.on('close', (code: number | null) => {
      if (code === 0) {
        const output = stdout.trim();
        if (output) {
          resolve(output);
        } else {
          console.error(`❌ Memlab analyze produced no output`);
          resolve(null);
        }
      } else {
        console.error(`❌ Memlab analyze failed (exit code ${code}):`, stderr);
        resolve(null);
      }
    });

    childProcess.on('error', (error: Error) => {
      reject(error);
    });
  });
}

/**
 * Run memlab trace command and return output
 */
async function runMemlabTrace(snapshotFile: string, nodeId: string): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    const childProcess = spawn('npx', ['memlab', 'trace', '--node-id', nodeId, '--snapshot', snapshotFile], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    childProcess.on('close', (code: number | null) => {
      if (code === 0) {
        // Memlab often outputs trace to stderr, so check both
        const output = stdout.trim() || stderr.trim();
        if (output) {
          resolve(output);
        } else {
          console.error(`❌ Memlab trace produced no output`);
          resolve(null);
        }
      } else {
        console.error(`❌ Memlab trace failed (exit code ${code}):`, stderr);
        resolve(null);
      }
    });

    childProcess.on('error', (error: Error) => {
      reject(error);
    });
  });
}

/**
 * Parse memlab analyze object output to extract object information
 */
function parseMemlabAnalyzeOutput(output: string, memlabId: string): MemlabObjectInfo {
  const lines = output.split('\n');
  
  let objectInfo: MemlabObjectInfo = {
    id: memlabId,
    name: 'unknown',
    type: 'unknown',
    selfSize: 0,
    retainedSize: 0,
    traceDetails: [],
    retainerTrace: [],
    edgeCount: 0
  };

  // Parse header info - format: "Heap node (object) @1857901"
  const headerMatch = output.match(/Heap node \(([^)]+)\) @(\d+)/);
  if (headerMatch) {
    objectInfo.type = headerMatch[1];
    objectInfo.id = '@' + headerMatch[2];
  }

  // Parse properties
  const nameMatch = output.match(/name: ([^\n]+)/);
  if (nameMatch) objectInfo.name = nameMatch[1];

  const referencesMatch = output.match(/# of references: (\d+)/);
  if (referencesMatch) objectInfo.edgeCount = parseInt(referencesMatch[1]);

  const shallowSizeMatch = output.match(/shallow size: (\d+)/);
  if (shallowSizeMatch) objectInfo.selfSize = parseInt(shallowSizeMatch[1]);

  const retainedSizeMatch = output.match(/retained size: (\d+)/);
  if (retainedSizeMatch) objectInfo.retainedSize = parseInt(retainedSizeMatch[1]);

  return objectInfo;
}

/**
 * Parse memlab trace output to extract object information (fallback)
 */
function parseMemlabTraceOutput(output: string, memlabId: string): MemlabObjectInfo {
  const lines = output.split('\n');
  
  // Find the target object line (should be the last line in the trace)
  let targetLine = '';
  let targetInfo: MemlabObjectInfo = {
    id: memlabId,
    name: 'unknown',
    type: 'unknown',
    selfSize: 0,
    retainedSize: 0,
    traceDetails: [],
    retainerTrace: []
  };

  // Look for the final object in the trace (the one we're inspecting)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.includes(memlabId.replace('@', ''))) {
      targetLine = line;
      break;
    }
  }

  if (targetLine) {
    // Parse object info from the trace line
    // Format: [Type] (category) @ID [size]
    const match = targetLine.match(/\[(.*?)\]\s*\(([^)]*)\)\s*@(\d+)\s*\[([^\]]+)\]/);
    if (match) {
      targetInfo.name = match[1] || 'unnamed';
      targetInfo.type = match[2] || 'object';
      targetInfo.id = '@' + match[3];
      
      // Parse size (could be KB, MB, etc.)
      const sizeStr = match[4];
      targetInfo.retainedSize = parseSizeString(sizeStr);
      targetInfo.selfSize = targetInfo.retainedSize; // Approximation
    }
  }

  // Extract all trace details
  targetInfo.traceDetails = lines.filter(line => line.trim() && !line.startsWith('Note:'));
  targetInfo.retainerTrace = extractRetainerTrace(output);

  return targetInfo;
}

/**
 * Extract retainer trace from memlab output
 */
function extractRetainerTrace(output: string): string[] {
  const lines = output.split('\n');
  const trace: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('Note:') && trimmed.includes('-->')) {
      trace.push(trimmed);
    }
  }
  
  return trace;
}

/**
 * Parse size strings like "32.2MB", "4KB", "152 bytes"
 */
function parseSizeString(sizeStr: string): number {
  const match = sizeStr.match(/([\d.]+)\s*(MB|KB|bytes|GB)/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  switch (unit) {
    case 'GB': return value * 1024 * 1024 * 1024;
    case 'MB': return value * 1024 * 1024;
    case 'KB': return value * 1024;
    case 'BYTES': return value;
    default: return value;
  }
}

/**
 * Generate insights about the memlab object
 */
function generateMemlabInsights(objectInfo: MemlabObjectInfo, retainerTrace: string[]): string[] {
  const insights: string[] = [];
  
  // Focus only on what's actually leaking
  if (objectInfo.retainedSize > 10 * 1024 * 1024) { // > 10MB
    insights.push(`🔴 ${formatBytes(objectInfo.retainedSize)} - Large ${objectInfo.name} object`);
  }
  
  // Check for common leak patterns
  if (retainerTrace.some(line => line.includes('memoryLeakArray'))) {
    insights.push('📊 Held by memoryLeakArray - accumulated objects not cleared');
  }
  
  return insights;
}

/**
 * Generate recommendations for the memlab object
 */
function generateMemlabRecommendations(objectInfo: MemlabObjectInfo, retainerTrace: string[]): string[] {
  const recommendations: string[] = [];
  
  // Simple, actionable fixes
  if (retainerTrace.some(line => line.includes('memoryLeakArray'))) {
    recommendations.push('🛠️ Clear the array: memoryLeakArray.length = 0');
  } else if (objectInfo.name === 'Array' && objectInfo.retainedSize > 1024 * 1024) {
    recommendations.push('🛠️ Clear large array contents');
  }
  
  return recommendations;
}

/**
 * Format bytes for display
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 bytes';
  
  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Display memlab inspection results
 */
export function displayMemlabInspectionResult(result: MemlabInspectionResult): void {
  const { objectInfo, insights, recommendations } = result;
  
  console.log(`\n🎯 ${objectInfo.id}: ${objectInfo.name} (${formatBytes(objectInfo.retainedSize)})`);
  
  if (insights.length > 0) {
    insights.forEach(insight => console.log(`   ${insight}`));
  }
  
  if (recommendations.length > 0) {
    recommendations.forEach(rec => console.log(`   ${rec}`));
  }
}