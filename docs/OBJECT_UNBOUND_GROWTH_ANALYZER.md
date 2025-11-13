# Object Unbound Growth Analyzer

**Inspired by MemLab's ObjectUnboundGrowthAnalysis** - Tracks individual objects that exhibit monotonic or significant growth patterns across multiple heap snapshots. Detects single objects that accumulate memory over time, which is a common pattern for memory leaks.

## What It Analyzes

### Individual Object Growth Tracking
- **Cross-Snapshot Analysis**: Tracks specific objects across multiple heap snapshots
- **Monotonic Growth Detection**: Identifies objects that always increase in size
- **Growth Pattern Classification**: MONOTONIC, SIGNIFICANT, FLUCTUATING, STABLE
- **Memory Accumulation**: Tracks objects that continuously accumulate data

### Detection Capabilities

1. **Critical Growing Objects** (>10MB growth or >500% increase)
   - Objects exhibiting unbounded memory accumulation
   - Likely candidates for memory leaks
   - Immediate optimization targets

2. **Monotonic Growth Objects**
   - Objects that always increase in size across snapshots
   - Strong indicators of missing cleanup logic
   - High confidence leak detection

3. **Significant Growth Objects**
   - Objects with large growth but some fluctuation  
   - Potential optimization candidates
   - Memory usage pattern analysis

### Analysis Features

- **Growth Rate Calculation**: Bytes per snapshot tracking
- **Peak Size Monitoring**: Maximum size reached during analysis
- **Confidence Scoring**: Based on growth consistency and magnitude
- **Severity Assessment**: CRITICAL/HIGH/MEDIUM/LOW/NEGLIGIBLE levels
- **Pattern Analysis**: Identifies consistent vs fluctuating growth

## Usage Example

```typescript
import { ObjectUnboundGrowthAnalyzer } from './utils/objectUnboundGrowthAnalyzer';

const analyzer = new ObjectUnboundGrowthAnalyzer();
const snapshots = [
  { nodes: beforeHeapNodes },
  { nodes: afterHeapNodes },
  // ... more snapshots for better analysis
];

const result = analyzer.analyzeAcrossSnapshots(snapshots);

console.log(`Growing objects detected: ${result.growingObjects.length}`);
console.log(`Critical objects: ${result.severityBreakdown.CRITICAL}`);

// Show top growing objects
result.growingObjects.slice(0, 5).forEach(obj => {
  console.log(`${obj.objectName}: +${obj.totalGrowth} bytes (${obj.growthPattern})`);
});
```

## Integration

Fully integrated into the main comparison workflow:
- Runs automatically during `npm run dev compare`
- Analyzes before and after snapshots for object growth
- Results displayed in "OBJECT UNBOUND GROWTH ANALYSIS" section
- Cross-references with Object Content Analyzer for deep inspection

## What the Output Shows

```
📈 OBJECT UNBOUND GROWTH ANALYSIS
=================================
🚨 CRITICAL: 3 objects with unbounded growth (25.7 MB total)
Objects Tracked: 1,247
Snapshots Analyzed: 4

🚨 CRITICAL GROWING OBJECTS:
🔥 MyDataAccumulator (object)
   Growth: 2.1 MB → 15.3 MB (+13.2 MB)
   Pattern: MONOTONIC | Rate: +4.4 MB/snapshot
   Confidence: 95% | Still Exists: Yes
   Fix: 🚨 CRITICAL: Implement immediate size limits and cleanup

📈 MONOTONIC GROWTH OBJECTS:
🔴 EventLogBuffer (object)
   Growth: 500 KB → 2.1 MB (+320.0%)
   Snapshots: 4 | Pattern: Always Increasing
   Node ID: @12345 (use inspect-object for details)

📊 GROWTH PATTERNS:
• 📈 Monotonic: 5 objects (always increasing)
• 📊 Significant: 8 objects (large growth with fluctuation)

🛠️ OBJECT GROWTH RECOMMENDATIONS:
• 🚨 Address critical growing objects immediately - implement size limits
• 📈 Investigate monotonic growth objects - likely accumulating data without cleanup
• 🔍 Use Object Content Analyzer to inspect specific growing objects
```

## Growth Patterns

### MONOTONIC Growth
- **Pattern**: Object size always increases across snapshots
- **Indication**: Strong leak candidate - missing cleanup logic
- **Action**: Immediate investigation required
- **Common Causes**: Event listeners, cache accumulation, data buffers

### SIGNIFICANT Growth  
- **Pattern**: Large growth with occasional decreases
- **Indication**: Potential optimization opportunity
- **Action**: Review and monitor
- **Common Causes**: Batch processing, periodic cleanup

### FLUCTUATING Growth
- **Pattern**: Growing trend but with regular decreases
- **Indication**: Normal operation with room for optimization
- **Action**: Monitor for trends
- **Common Causes**: Cache with periodic cleanup, temporary buffers

### STABLE Growth
- **Pattern**: No significant size changes
- **Indication**: Normal behavior
- **Action**: No immediate action needed
- **Common Causes**: Stable object state, proper cleanup

## Severity Levels

### CRITICAL (🔥)
- **Threshold**: >10MB growth or >500% increase
- **Action**: Immediate investigation and fix required
- **Strategies**: Size limits, immediate cleanup, data streaming

### HIGH (🔴)
- **Threshold**: 5-10MB growth or >200% increase
- **Action**: Review and optimize soon
- **Strategies**: Periodic cleanup, memory monitoring

### MEDIUM (🟡)
- **Threshold**: 1-5MB growth or >100% increase
- **Action**: Monitor and consider optimization
- **Strategies**: Cleanup patterns, lifecycle management

### LOW (🟢)
- **Threshold**: 100KB-1MB growth or >50% increase
- **Action**: Regular monitoring
- **Strategies**: Standard cleanup practices

### NEGLIGIBLE
- **Threshold**: <100KB or <50% increase
- **Action**: No immediate action needed
- **Strategies**: Include in general monitoring

## Object Types Tracked

### Objects (`object`)
- **Focus**: Plain JavaScript objects
- **Common Issues**: Property accumulation, cache growth
- **Recommendations**: Property cleanup, WeakMap usage

### Closures (`closure`)
- **Focus**: Function closures with captured variables
- **Common Issues**: Scope creep, variable accumulation
- **Recommendations**: Scope management, variable cleanup

### RegExp (`regexp`)
- **Focus**: Regular expression objects
- **Common Issues**: RegExp caching, compilation accumulation
- **Recommendations**: RegExp reuse, cache management

## Implementation Notes

- **Smart Filtering**: Excludes system internals and tiny objects (<1KB)
- **Performance Optimized**: Limits tracking to 10,000 objects maximum
- **Identity Verification**: Ensures tracked objects maintain type/name consistency
- **Memory Efficient**: Tracks only essential growth metrics
- **Cross-Snapshot Correlation**: Links objects across multiple heap snapshots

## Best Practices

### Analysis Workflow
1. **Take Multiple Snapshots**: More snapshots = better growth pattern detection
2. **Focus on Monotonic**: Objects that always grow are highest priority
3. **Investigate Critical Objects**: Start with >10MB growth objects
4. **Use Content Analyzer**: Deep-dive into specific growing objects
5. **Monitor Over Time**: Track growth trends across development cycles

### Common Patterns
- **Event Accumulation**: Event listeners or handlers accumulating
- **Cache Growth**: Caches without proper size limits or cleanup
- **Data Buffers**: Buffers that grow without being flushed
- **Object Property Growth**: Objects accumulating properties over time
- **Closure Capture**: Closures capturing and holding growing data

This analyzer provides **individual object growth tracking** that complements the other 10 MemLab analyzers for comprehensive JavaScript memory leak detection!