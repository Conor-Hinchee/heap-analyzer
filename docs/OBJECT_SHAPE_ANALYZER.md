# Object Shape Analyzer

**Inspired by MemLab's ObjectShapeAnalysis** - Analyzes object shapes (structural patterns) to identify which object structures consume the most memory and find optimization opportunities at the shape level.

## What It Analyzes

### Shape Classification
- **Object Type + Name Patterns**: Groups objects with similar structures
- **Size Categories**: TINY (<1KB), SMALL (1KB-100KB), MEDIUM (100KB-1MB), LARGE (>1MB)
- **Memory Distribution**: Shows which shapes consume the most memory
- **Instance Counts**: Tracks how many objects share each shape

### Detection Capabilities

1. **Critical Memory Shapes** (>10MB total consumption)
   - Large object structures consuming excessive memory
   - High-impact optimization targets
   - Shape-specific recommendations

2. **High Object Count Shapes** (>100 instances)
   - Shapes with many instances that could benefit from pooling
   - Potential duplication or factory pattern optimization
   - Memory density analysis

3. **Memory Impact Classification**
   - CRITICAL: >10MB total per shape
   - HIGH: 5-10MB total per shape  
   - MEDIUM: 1-5MB total per shape
   - LOW: <1MB total per shape

### Analysis Features

- **Shape Distribution Statistics**: Memory consumption breakdown by shape category
- **Top Shapes by Memory**: Largest memory consumers per shape
- **Top Shapes by Count**: Shapes with highest instance counts
- **Confidence Scoring**: Analysis reliability based on sample size and memory impact
- **Professional Recommendations**: Shape-specific optimization strategies

## Usage Example

```typescript
import { ObjectShapeAnalyzer } from './utils/objectShapeAnalyzer';

const analyzer = new ObjectShapeAnalyzer();
const result = analyzer.analyze({ nodes: heapNodes });

console.log(`Shapes analyzed: ${result.totalShapesAnalyzed}`);
console.log(`Critical shapes: ${result.criticalShapes.length}`);
console.log(`Memory analyzed: ${result.totalMemoryAnalyzed} bytes`);

// Show top memory-consuming shapes
result.topShapesBySize.forEach(shape => {
  console.log(`${shape.shapeSignature}: ${shape.totalRetainedSize} bytes`);
});
```

## Integration

Fully integrated into the main comparison workflow:
- Runs automatically during `npm run dev compare`
- Results displayed in "OBJECT SHAPE ANALYSIS" section
- Contributes to overall leak detection confidence
- Professional recommendations included in final report

## What the Output Shows

```
📐 OBJECT SHAPE ANALYSIS
========================
🚨 CRITICAL: 2 object shapes consuming excessive memory (45.2 MB total)
Shapes Analyzed: 156
Objects Analyzed: 12,847  
Memory Analyzed: 45.2 MB

🚨 CRITICAL MEMORY SHAPES:
1. 🔥 MyLargeObject (object, LARGE)
   Memory: 25.3 MB across 45 objects
   Avg Size: 576.2 KB | Confidence: 95%
   Examples: @12345 [1.2 MB] | @67890 [890 KB] | @54321 [756 KB]

💾 TOP SHAPES BY MEMORY CONSUMPTION:
1. 🔥 DataBuffer (object, LARGE)
   Total: 25.3 MB | Objects: 45
   Avg: 576.2 KB | Impact: CRITICAL

🛠️ SHAPE OPTIMIZATION RECOMMENDATIONS:
• 🚨 Focus on critical shapes first - implement size limits or object pooling
• 📦 Large object instances detected - implement lazy loading or data streaming  
• 🔍 Use Object Content Analyzer to inspect specific instances of top shapes
```

## Implementation Notes

- **Simplified Shape Analysis**: Uses object name, type, and size category (edge traversal not available)
- **Memory-Efficient**: Groups objects by shape patterns to reduce analysis overhead
- **Confidence-Based**: Higher confidence for shapes with many instances and large memory impact
- **Integration-Ready**: Works with existing heap node data structure
- **Professional Output**: Clear categorization and actionable recommendations

## Recommendations by Shape Type

### Critical Shapes (>10MB)
- Implement object pooling or factory patterns
- Add size limits and validation
- Consider lazy loading or streaming for large data
- Break large objects into smaller, more manageable pieces

### High-Count Shapes (>100 instances)  
- Implement object pooling
- Use flyweight pattern for shared data
- Consider deduplication strategies
- Add instance limits and cleanup logic

### String Shapes
- Implement string interning
- Use string builders for concatenation
- Consider string compression for large text
- Implement string caching strategies

This analyzer provides **shape-level memory optimization insights** that complement the other 8 MemLab analyzers for comprehensive JavaScript memory analysis!