/**
 * Markdown Report Enricher
 * Updates analysis markdown reports with detailed object inspection results
 */

import fs from 'node:fs';
import path from 'node:path';
import { inspectMemlabObject } from './memlabObjectInspectorSimple.js';
import { spawn } from 'node:child_process';

export interface ObjectInspectionResult {
  id: number;
  name: string;
  type: string;
  selfsize: number;
  retainedSize: number;
  references?: Array<{
    name?: string;
    type?: string;
    fromNode?: number;
    toNode?: number;
  }>;
  referrers?: Array<{
    name?: string;
    fromNode?: number;
  }>;
}

export interface EnrichmentOptions {
  reportPath: string;
  snapshotFile?: string;
  maxObjects?: number;
  saveBackup?: boolean;
}

/**
 * Enrich a markdown report with detailed object inspection data
 */
export async function enrichMarkdownReport(options: EnrichmentOptions): Promise<boolean> {
  try {
    console.log(`\n🔍 Enriching analysis report: ${path.basename(options.reportPath)}`);
    
    if (!fs.existsSync(options.reportPath)) {
      console.error(`❌ Report file not found: ${options.reportPath}`);
      return false;
    }

    // Read the current report
    const reportContent = fs.readFileSync(options.reportPath, 'utf8');
    
    // Extract object IDs and snapshot file from the report
    const objectIds = extractObjectIds(reportContent);
    const snapshotFile = options.snapshotFile || extractSnapshotFile(reportContent);
    
    if (!snapshotFile) {
      console.error('❌ Could not determine snapshot file. Please specify --snapshot-file');
      return false;
    }

    if (!fs.existsSync(snapshotFile)) {
      console.error(`❌ Snapshot file not found: ${snapshotFile}`);
      return false;
    }

    console.log(`📊 Found ${objectIds.length} objects to inspect`);
    console.log(`📁 Using snapshot: ${path.basename(snapshotFile)}`);

    // Backup original report if requested
    if (options.saveBackup) {
      const backupPath = options.reportPath + '.backup';
      fs.copyFileSync(options.reportPath, backupPath);
      console.log(`💾 Backup saved: ${path.basename(backupPath)}`);
    }

    // Inspect each object and collect results
    const maxObjects = Math.min(objectIds.length, options.maxObjects || 10);
    const inspectionResults = new Map<string, ObjectInspectionResult>();

    for (let i = 0; i < maxObjects; i++) {
      const objectId = objectIds[i];
      console.log(`\n🔍 Inspecting object ${i + 1}/${maxObjects}: @${objectId}`);
      
      const result = await inspectObjectForEnrichment(snapshotFile, objectId);
      if (result) {
        inspectionResults.set(objectId, result);
        console.log(`✅ Collected data for @${objectId}: ${result.name} (${formatBytes(result.retainedSize)})`);
      } else {
        console.log(`⚠️ Could not inspect @${objectId}`);
      }
    }

    // Update the report with inspection results
    const enrichedContent = updateReportWithInspections(reportContent, inspectionResults);
    
    // Write the enriched report
    fs.writeFileSync(options.reportPath, enrichedContent);
    
    console.log(`\n✅ Report enriched with ${inspectionResults.size} detailed object inspections`);
    console.log(`📝 Updated: ${options.reportPath}`);
    
    return true;

  } catch (error) {
    console.error('❌ Error enriching report:', error);
    return false;
  }
}

/**
 * Extract object IDs from markdown report
 */
function extractObjectIds(content: string): string[] {
  const objectIdRegex = /@(\d+)\)/g;
  const matches = [];
  let match;
  
  while ((match = objectIdRegex.exec(content)) !== null) {
    matches.push(match[1]);
  }
  
  return [...new Set(matches)]; // Remove duplicates
}

/**
 * Extract snapshot file path from markdown report
 */
function extractSnapshotFile(content: string): string | null {
  // Look for trace commands in the report
  const traceCommandRegex = /`npx heap-analyzer inspect-object ([^`]+) --object-id/;
  const match = content.match(traceCommandRegex);
  
  if (match) {
    return match[1].trim();
  }
  
  return null;
}

/**
 * Inspect a specific object using memlab and return structured data
 */
async function inspectObjectForEnrichment(snapshotFile: string, objectId: string): Promise<ObjectInspectionResult | null> {
  try {
    // Run memlab analyze object with JSON output
    const result = await runMemlabAnalyzeObjectJson(snapshotFile, objectId);
    return result;
  } catch (error) {
    console.error(`Error inspecting object @${objectId}:`, error);
    return null;
  }
}

/**
 * Run memlab analyze object with JSON output
 */
async function runMemlabAnalyzeObjectJson(snapshotFile: string, nodeId: string): Promise<ObjectInspectionResult | null> {
  return new Promise<ObjectInspectionResult | null>((resolve) => {
    let jsonOutput = '';
    
    const childProcess = spawn('npx', [
      'memlab', 'analyze', 'object',
      '--node-id', nodeId,
      '--snapshot', snapshotFile,
      '--output', 'json'
    ], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    childProcess.stdout.on('data', (data: Buffer) => {
      jsonOutput += data.toString();
    });

    childProcess.on('close', (code: number | null) => {
      if (code === 0 && jsonOutput.trim()) {
        try {
          const objectData = JSON.parse(jsonOutput.trim()) as ObjectInspectionResult;
          resolve(objectData);
        } catch (parseError) {
          console.error('Failed to parse JSON output:', parseError);
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });

    childProcess.on('error', (error: Error) => {
      console.error('Failed to run memlab analyze:', error);
      resolve(null);
    });
  });
}

/**
 * Update the markdown report with detailed inspection results
 */
function updateReportWithInspections(content: string, inspections: Map<string, ObjectInspectionResult>): string {
  let updatedContent = content;
  
  // For each inspection result, find and enhance the corresponding section
  for (const [objectId, data] of inspections) {
    const sectionRegex = new RegExp(`(### \\d+\\. ${data.name} \\(@${objectId}\\)[\\s\\S]*?)(?=### \\d+\\.|$)`, 'g');
    
    updatedContent = updatedContent.replace(sectionRegex, (match) => {
      return enhanceObjectSection(match, data);
    });
  }
  
  // Add enrichment metadata
  const timestamp = new Date().toISOString();
  const enrichmentNote = `\n---\n\n*📊 Report enriched with detailed object analysis on ${timestamp}*\n*🔍 ${inspections.size} objects inspected with memlab analyze object*\n`;
  
  // Insert before the final section or at the end
  if (updatedContent.includes('---\n\n## 🔧')) {
    updatedContent = updatedContent.replace('---\n\n## 🔧', enrichmentNote + '\n---\n\n## 🔧');
  } else {
    updatedContent += enrichmentNote;
  }
  
  return updatedContent;
}

/**
 * Enhance a single object section with detailed inspection data
 */
function enhanceObjectSection(originalSection: string, data: ObjectInspectionResult): string {
  // Extract the header and basic info
  const lines = originalSection.split('\n');
  const headerLine = lines[0];
  
  // Build enhanced section
  const enhanced = [
    headerLine,
    `- **Type:** ${data.type}`,
    `- **Self Size:** ${formatBytes(data.selfsize)}`,
    `- **Retained Size:** ${formatBytes(data.retainedSize)}`,
    `- **Node ID:** ${data.id}`,
    ''
  ];
  
  // Add reference information
  if (data.referrers && data.referrers.length > 0) {
    enhanced.push('**🔗 Referenced By:**');
    const topReferrers = data.referrers.slice(0, 5);
    topReferrers.forEach(ref => {
      const refName = ref.name || 'unnamed';
      const fromNode = ref.fromNode ? ` (@${ref.fromNode})` : '';
      enhanced.push(`- ${refName}${fromNode}`);
    });
    
    if (data.referrers.length > 5) {
      enhanced.push(`- *... and ${data.referrers.length - 5} more referrers*`);
    }
    enhanced.push('');
  }
  
  if (data.references && data.references.length > 0) {
    enhanced.push('**👉 Points To:**');
    const topReferences = data.references.slice(0, 5);
    topReferences.forEach(ref => {
      const refName = ref.name || 'unnamed';
      const toNode = ref.toNode ? ` (@${ref.toNode})` : '';
      const refType = ref.type ? ` (${ref.type})` : '';
      enhanced.push(`- ${refName}${refType}${toNode}`);
    });
    
    if (data.references.length > 5) {
      enhanced.push(`- *... and ${data.references.length - 5} more references*`);
    }
    enhanced.push('');
  }
  
  // Add analysis commands (keep existing trace command if present)
  const traceCommandMatch = originalSection.match(/- \*\*Trace Command:\*\* `([^`]+)`/);
  if (traceCommandMatch) {
    enhanced.push(`**🔍 Analysis Commands:**`);
    enhanced.push(`- **Object Inspection:** \`${traceCommandMatch[1]}\``);
    enhanced.push(`- **Retention Path:** \`npx memlab trace --node-id ${data.id} --snapshot [snapshot-file]\``);
  }
  
  enhanced.push('');
  
  return enhanced.join('\n');
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

/**
 * Command-line interface for enriching reports
 */
export async function enrichReportFromCLI(reportPath: string, options: {
  snapshotFile?: string;
  maxObjects?: number;
  backup?: boolean;
}): Promise<boolean> {
  console.log('🔍 Starting markdown report enrichment...');
  
  const success = await enrichMarkdownReport({
    reportPath,
    snapshotFile: options.snapshotFile,
    maxObjects: options.maxObjects || 10,
    saveBackup: options.backup !== false
  });
  
  if (success) {
    console.log('\n🎉 Report enrichment completed successfully!');
    console.log(`📖 View enriched report: ${reportPath}`);
  } else {
    console.log('\n❌ Report enrichment failed');
  }
  
  return success;
}