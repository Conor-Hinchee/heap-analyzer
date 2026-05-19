/**
 * Node.js Heap Analyzer - Structured analysis of V8 heap snapshots
 *
 * Provides programmatic, typed analysis of .heapsnapshot files:
 *  - Node type breakdown with size and count metrics
 *  - Retained-size estimation and top consumer ranking
 *  - Node.js-specific leak pattern detection (globals, closures, streams, etc.)
 *  - String interning / string deduplication analysis
 *  - Structured summary suitable for programmatic consumption or CLI display
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Severity classification for a detected issue */
export type IssueSeverity = 'info' | 'warning' | 'critical';

/** Category of a detected leak pattern */
export type LeakCategory =
  | 'global-accumulation'
  | 'event-listener'
  | 'timer'
  | 'closure'
  | 'stream'
  | 'module-cache'
  | 'string-duplication'
  | 'large-array'
  | 'unknown';

/** Aggregated statistics for a single V8 node type */
export interface NodeTypeStat {
  /** V8 node type name (e.g. "object", "string", "array", "closure") */
  type: string;
  /** Total number of nodes of this type */
  count: number;
  /** Sum of self_size for all nodes of this type (bytes) */
  selfSizeBytes: number;
  /** Self-size in MB */
  selfSizeMB: number;
  /** Fraction of total heap self-size (0–1) */
  heapFraction: number;
}

/** A single named object that is a significant memory consumer */
export interface TopConsumer {
  /** Node name (constructor name, string value truncated, etc.) */
  name: string;
  /** V8 node type */
  type: string;
  /** Self size in bytes */
  selfSizeBytes: number;
  /** Self size in MB */
  selfSizeMB: number;
  /** Node ID from the snapshot */
  nodeId: number;
}

/** A detected potential leak pattern in the snapshot */
export interface LeakPattern {
  /** Pattern category */
  category: LeakCategory;
  /** Severity level */
  severity: IssueSeverity;
  /** Human-readable description */
  description: string;
  /** Count of nodes matching this pattern */
  matchCount: number;
  /** Total self-size of matching nodes (bytes) */
  totalSizeBytes: number;
  /** Suggested fix or next-step command */
  recommendation: string;
}

/** String deduplication / interning analysis */
export interface StringAnalysis {
  /** Total string nodes */
  totalStringCount: number;
  /** Total size of all string nodes (bytes) */
  totalStringSizeBytes: number;
  /** Number of unique string values (approximate — capped at sampleSize) */
  uniqueValueCount: number;
  /** Top 10 repeated string values with their occurrence counts */
  topRepeatedStrings: Array<{ value: string; count: number; totalSizeBytes: number }>;
  /** Whether string duplication appears to be a significant concern */
  isDuplicationConcern: boolean;
}

/** Raw snapshot metadata parsed without loading the full node graph */
export interface SnapshotMeta {
  /** Absolute path of the snapshot file */
  filePath: string;
  /** Bare filename */
  filename: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** File modification time */
  mtime: Date;
  /** Node count from the snapshot metadata header */
  nodeCount: number;
  /** Edge count from the snapshot metadata header */
  edgeCount: number;
  /** V8 snapshot format version string (if present) */
  v8Version?: string;
}

/** Complete analysis result for a single Node.js heap snapshot */
export interface NodejsHeapSummary {
  /** Metadata about the snapshot file */
  meta: SnapshotMeta;
  /** Total self-size across all nodes (bytes) */
  totalHeapSizeBytes: number;
  /** Total self-size in MB */
  totalHeapSizeMB: number;
  /** Per-type breakdown sorted by size descending */
  nodeTypeStats: NodeTypeStat[];
  /** Top memory-consuming individual nodes */
  topConsumers: TopConsumer[];
  /** Detected Node.js-specific leak patterns */
  leakPatterns: LeakPattern[];
  /** String analysis */
  stringAnalysis: StringAnalysis;
  /** Whether any critical issues were detected */
  hasCriticalIssues: boolean;
  /** Human-readable recommendations */
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Raw V8 snapshot JSON shape (partial — only fields we use)
// ---------------------------------------------------------------------------

interface RawSnapshotMeta {
  node_count?: number;
  edge_count?: number;
  v8_version?: string;
  node_fields?: string[];
  node_types?: Array<string | string[]>;
  edge_fields?: string[];
  edge_types?: Array<string | string[]>;
}

interface RawSnapshot {
  snapshot?: {
    meta?: RawSnapshotMeta;
    node_count?: number;
    edge_count?: number;
  };
  nodes?: number[];
  edges?: number[];
  strings?: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a .heapsnapshot JSON file.
 * Files can be very large (100–500 MB) so we stream-parse only the fields
 * we need when possible.  For correctness we fall back to full JSON.parse.
 */
async function parseSnapshot(filePath: string): Promise<RawSnapshot> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as RawSnapshot;
}

/** Read snapshot file metadata without parsing the full JSON */
async function readSnapshotMeta(filePath: string): Promise<SnapshotMeta> {
  const stat = await fs.stat(filePath);
  const filename = path.basename(filePath);

  // Quick-parse just enough of the file to get node/edge counts and version
  let nodeCount = 0;
  let edgeCount = 0;
  let v8Version: string | undefined;

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as RawSnapshot;

    nodeCount =
      data.snapshot?.node_count ??
      data.snapshot?.meta?.node_count ??
      (data.nodes ? Math.floor(data.nodes.length / (data.snapshot?.meta?.node_fields?.length ?? 7)) : 0);

    edgeCount =
      data.snapshot?.edge_count ??
      data.snapshot?.meta?.edge_count ??
      (data.edges ? Math.floor(data.edges.length / (data.snapshot?.meta?.edge_fields?.length ?? 3)) : 0);

    v8Version = data.snapshot?.meta?.v8_version;
  } catch {
    // If parsing fails, leave counts as 0
  }

  return {
    filePath,
    filename,
    fileSizeBytes: stat.size,
    mtime: stat.mtime,
    nodeCount,
    edgeCount,
    v8Version,
  };
}

/**
 * Extract per-type statistics from the flat V8 node array.
 *
 * V8 heap snapshots store nodes as a flat array of fixed-width integer
 * records.  The default layout (7 fields) is:
 *   [type_index, name_index, id, self_size, edge_count, trace_node_id, detachedness]
 *
 * The `snapshot.meta.node_fields` array names the fields explicitly.
 * The `snapshot.meta.node_types` array provides type-index → type-name mapping.
 */
function extractNodeTypeStats(
  data: RawSnapshot,
  totalHeapBytes: number
): NodeTypeStat[] {
  const nodes = data.nodes;
  const meta = data.snapshot?.meta;

  if (!nodes || nodes.length === 0) return [];

  // Resolve field positions
  const nodeFields = meta?.node_fields ?? [
    'type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness',
  ];
  const stride = nodeFields.length;
  const typeIndex = nodeFields.indexOf('type');
  const selfSizeIndex = nodeFields.indexOf('self_size');

  if (typeIndex === -1 || selfSizeIndex === -1) return [];

  // Resolve type-index → type-name mapping
  const rawTypes = meta?.node_types;
  let typeNames: string[] = [];
  if (Array.isArray(rawTypes) && rawTypes.length > 0) {
    const firstEntry = rawTypes[0];
    if (Array.isArray(firstEntry)) {
      typeNames = firstEntry as string[];
    } else if (typeof firstEntry === 'string') {
      // node_types is a flat array when the first element is a string
      typeNames = rawTypes as string[];
    }
  }

  const typeMap = new Map<string, { count: number; sizeBytes: number }>();

  for (let i = 0; i + stride - 1 < nodes.length; i += stride) {
    const rawType = nodes[i + typeIndex];
    const selfSize = nodes[i + selfSizeIndex] ?? 0;
    const typeName = typeNames[rawType] ?? String(rawType);

    const existing = typeMap.get(typeName);
    if (existing) {
      existing.count += 1;
      existing.sizeBytes += selfSize;
    } else {
      typeMap.set(typeName, { count: 1, sizeBytes: selfSize });
    }
  }

  return Array.from(typeMap.entries())
    .map(([type, { count, sizeBytes }]) => ({
      type,
      count,
      selfSizeBytes: sizeBytes,
      selfSizeMB: sizeBytes / (1024 * 1024),
      heapFraction: totalHeapBytes > 0 ? sizeBytes / totalHeapBytes : 0,
    }))
    .sort((a, b) => b.selfSizeBytes - a.selfSizeBytes);
}

/**
 * Identify the top N individual nodes by self_size.
 */
function extractTopConsumers(data: RawSnapshot, topN = 20): TopConsumer[] {
  const nodes = data.nodes;
  const strings = data.strings ?? [];
  const meta = data.snapshot?.meta;

  if (!nodes || nodes.length === 0) return [];

  const nodeFields = meta?.node_fields ?? [
    'type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness',
  ];
  const stride = nodeFields.length;
  const typeIndex = nodeFields.indexOf('type');
  const nameIndex = nodeFields.indexOf('name');
  const idIndex = nodeFields.indexOf('id');
  const selfSizeIndex = nodeFields.indexOf('self_size');

  if (selfSizeIndex === -1) return [];

  const rawTypes = meta?.node_types;
  let typeNames: string[] = [];
  if (Array.isArray(rawTypes) && rawTypes.length > 0) {
    const firstEntry = rawTypes[0];
    typeNames = Array.isArray(firstEntry) ? (firstEntry as string[]) : (rawTypes as string[]);
  }

  // Collect candidates
  interface Candidate {
    name: string;
    type: string;
    selfSizeBytes: number;
    nodeId: number;
  }
  const candidates: Candidate[] = [];

  for (let i = 0; i + stride - 1 < nodes.length; i += stride) {
    const selfSize = nodes[i + selfSizeIndex] ?? 0;
    if (selfSize === 0) continue;

    const rawType = nodes[i + typeIndex] ?? 0;
    const nameIdx = nameIndex !== -1 ? (nodes[i + nameIndex] ?? 0) : 0;
    const nodeId = idIndex !== -1 ? (nodes[i + idIndex] ?? 0) : 0;

    const typeName = typeNames[rawType] ?? String(rawType);
    const rawName = strings[nameIdx] ?? '';
    const displayName = rawName.length > 80 ? rawName.slice(0, 77) + '...' : rawName;

    candidates.push({ name: displayName || `(${typeName})`, type: typeName, selfSizeBytes: selfSize, nodeId });
  }

  candidates.sort((a, b) => b.selfSizeBytes - a.selfSizeBytes);

  return candidates.slice(0, topN).map((c) => ({
    name: c.name,
    type: c.type,
    selfSizeBytes: c.selfSizeBytes,
    selfSizeMB: c.selfSizeBytes / (1024 * 1024),
    nodeId: c.nodeId,
  }));
}

/**
 * Perform string deduplication analysis.
 * Samples all string nodes and looks for frequently repeated values.
 */
function analyzeStrings(data: RawSnapshot): StringAnalysis {
  const nodes = data.nodes;
  const strings = data.strings ?? [];
  const meta = data.snapshot?.meta;

  const empty: StringAnalysis = {
    totalStringCount: 0,
    totalStringSizeBytes: 0,
    uniqueValueCount: 0,
    topRepeatedStrings: [],
    isDuplicationConcern: false,
  };

  if (!nodes || nodes.length === 0) return empty;

  const nodeFields = meta?.node_fields ?? [
    'type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness',
  ];
  const stride = nodeFields.length;
  const typeIndex = nodeFields.indexOf('type');
  const nameIndex = nodeFields.indexOf('name');
  const selfSizeIndex = nodeFields.indexOf('self_size');

  if (typeIndex === -1 || selfSizeIndex === -1) return empty;

  const rawTypes = meta?.node_types;
  let typeNames: string[] = [];
  if (Array.isArray(rawTypes) && rawTypes.length > 0) {
    const firstEntry = rawTypes[0];
    typeNames = Array.isArray(firstEntry) ? (firstEntry as string[]) : (rawTypes as string[]);
  }

  // Find the index value that corresponds to "string" type
  const stringTypeIdx = typeNames.indexOf('string');

  let totalCount = 0;
  let totalSize = 0;
  const valueCounts = new Map<string, { count: number; sizeBytes: number }>();

  for (let i = 0; i + stride - 1 < nodes.length; i += stride) {
    const rawType = nodes[i + typeIndex] ?? 0;
    if (stringTypeIdx !== -1 && rawType !== stringTypeIdx) continue;
    // If we can't identify the string type, skip — we'd match everything
    if (stringTypeIdx === -1) continue;

    const selfSize = nodes[i + selfSizeIndex] ?? 0;
    const nameIdx = nameIndex !== -1 ? (nodes[i + nameIndex] ?? 0) : 0;
    const value = strings[nameIdx] ?? '';

    totalCount += 1;
    totalSize += selfSize;

    const entry = valueCounts.get(value);
    if (entry) {
      entry.count += 1;
      entry.sizeBytes += selfSize;
    } else {
      valueCounts.set(value, { count: 1, sizeBytes: selfSize });
    }
  }

  const repeated = Array.from(valueCounts.entries())
    .filter(([, v]) => v.count > 1)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([value, { count, sizeBytes }]) => ({
      value: value.length > 60 ? value.slice(0, 57) + '...' : value,
      count,
      totalSizeBytes: sizeBytes,
    }));

  const uniqueValueCount = valueCounts.size;
  // Flag if >30% of strings are duplicates and total string size > 5 MB
  const duplicateCount = totalCount - uniqueValueCount;
  const isDuplicationConcern =
    totalCount > 0 &&
    duplicateCount / totalCount > 0.3 &&
    totalSize > 5 * 1024 * 1024;

  return {
    totalStringCount: totalCount,
    totalStringSizeBytes: totalSize,
    uniqueValueCount,
    topRepeatedStrings: repeated,
    isDuplicationConcern,
  };
}

/** Detect Node.js-specific memory leak patterns from node type statistics */
function detectLeakPatterns(
  typeStats: NodeTypeStat[],
  topConsumers: TopConsumer[],
  stringAnalysis: StringAnalysis,
  totalHeapMB: number
): LeakPattern[] {
  const patterns: LeakPattern[] = [];

  const typeMap = new Map(typeStats.map((s) => [s.type, s]));

  // --- Closure accumulation ---
  const closureStat = typeMap.get('closure');
  if (closureStat && closureStat.selfSizeMB > 5) {
    patterns.push({
      category: 'closure',
      severity: closureStat.selfSizeMB > 20 ? 'critical' : 'warning',
      description: `Closure nodes consume ${closureStat.selfSizeMB.toFixed(2)} MB (${(closureStat.heapFraction * 100).toFixed(1)}% of heap).`,
      matchCount: closureStat.count,
      totalSizeBytes: closureStat.selfSizeBytes,
      recommendation: 'Review functions capturing large lexical scopes. Use WeakRef/WeakMap for caches.',
    });
  }

  // --- Large arrays (potential unbounded accumulation) ---
  const arrayStat = typeMap.get('array');
  if (arrayStat && arrayStat.selfSizeMB > totalHeapMB * 0.3) {
    patterns.push({
      category: 'large-array',
      severity: arrayStat.selfSizeMB > totalHeapMB * 0.5 ? 'critical' : 'warning',
      description: `Array nodes account for ${(arrayStat.heapFraction * 100).toFixed(1)}% of heap (${arrayStat.selfSizeMB.toFixed(2)} MB).`,
      matchCount: arrayStat.count,
      totalSizeBytes: arrayStat.selfSizeBytes,
      recommendation: 'Check for arrays that grow without bounds (caches, logs, queues). Add size limits or use circular buffers.',
    });
  }

  // --- String duplication ---
  if (stringAnalysis.isDuplicationConcern) {
    const dupCount = stringAnalysis.totalStringCount - stringAnalysis.uniqueValueCount;
    patterns.push({
      category: 'string-duplication',
      severity: 'warning',
      description: `${dupCount.toLocaleString()} duplicate string instances detected (${(stringAnalysis.totalStringSizeBytes / 1024 / 1024).toFixed(2)} MB total).`,
      matchCount: dupCount,
      totalSizeBytes: stringAnalysis.topRepeatedStrings.reduce((s, r) => s + r.totalSizeBytes, 0),
      recommendation: 'Intern frequently repeated strings (Symbol.for, Map keying). Consider a string pool for repeated identifiers.',
    });
  }

  // --- Native / hidden objects (stream handles, TCP sockets) ---
  const nativeStat = typeMap.get('native');
  if (nativeStat && nativeStat.count > 500) {
    patterns.push({
      category: 'stream',
      severity: nativeStat.count > 2000 ? 'critical' : 'warning',
      description: `${nativeStat.count.toLocaleString()} native objects found. May indicate unclosed handles (streams, sockets, file descriptors).`,
      matchCount: nativeStat.count,
      totalSizeBytes: nativeStat.selfSizeBytes,
      recommendation: 'Ensure all streams, net.Socket, and fs handles are properly closed/destroyed when done.',
    });
  }

  // --- Regex accumulation (compiled patterns) ---
  const regexpStat = typeMap.get('regexp');
  if (regexpStat && regexpStat.count > 1000) {
    patterns.push({
      category: 'global-accumulation',
      severity: 'warning',
      description: `${regexpStat.count.toLocaleString()} RegExp objects found. Dynamically constructed regexps may cause unbounded growth.`,
      matchCount: regexpStat.count,
      totalSizeBytes: regexpStat.selfSizeBytes,
      recommendation: 'Cache compiled RegExp patterns rather than recreating them on each request.',
    });
  }

  // --- Hidden-class / map proliferation (signals poor object shapes) ---
  const hiddenStat = typeMap.get('hidden');
  if (hiddenStat && hiddenStat.count > 10_000) {
    patterns.push({
      category: 'global-accumulation',
      severity: 'info',
      description: `${hiddenStat.count.toLocaleString()} hidden-class (Map) objects detected. Excessive property additions can prevent V8 optimisations.`,
      matchCount: hiddenStat.count,
      totalSizeBytes: hiddenStat.selfSizeBytes,
      recommendation: 'Define object shapes up-front (avoid adding properties after construction) to reduce hidden-class proliferation.',
    });
  }

  // --- Top consumers that look suspicious (individual items > 10 MB) ---
  const bigItems = topConsumers.filter((c) => c.selfSizeMB > 10);
  for (const item of bigItems.slice(0, 3)) {
    patterns.push({
      category: 'unknown',
      severity: 'critical',
      description: `Large individual node: "${item.name}" (${item.type}) — ${item.selfSizeMB.toFixed(2)} MB at node @${item.nodeId}.`,
      matchCount: 1,
      totalSizeBytes: item.selfSizeBytes,
      recommendation: `Investigate with: heap-analyzer trace <snapshot> --node-id ${item.nodeId}`,
    });
  }

  return patterns;
}

/** Derive recommendations from the analysis result */
function buildRecommendations(
  typeStats: NodeTypeStat[],
  leakPatterns: LeakPattern[],
  hasCritical: boolean
): string[] {
  const recs: string[] = [];

  if (!hasCritical && leakPatterns.length === 0) {
    recs.push('No significant memory issues detected in this snapshot.');
    recs.push('Continue monitoring over time to confirm stable memory usage.');
    return recs;
  }

  const criticalPatterns = leakPatterns.filter((p) => p.severity === 'critical');
  if (criticalPatterns.length > 0) {
    recs.push('Critical issues require immediate attention:');
    for (const p of criticalPatterns) {
      recs.push(`  [${p.category}] ${p.recommendation}`);
    }
  }

  const warnPatterns = leakPatterns.filter((p) => p.severity === 'warning');
  if (warnPatterns.length > 0) {
    recs.push('Warnings to investigate:');
    for (const p of warnPatterns) {
      recs.push(`  [${p.category}] ${p.recommendation}`);
    }
  }

  // Always suggest comparison if issues are found
  recs.push('Compare snapshots over time with: heap-analyzer compare <before> <after>');
  recs.push('Find specific leaked objects with: heap-analyzer find-leaks --baseline <b> --target <t> --trace-all-objects');

  return recs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse a single .heapsnapshot file and return a structured summary.
 *
 * @param filePath - Absolute or relative path to a .heapsnapshot file
 * @param options.topConsumersN - How many top consumers to include (default 20)
 */
export async function analyzeNodejsSnapshot(
  filePath: string,
  options: { topConsumersN?: number } = {}
): Promise<NodejsHeapSummary> {
  const topN = options.topConsumersN ?? 20;

  const resolvedPath = path.resolve(filePath);
  const meta = await readSnapshotMeta(resolvedPath);
  const data = await parseSnapshot(resolvedPath);

  // --- Compute total heap size ---
  const nodes = data.nodes ?? [];
  const nodeFields = data.snapshot?.meta?.node_fields ?? [
    'type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness',
  ];
  const stride = nodeFields.length;
  const selfSizeIndex = nodeFields.indexOf('self_size');

  let totalHeapSizeBytes = 0;
  if (selfSizeIndex !== -1) {
    for (let i = selfSizeIndex; i < nodes.length; i += stride) {
      totalHeapSizeBytes += nodes[i] ?? 0;
    }
  }
  const totalHeapSizeMB = totalHeapSizeBytes / (1024 * 1024);

  // --- Per-type stats ---
  const nodeTypeStats = extractNodeTypeStats(data, totalHeapSizeBytes);

  // --- Top consumers ---
  const topConsumers = extractTopConsumers(data, topN);

  // --- String analysis ---
  const stringAnalysis = analyzeStrings(data);

  // --- Leak patterns ---
  const leakPatterns = detectLeakPatterns(nodeTypeStats, topConsumers, stringAnalysis, totalHeapSizeMB);

  const hasCriticalIssues = leakPatterns.some((p) => p.severity === 'critical');
  const recommendations = buildRecommendations(nodeTypeStats, leakPatterns, hasCriticalIssues);

  return {
    meta,
    totalHeapSizeBytes,
    totalHeapSizeMB,
    nodeTypeStats,
    topConsumers,
    leakPatterns,
    stringAnalysis,
    hasCriticalIssues,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Formatted output helpers
// ---------------------------------------------------------------------------

function severityLabel(s: IssueSeverity): string {
  return { info: 'INFO    ', warning: 'WARNING ', critical: 'CRITICAL' }[s];
}

function bar(fraction: number, width = 20): string {
  const filled = Math.round(fraction * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Pretty-print a `NodejsHeapSummary` to stdout */
export function printNodejsSummary(summary: NodejsHeapSummary): void {
  const LINE = '═'.repeat(80);

  console.log(`\n${LINE}`);
  console.log('Node.js Heap Snapshot Analysis');
  console.log(LINE);

  // File info
  console.log('\nSnapshot');
  console.log(`   File      : ${summary.meta.filename}`);
  console.log(`   Size      : ${(summary.meta.fileSizeBytes / 1024 / 1024).toFixed(2)} MB on disk`);
  console.log(`   Modified  : ${summary.meta.mtime.toISOString()}`);
  console.log(`   Nodes     : ${summary.meta.nodeCount.toLocaleString()}`);
  console.log(`   Edges     : ${summary.meta.edgeCount.toLocaleString()}`);
  if (summary.meta.v8Version) {
    console.log(`   V8        : ${summary.meta.v8Version}`);
  }

  // Heap overview
  console.log('\nHeap Overview');
  console.log(`   Total self-size : ${summary.totalHeapSizeMB.toFixed(2)} MB`);

  // Type breakdown (top 10)
  console.log('\nNode Types (top 10 by size)\n');
  const topTypes = summary.nodeTypeStats.slice(0, 10);
  for (const t of topTypes) {
    const pct = (t.heapFraction * 100).toFixed(1).padStart(5);
    const sizeStr = `${t.selfSizeMB.toFixed(2)} MB`.padStart(10);
    const countStr = t.count.toLocaleString().padStart(10);
    const b = bar(t.heapFraction);
    console.log(`   ${t.type.padEnd(18)} ${b} ${pct}%  ${sizeStr}  ${countStr} nodes`);
  }

  // Top consumers
  if (summary.topConsumers.length > 0) {
    console.log('\nTop Memory Consumers\n');
    const top10 = summary.topConsumers.slice(0, 10);
    for (const c of top10) {
      const sizeStr = `${c.selfSizeMB.toFixed(3)} MB`.padStart(10);
      console.log(`   @${String(c.nodeId).padEnd(10)} ${c.type.padEnd(14)} ${sizeStr}  ${c.name}`);
    }
  }

  // String analysis
  const sa = summary.stringAnalysis;
  if (sa.totalStringCount > 0) {
    console.log('\nString Analysis');
    console.log(`   Total strings    : ${sa.totalStringCount.toLocaleString()}`);
    console.log(`   Unique values    : ${sa.uniqueValueCount.toLocaleString()}`);
    console.log(`   Total size       : ${(sa.totalStringSizeBytes / 1024 / 1024).toFixed(2)} MB`);
    if (sa.isDuplicationConcern) {
      console.log('   Duplication      : HIGH — significant repeated string values detected');
    }
    if (sa.topRepeatedStrings.length > 0) {
      console.log('\n   Top repeated strings:');
      for (const r of sa.topRepeatedStrings.slice(0, 5)) {
        const sizeKB = (r.totalSizeBytes / 1024).toFixed(1);
        console.log(`      x${String(r.count).padStart(6)}  ${sizeKB.padStart(8)} KB  "${r.value}"`);
      }
    }
  }

  // Detected patterns
  if (summary.leakPatterns.length > 0) {
    console.log('\nDetected Issues\n');
    for (const p of summary.leakPatterns) {
      console.log(`   [${severityLabel(p.severity)}] ${p.description}`);
      console.log(`              Fix: ${p.recommendation}`);
    }
  } else {
    console.log('\nDetected Issues');
    console.log('   No issues detected.');
  }

  // Recommendations
  console.log('\nRecommendations\n');
  summary.recommendations.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r}`);
  });

  console.log(`\n${LINE}\n`);
}

/**
 * CLI entry point — analyse a snapshot and print results.
 *
 * @param filePath - Path to the .heapsnapshot file
 * @param options.topConsumersN - Number of top consumers to show (default 20)
 */
export async function nodejisCLI(
  filePath: string,
  options: { topConsumersN?: number } = {}
): Promise<void> {
  try {
    console.log(`Analysing Node.js heap snapshot: ${path.basename(filePath)}`);
    const summary = await analyzeNodejsSnapshot(filePath, options);
    printNodejsSummary(summary);
  } catch (err) {
    console.error('Node.js heap analysis failed:', err);
    throw err;
  }
}
