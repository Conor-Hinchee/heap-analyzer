import * as fs from 'fs';
import * as path from 'path';

// JSON Schema Interfaces
interface AnalysisMetadata {
  timestamp: string;
  sessionId: string;
  analysisType: 'website' | 'nodejs' | 'unknown';
  target: {
    name: string;
    url?: string;
    title?: string;
    domain?: string;
  };
  snapshots: {
    baseline: string;
    target?: string;
    final: string;
    totalSize: number;
    count: number;
  };
  performance: {
    analysisDuration?: number;
    memlabVersion?: string;
    toolVersion: string;
  };
}

interface MemoryObject {
  id: string;
  type: string;
  size: string;
  sizeBytes: number;
  edges: number;
  refs: string[];
  category: 'dom' | 'javascript' | 'data' | 'framework' | 'unknown';
  investigated?: boolean;
}

interface LeakPattern {
  id: string;
  count: number;
  retainedSize: string;
  retainedSizeBytes: number;
  description: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  stackTrace?: string[];
  remediation?: string;
}

interface GlobalVariable {
  name: string;
  id: string;
  type: string;
  size: string;
  sizeBytes: number;
  edges: number;
  refs: string[];
}

interface DetachedDOMElement {
  id: string;
  element: string;
  retainedSize: string;
  retainedSizeBytes: number;
  retainedBy?: string;
}

interface UnboundCollection {
  id: string;
  type: string;
  growth: string;
  itemCount: {
    baseline?: number;
    target?: number;
    final?: number;
  };
}

interface RetentionPathStep {
  edge: string;
  edgeType: 'variable' | 'property' | 'element' | 'internal' | 'weak' | 'shortcut';
  object: string;
  type: 'native' | 'object' | 'closure' | 'string' | 'number' | 'array';
  nodeId: string;
  size: string;
}

interface ObjectInvestigation {
  objectId: string;
  snapshot: string;
  investigatedAt: string;
  objectDetails: {
    id: number;
    name: string;
    type: string;
    selfSizeBytes: number;
    retainedSizeBytes: number;
    topReferences: Array<{ name: string; toNode: number }>;
    topReferrers: Array<{ name: string; fromNode: number }>;
  };
  retentionPath: RetentionPathStep[];
}

interface AnalysisSummary {
  totalLeaks: number;
  totalRetainedSize: string;
  totalRetainedSizeBytes: number;
  criticalIssues: number;
  severityBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  topCategories: string[];
}

interface AnalysisReport {
  schema: {
    version: '1.0.0';
    generatedAt: string;
  };
  metadata: AnalysisMetadata;
  summary: AnalysisSummary;
  memoryObjects: MemoryObject[];
  leakPatterns: LeakPattern[];
  globalVariables: GlobalVariable[];
  detachedDOM: DetachedDOMElement[];
  unboundCollections: UnboundCollection[];
  recommendations: {
    immediate: string[];
    commands: string[];
    nextSteps: string[];
  };
  investigations?: ObjectInvestigation[];
}

// Legacy interfaces for backward compatibility
interface LeakSummary {
  count: number;
  retainedSize: string;
  description: string;
}

interface LeakPatternConfig {
  keywords: string[];
  description: string;
  category: string;
  priority: number;
}

// Configurable leak patterns - can be externalized to config file
const LEAK_PATTERNS: LeakPatternConfig[] = [
  {
    keywords: ['Timer(', 'setInterval(', 'setTimeout(', 'clearInterval', 'clearTimeout'],
    description: 'Timer/Interval leak - cleanup needed',
    category: 'timers',
    priority: 1
  },
  {
    keywords: ['React.Context', 'FiberNode', 'ReactInternalInstance', 'React.Component'],
    description: 'React component memory retention',
    category: 'react',
    priority: 2
  },
  {
    keywords: ['DOMTimer', 'ScheduledAction', 'MutationObserver', 'addEventListener'],
    description: 'DOM timer/callback leak',
    category: 'dom',
    priority: 1
  },
  {
    keywords: ['DetachedText', 'HTMLElement', 'DocumentFragment', 'Node.appendChild'],
    description: 'Detached DOM elements',
    category: 'dom',
    priority: 2
  },
  {
    keywords: ['PerformanceEventTiming', 'PerformanceEntry', 'PerformanceObserver'],
    description: 'Performance API accumulation',
    category: 'performance',
    priority: 3
  },
  {
    keywords: ['EventListener', 'AbortController', 'Promise.resolve', 'Promise.reject'],
    description: 'Event/Promise leak - cleanup needed',
    category: 'events',
    priority: 2
  },
  {
    keywords: ['Array(', 'Object.create', 'new Map(', 'new Set(', 'new WeakMap('],
    description: 'Large data structure accumulation',
    category: 'data-structures',
    priority: 3
  }
];

/**
 * Utility functions for data conversion
 */
function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^([\d.]+)\s*(bytes?|KB|MB|GB)$/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case 'gb': return Math.round(value * 1024 * 1024 * 1024);
    case 'mb': return Math.round(value * 1024 * 1024);
    case 'kb': return Math.round(value * 1024);
    default: return Math.round(value);
  }
}

function categorizeObject(type: string, refs: string[]): MemoryObject['category'] {
  const typeStr = type.toLowerCase();
  const refStr = refs.join(' ').toLowerCase();
  
  if (typeStr.includes('html') || typeStr.includes('dom') || typeStr.includes('element')) {
    return 'dom';
  }
  if (typeStr.includes('react') || typeStr.includes('fiber') || refStr.includes('react')) {
    return 'framework';
  }
  if (typeStr.includes('array') || typeStr.includes('object') || typeStr.includes('map')) {
    return 'data';
  }
  if (typeStr.includes('function') || typeStr.includes('closure') || typeStr.includes('context')) {
    return 'javascript';
  }
  
  return 'unknown';
}

function calculatePriority(retainedSizeBytes: number, count: number): LeakPattern['priority'] {
  const mb = 1024 * 1024;
  
  if (retainedSizeBytes >= 10 * mb || count >= 1000) return 'critical';
  if (retainedSizeBytes >= 1 * mb || count >= 100) return 'high';
  if (retainedSizeBytes >= 100 * 1024 || count >= 10) return 'medium';
  return 'low';
}

/**
 * Extract metadata from snapshot directory and files
 */
function extractMetadata(outputDir: string, timestamp: string): AnalysisMetadata {
  const snapshotFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.heapsnapshot'));
  const metaFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.meta.json'));
  
  // Calculate total size
  let totalSize = 0;
  snapshotFiles.forEach(file => {
    const filePath = path.join(outputDir, file);
    totalSize += fs.statSync(filePath).size;
  });
  
  // Extract target information from meta files or directory name
  let target: AnalysisMetadata['target'] = { name: 'Unknown Target' };
  let analysisType: AnalysisMetadata['analysisType'] = 'unknown';
  
  if (metaFiles.length > 0) {
    try {
      const metaPath = path.join(outputDir, metaFiles[0]);
      const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      
      if (metaData.url) {
        // Website analysis
        analysisType = 'website';
        const urlObj = new URL(metaData.url);
        target = {
          name: metaData.title || urlObj.hostname,
          url: metaData.url,
          title: metaData.title,
          domain: urlObj.hostname.replace(/^www\./, '')
        };
      }
    } catch (error) {
      console.warn('Failed to parse metadata:', error);
    }
  }
  
  // Fallback: detect from directory name
  if (analysisType === 'unknown') {
    const dirName = path.basename(outputDir);
    if (dirName.includes('browser-snapshots')) {
      analysisType = 'website';
      const domainMatch = dirName.match(/browser-snapshots-\d+-(.+)$/);
      if (domainMatch) {
        const domain = domainMatch[1].replace(/_/g, '.');
        target = {
          name: domain,
          domain: domain
        };
      }
    } else {
      analysisType = 'nodejs';
      target = { name: 'Node.js Application' };
    }
  }
  
  // Get full paths for snapshots
  const baselineFile = snapshotFiles.find(f => f.includes('before')) || snapshotFiles[0] || '';
  const targetFile = snapshotFiles.find(f => f.includes('after'));
  const finalFile = snapshotFiles.find(f => f.includes('final')) || snapshotFiles[snapshotFiles.length - 1] || '';
  
  return {
    timestamp,
    sessionId: timestamp,
    analysisType,
    target,
    snapshots: {
      baseline: baselineFile ? path.join(outputDir, baselineFile) : '',
      target: targetFile ? path.join(outputDir, targetFile) : undefined,
      final: finalFile ? path.join(outputDir, finalFile) : '',
      totalSize,
      count: snapshotFiles.length
    },
    performance: {
      toolVersion: process.env.npm_package_version || '1.0.0'
    }
  };
}

/**
 * Generate dynamic title based on analysis context
 */
function generateDynamicTitle(report: AnalysisReport): string {
  const { metadata, summary } = report;
  
  // Severity indicator
  const severityIndicator = summary.criticalIssues > 0 ? '🚨' : 
                           summary.severityBreakdown.high > 0 ? '⚠️' : 
                           summary.severityBreakdown.medium > 0 ? '📊' : '✅';
  
  let targetName = metadata.target.name;
  
  if (metadata.analysisType === 'website') {
    // For websites, prefer title over domain
    if (metadata.target.title && metadata.target.domain) {
      targetName = `${metadata.target.title} (${metadata.target.domain})`;
    } else {
      targetName = metadata.target.domain || metadata.target.url || targetName;
    }
  } else if (metadata.analysisType === 'nodejs') {
    if (!targetName.toLowerCase().includes('node')) {
      targetName = `${targetName} (Node.js)`;
    }
  }
  
  return `${severityIndicator} Memory Analysis of ${targetName}`;
}

/**
 * Convert legacy data to new JSON schema
 */
function createAnalysisReport(
  outputDir: string,
  timestamp: string,
  legacyObjects: any[],
  legacyLeaks: any[],
  rawAnalysisDir: string
): AnalysisReport {
  const startTime = Date.now();
  
  // Extract metadata
  const metadata = extractMetadata(outputDir, timestamp);
  
  // Convert memory objects
  const memoryObjects: MemoryObject[] = legacyObjects.map((obj, index) => ({
    id: obj.id,
    type: obj.type,
    size: obj.size,
    sizeBytes: parseSize(obj.size),
    edges: obj.edges,
    refs: obj.refs || [],
    category: categorizeObject(obj.type, obj.refs || [])
  }));
  
  // Parse Phase 1 analysis results
  let globalVariables: GlobalVariable[] = [];
  let detachedDOM: DetachedDOMElement[] = [];
  let unboundCollections: UnboundCollection[] = [];
  
  try {
    const globalVarPath = path.join(rawAnalysisDir, `global-variable-${timestamp}.txt`);
    if (fs.existsSync(globalVarPath)) {
      const globalVarContent = fs.readFileSync(globalVarPath, 'utf8');
      globalVariables = parseGlobalVariableReport(globalVarContent);
    }
  } catch (error) {
    console.warn('⚠️  Could not parse global-variable report:', error);
  }
  
  try {
    const detachedDOMPath = path.join(rawAnalysisDir, `detached-dom-${timestamp}.txt`);
    if (fs.existsSync(detachedDOMPath)) {
      const detachedDOMContent = fs.readFileSync(detachedDOMPath, 'utf8');
      detachedDOM = parseDetachedDOMReport(detachedDOMContent);
    }
  } catch (error) {
    console.warn('⚠️  Could not parse detached-DOM report:', error);
  }
  
  try {
    const unboundCollectionPath = path.join(rawAnalysisDir, `unbound-collection-${timestamp}.txt`);
    if (fs.existsSync(unboundCollectionPath)) {
      const unboundCollectionContent = fs.readFileSync(unboundCollectionPath, 'utf8');
      unboundCollections = parseUnboundCollectionReport(unboundCollectionContent);
    }
  } catch (error) {
    console.warn('⚠️  Could not parse unbound-collection report:', error);
  }
  
  // Continue with existing leak pattern conversion
  
  // Convert leak patterns
  const leakPatterns: LeakPattern[] = legacyLeaks.map((leak, index) => {
    const sizeBytes = parseSize(leak.retainedSize);
    return {
      id: `leak-${index + 1}`,
      count: leak.count,
      retainedSize: leak.retainedSize,
      retainedSizeBytes: sizeBytes,
      description: leak.description,
      category: detectLeakCategory(leak.description),
      priority: calculatePriority(sizeBytes, leak.count),
      confidence: calculateConfidence(leak.description)
    };
  });
  
  // Calculate summary statistics
  const totalRetainedSizeBytes = leakPatterns.reduce((sum, leak) => sum + leak.retainedSizeBytes, 0);
  const severityBreakdown = leakPatterns.reduce((acc, leak) => {
    acc[leak.priority]++;
    return acc;
  }, { critical: 0, high: 0, medium: 0, low: 0 });
  
  const summary: AnalysisSummary = {
    totalLeaks: leakPatterns.length,
    totalRetainedSize: formatSize(totalRetainedSizeBytes),
    totalRetainedSizeBytes,
    criticalIssues: severityBreakdown.critical + severityBreakdown.high,
    severityBreakdown,
    topCategories: getTopCategories(leakPatterns)
  };
  
  // Generate recommendations
  const recommendations = generateRecommendations(memoryObjects, leakPatterns, metadata);
  
  // Performance tracking
  metadata.performance.analysisDuration = Date.now() - startTime;
  
  return {
    schema: {
      version: '1.0.0',
      generatedAt: new Date().toISOString()
    },
    metadata,
    summary,
    memoryObjects,
    leakPatterns,
    globalVariables,
    detachedDOM,
    unboundCollections,
    recommendations
  };
}

function detectLeakCategory(description: string): string {
  const desc = description.toLowerCase();
  
  if (desc.includes('timer') || desc.includes('interval')) return 'timers';
  if (desc.includes('react') || desc.includes('component')) return 'react';
  if (desc.includes('dom') || desc.includes('element')) return 'dom';
  if (desc.includes('event') || desc.includes('promise')) return 'events';
  if (desc.includes('data') || desc.includes('array') || desc.includes('object')) return 'data-structures';
  if (desc.includes('performance')) return 'performance';
  
  return 'unknown';
}

function calculateConfidence(description: string): number {
  // Higher confidence for specific patterns
  if (description.includes('Timer') || description.includes('React') || description.includes('DOM')) {
    return 0.9;
  }
  if (description.includes('leak') || description.includes('cleanup')) {
    return 0.8;
  }
  if (description.includes('accumulation') || description.includes('retention')) {
    return 0.7;
  }
  return 0.5; // Default confidence for generic patterns
}

function getTopCategories(leakPatterns: LeakPattern[]): string[] {
  const categoryCount = leakPatterns.reduce((acc, leak) => {
    acc[leak.category] = (acc[leak.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return Object.entries(categoryCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([category]) => category);
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${bytes} bytes`;
}

/**
 * Generate markdown report from JSON file
 */
export async function generateMarkdownReport(jsonPath: string, outputPath?: string): Promise<void> {
  try {
    console.log('📄 Reading JSON report:', jsonPath);
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    const report: AnalysisReport = JSON.parse(jsonContent);
    
    // Generate markdown from JSON
    const markdownReport = generateMarkdownFromJSON(report);
    
    // Determine output path
    const mdPath = outputPath || jsonPath.replace(/\.json$/, '.md').replace('ANALYSIS-DATA', 'ANALYSIS-SUMMARY');
    
    // Save markdown report
    fs.writeFileSync(mdPath, markdownReport);
    console.log('✅ Markdown report generated:', path.basename(mdPath));
    
    return;
  } catch (error) {
    console.error('❌ Failed to generate markdown report:', error);
    throw error;
  }
}

function generateRecommendations(
  memoryObjects: MemoryObject[],
  leakPatterns: LeakPattern[],
  metadata: AnalysisMetadata
): AnalysisReport['recommendations'] {
  const immediate: string[] = [];
  const commands: string[] = [];
  let nextSteps: string[] = [];
  
  // Immediate actions based on critical issues
  const criticalLeaks = leakPatterns.filter(l => l.priority === 'critical' || l.priority === 'high');
  criticalLeaks.slice(0, 3).forEach((leak, index) => {
    immediate.push(`Investigate ${leak.description} (${leak.retainedSize} impact)`);
  });
  
  // Investigation commands for top objects
  const topObjects = memoryObjects.slice(0, 3);
  topObjects.forEach((obj) => {
    // Emit investigate (combined inspect + trace) directly for consistency
    commands.push(`npx heap-analyzer investigate "${metadata.snapshots.final}" --object-id @${obj.id}`);
  });
  
  // Next steps should pair inspect + trace for the same object when possible
  const finalSnapshot = metadata.snapshots.final;
  const paired: string[] = [];
  topObjects.forEach((obj) => {
    const inspectCmd = `npx heap-analyzer investigate "${finalSnapshot}" --object-id @${obj.id}`;
    paired.push(inspectCmd);
  });
  nextSteps = paired.length ? paired : [...commands];
  
  return { immediate, commands, nextSteps };
}

/**
 * Find investigation data for a given object
 */
function getInvestigationForObject(objectId: string, investigations?: ObjectInvestigation[]): ObjectInvestigation | undefined {
  if (!investigations) return undefined;
  return investigations.find(inv => inv.objectId === objectId);
}

/**
 * Format retention path as numbered steps
 */
function formatRetentionPath(path: RetentionPathStep[]): string {
  if (path.length === 0) return '*No retention path available*';
  
  const steps = path.map((step, index) => {
    const stepNum = index + 1;
    const edgeInfo = step.edgeType !== 'element' ? `(${step.edgeType})` : '';
    return `${stepNum}. ${step.object} (@${step.nodeId}) ${edgeInfo} - ${step.size}`;
  });
  
  return steps.join('\n   ');
}

/**
 * Extract root cause variable from retention path
 */
function extractRootCauseVariable(path: RetentionPathStep[]): { variable: string; edgeType: string; nodeId: string } | null {
  if (path.length === 0) return null;
  const lastStep = path[path.length - 1];
  return {
    variable: lastStep.edge,
    edgeType: lastStep.edgeType,
    nodeId: lastStep.nodeId
  };
}

/**
 * Identify critical nodes in retention path (closures, event listeners, scopes)
 */
function extractCriticalNodes(path: RetentionPathStep[]): string[] {
  const critical: string[] = [];
  
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    if (step.object.includes('closure')) {
      critical.push(`Step ${i + 1}: Event handler closure (@${step.nodeId})`);
    }
    if (step.object.includes('EventListener')) {
      critical.push(`Step ${i + 1}: Event listener (@${step.nodeId})`);
    }
    if (step.object.includes('function scope')) {
      critical.push(`Step ${i + 1}: Function scope capturing variables (@${step.nodeId}, ${step.size})`);
    }
  }
  
  return critical;
}

/**
 * Build markdown for investigated object
 */
function buildInvestigationMarkdown(investigation: ObjectInvestigation, finalSnapshot: string): string {
  const details = investigation.objectDetails;
  const rootCause = extractRootCauseVariable(investigation.retentionPath);
  const criticalNodes = extractCriticalNodes(investigation.retentionPath);
  const topRefStr = details.topReferences.slice(0, 10).map(r => r.toNode).join(', @');
  const heldByStr = details.topReferrers.map(r => '`' + r.name + '` (from @' + r.fromNode + ')').join(', ');
  
  let markdown = '\n#### Object Details\n';
  markdown += `- **Self Size:** ${details.selfSizeBytes} bytes\n`;
  markdown += `- **Retained Size:** ${details.retainedSizeBytes.toLocaleString()} bytes\n`;
  markdown += `- **Top References:** ${details.topReferences.length} edges (first 10 indices: @${topRefStr})\n`;
  markdown += `- **Held By:** ${details.topReferrers.length > 0 ? heldByStr : 'Unknown'}\n`;
  
  if (rootCause) {
    markdown += '\n#### Root Cause\n';
    markdown += `- **Leak Source Variable:** \`${rootCause.variable}\`\n`;
    markdown += `- **Reference Type:** ${rootCause.edgeType}\n`;
    markdown += `- **From Node:** @${rootCause.nodeId}\n`;
  }
  
  if (criticalNodes.length > 0) {
    markdown += '\n#### Critical Retention Points\n';
    markdown += criticalNodes.map(node => '- ' + node).join('\n') + '\n';
  }
  
  markdown += '\n#### Full Retention Path (' + investigation.retentionPath.length + ' steps)\n';
  markdown += '```\n';
  markdown += '   ' + formatRetentionPath(investigation.retentionPath) + '\n';
  markdown += '```\n';
  markdown += '\n- **Investigated At:** ' + new Date(investigation.investigatedAt).toLocaleString() + '\n';
  
  return markdown;
}

/**
 * Convert JSON report to markdown
 */
function generateMarkdownFromJSON(report: AnalysisReport): string {
  const title = generateDynamicTitle(report);
  const date = new Date().toLocaleDateString();
  const time = new Date().toLocaleTimeString();
  
  return `# ${title}

**Generated:** ${date} at ${time}  
**Session:** ${report.metadata.sessionId}  
**Target:** ${report.metadata.target.name}${report.metadata.target.url ? ` (${report.metadata.target.url})` : ''}

---

## 🎯 Executive Summary

${report.summary.criticalIssues > 0 ? 
  `**${report.summary.criticalIssues} critical issues detected** requiring immediate attention` : 
  '**No critical issues detected**'
}

- **Total Memory Impact:** ${report.summary.totalRetainedSize}
- **Leak Patterns:** ${report.summary.totalLeaks} identified
- **Memory Objects:** ${report.memoryObjects.length} large consumers
- **Analysis Type:** ${report.metadata.analysisType === 'website' ? '🌐 Website' : '🟢 Node.js Application'}

### Severity Breakdown
${Object.entries(report.summary.severityBreakdown)
  .filter(([_, count]) => count > 0)
  .map(([severity, count]) => {
    const icon = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : severity === 'medium' ? '🟡' : '🟢';
    return `- ${icon} **${severity.toUpperCase()}:** ${count} issues`;
  }).join('\n') || '- 🟢 **LOW:** No significant issues detected'}

---

## 📊 Top Memory Consumers

${report.memoryObjects.length > 0 ? report.memoryObjects.map((obj, index) => {
  const investigation = getInvestigationForObject(`@${obj.id}`, report.investigations);
  let output = `
### ${index + 1}. ${obj.type} (@${obj.id})${obj.investigated ? ' ✅ INVESTIGATED' : ''}
- **Size:** ${obj.size} (${obj.sizeBytes.toLocaleString()} bytes)
- **Category:** ${obj.category.charAt(0).toUpperCase() + obj.category.slice(1)}
- **Complexity:** ${obj.edges.toLocaleString()} edges
- **References:** ${obj.refs.length > 0 ? obj.refs.join(', ') : 'None'}`;

  if (investigation) {
    output += buildInvestigationMarkdown(investigation, report.metadata.snapshots.final);
  } else {
    output += `
- **Status:** Not yet investigated
- **Command:** \`npx heap-analyzer investigate ${report.metadata.snapshots.final} --object-id @${obj.id}\``;
  }
  
  return output;
}).join('\n') : '*No large objects detected*'}

---

## 🌐 Global Variables

${report.globalVariables.length > 0 ? report.globalVariables.slice(0, 10).map((gv, index) => `
### ${index + 1}. ${gv.name} (@${gv.id})
- **Type:** ${gv.type}
- **Size:** ${gv.size} (${gv.sizeBytes.toLocaleString()} bytes)
- **Complexity:** ${gv.edges.toLocaleString()} edges
- **References:** ${gv.refs.length > 0 ? gv.refs.slice(0, 5).join(', ') : 'None'}
`).join('\n') : '*No significant global variables detected*'}

---

## 🏗️ Detached DOM Elements

${report.detachedDOM.length > 0 ? report.detachedDOM.map((dom, index) => `
### ${index + 1}. ${dom.element} (@${dom.id})
- **Retained Size:** ${dom.retainedSize} (${dom.retainedSizeBytes.toLocaleString()} bytes)
${dom.retainedBy ? `- **Retained By:** ${dom.retainedBy}` : ''}
- **Priority:** 🔴 HIGH - Detached DOM causes memory leaks
`).join('\n') : '*No detached DOM elements detected*'}

---

## 📈 Unbound Collections

${report.unboundCollections.length > 0 ? report.unboundCollections.map((coll, index) => `
### ${index + 1}. ${coll.type} (@${coll.id})
- **Growth:** ${coll.growth || 'Analyzing...'}
- **Item Count:**
  ${coll.itemCount.baseline !== undefined ? `- Baseline: ${coll.itemCount.baseline.toLocaleString()}` : ''}
  ${coll.itemCount.target !== undefined ? `- Target: ${coll.itemCount.target.toLocaleString()}` : ''}
  ${coll.itemCount.final !== undefined ? `- Final: ${coll.itemCount.final.toLocaleString()}` : ''}
- **Priority:** ${(coll.itemCount.final || 0) > (coll.itemCount.baseline || 0) * 2 ? '🔴 CRITICAL' : '🟡 MEDIUM'} - Collection growing without bounds
`).join('\n') : '*No unbound collections detected*'}

---

## 🚨 Memory Leak Analysis

${report.leakPatterns.length > 0 ? report.leakPatterns.map((leak, index) => {
  const priorityIcon = leak.priority === 'critical' ? '🔴' : 
                      leak.priority === 'high' ? '🟠' : 
                      leak.priority === 'medium' ? '🟡' : '🟢';
  
  return `
### ${index + 1}. ${leak.description}
- **Impact:** ${leak.retainedSize} (${leak.count.toLocaleString()} instances)
- **Priority:** ${priorityIcon} ${leak.priority.toUpperCase()}
- **Category:** ${leak.category}
- **Confidence:** ${Math.round(leak.confidence * 100)}%
${leak.remediation ? `- **Remediation:** ${leak.remediation}` : ''}
`;
}).join('\n') : '*No significant memory leaks detected*'}

---

## 🛠️ Recommended Actions

### Immediate Actions
${report.recommendations.immediate.length > 0 ? 
  report.recommendations.immediate.map((action, i) => `${i + 1}. ${action}`).join('\n') : 
  'No immediate actions required'
}

### Investigation Commands
\`\`\`bash
${report.recommendations.commands.map(cmd => cmd.replace('inspect-object', 'investigate')).join('\n')}
\`\`\`

### Next Steps
${report.recommendations.nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

---

## 📈 Additional Analysis

### Alternative Commands
\`\`\`bash
# Run comparative analysis
npx heap-analyzer compare ${report.metadata.snapshots.baseline} ${report.metadata.snapshots.final}

# Export raw data for custom analysis
npx heap-analyzer export ${report.metadata.snapshots.final} --format json

# Generate timeline analysis
npx heap-analyzer timeline --snapshot-dir "${path.dirname(report.metadata.snapshots.final)}"
\`\`\`

---

**Analysis Performance:** ${report.metadata.performance.analysisDuration || 0}ms  
**Generated by:** Heap Analyzer v${report.metadata.performance.toolVersion}  
**Schema Version:** ${report.schema.version}
`;
}

// Legacy parsing functions (updated to work with new system)
function parseObjectSizeReport(content: string): any[] {
  const objects: any[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Parse lines like: · @1425693 Array: 1003 edges, 4.5MB, refs: [oceanData]
    const match = line.match(/· @(\d+) ([^:]+): (\d+) edges, ([^,]+), refs: \[([^\]]*)\]/);
    if (match) {
      objects.push({
        id: match[1],
        type: match[2].trim(),
        edges: parseInt(match[3]),
        size: match[4].trim(),
        refs: match[5] ? match[5].split(',').map(r => r.trim()) : []
      });
    }
  }
  
  return objects.slice(0, 10);
}

function parseMemlabReport(content: string): any[] {
  const leaks: any[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    const countMatch = line.match(/--Similar leaks in this run: (\d+)--/);
    if (countMatch) {
      const count = parseInt(countMatch[1]);
      
      const nextLine = lines[i + 1];
      const sizeMatch = nextLine?.match(/--Retained size of leaked objects: ([^--]+)--/);
      const retainedSize = sizeMatch ? sizeMatch[1].trim() : 'Unknown';
      
      // Skip tiny leaks
      if (retainedSize.includes('bytes') && !retainedSize.includes('KB') && !retainedSize.includes('MB')) {
        const bytes = parseInt(retainedSize);
        if (bytes < 1024) continue;
      }
      
      const patternMatch = detectLeakPattern(lines, i);
      const description = patternMatch?.description || `${count} similar objects retained`;
      
      if (description || count > 5 || retainedSize.includes('KB') || retainedSize.includes('MB')) {
        leaks.push({
          count,
          retainedSize,
          description
        });
      }
    }
  }
  
  return leaks.sort((a, b) => {
    const aSize = a.retainedSize;
    const bSize = b.retainedSize;
    
    if (aSize.includes('MB') && !bSize.includes('MB')) return -1;
    if (!aSize.includes('MB') && bSize.includes('MB')) return 1;
    if (aSize.includes('KB') && !bSize.includes('KB')) return -1;
    if (!aSize.includes('KB') && bSize.includes('KB')) return 1;
    
    return b.count - a.count;
  }).slice(0, 10);
}

function detectLeakPattern(lines: string[], startIndex: number): LeakPatternConfig | null {
  for (let j = startIndex + 2; j < Math.min(startIndex + 15, lines.length); j++) {
    const currentLine = lines[j].trim();
    
    if (!currentLine || (!currentLine.includes('at ') && !currentLine.includes(':') && !currentLine.includes('(')))
      continue;
    
    for (const pattern of LEAK_PATTERNS.sort((a, b) => a.priority - b.priority)) {
      if (pattern.keywords.some(keyword => isRelevantMatch(currentLine, keyword))) {
        return pattern;
      }
    }
  }
  return null;
}

function isRelevantMatch(line: string, keyword: string): boolean {
  if (!line.includes(keyword)) return false;
  
  if (line.includes(`at ${keyword}`) ||
      line.includes(`${keyword}(`) ||
      line.includes(`${keyword}.`) ||
      line.includes(`${keyword}:`)) {
    return true;
  }
  
  if (line.includes('at ') && line.includes(keyword)) {
    return true;
  }
  
  return false;
}

/**
 * Parse global-variable analysis output
 */
function parseGlobalVariableReport(content: string): GlobalVariable[] {
  const globals: GlobalVariable[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Parse lines like: ·  --heapAnalyzer--> @57843 Object { ... }: 8 edges, 1.4KB, refs: [value, heapAnalyzer]
    const match = line.match(/--([^-]+)--> @(\d+) ([^:]+): (\d+) edges, ([^,]+), refs: \[([^\]]*)\]/);
    if (match) {
      const name = match[1].trim();
      const id = match[2];
      const type = match[3].trim();
      const edges = parseInt(match[4]);
      const size = match[5].trim();
      const refs = match[6] ? match[6].split(',').map(r => r.trim()) : [];
      
      globals.push({
        name,
        id,
        type,
        size,
        sizeBytes: parseSize(size),
        edges,
        refs
      });
    }
  }
  
  return globals.slice(0, 20); // Top 20 global variables
}

/**
 * Parse detached-DOM analysis output
 */
function parseDetachedDOMReport(content: string): DetachedDOMElement[] {
  const detached: DetachedDOMElement[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Parse lines with detached DOM information
    // Format varies, looking for patterns indicating detached elements
    if (line.includes('detached') || line.includes('Detached')) {
      // Extract meaningful detached DOM info when present
      const match = line.match(/@(\d+)\s+([^:]+):\s*([\d.]+\s*[KMG]?B)/);
      if (match) {
        detached.push({
          id: match[1],
          element: match[2].trim(),
          retainedSize: match[3].trim(),
          retainedSizeBytes: parseSize(match[3].trim())
        });
      }
    }
  }
  
  return detached.slice(0, 10);
}

/**
 * Parse unbound-collection analysis output
 */
function parseUnboundCollectionReport(content: string): UnboundCollection[] {
  const collections: UnboundCollection[] = [];
  const lines = content.split('\n');
  
  // Look for collection growth patterns
  let currentCollection: Partial<UnboundCollection> | null = null;
  
  for (const line of lines) {
    // Check for "No increasing collections found" message
    if (line.includes('No increasing collections found')) {
      break;
    }
    
    // Parse collection entries if they exist
    const collectionMatch = line.match(/@(\d+)\s+(\w+)/);
    if (collectionMatch && (line.includes('Map') || line.includes('Set') || line.includes('Array'))) {
      if (currentCollection) {
        collections.push(currentCollection as UnboundCollection);
      }
      currentCollection = {
        id: collectionMatch[1],
        type: collectionMatch[2],
        itemCount: {}
      };
    }
    
    // Parse size information
    if (currentCollection) {
      if (line.includes('baseline:')) {
        const sizeMatch = line.match(/(\d+)/);
        if (sizeMatch) currentCollection.itemCount!.baseline = parseInt(sizeMatch[1]);
      }
      if (line.includes('target:')) {
        const sizeMatch = line.match(/(\d+)/);
        if (sizeMatch) currentCollection.itemCount!.target = parseInt(sizeMatch[1]);
      }
      if (line.includes('final:')) {
        const sizeMatch = line.match(/(\d+)/);
        if (sizeMatch) currentCollection.itemCount!.final = parseInt(sizeMatch[1]);
      }
    }
  }
  
  if (currentCollection) {
    collections.push(currentCollection as UnboundCollection);
  }
  
  return collections.slice(0, 10);
}

/**
 * Main entry point - JSON-only generation
 */
export async function generateReadableReport(
  outputDir: string, 
  rawAnalysisDir: string, 
  timestamp: string
): Promise<void> {
  try {
    console.log('🔄 Generating JSON analysis report...');
    
    // Read raw reports (legacy format)
    const memlabReportPath = path.join(rawAnalysisDir, `memlab-analysis-${timestamp}.txt`);
    const objectSizeReportPath = path.join(rawAnalysisDir, `object-size-${timestamp}.txt`);
    
    const memlabContent = fs.readFileSync(memlabReportPath, 'utf8');
    const objectSizeContent = fs.readFileSync(objectSizeReportPath, 'utf8');
    
    // Parse legacy data
    const topObjects = parseObjectSizeReport(objectSizeContent);
    const leakSummary = parseMemlabReport(memlabContent);
    
    // Create comprehensive JSON report
    const report = createAnalysisReport(outputDir, timestamp, topObjects, leakSummary, rawAnalysisDir);
    
    // Save JSON report only
    const jsonReportPath = path.join(outputDir, `ANALYSIS-DATA-${timestamp}.json`);
    fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));
    
    // Enhanced console summary
    console.log('\n📊 Analysis Summary:');
    console.log(`   ${report.summary.criticalIssues > 0 ? '🚨' : '✅'} ${report.summary.criticalIssues} critical issues`);
    console.log(`   📈 ${report.memoryObjects.length} large memory consumers`);
    console.log(`   🎯 ${report.summary.totalRetainedSize} total memory impact`);
    console.log(`   🔍 ${report.metadata.analysisType === 'website' ? '🌐 Website' : '🟢 Node.js'} analysis`);
    
    if (report.memoryObjects.length > 0) {
      console.log('\n🎯 Top Memory Issues:');
      report.memoryObjects.slice(0, 3).forEach((obj, index) => {
        console.log(`   ${index + 1}. ${obj.type} (@${obj.id}) - ${obj.size}`);
      });
    }
    
    console.log('\n✅ JSON report generated:', path.basename(jsonReportPath));
    console.log('📊 Generate markdown with: npx heap-analyzer generate-report "' + jsonReportPath + '"');
    if (report.memoryObjects.length > 0) {
      // Prefer combined investigate command (inspect + trace) instead of plain inspect
      console.log(`🔍 Investigate top object: npx heap-analyzer investigate "${report.metadata.snapshots.final}" --object-id @${report.memoryObjects[0].id}`);
    }
    
  } catch (error) {
    console.error('⚠️ Failed to generate JSON-first report:', error);
  }
}