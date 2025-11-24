# heap-analyzer

A CLI and agent tool for analyzing JavaScript heap snapshots from Google DevTools. Helps developers trace memory issues, browser crashes, and provides actionable insights for fixing leaks in JavaScript apps.

## Features

- 🖥️ **Interactive CLI** for guided manual analysis
- 🤖 **Agent Mode** for automated analysis and reporting
- � **Enhanced Compare Mode** for detailed before/after analysis
- �📊 **Continuous Monitoring** with watch mode
- 🔍 **Memory leak detection** with categorized insights
- 💡 **Actionable recommendations** for optimization
- 📁 **JSON reports** for CI/CD integration
- 📝 **Markdown reports** for documentation and sharing
- 🎯 **Smart categorization** of memory consumers

## Getting Started

Install as a dev dependency:

```sh
npm install --save-dev heap-analyzer
```

**🚀 Quick Start**: For immediate heap analysis, see [AGENT.md](./AGENT.md) - zero-config automated analysis guide.

**🔧 Real-Time Debugging**: For browser console debugging snippets, see [DEBUGGING_SNIPPETS.md](./DEBUGGING_SNIPPETS.md) - intercept and track leaks as they happen.

## Usage

heap-analyzer is a complete **memlab wrapper** that provides all memlab functionality with better developer experience and easier file management.

### Core Analysis Commands

#### Memory Leak Detection
```sh
# Basic leak detection (2-3 snapshots)
npx heap-analyzer find-leaks --baseline before.heapsnapshot --target after.heapsnapshot
npx heap-analyzer find-leaks --baseline baseline.heapsnapshot --target target.heapsnapshot --final final.heapsnapshot

# Auto-detect snapshots in directory
npx heap-analyzer find-leaks --snapshot-dir ./snapshots/
```

#### Growth Analysis (Our Enhancement)
```sh
# Compare memory growth between snapshots
npx heap-analyzer compare before.heapsnapshot after.heapsnapshot

# Single snapshot analysis
npx heap-analyzer analyze snapshot.heapsnapshot
```

#### Interactive Heap Exploration
```sh
# Interactive heap exploration (memlab wrapper)
npx heap-analyzer heap snapshot.heapsnapshot

# Heap visualization (memlab wrapper)
npx heap-analyzer view-heap snapshot.heapsnapshot
npx heap-analyzer view-heap snapshot.heapsnapshot --node-id 12345
```

#### Retainer Trace Analysis
```sh
# Analyze why specific objects are retained (memlab wrapper)
npx heap-analyzer trace snapshot.heapsnapshot --node-id 12345
```

#### Node.js Server Analysis
```sh
# Take heap snapshot from running Node.js process
npx heap-analyzer node-snapshot --endpoint http://localhost:3000/debug/heap-snapshot
npx heap-analyzer node-snapshot --pid 12345

# Monitor Node.js process memory and auto-snapshot on high usage
npx heap-analyzer node-monitor --pid 12345 --threshold 500 --interval 5

# Load test with automatic heap snapshot collection
npx heap-analyzer node-load-test http://localhost:3000/api/heavy \
  --endpoint http://localhost:3000/debug/heap-snapshot \
  --concurrency 50 --duration 60
```

#### Analysis Plugins
```sh
# Run memlab analysis plugins (memlab wrapper)
npx heap-analyzer analyze-plugin string-analysis
npx heap-analyzer analyze-plugin <plugin-name>
```

#### File Management
```sh
# List available snapshots
npx heap-analyzer list
```

### Advanced Memlab Features (Direct Access)

All memlab commands work directly with better path resolution:

```sh
# Advanced leak detection with filtering
npx memlab find-leaks --baseline snapshots/sim-1.heapsnapshot --target snapshots/sim-2.heapsnapshot --trace-object-size-above 1000000

# Compare different leak sets
npx memlab diff-leaks --control-snapshot snapshots/before.heapsnapshot --treatment-snapshot snapshots/after.heapsnapshot

# ML-based clustering
npx memlab find-leaks --baseline snapshots/baseline.heapsnapshot --target snapshots/target.heapsnapshot --ml-clustering
```

### Command Reference

**Core Commands:**
- `find-leaks` - Run memlab leak detection (wrapper for memlab find-leaks)
- `compare <baseline> <target>` - Compare memory growth between snapshots  
- `analyze <file>` - Analyze single heap snapshot
- `trace <file> --node-id <id>` - Analyze retainer traces (wrapper for memlab trace)
- `heap <file>` - Interactive heap exploration (wrapper for memlab heap)
- `view-heap <file>` - Heap visualization (wrapper for memlab view-heap)
- `analyze-plugin <plugin>` - Run analysis plugins (wrapper for memlab analyze)
- `list` - List available snapshots

**Options:**
- `--baseline <file>` - Baseline snapshot (initial state)
- `--target <file>` - Target snapshot (after action) 
- `--final <file>` - Final snapshot (after cleanup) - optional
- `--snapshot-dir <dir>` - Directory containing snapshots
- `--node-id <id>` - Node ID for retainer trace analysis
- `--help, -h` - Show help information

**File Path Resolution:**
- Automatically finds files in `./snapshots/` directory
- Supports relative and absolute paths
- Smart error handling for missing files

## Complete Memlab Wrapper Features

**All Memlab Commands Available:**
- **find-leaks**: Sophisticated memory leak detection with retainer traces
- **trace**: Analyze specific object retention paths  
- **heap**: Interactive heap exploration and querying
- **view-heap**: Visual heap inspection with node focusing
- **analyze**: Plugin-based heap analysis
- **diff-leaks**: Compare leak sets between different snapshots

**Enhanced Developer Experience:**
- **Smart Path Resolution**: Automatically finds files in `./snapshots/` directory
- **Better Error Messages**: Clear guidance when files are missing or invalid
- **Consistent Interface**: All memlab commands follow the same pattern
- **File Validation**: Checks file existence before running expensive operations
- **Progress Indication**: Shows what's happening before delegating to memlab

**Growth Analysis (Our Addition):**
- **Memory Growth Tracking**: Detailed size and object count comparisons
- **Object Type Breakdown**: See which types (Arrays, Objects, Strings) grew most
- **Growth Pattern Detection**: Identify data accumulation vs object creation patterns
- **Actionable Insights**: Specific recommendations based on growth patterns

### Snapshot-Only Analysis Capability

The heap analyzer detects memory leaks using **only snapshot data**, without requiring:

- Component source code access
- Global variable names or application structure
- Specific collection types or framework details
- Exact growth mechanisms or application logic

This snapshot-isolated approach ensures accurate leak detection across any JavaScript application, regardless of framework or implementation patterns.

## Examples

### Complete Workflow Examples

#### Basic Leak Detection
```sh
# 1. List available snapshots
npx heap-analyzer list

# 2. Run leak detection
npx heap-analyzer find-leaks --baseline before.heapsnapshot --target after.heapsnapshot

# 3. If leaks found, analyze specific objects
npx heap-analyzer trace after.heapsnapshot --node-id 12345
```

#### Growth Analysis Workflow  
```sh
# 1. Compare memory growth
npx heap-analyzer compare baseline.heapsnapshot target.heapsnapshot

# 2. Interactive exploration of larger snapshot
npx heap-analyzer heap target.heapsnapshot

# 3. Visual inspection
npx heap-analyzer view-heap target.heapsnapshot
```

#### Advanced Analysis
```sh
# 1. Run memlab's sophisticated leak detection
npx heap-analyzer find-leaks --baseline baseline.heapsnapshot --target target.heapsnapshot --final final.heapsnapshot

# 2. Compare different approaches to same feature
npx memlab diff-leaks --control-snapshot snapshots/approach-a.heapsnapshot --treatment-snapshot snapshots/approach-b.heapsnapshot

# 3. Run analysis plugins for specific insights
npx heap-analyzer analyze-plugin string-analysis
```

### Sample Output

**Growth Analysis Output:**
```
📊 Growth Analysis:
   Memory growth: 50.01 MB
   Growth percentage: 239.7%

🔍 Object Type Analysis:
   📈 array: +49.74 MB (+13,022 objects)
   📈 object: +0.20 MB (+13,076 objects)

💡 Growth Pattern Analysis:
   📊 High memory growth with low object count growth
   🎯 This suggests existing objects got larger (data accumulation)
   🔍 Check: Arrays growing, string concatenation, cache buildup
```

**Memlab Leak Detection Output:**
```
Alive objects allocated in target page:
┌─────────┬────────────────────────────┬─────────────┬───────┬──────────────┐
│ (index) │ name                       │ type        │ count │ retainedSize │
├─────────┼────────────────────────────┼─────────────┼───────┼──────────────┤
│ 0       │ 'Array'                    │ 'object'    │ 13020 │ '52.3MB'     │
│ 1       │ 'MouseEvent'               │ 'object'    │ 2     │ '2.2KB'      │
└─────────┴────────────────────────────┴─────────────┴───────┴──────────────┘

No leaks found - Memory growth is legitimate application behavior
```

## Development Tools

### Object Content Analyzer

For deep inspection of specific suspicious objects found in your analysis:

```sh
npm run inspect-object <snapshot-file> <node-id>
```

**When to use:**
- Investigate specific objects flagged in main analysis
- Understand object relationships and retention paths  
- Debug circular references and memory ownership
- Analyze large objects consuming significant memory

**Example workflow:**
```sh
# 1. Run main analysis to find suspects
npm run dev compare

# Output shows: "🔴 userCache (HIGH) - Node ID: 287534"

# 2. Deep dive into the suspicious object
npm run inspect-object snapshots/after.heapsnapshot 287534

# 3. Get detailed analysis with retainer chains, references, and fix recommendations
```

The Object Content Analyzer provides:
- **Detailed object properties** and memory breakdown
- **Reference mapping** (what objects it points to)
- **Referrer analysis** (what objects point to it)
- **Retainer chains** showing exactly what keeps objects alive
- **Circular reference detection** with cycle mapping
- **Actionable recommendations** for specific object types

📚 **Full documentation**: [docs/OBJECT_CONTENT_ANALYZER.md](./docs/OBJECT_CONTENT_ANALYZER.md)

## CI/CD Integration

Perfect for automated memory analysis in CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Memory Leak Detection
  run: |
    # Generate snapshots in your test suite
    npm run test:memory-snapshots
    
    # Run leak detection
    npx heap-analyzer find-leaks --baseline snapshots/baseline.heapsnapshot --target snapshots/after-test.heapsnapshot
    
    # Growth analysis for performance monitoring  
    npx heap-analyzer compare snapshots/baseline.heapsnapshot snapshots/after-test.heapsnapshot

# GitLab CI example
memory_analysis:
  script:
    - npx heap-analyzer find-leaks --snapshot-dir ./test-snapshots/
    - npx heap-analyzer analyze-plugin string-analysis
  artifacts:
    reports:
      # Save memlab output for later analysis
    expire_in: 1 week
```

### Automated Monitoring
```sh
# Set up automated snapshot comparison
npx heap-analyzer find-leaks --baseline production-baseline.heapsnapshot --target latest-build.heapsnapshot

# Check for memory regressions
npx heap-analyzer compare production-baseline.heapsnapshot feature-branch.heapsnapshot
```

## Interpreting Analysis Results

### Severity Levels

- **LOW**: Minor memory variations, typically within normal application behavior
- **MEDIUM**: Noticeable memory growth patterns that warrant investigation
- **HIGH**: Significant memory leaks detected with clear attribution
- **CRITICAL**: Large-scale memory growth requiring immediate attention

### Common Leak Patterns

**Data URL/Base64 Accumulation**: Canvas operations, image caching, file uploads
- Look for: `toDataURL()`, `FileReader`, growing arrays of base64 strings
- Fix: Implement cleanup cycles, use object URLs, clear caches

**Event Listener Leaks**: Missing cleanup in component lifecycle
- Look for: `addEventListener` without `removeEventListener`
- Fix: Add cleanup in unmount/destroy hooks

**Timer Leaks**: Uncleaned intervals and timeouts
- Look for: `setInterval`, `setTimeout` without corresponding clear calls
- Fix: Store timer IDs and clear them on cleanup

**Collection Growth**: Unbounded arrays, maps, or sets
- Look for: Global collections that only grow, never shrink
- Fix: Implement size limits, periodic cleanup, or LRU eviction

### Analysis Metrics

**Memory Growth**: Absolute and percentage increase between snapshots
**Object Count**: New objects created, useful for detecting object accumulation
**File Size Growth**: Raw snapshot size difference, indicates data structure bloat

## Heap Snapshot Creation

Create heap snapshots in Chrome DevTools:

1. Open DevTools (F12)
2. Go to Memory tab
3. Select "Heap snapshot"
4. Click "Take snapshot"
5. Save the `.heapsnapshot` file

## Complete Command Reference

### Core Wrapper Commands

| Command | Description | Memlab Equivalent |
|---------|-------------|-------------------|
| `find-leaks` | Memory leak detection | `memlab find-leaks` |
| `trace <file> --node-id <id>` | Retainer trace analysis | `memlab trace` |
| `heap <file>` | Interactive heap exploration | `memlab heap` |
| `view-heap <file>` | Heap visualization | `memlab view-heap` |
| `analyze-plugin <plugin>` | Run analysis plugins | `memlab analyze` |
| `compare <baseline> <target>` | Growth analysis | *(Our enhancement)* |
| `analyze <file>` | Single snapshot analysis | *(Our enhancement)* |
| `list` | List available snapshots | *(Our enhancement)* |

### Node.js Server Commands

| Command | Description | Use Case |
|---------|-------------|----------|
| `node-snapshot --endpoint <url>` | Take snapshot via HTTP | Production monitoring |
| `node-snapshot --pid <pid>` | Take snapshot via process signal | Development debugging |
| `node-monitor --pid <pid>` | Auto-monitor memory usage | Continuous monitoring |
| `node-load-test <url>` | Load test with snapshots | Performance testing |

### Advanced Memlab Commands (Direct Access)

```sh
# Advanced leak detection with filtering
npx memlab find-leaks --baseline snapshots/baseline.heapsnapshot --target snapshots/target.heapsnapshot --trace-object-size-above 1000000

# Compare leak sets between different implementations  
npx memlab diff-leaks --control-snapshot snapshots/old-version.heapsnapshot --treatment-snapshot snapshots/new-version.heapsnapshot

# Machine learning based leak clustering
npx memlab find-leaks --baseline snapshots/baseline.heapsnapshot --target snapshots/target.heapsnapshot --ml-clustering

# Trace specific patterns
npx memlab find-leaks --baseline snapshots/baseline.heapsnapshot --target snapshots/target.heapsnapshot --trace-contains "EventListener"

# Interactive heap exploration with specific node focus
npx memlab view-heap --snapshot snapshots/large-heap.heapsnapshot --node-id 12345
```

### File Path Resolution

All commands support smart path resolution:

```sh
# These are equivalent:
npx heap-analyzer find-leaks --baseline baseline.heapsnapshot --target target.heapsnapshot
npx heap-analyzer find-leaks --baseline ./snapshots/baseline.heapsnapshot --target ./snapshots/target.heapsnapshot
npx heap-analyzer find-leaks --baseline /absolute/path/to/baseline.heapsnapshot --target /absolute/path/to/target.heapsnapshot

# Directory mode automatically finds files:
npx heap-analyzer find-leaks --snapshot-dir ./snapshots/
```

### Common Use Cases

**Debugging Memory Leaks:**
1. `heap-analyzer find-leaks --baseline before.heapsnapshot --target after.heapsnapshot`
2. `heap-analyzer trace after.heapsnapshot --node-id <leaked-object-id>`
3. `heap-analyzer heap after.heapsnapshot` (for interactive exploration)

**Performance Analysis:**
1. `heap-analyzer compare baseline.heapsnapshot optimized.heapsnapshot`
2. `heap-analyzer analyze-plugin string-analysis`
3. `npx memlab diff-leaks --control-snapshot baseline.heapsnapshot --treatment-snapshot optimized.heapsnapshot`

**Development Workflow:**
1. `heap-analyzer list` (see available snapshots)
2. `heap-analyzer find-leaks --snapshot-dir ./snapshots/` (auto-detect and analyze)
3. `heap-analyzer view-heap latest.heapsnapshot` (visual inspection)

## License

MIT
