/**
 * Timeline Analyzer - Structured event-based timeline analysis for heap snapshots
 *
 * Provides richer analysis than the base timelineAnalyzer:
 *  - Typed event data structures with severity classification
 *  - GC event detection and allocation/deallocation tracking
 *  - Memory trend detection (stable / growing / shrinking / volatile)
 *  - Critical event identification with contextual recommendations
 *  - Recovery pattern detection (post-GC heap reduction)
 *  - Time range filtering and event querying
 *  - Growth rate calculation (MB/s, MB/event)
 *  - Structured timeline summaries suitable for programmatic use
 *  - Export to JSON and CSV for visualization
 *  - Integration with nodejs.ts for per-snapshot deep analysis
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { analyzeNodejsSnapshot } from './nodejs.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type EventSeverity = 'info' | 'warning' | 'critical';

export type MemoryTrend = 'stable' | 'growing' | 'shrinking' | 'volatile';

/** Category of a snapshot-to-snapshot memory change */
export type EventCategory =
  | 'allocation'    // Net new objects added
  | 'deallocation'  // Net objects freed (GC completed)
  | 'gc-recovery'   // Significant drop following a growth spike (GC fired)
  | 'stable'        // Negligible change
  | 'leak-suspect'; // Large growth exceeding threshold

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
  /** Top node-type breakdown — populated when deepAnalysis is enabled */
  topNodeTypes?: Array<{ type: string; selfSizeMB: number; count: number }>;
  /** Whether this snapshot was identified as a post-GC recovery point */
  isGcRecoveryPoint?: boolean;
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
  /** Memory growth rate in MB per second */
  growthRateMBPerSec: number;
  /** Computed severity for this event */
  severity: EventSeverity;
  /** Whether this event is flagged as a candidate leak site */
  isCritical: boolean;
  /** Semantic category of this memory change */
  category: EventCategory;
  /** True when this event follows a spike and heap dropped significantly */
  isGcRecovery: boolean;
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
  /** Average heap growth rate across all events (MB/s) */
  avgGrowthRateMBPerSec: number;
  /** Number of detected GC recovery events */
  gcRecoveryCount: number;
  /** Total memory reclaimed by GC across all recovery events (MB) */
  totalGcReclaimedMB: number;
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
  /** Overall heap growth rate for the session (MB/s) */
  overallGrowthRateMBPerSec: number;
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
  /** GC recovery events detected in the timeline */
  gcRecoveryEvents: TimelineEvent[];
  /** Unique operation names that produced critical events */
  problematicOperations: string[];
  /** Human-readable recommendations derived from the analysis */
  recommendations: string[];
}

/** Options for filtering events from a timeline */
export interface EventFilterOptions {
  /** Only include events at or after this timestamp */
  startTime?: Date;
  /** Only include events at or before this timestamp */
  endTime?: Date;
  /** Only include events with this severity or worse (info < warning < critical) */
  minSeverity?: EventSeverity;
  /** Only include events belonging to one of these categories */
  categories?: EventCategory[];
  /** Only include events where growthMB exceeds this value */
  minGrowthMB?: number;
  /** Only include events where growthMB is below this value (negative = shrink) */
  maxGrowthMB?: number;
  /** Only include critical / leak-suspect events */
  criticalOnly?: boolean;
  /** Only include GC recovery events */
  gcRecoveryOnly?: boolean;
}

/** Visualization-ready data point for a single timeline moment */
export interface TimelineDataPoint {
  /** Unix timestamp in milliseconds */
  timestampMs: number;
  /** ISO-8601 timestamp */
  isoTime: string;
  /** Heap size in MB */
  heapSizeMB: number;
  /** Object count (0 when unavailable) */
  objectCount: number;
  /** Event label (operation name or filename) */
  label: string;
  /** Severity at this point */
  severity: EventSeverity;
  /** Category */
  category: EventCategory;
  /** Whether this is a GC recovery point */
  isGcRecovery: boolean;
}

/** Complete export payload for external visualization */
export interface TimelineExport {
  /** Schema version for forward-compatibility */
  schemaVersion: string;
  /** ISO timestamp when the export was generated */
  exportedAt: string;
  /** Directory that was analysed */
  directory: string;
  /** Session wall-clock bounds */
  session: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  /** Heap overview */
  heap: {
    startMB: number;
    endMB: number;
    peakMB: number;
    netGrowthMB: number;
    netGrowthPercent: number;
    overallGrowthRateMBPerSec: number;
  };
  /** Trend classification */
  trend: TrendAnalysis;
  /** Whether a leak was detected */
  leakDetected: boolean;
  /** Ordered data points — one per snapshot */
  dataPoints: TimelineDataPoint[];
  /** Raw events (between consecutive snapshots) */
  events: TimelineEvent[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<EventSeverity, number> = { info: 0, warning: 1, critical: 2 };

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

/**
 * Load richer per-snapshot data using the nodejs.ts analyzer.
 * Returns top node types for the entry; does not throw on failure.
 */
async function loadDeepStats(
  entry: SnapshotEntry
): Promise<{ heapSizeMB: number; objectCount: number; topNodeTypes: Array<{ type: string; selfSizeMB: number; count: number }> }> {
  try {
    const summary = await analyzeNodejsSnapshot(entry.filepath, { topConsumersN: 5 });
    const topNodeTypes = summary.nodeTypeStats.slice(0, 5).map((s) => ({
      type: s.type,
      selfSizeMB: s.selfSizeMB,
      count: s.count,
    }));
    return {
      heapSizeMB: summary.totalHeapSizeMB,
      objectCount: summary.meta.nodeCount,
      topNodeTypes,
    };
  } catch {
    // Fall back to the lightweight loader
    const stats = await loadStats(entry);
    return { ...stats, topNodeTypes: [] };
  }
}

/** Classify an event based on its absolute growth and the configured threshold */
function classifySeverity(growthMB: number, thresholdMB: number): EventSeverity {
  if (growthMB >= thresholdMB) return 'critical';
  if (growthMB >= thresholdMB * 0.5) return 'warning';
  return 'info';
}

/**
 * Determine the semantic category of a memory change.
 *
 * GC recovery: this event follows a spike AND heap dropped by ≥ 20% relative
 * to the previous snapshot.
 */
function classifyCategory(
  growthMB: number,
  growthPercent: number,
  prevGrowthMB: number | undefined,
  thresholdMB: number
): EventCategory {
  const isGcRecovery =
    growthMB < -thresholdMB * 0.2 &&
    prevGrowthMB !== undefined &&
    prevGrowthMB > 0 &&
    Math.abs(growthMB) >= prevGrowthMB * 0.3;

  if (isGcRecovery) return 'gc-recovery';
  if (growthMB >= thresholdMB) return 'leak-suspect';
  if (growthPercent >= 5 || growthMB > 0.5) return 'allocation';
  if (growthMB < -0.5 || growthPercent < -5) return 'deallocation';
  return 'stable';
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
      avgGrowthRateMBPerSec: 0,
      gcRecoveryCount: 0,
      totalGcReclaimedMB: 0,
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

  const ratesPerSec = events.map((e) => e.growthRateMBPerSec);
  const avgGrowthRateMBPerSec = ratesPerSec.reduce((a, b) => a + b, 0) / ratesPerSec.length;

  const gcEvents = events.filter((e) => e.isGcRecovery);
  const totalGcReclaimedMB = gcEvents.reduce((sum, e) => sum + Math.abs(e.growthMB), 0);

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
    avgGrowthRateMBPerSec,
    gcRecoveryCount: gcEvents.length,
    totalGcReclaimedMB,
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
      `Memory is growing at an average of ${trend.avgGrowthPerEventMB.toFixed(2)} MB per event` +
      ` (${trend.avgGrowthRateMBPerSec.toFixed(4)} MB/s).`
    );
    recs.push('Investigate whether objects accumulated during these events are being released.');
  }

  if (trend.isVolatile) {
    recs.push(
      'Memory usage is volatile (high standard deviation). Consider checking for burst allocations.'
    );
  }

  if (trend.gcRecoveryCount > 0) {
    recs.push(
      `GC recovered ${trend.totalGcReclaimedMB.toFixed(2)} MB across ${trend.gcRecoveryCount} event(s). ` +
      'Memory is being reclaimed, but net growth suggests objects are accumulating faster than GC can free them.'
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
 *
 * @param snapshots - Ordered list of snapshots (from `collectSnapshots`)
 * @param thresholdMB - Growth threshold for severity classification
 * @param options.deepAnalysis - When true, uses `analyzeNodejsSnapshot` for richer data
 */
export async function buildTimelineEvents(
  snapshots: SnapshotEntry[],
  thresholdMB: number,
  options: { deepAnalysis?: boolean } = {}
): Promise<TimelineEvent[]> {
  if (snapshots.length < 2) return [];

  // Load stats for all snapshots in parallel, then build events sequentially
  if (options.deepAnalysis) {
    const stats = await Promise.all(snapshots.map((s) => loadDeepStats(s)));
    snapshots.forEach((entry, i) => {
      entry.heapSizeMB = stats[i].heapSizeMB;
      entry.objectCount = stats[i].objectCount;
      entry.topNodeTypes = stats[i].topNodeTypes;
    });
  } else {
    const stats = await Promise.all(snapshots.map((s) => loadStats(s)));
    snapshots.forEach((entry, i) => {
      entry.heapSizeMB = stats[i].heapSizeMB;
      entry.objectCount = stats[i].objectCount;
    });
  }

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
    const durationSec = durationMs > 0 ? durationMs / 1000 : 1;
    const growthRateMBPerSec = growthMB / durationSec;
    const severity = classifySeverity(growthMB, thresholdMB);
    const prevGrowthMB = events.length > 0 ? events[events.length - 1].growthMB : undefined;
    const category = classifyCategory(growthMB, growthPercent, prevGrowthMB, thresholdMB);
    const isGcRecovery = category === 'gc-recovery';

    if (isGcRecovery) {
      to.isGcRecoveryPoint = true;
    }

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
      growthRateMBPerSec,
      severity,
      isCritical: severity === 'critical',
      category,
      isGcRecovery,
    });
  }

  return events;
}

/**
 * Identify which events should be considered critical based on the threshold,
 * relative growth, and object accumulation patterns.
 *
 * An event is critical when:
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
 * Filter events from a timeline by time range, severity, category, or growth bounds.
 *
 * All filters are ANDed together. Omit a field to skip that filter.
 *
 * @param events - Full ordered event list from `buildTimelineEvents`
 * @param snapshots - Snapshot entries (used to resolve event timestamps)
 * @param filter - Filter criteria
 */
export function filterEvents(
  events: TimelineEvent[],
  snapshots: SnapshotEntry[],
  filter: EventFilterOptions
): TimelineEvent[] {
  // Build a map from filename → timestamp for range checks
  const tsMap = new Map<string, number>(
    snapshots.map((s) => [s.filename, s.timestamp.getTime()])
  );

  return events.filter((e) => {
    // Time range: use the *target* snapshot timestamp for range checks
    const targetTs = tsMap.get(e.toSnapshot);
    if (targetTs !== undefined) {
      if (filter.startTime && targetTs < filter.startTime.getTime()) return false;
      if (filter.endTime && targetTs > filter.endTime.getTime()) return false;
    }

    // Minimum severity
    if (
      filter.minSeverity !== undefined &&
      SEVERITY_RANK[e.severity] < SEVERITY_RANK[filter.minSeverity]
    ) {
      return false;
    }

    // Categories
    if (filter.categories && filter.categories.length > 0) {
      if (!filter.categories.includes(e.category)) return false;
    }

    // Growth bounds
    if (filter.minGrowthMB !== undefined && e.growthMB < filter.minGrowthMB) return false;
    if (filter.maxGrowthMB !== undefined && e.growthMB > filter.maxGrowthMB) return false;

    // Quick flags
    if (filter.criticalOnly && !e.isCritical) return false;
    if (filter.gcRecoveryOnly && !e.isGcRecovery) return false;

    return true;
  });
}

/**
 * Query a timeline summary for events within a time window.
 *
 * Convenience wrapper around `filterEvents` that also re-computes
 * the trend for the filtered subset.
 *
 * @param summary - Full timeline summary
 * @param snapshots - Snapshot entries used to build the summary
 * @param startTime - Window start (inclusive)
 * @param endTime - Window end (inclusive)
 */
export function queryTimeRange(
  summary: TimelineSummary,
  snapshots: SnapshotEntry[],
  startTime: Date,
  endTime: Date
): TimelineEvent[] {
  return filterEvents(summary.events, snapshots, { startTime, endTime });
}

/**
 * Calculate the heap growth rate in MB per second over a slice of events.
 *
 * @param events - Subset of timeline events (e.g. from `filterEvents`)
 * @returns Growth rate in MB/s, or 0 when the window has zero duration
 */
export function calculateGrowthRate(events: TimelineEvent[]): number {
  if (events.length === 0) return 0;
  const totalGrowthMB = events.reduce((sum, e) => sum + e.growthMB, 0);
  const totalMs = events.reduce((sum, e) => sum + e.durationMs, 0);
  if (totalMs === 0) return 0;
  return totalGrowthMB / (totalMs / 1000);
}

/**
 * Detect recovery patterns: sequences where a growth spike is followed by
 * a significant drop (GC fired and reclaimed memory).
 *
 * @returns Pairs of [spikeEvent, recoveryEvent]
 */
export function detectRecoveryPatterns(
  events: TimelineEvent[]
): Array<{ spike: TimelineEvent; recovery: TimelineEvent }> {
  const pairs: Array<{ spike: TimelineEvent; recovery: TimelineEvent }> = [];

  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    if (current.growthMB > 0 && next.isGcRecovery) {
      pairs.push({ spike: current, recovery: next });
    }
  }

  return pairs;
}

/**
 * Run the full timeline analysis pipeline and return a structured summary.
 *
 * @param directory - Path to folder containing .heapsnapshot files
 * @param options.leakThresholdMB - Growth in MB that classifies an event as critical (default 10)
 * @param options.deepAnalysis - Use nodejs.ts for richer per-snapshot analysis (default false)
 */
export async function analyzeTimeline(
  directory: string,
  options: { leakThresholdMB?: number; deepAnalysis?: boolean } = {}
): Promise<TimelineSummary> {
  const thresholdMB = options.leakThresholdMB ?? 10;

  const snapshots = await collectSnapshots(directory);

  if (snapshots.length < 2) {
    throw new Error(
      `At least 2 .heapsnapshot files are required. Found: ${snapshots.length}`
    );
  }

  const events = await buildTimelineEvents(snapshots, thresholdMB, {
    deepAnalysis: options.deepAnalysis,
  });
  const criticalEvents = identifyCriticalEvents(events, thresholdMB);
  const gcRecoveryEvents = events.filter((e) => e.isGcRecovery);

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const startHeapMB = first.heapSizeMB ?? 0;
  const endHeapMB = last.heapSizeMB ?? 0;
  const totalGrowthMB = endHeapMB - startHeapMB;
  const totalGrowthPercent = startHeapMB > 0 ? (totalGrowthMB / startHeapMB) * 100 : 0;
  const totalDurationMs = last.timestamp.getTime() - first.timestamp.getTime();
  const overallGrowthRateMBPerSec =
    totalDurationMs > 0 ? totalGrowthMB / (totalDurationMs / 1000) : 0;
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
    totalDurationMs,
    snapshotCount: snapshots.length,
    startHeapMB,
    endHeapMB,
    totalGrowthMB,
    totalGrowthPercent,
    overallGrowthRateMBPerSec,
    leakDetected,
    leakThresholdMB: thresholdMB,
    events,
    trend,
    criticalEvents,
    gcRecoveryEvents,
    problematicOperations,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

/**
 * Build a `TimelineExport` from a completed analysis.
 * Suitable for serialisation to JSON and consumption by charting libraries.
 *
 * @param summary - Result of `analyzeTimeline`
 * @param snapshots - Snapshot entries returned by `collectSnapshots`
 */
export function buildTimelineExport(
  summary: TimelineSummary,
  snapshots: SnapshotEntry[]
): TimelineExport {
  const peakMB = Math.max(...snapshots.map((s) => s.heapSizeMB ?? 0));

  const dataPoints: TimelineDataPoint[] = snapshots.map((s, i) => {
    // The severity at this point is the severity of the event that ended here.
    // The first snapshot has no preceding event, so we use 'info'.
    const event = summary.events[i - 1];
    return {
      timestampMs: s.timestamp.getTime(),
      isoTime: s.timestamp.toISOString(),
      heapSizeMB: s.heapSizeMB ?? 0,
      objectCount: s.objectCount ?? 0,
      label: s.operation ?? s.filename,
      severity: event?.severity ?? 'info',
      category: event?.category ?? 'stable',
      isGcRecovery: s.isGcRecoveryPoint ?? false,
    };
  });

  return {
    schemaVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    directory: summary.directory,
    session: {
      startTime: summary.startTime,
      endTime: summary.endTime,
      durationMs: summary.totalDurationMs,
    },
    heap: {
      startMB: summary.startHeapMB,
      endMB: summary.endHeapMB,
      peakMB,
      netGrowthMB: summary.totalGrowthMB,
      netGrowthPercent: summary.totalGrowthPercent,
      overallGrowthRateMBPerSec: summary.overallGrowthRateMBPerSec,
    },
    trend: summary.trend,
    leakDetected: summary.leakDetected,
    dataPoints,
    events: summary.events,
  };
}

/**
 * Serialize a `TimelineExport` to a JSON string.
 * Pass `pretty: true` for human-readable output (default: minified).
 */
export function exportTimelineJSON(payload: TimelineExport, pretty = false): string {
  return JSON.stringify(payload, null, pretty ? 2 : undefined);
}

/**
 * Serialize timeline data points to CSV format.
 * Columns: timestampMs, isoTime, heapSizeMB, objectCount, label, severity, category, isGcRecovery
 */
export function exportTimelineCSV(payload: TimelineExport): string {
  const header = [
    'timestampMs',
    'isoTime',
    'heapSizeMB',
    'objectCount',
    'label',
    'severity',
    'category',
    'isGcRecovery',
  ].join(',');

  const rows = payload.dataPoints.map((dp) =>
    [
      dp.timestampMs,
      dp.isoTime,
      dp.heapSizeMB.toFixed(4),
      dp.objectCount,
      `"${dp.label.replace(/"/g, '""')}"`,
      dp.severity,
      dp.category,
      dp.isGcRecovery ? 'true' : 'false',
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

/**
 * Write timeline data to disk.
 *
 * @param summary - Result of `analyzeTimeline`
 * @param snapshots - Snapshot entries returned by `collectSnapshots`
 * @param outputDir - Directory to write files into (defaults to `summary.directory`)
 * @param formats - Formats to write; defaults to both JSON and CSV
 */
export async function writeTimelineExport(
  summary: TimelineSummary,
  snapshots: SnapshotEntry[],
  outputDir?: string,
  formats: Array<'json' | 'csv'> = ['json', 'csv']
): Promise<{ jsonPath?: string; csvPath?: string }> {
  const dir = outputDir ?? summary.directory;
  const payload = buildTimelineExport(summary, snapshots);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const result: { jsonPath?: string; csvPath?: string } = {};

  if (formats.includes('json')) {
    const p = path.join(dir, `timeline-export-${timestamp}.json`);
    await fs.writeFile(p, exportTimelineJSON(payload, true), 'utf8');
    result.jsonPath = p;
  }

  if (formats.includes('csv')) {
    const p = path.join(dir, `timeline-export-${timestamp}.csv`);
    await fs.writeFile(p, exportTimelineCSV(payload), 'utf8');
    result.csvPath = p;
  }

  return result;
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

function categoryLabel(c: EventCategory): string {
  return {
    allocation: 'alloc',
    deallocation: 'dealloc',
    'gc-recovery': 'gc↓',
    stable: '—',
    'leak-suspect': 'LEAK?',
  }[c];
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
  console.log(`   Start heap   : ${summary.startHeapMB.toFixed(2)} MB`);
  console.log(`   End heap     : ${summary.endHeapMB.toFixed(2)} MB`);
  console.log(
    `   Net growth   : ${signedMB(summary.totalGrowthMB)} (${summary.totalGrowthPercent.toFixed(1)}%)`
  );
  console.log(
    `   Growth rate  : ${summary.overallGrowthRateMBPerSec.toFixed(4)} MB/s`
  );

  // Trend
  const t = summary.trend;
  console.log('\n📊  Memory Trend');
  console.log(`   Classification : ${trendEmoji(t.trend)} ${t.trend.toUpperCase()}`);
  console.log(`   Avg growth/evt : ${signedMB(t.avgGrowthPerEventMB)}`);
  console.log(`   Avg rate       : ${t.avgGrowthRateMBPerSec.toFixed(4)} MB/s`);
  console.log(`   Peak growth    : ${signedMB(t.peakGrowthMB)} (event #${t.peakEventIndex})`);
  console.log(`   Growing events : ${(t.growingEventRatio * 100).toFixed(0)}%`);
  console.log(`   Std deviation  : ${t.growthStdDevMB.toFixed(2)} MB`);
  if (t.gcRecoveryCount > 0) {
    console.log(`   GC recoveries  : ${t.gcRecoveryCount} (reclaimed ${t.totalGcReclaimedMB.toFixed(2)} MB)`);
  }

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
    '┌──────┬──────────────────────────────┬──────────────┬──────────────┬─────────┬─────────────┐'
  );
  console.log(
    '│ Sev  │ Event / Operation            │ Growth       │ Heap Size    │ Cat     │ Objects Δ   │'
  );
  console.log(
    '├──────┼──────────────────────────────┼──────────────┼──────────────┼─────────┼─────────────┤'
  );

  for (const evt of summary.events) {
    const sev = severityEmoji(evt.severity);
    const label = evt.label.padEnd(28).slice(0, 28);
    const growth = signedMB(evt.growthMB).padStart(12);
    const heapStr = `${evt.heapSizeMB.toFixed(2)} MB`.padStart(12);
    const cat = categoryLabel(evt.category).padEnd(7);
    const objDelta = ((evt.objectCountDelta >= 0 ? '+' : '') + evt.objectCountDelta.toLocaleString()).padStart(11);
    console.log(`│ ${sev} │ ${label} │ ${growth} │ ${heapStr} │ ${cat} │ ${objDelta} │`);
  }

  console.log(
    '└──────┴──────────────────────────────┴──────────────┴──────────────┴─────────┴─────────────┘'
  );

  // GC recovery summary
  if (summary.gcRecoveryEvents.length > 0) {
    console.log('\n♻️  GC Recovery Events');
    for (const e of summary.gcRecoveryEvents) {
      console.log(
        `   Event #${e.index}: ${e.label} — reclaimed ${Math.abs(e.growthMB).toFixed(2)} MB`
      );
    }
  }

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
 * @param options.deepAnalysis - Use nodejs.ts for richer per-snapshot data (default false)
 * @param options.export - When set, write JSON/CSV export files to this directory
 */
export async function timelineCLI(
  directory: string,
  options: {
    leakThresholdMB?: number;
    deepAnalysis?: boolean;
    export?: string;
  } = {}
): Promise<void> {
  try {
    console.log('📊 Timeline Analysis\n');
    console.log(`📁 Directory: ${directory}`);

    const snapshots = await collectSnapshots(directory);
    console.log(`✅ Found ${snapshots.length} snapshots\n`);
    console.log('🔍 Building event timeline...\n');

    const summary = await analyzeTimeline(directory, {
      leakThresholdMB: options.leakThresholdMB,
      deepAnalysis: options.deepAnalysis,
    });

    printTimelineSummary(summary);

    if (options.export !== undefined) {
      const exportDir = options.export || directory;
      const paths = await writeTimelineExport(summary, snapshots, exportDir);
      if (paths.jsonPath) console.log(`📄 JSON export : ${paths.jsonPath}`);
      if (paths.csvPath) console.log(`📄 CSV export  : ${paths.csvPath}`);
    }
  } catch (err) {
    console.error('❌ Timeline analysis failed:', err);
    throw err;
  }
}
