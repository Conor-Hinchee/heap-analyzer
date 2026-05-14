/**
 * Timeline Analyzer - Structured event-based timeline analysis for heap snapshots
 *
 * Provides richer analysis than the base timelineAnalyzer:
 *  - Typed event data structures with severity classification
 *  - Memory trend detection (stable / growing / shrinking / volatile)
 *  - Critical event identification with contextual recommendations
 *  - Structured timeline summaries suitable for programmatic use
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type EventSeverity = 'info' | 'warning' | 'critical';

export type MemoryTrend = 'stable' | 'growing' | 'shrinking' | 'volatile';

/** A single parsed heap snapshot on disk */
export interface SnapshotEntry {
  /** Absolute path to the .heapsnapshot file */
  filepath: string;
  /** Bare filename (no directory component) */
  filename: string;
  /** Timestamp extracted from filename, or file mtime as fallback */
  timestamp: Date;
  /** Operation tag embedded in the filename, e.g. "beatHeartbeat" */
  operation?: string;
  /** Request-ID tag embedded in the filename */
  requestId?: string;
  /** Heap size in MB — populated after stats are loaded */
  heapSizeMB?: number;
  /** Object count — populated after stats are loaded */
  objectCount?: number;
}

/** Memory delta between two consecutive snapshots */
export interface TimelineEvent {
  /** Sequential 1-based index within the timeline */
  index: number;
  /** Source snapshot filename */
  fromSnapshot: string;
  /** Target snapshot filename */
  toSnapshot: string;
  /** Human-readable label (operation name or filename) */
  label: string;
  /** Wall-clock time between the two snapshots */
  durationMs: number;
  /** Heap growth in megabytes (negative = shrink) */
  growthMB: number;
  /** Heap growth as a percentage of the source snapshot size */
  growthPercent: number;
  /** Absolute heap size at the target snapshot */
  heapSizeMB: number;
  /** Change in object count (negative = objects were freed) */
  objectCountDelta: number;
  /** Computed severity for this event */
  severity: EventSeverity;
  /** Whether this event is flagged as a candidate leak site */
  isCritical: boolean;
}

/** Overall memory trend for the captured session */
export interface TrendAnalysis {
  trend: MemoryTrend;
  /** Average MB growth per event */
  avgGrowthPerEventMB: number;
  /** Maximum single-event growth (MB) */
  peakGrowthMB: number;
  /** Index of the event with peak growth */
  peakEventIndex: number;
  /** Ratio of growing events to total events (0–1) */
  growingEventRatio: number;
  /** Standard deviation of event growth values */
  growthStdDevMB: number;
  /** True when memory oscillates significantly */
  isVolatile: boolean;
}

/** High-level timeline summary */
export interface TimelineSummary {
  /** Directory that was analysed */
  directory: string;
  /** ISO timestamp of the first snapshot */
  startTime: string;
  /** ISO timestamp of the last snapshot */
  endTime: string;
  /** Total wall-clock duration of the captured session (ms) */
  totalDurationMs: number;
  /** Number of .heapsnapshot files found */
  snapshotCount: number;
  /** Heap size at the first snapshot (MB) */
  startHeapMB: number;
  /** Heap size at the last snapshot (MB) */
  endHeapMB: number;
  /** Net growth over the entire session (MB) */
  totalGrowthMB: number;
  /** Net growth as a percentage of the starting heap */
  totalGrowthPercent: number;
  /** Whether a significant leak was detected */
  leakDetected: boolean;
  /** The threshold (MB) used for leak / critical classification */
  leakThresholdMB: number;
  /** Ordered list of events between consecutive snapshots */
  events: TimelineEvent[];
  /** Overall memory trend characterisation */
  trend: TrendAnalysis;
  /** Events flagged as critical (severity === 'critical') */
  criticalEvents: TimelineEvent[];
  /** Unique operation names that produced critical events */
  problematicOperations: string[];
  /** Human-readable recommendations derived from the analysis */
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a heap-snapshot filename and extract embedded metadata.
 *
 * Supported patterns:
 *   heap-2025-12-03T19-32-37-260Z-startup.heapsnapshot
 *   heap-2025-12-03T19-42-55-976Z-request-start-op-beatHeartbeat_id-vsjvl25n.heapsnapshot
 */
function parseFilename(filepath: string): SnapshotEntry {
  const filename = path.basename(filepath);

  // Extract ISO-like timestamp embedded in the name
  const tsMatch = filename.match(/heap-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
  let timestamp = new Date(0);
  if (tsMatch) {
    // Convert dashes-as-separators back to colons / dot
    const iso = tsMatch[1].replace(/(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) {
      timestamp = parsed;
    }
  }

  const opMatch = filename.match(/op-([^_]+)/);
  const idMatch = filename.match(/id-([^.]+)/);

  return {
    filepath,
    filename,
    timestamp,
    operation: opMatch?.[1],
    requestId: idMatch?.[1],
  };
}

/**
 * Determine heap size and object count for a snapshot.
 * Tries the memlab CLI first; falls back to raw file size if memlab is unavailable.
 */
async function loadStats(
  entry: SnapshotEntry
): Promise<{ heapSizeMB: number; objectCount: number }> {
  return new Promise((resolve) => {
    const proc = spawn(
      'npx',
      ['memlab', 'analyze', 'object-size', '--snapshot', entry.filepath, '--output', 'json'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        const mbMatch = stdout.match(/(\d+(?:\.\d+)?)\s*MB/i);
        const objMatch = stdout.match(/(\d[\d,]*)\s*objects/i);
        const heapSizeMB = mbMatch ? parseFloat(mbMatch[1]) : 0;
        const objectCount = objMatch ? parseInt(objMatch[1].replace(/,/g, ''), 10) : 0;

        if (heapSizeMB > 0) {
          resolve({ heapSizeMB, objectCount });
          return;
        }
      }

      // Fall back to file size as a proxy for heap size
      fs.stat(entry.filepath)
        .then((stat) => resolve({ heapSizeMB: stat.size / (1024 * 1024), objectCount: 0 }))
        .catch(() => resolve({ heapSizeMB: 0, objectCount: 0 }));
    });
  });
}

/** Classify an event based on its absolute growth and the configured threshold */
function classifySeverity(growthMB: number, thresholdMB: number): EventSeverity {
  if (growthMB >= thresholdMB) return 'critical';
  if (growthMB >= thresholdMB * 0.5) return 'warning';
  return 'info';
}

/** Compute standard deviation of an array of numbers */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Derive an overall MemoryTrend from the set of events */
function computeTrend(events: TimelineEvent[], thresholdMB: number): TrendAnalysis {
  if (events.length === 0) {
    return {
      trend: 'stable',
      avgGrowthPerEventMB: 0,
      peakGrowthMB: 0,
      peakEventIndex: 0,
      growingEventRatio: 0,
      growthStdDevMB: 0,
      isVolatile: false,
    };
  }

  const growths = events.map((e) => e.growthMB);
  const avg = growths.reduce((a, b) => a + b, 0) / growths.length;
  const peakGrowthMB = Math.max(...growths);
  const peakEventIndex = growths.indexOf(peakGrowthMB) + 1; // 1-based
  const growingCount = growths.filter((g) => g > 0).length;
  const growingEventRatio = growingCount / growths.length;
  const growthStdDevMB = stdDev(growths);
  const isVolatile = growthStdDevMB > thresholdMB * 0.5;

  let trend: MemoryTrend;
  if (isVolatile) {
    trend = 'volatile';
  } else if (avg > thresholdMB * 0.1) {
    trend = 'growing';
  } else if (avg < -thresholdMB * 0.1) {
    trend = 'shrinking';
  } else {
    trend = 'stable';
  }

  return {
    trend,
    avgGrowthPerEventMB: avg,
    peakGrowthMB,
    peakEventIndex,
    growingEventRatio,
    growthStdDevMB,
    isVolatile,
  };
}

/** Build actionable recommendations from the summary data */
function buildRecommendations(
  events: TimelineEvent[],
  trend: TrendAnalysis,
  thresholdMB: number,
  leakDetected: boolean
): string[] {
  const recs: string[] = [];

  if (!leakDetected) {
    recs.push('Memory usage appears healthy across the captured session.');
    recs.push('Continue collecting snapshots over a longer period to confirm stability.');
    return recs;
  }

  if (trend.trend === 'growing') {
    recs.push(
      `Memory is growing at an average of ${trend.avgGrowthPerEventMB.toFixed(2)} MB per event.`
    );
    recs.push('Investigate whether objects accumulated during these events are being released.');
  }

  if (trend.isVolatile) {
    recs.push(
      'Memory usage is volatile (high standard deviation). Consider checking for burst allocations.'
    );
  }

  const topCritical = events
    .filter((e) => e.isCritical)
    .sort((a, b) => b.growthMB - a.growthMB)
    .slice(0, 3);

  if (topCritical.length > 0) {
    recs.push('Investigate these high-growth snapshots:');
    for (const e of topCritical) {
      recs.push(`  npx heap-analyzer analyze "${e.toSnapshot}"`);
    }
    const worst = topCritical[0];
    recs.push('Compare the worst offender against its predecessor:');
    recs.push(`  npx heap-analyzer compare "${worst.fromSnapshot}" "${worst.toSnapshot}"`);
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Locate all .heapsnapshot files in `directory` and return them sorted by
 * their embedded (or file-system) timestamp.
 */
export async function collectSnapshots(directory: string): Promise<SnapshotEntry[]> {
  const dirContents = await fs.readdir(directory);
  const snapshotPaths = dirContents
    .filter((f) => f.endsWith('.heapsnapshot'))
    .map((f) => path.join(directory, f));

  const entries = snapshotPaths.map(parseFilename);

  // When the embedded timestamp could not be parsed (epoch), fall back to mtime
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.timestamp.getTime() === 0) {
        try {
          const stat = await fs.stat(entry.filepath);
          entry.timestamp = stat.mtime;
        } catch {
          // leave as epoch — it will sort to the front
        }
      }
    })
  );

  entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return entries;
}

/**
 * Compute `TimelineEvent` records for every consecutive snapshot pair.
 * Stats (heap size, object count) are loaded for each snapshot.
 */
export async function buildTimelineEvents(
  snapshots: SnapshotEntry[],
  thresholdMB: number
): Promise<TimelineEvent[]> {
  if (snapshots.length < 2) return [];

  // Load stats for all snapshots in parallel, then build events sequentially
  console.log('   Loading snapshot stats...');
  const stats = await Promise.all(snapshots.map((s) => loadStats(s)));

  // Annotate entries with loaded stats
  snapshots.forEach((entry, i) => {
    entry.heapSizeMB = stats[i].heapSizeMB;
    entry.objectCount = stats[i].objectCount;
  });

  const events: TimelineEvent[] = [];

  for (let i = 0; i < snapshots.length - 1; i++) {
    const from = snapshots[i];
    const to = snapshots[i + 1];

    const fromMB = from.heapSizeMB ?? 0;
    const toMB = to.heapSizeMB ?? 0;
    const growthMB = toMB - fromMB;
    const growthPercent = fromMB > 0 ? (growthMB / fromMB) * 100 : 0;
    const objectCountDelta = (to.objectCount ?? 0) - (from.objectCount ?? 0);
    const durationMs = to.timestamp.getTime() - from.timestamp.getTime();
    const severity = classifySeverity(growthMB, thresholdMB);

    events.push({
      index: i + 1,
      fromSnapshot: from.filename,
      toSnapshot: to.filename,
      label: to.operation ?? to.filename,
      durationMs,
      growthMB,
      growthPercent,
      heapSizeMB: toMB,
      objectCountDelta,
      severity,
      isCritical: severity === 'critical',
    });
  }

  return events;
}

/**
 * Identify which events should be considered critical based on the threshold,
 * relative growth, and object accumulation patterns.
 *
 * A event is critical when:
 *  - Its absolute growth exceeds `thresholdMB`, OR
 *  - Its growth percent exceeds 25% of baseline, OR
 *  - Object count increased by more than 50 000
 */
export function identifyCriticalEvents(
  events: TimelineEvent[],
  thresholdMB: number
): TimelineEvent[] {
  return events.filter(
    (e) =>
      e.growthMB >= thresholdMB ||
      e.growthPercent >= 25 ||
      e.objectCountDelta > 50_000
  );
}

/**
 * Run the full timeline analysis pipeline and return a structured summary.
 *
 * @param directory - Path to folder containing .heapsnapshot files
 * @param options.leakThresholdMB - Growth in MB that classifies an event as critical (default 10)
 */
export async function analyzeTimeline(
  directory: string,
  options: { leakThresholdMB?: number } = {}
): Promise<TimelineSummary> {
  const thresholdMB = options.leakThresholdMB ?? 10;

  console.log('📊 Timeline Analysis\n');
  console.log(`📁 Directory: ${directory}`);

  const snapshots = await collectSnapshots(directory);

  if (snapshots.length < 2) {
    throw new Error(
      `At least 2 .heapsnapshot files are required. Found: ${snapshots.length}`
    );
  }

  console.log(`✅ Found ${snapshots.length} snapshots\n`);
  console.log('🔍 Building event timeline...\n');

  const events = await buildTimelineEvents(snapshots, thresholdMB);
  const criticalEvents = identifyCriticalEvents(events, thresholdMB);

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const startHeapMB = first.heapSizeMB ?? 0;
  const endHeapMB = last.heapSizeMB ?? 0;
  const totalGrowthMB = endHeapMB - startHeapMB;
  const totalGrowthPercent = startHeapMB > 0 ? (totalGrowthMB / startHeapMB) * 100 : 0;
  const leakDetected = totalGrowthMB >= thresholdMB && criticalEvents.length > 0;

  const trend = computeTrend(events, thresholdMB);

  const problematicOperations = Array.from(
    new Set(criticalEvents.map((e) => e.label).filter(Boolean))
  );

  const recommendations = buildRecommendations(events, trend, thresholdMB, leakDetected);

  return {
    directory,
    startTime: first.timestamp.toISOString(),
    endTime: last.timestamp.toISOString(),
    totalDurationMs: last.timestamp.getTime() - first.timestamp.getTime(),
    snapshotCount: snapshots.length,
    startHeapMB,
    endHeapMB,
    totalGrowthMB,
    totalGrowthPercent,
    leakDetected,
    leakThresholdMB: thresholdMB,
    events,
    trend,
    criticalEvents,
    problematicOperations,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Formatted output helpers
// ---------------------------------------------------------------------------

function signedMB(mb: number): string {
  return `${mb >= 0 ? '+' : ''}${mb.toFixed(2)} MB`;
}

function trendEmoji(t: MemoryTrend): string {
  return { stable: '✅', growing: '📈', shrinking: '📉', volatile: '⚡' }[t];
}

function severityEmoji(s: EventSeverity): string {
  return { info: '  ', warning: '⚠️ ', critical: '🚨' }[s];
}

/** Pretty-print a `TimelineSummary` to stdout */
export function printTimelineSummary(summary: TimelineSummary): void {
  const LINE = '═'.repeat(80);

  console.log(`\n${LINE}`);
  console.log('📈  Timeline Summary');
  console.log(LINE);

  // Session info
  console.log('\n🗂  Session');
  console.log(`   Directory  : ${summary.directory}`);
  console.log(`   Start      : ${summary.startTime}`);
  console.log(`   End        : ${summary.endTime}`);
  const mins = (summary.totalDurationMs / 60_000).toFixed(1);
  console.log(`   Duration   : ${mins} min`);
  console.log(`   Snapshots  : ${summary.snapshotCount}`);

  // Heap overview
  console.log('\n💾  Heap Overview');
  console.log(`   Start heap : ${summary.startHeapMB.toFixed(2)} MB`);
  console.log(`   End heap   : ${summary.endHeapMB.toFixed(2)} MB`);
  console.log(
    `   Net growth : ${signedMB(summary.totalGrowthMB)} (${summary.totalGrowthPercent.toFixed(1)}%)`
  );

  // Trend
  const t = summary.trend;
  console.log('\n📊  Memory Trend');
  console.log(`   Classification : ${trendEmoji(t.trend)} ${t.trend.toUpperCase()}`);
  console.log(`   Avg growth/evt : ${signedMB(t.avgGrowthPerEventMB)}`);
  console.log(`   Peak growth    : ${signedMB(t.peakGrowthMB)} (event #${t.peakEventIndex})`);
  console.log(`   Growing events : ${(t.growingEventRatio * 100).toFixed(0)}%`);
  console.log(`   Std deviation  : ${t.growthStdDevMB.toFixed(2)} MB`);

  // Leak detection
  console.log('\n🔍  Leak Detection');
  if (summary.leakDetected) {
    console.log(`   🚨 Potential memory leak detected!`);
    console.log(`   Threshold : ${summary.leakThresholdMB} MB`);
    if (summary.problematicOperations.length > 0) {
      console.log('   Problematic operations:');
      summary.problematicOperations.forEach((op) => console.log(`      - ${op}`));
    }
  } else {
    console.log(`   ✅ No significant leaks detected`);
    console.log(`   Threshold : ${summary.leakThresholdMB} MB`);
  }

  // Events table
  console.log('\n📋  Event Timeline\n');
  console.log(
    '┌──────┬──────────────────────────────────┬──────────────┬──────────────┬─────────────┐'
  );
  console.log(
    '│ Sev  │ Event / Operation                │ Growth       │ Heap Size    │ Objects Δ   │'
  );
  console.log(
    '├──────┼──────────────────────────────────┼──────────────┼──────────────┼─────────────┤'
  );

  for (const evt of summary.events) {
    const sev = severityEmoji(evt.severity);
    const label = evt.label.padEnd(32).slice(0, 32);
    const growth = signedMB(evt.growthMB).padStart(12);
    const heapStr = `${evt.heapSizeMB.toFixed(2)} MB`.padStart(12);
    const objDelta = ((evt.objectCountDelta >= 0 ? '+' : '') + evt.objectCountDelta.toLocaleString()).padStart(11);
    console.log(`│ ${sev} │ ${label} │ ${growth} │ ${heapStr} │ ${objDelta} │`);
  }

  console.log(
    '└──────┴──────────────────────────────────┴──────────────┴──────────────┴─────────────┘'
  );

  // Recommendations
  console.log('\n💡  Recommendations\n');
  summary.recommendations.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r}`);
  });

  console.log(`\n${LINE}\n`);
}

/**
 * CLI entry point.
 *
 * @param directory - Directory containing .heapsnapshot files
 * @param options.leakThresholdMB - Growth threshold in MB (default 10)
 */
export async function timelineCLI(
  directory: string,
  options: { leakThresholdMB?: number } = {}
): Promise<void> {
  try {
    const summary = await analyzeTimeline(directory, options);
    printTimelineSummary(summary);
  } catch (err) {
    console.error('❌ Timeline analysis failed:', err);
    throw err;
  }
}
