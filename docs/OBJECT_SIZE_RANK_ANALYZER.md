# Object Size Rank Analyzer

**Inspired by MemLab's ObjectSizeRankAnalysis** - Identifies and ranks the largest objects in a heap snapshot by retained size. Essential for finding memory bottlenecks and optimization targets.

## What It Analyzes

### Size-Based Object Ranking
- **Retained Size Analysis**: Ranks objects by total memory retention
- **Heap Percentage**: Shows what percentage of total heap each object consumes
- **Size Categories**: Classifies objects by memory significance
- **Memory Distribution**: Analyzes size patterns across object types

### Detection Capabilities

1. **Critical Objects** (>10MB or >5% of heap)
   - Immediate optimization targets
   - Memory bottleneck identification
   - Size reduction strategies

2. **High-Impact Objects** (5-10MB or >2% of heap)
   - Significant memory consumers requiring attention
   - Candidates for lazy loading or compression
   - Architecture review recommendations

3. **Object Category Analysis**
   - ARRAY, OBJECT, STRING, FUNCTION, CLOSURE
   - DOM_NODE, CODE, TYPED_ARRAY, SYSTEM
   - Category-specific optimization suggestions

### Analysis Features

- **Object Filtering**: Excludes system internals and built-in globals
- **Smart Categorization**: Groups objects by type and purpose  
- **Significance Assessment**: CRITICAL/HIGH/MEDIUM/LOW/NEGLIGIBLE levels
- **Confidence Scoring**: Analysis reliability based on object characteristics
- **Optimization Suggestions**: Category-specific recommendations for size reduction

## Usage Example

```typescript
import { ObjectSizeRankAnalyzer } from './utils/objectSizeRankAnalyzer';

const analyzer = new ObjectSizeRankAnalyzer();
const result = analyzer.analyze({ nodes: heapNodes }, 50);

console.log(`Largest object: ${result.largestObjects[0]?.retainedSize} bytes`);
console.log(`Critical objects: ${result.significanceBreakdown.CRITICAL}`);

// Show top objects
result.largestObjects.slice(0, 10).forEach(obj => {
  console.log(`${obj.rank}. ${obj.node.name}: ${obj.retainedSize} bytes (${obj.sizePercentage}%)`);
});
```

## Integration

Fully integrated into the main comparison workflow:
- Runs automatically during `npm run dev compare`
- Results displayed in "OBJECT SIZE RANK ANALYSIS" section
- Links with Object Content Analyzer for deep inspection
- Professional recommendations included in final report

## What the Output Shows

```
📏 OBJECT SIZE RANK ANALYSIS
============================
🚨 CRITICAL: 2 objects >10MB detected (145.7 MB analyzed)
Objects Analyzed: 15,847
Memory Analyzed: 145.7 MB

🚨 CRITICAL OBJECTS (>10MB):
1. 🔥 MyLargeDataStructure (object)
   Size: 25.3 MB (17.4% of heap)
   Category: OBJECT | Confidence: 95%
   Fix: 🔥 CRITICAL: Implement immediate size reduction

💾 TOP LARGEST OBJECTS:
1. 🔥 MyLargeDataStructure (object)
   Size: 25.3 MB | Category: OBJECT
   Heap %: 17.36% | Significance: CRITICAL
   Node ID: @12345 (use inspect-object for details)

📂 TOP MEMORY-CONSUMING CATEGORIES:
1. 🔥 OBJECT
   Total: 45.2 MB (31.1% of analyzed)
   Objects: 1,247 | Avg Size: 37.2 KB

🎯 SIZE OPTIMIZATION RECOMMENDATIONS:
• 🚨 Address critical objects immediately - implement size limits
• 🎯 Focus on top 2 critical objects first
• 🔍 Use Object Content Analyzer to inspect specific large objects
```

## Object Categories & Optimization Strategies

### Arrays (`ARRAY`)
- **Detection**: Array objects and collections
- **Optimizations**: Pagination, virtualization, sparse arrays
- **Recommendations**: Implement cleanup for unused elements

### Objects (`OBJECT`) 
- **Detection**: Plain JavaScript objects
- **Optimizations**: Property cleanup, structure review
- **Recommendations**: Use Maps for dynamic key-value storage

### Strings (`STRING`)
- **Detection**: String objects and concatenated strings
- **Optimizations**: String interning, compression
- **Recommendations**: StringBuilder pattern for large concatenations

### Closures (`CLOSURE`)
- **Detection**: Function closures with captured variables
- **Optimizations**: Scope review, variable cleanup
- **Recommendations**: Break into smaller functions

### DOM Nodes (`DOM_NODE`)
- **Detection**: DOM elements and related objects
- **Optimizations**: Element lifecycle management
- **Recommendations**: Remove event listeners, verify attachment

### Code (`CODE`)
- **Detection**: Compiled code and instruction streams
- **Optimizations**: Code splitting, lazy compilation
- **Recommendations**: Review code generation patterns

## Significance Levels

### CRITICAL (🔥)
- **Threshold**: >10MB or >5% of heap
- **Action**: Immediate optimization required
- **Strategies**: Size limits, breaking into chunks, lazy loading

### HIGH (🔴)
- **Threshold**: 5-10MB or >2% of heap  
- **Action**: Review and optimize soon
- **Strategies**: Compression, streaming, pagination

### MEDIUM (🟡)
- **Threshold**: 1-5MB or >0.5% of heap
- **Action**: Monitor and consider optimization
- **Strategies**: Cleanup patterns, lifecycle management

### LOW (🟢)
- **Threshold**: 100KB-1MB
- **Action**: Regular monitoring
- **Strategies**: Standard cleanup practices

### NEGLIGIBLE
- **Threshold**: <100KB
- **Action**: No immediate action needed
- **Strategies**: Include in general cleanup

## Implementation Notes

- **Smart Filtering**: Excludes system internals, built-ins, and tiny objects (<1KB)
- **Memory-Efficient**: Processes objects in sorted order to minimize overhead
- **Confidence-Based**: Higher confidence for larger objects and known types
- **Integration-Ready**: Works with existing heap node data structure
- **Professional Output**: Clear ranking with actionable recommendations

## Best Practices

### Investigation Workflow
1. **Identify Critical Objects**: Start with objects >10MB
2. **Use Content Analyzer**: Inspect specific large objects with `inspect-object @nodeId`
3. **Category Analysis**: Focus on top memory-consuming categories
4. **Optimization Planning**: Implement category-specific strategies
5. **Monitor Progress**: Track size changes over time

### Common Patterns
- **Large Arrays**: Often indicate need for pagination or virtualization
- **Big Objects**: Usually require property cleanup or restructuring  
- **String Accumulation**: Suggest interning or compression opportunities
- **Closure Growth**: Point to scope management issues
- **DOM Retention**: Indicate lifecycle management problems

This analyzer provides **size-based memory optimization insights** that complement the other 9 MemLab analyzers for complete JavaScript memory analysis coverage!