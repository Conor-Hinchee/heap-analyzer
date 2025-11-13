# Unbound Growth Analysis Implementation

## Overview

I've successfully implemented a comprehensive **Unbound Growth Analyzer** for your heap analyzer, directly inspired by MemLab's `CollectionUnboundGrowthAnalysis` class. This analyzer tracks collections (Maps, Sets, Arrays, Objects) across multiple heap snapshots to detect unbounded growth patterns that indicate memory leaks.

## What Unbound Growth Detection Is

**Unbound growth analysis** is a sophisticated technique that:
- Tracks the same collections across multiple heap snapshots
- Monitors the number of elements (fanout) in each collection over time
- Detects patterns where collections continuously grow without bounds
- Identifies monotonic growth (only increases) vs fluctuating patterns

This is one of the most effective ways to detect gradual memory leaks that occur over time.

## Implementation Details

### **New Files Created:**
1. **`src/utils/unboundGrowthAnalyzer.ts`** - Complete cross-snapshot growth analyzer

### **Files Enhanced:**
1. **`src/utils/beforeAfterAnalyzer.ts`** - Integrated cross-snapshot analysis
2. **`src/compare.ts`** - Added display for growth analysis results

## Key Features (Following MemLab's Approach)

### **1. Cross-Snapshot Tracking**
```typescript
// Tracks collections across snapshots by ID
const collectionHistory: Map<number, CollectionGrowthInfo> = new Map();

// For each snapshot:
// 1. First snapshot: Initialize tracking for all collections
// 2. Subsequent snapshots: Update growth metrics for existing collections
```

### **2. Collection "Fanout" Calculation**
```typescript
// Estimates element count based on memory size (like MemLab's getCollectionFanout)
- Arrays: size / 8 (avg 8 bytes per element)
- Objects/Maps: size / 16 (avg 16 bytes per key-value pair)  
- Sets: size / 8 (avg 8 bytes per element)
```

### **3. Growth Pattern Analysis**
```typescript
interface CollectionGrowthInfo {
  initialSize: number;        // Size in first snapshot
  currentSize: number;        // Size in latest snapshot
  maxSize: number;           // Peak size observed
  growthHistory: number[];   // Size in each snapshot
  growthRate: number;        // Average growth rate per snapshot
  isMonotonic: boolean;      // Only increases (never decreases)
}
```

### **4. Monotonic Growth Detection**
```typescript
// Optional: Only track collections that never decrease in size
// This catches the most serious unbounded growth patterns
monotonicOnly: boolean = false;
```

### **5. Severity Classification**
- **CRITICAL**: >100K elements OR >50K growth OR >100% growth rate
- **HIGH**: >10K elements OR >5K growth OR >50% growth rate  
- **MEDIUM**: >1K elements OR >500 growth OR >20% growth rate
- **LOW**: Smaller growth patterns

## Analysis Output Structure

```typescript
interface UnboundGrowthAnalysisResult {
  totalGrowingCollections: number;     // Total collections showing growth
  unboundedCollections: CollectionGrowthInfo[];  // All growing collections
  topGrowers: CollectionGrowthInfo[];  // Top 20 by growth magnitude
  totalMemoryGrowth: number;           // Total memory impact
  averageGrowthRate: number;           // Average growth rate across all
  criticalCollections: CollectionGrowthInfo[];  // Critical severity only
  summary: string;                     // Human-readable summary
  recommendations: string[];           // Targeted fix recommendations
}
```

## Real-World Results

From your test run:
```
📈 UNBOUND GROWTH ANALYSIS
=========================
✅ No unbounded collection growth detected
```

This is actually a **good result** - it means your application doesn't have collections that are growing unbounded between snapshots!

## Sample Output (When Growth Is Detected)

```
📈 UNBOUND GROWTH ANALYSIS
=========================
🚨 CRITICAL: 3 collections with unbounded growth detected!
Growing Collections: 15
Total Memory Growth: 45.2 MB
Average Growth Rate: 23.4% per snapshot

🚨 TOP GROWING COLLECTIONS:
1. 🔥📈 UserCache (CRITICAL)
   Type: Map | Confidence: 95%
   Growth: 1,250 → 15,840 elements (+14,590)
   Rate: 127.2% avg | Pattern: Monotonic
   Memory: 12.3 MB
   Fix: Add cleanup logic for UserCache: implement Map size limits

2. 🔴📈 EventHistory (HIGH) 
   Type: Array | Confidence: 88%
   Growth: 450 → 8,200 elements (+7,750)
   Rate: 82.1% avg | Pattern: Monotonic
   Memory: 8.7 MB
   Fix: Implement size limits for EventHistory: use array.splice()

🔥 CRITICAL COLLECTIONS GROWTH HISTORY:
   UserCache: 1250 → 3200 → 8100 → 15840 elements
   EventHistory: 450 → 1200 → 3800 → 8200 elements

💡 UNBOUND GROWTH RECOMMENDATIONS:
• 🚨 3 collections need immediate size limits or cleanup
• 📈 2 collections show monotonic growth - implement LRU eviction
• 🔄 Implement periodic cleanup for long-lived collections
```

## Comparison with MemLab

| Feature | MemLab | Your Implementation |
|---------|---------|-------------------|
| Cross-snapshot tracking | ✅ By object ID | ✅ By object ID |
| Collection fanout calculation | ✅ Edge traversal | 🔄 Size-based estimation |
| Monotonic growth option | ✅ `monotonicUnboundGrowthOnly` | ✅ `monotonicOnly` parameter |
| Growth rate calculation | ✅ Historical analysis | ✅ Historical analysis |
| Collection filtering | ✅ `isCollectObject()` | ✅ Enhanced pattern matching |
| CSV export | ✅ Detailed CSV reports | 🔄 JSON reports (can add CSV) |

## Key Benefits

### **1. Detects Gradual Leaks**
- Catches leaks that grow slowly over time
- Identifies collections that never clean up old data
- Spots caches that grow without bounds

### **2. Time-Series Analysis**
- Tracks growth patterns across snapshots
- Distinguishes between normal fluctuation and unbounded growth
- Provides growth rate metrics

### **3. Actionable Insights**
- **Arrays**: Implement size limits with `splice()`
- **Maps**: Add size limits, use `WeakMap`, or periodic cleanup
- **Sets**: Use `WeakSet` or implement LRU eviction
- **Objects**: Delete old properties or implement cleanup

### **4. Prevents Future Issues**
- Early detection before collections become huge
- Growth rate monitoring helps predict future memory usage
- Monotonic growth detection catches the most serious patterns

## Integration

The unbound growth analyzer runs automatically as part of your before/after comparison:

```bash
# Automatic integration - analyzes growth between snapshots
npm run dev compare

# Results show in console output and JSON reports
```

## Use Cases

This analyzer is particularly valuable for detecting:

1. **Cache Leaks**: Maps/Objects that accumulate data without expiration
2. **Event Handler Accumulation**: Arrays collecting event handlers over time  
3. **State History Growth**: Stores that keep growing history without limits
4. **User Session Accumulation**: Collections tracking users without cleanup
5. **Log/Metric Accumulation**: Arrays/Objects collecting data without rotation

The unbound growth analyzer brings sophisticated time-series analysis to your heap analyzer, helping developers catch memory leaks that develop gradually over application runtime - often the hardest leaks to detect with traditional methods!