# 🤖 Heap Analyzer Agent Mode - Quick Start

**Fast, automated heap snapshot analysis with zero configuration.**

## 🚀 Quick Analysis

### Analyze Default Snapshot

```bash
npx heap-analyzer --agent
```

_Analyzes `./snapshots/after.heapsnapshot` automatically, or compares before/after snapshots if both exist_

### Analyze Specific File

```bash
npx heap-analyzer --agent path/to/your-snapshot.heapsnapshot
```

### Continuous Monitoring

```bash
npx heap-analyzer --watch ./snapshots
```

_Auto-analyzes new `.heapsnapshot` files as they're created_

## 📊 What You Get

### Instant Analysis Report

- **🔴 Severity Assessment**: LOW, MEDIUM, HIGH, or CRITICAL
- **🧠 Smart Leak Detection**: AI-powered confidence scoring
- **🎯 Framework Detection**: React, Vue, Angular, Next.js recognition
- **💡 Actionable Fixes**: Specific debugging steps and code changes

### Example Analysis Results

When you run the agent, you get immediate insights like:

- **🟠 Severity: HIGH** - Clear risk assessment
- **Timer Activity**: 45 timer references detected (potential uncleared intervals)
- **Event Listeners**: 1202 references (possible unremoved listeners)
- **Memory Growth**: Before: 9.88MB → After: 11.66MB (1.78MB increase)
- **Object Count**: Before: 127,700 → After: 145,068 objects (+17,368 new objects)

The tool automatically detects:

- Memory leaks and their confidence levels
- Framework usage (React, Vue, Angular, etc.)
- Specific memory hotspots and their categories
- Actionable recommendations for fixes

## � Before/After Comparison Analysis

### Dual Snapshot Detection

When you have both `before.heapsnapshot` and `after.heapsnapshot` in your snapshots directory:

```bash
npx heap-analyzer --agent
```

_Automatically detects and compares both snapshots for memory growth analysis_

### Interactive Comparison Mode

For detailed before/after analysis with guided workflow:

```bash
npx heap-analyzer
```

_Choose option [1] to analyze memory leaks with step-by-step comparison_

### What Dual Analysis Reveals

- **Memory Growth**: Exact size differences between snapshots
- **New Objects**: Objects that appeared between snapshots
- **Grown Objects**: Existing objects that increased in size
- **Leak Patterns**: Timer, event listener, and DOM retention issues
- **Root Cause Analysis**: Specific objects and references causing growth

## �🔍 Advanced Features

### JSON Reports for CI/CD

```bash
npx heap-analyzer --agent
# Creates: ./reports/heap-analysis-TIMESTAMP.json
```

### Watch Mode for Development

```bash
# Monitor directory for new snapshots
npx heap-analyzer --watch ./my-snapshots

# Default monitoring (./snapshots)
npx heap-analyzer --watch
```

## 📁 Heap Snapshot Creation

### Recommended File Naming

For single snapshot analysis:

- `after.heapsnapshot` - Default file the agent looks for
- `my-app.heapsnapshot` - Any descriptive name ending in `.heapsnapshot`

For before/after comparison:

- `before.heapsnapshot` - Initial state snapshot
- `after.heapsnapshot` - Post-action state snapshot

_Place both files in `./snapshots/` directory for automatic detection_

### Chrome DevTools Method

1. Open DevTools (`F12`)
2. Go to **Memory** tab
3. Select **"Heap snapshot"**
4. Click **"Take snapshot"**
5. Save as `.heapsnapshot` file with appropriate name

### Programmatic Creation (Node.js)

```javascript
const v8 = require("v8");
const fs = require("fs");

// Take snapshot
const snapshot = v8.writeHeapSnapshot("./my-app.heapsnapshot");
console.log("Snapshot saved:", snapshot);
```

### Browser Automation

```javascript
// Puppeteer example
const client = await page.target().createCDPSession();
await client.send("HeapProfiler.takeHeapSnapshot");
```

## 🎯 Leak Detection Categories

### Timer/Interval Leaks

```
🚨 Timer/Interval leak detected (1.2MB)
• Clear intervals with clearInterval() in cleanup
• Clear timeouts with clearTimeout() when unmounting
• Use useEffect cleanup or componentWillUnmount
```

### Event Listener Leaks

```
🚨 Event listener accumulation detected
• Remove listeners before DOM removal
• Use addEventListener with { once: true }
• Implement cleanup in component lifecycle
```

### Closure/Memory Capture

```
🚨 Large closure in global scope (800KB)
• Avoid capturing large objects in timer callbacks
• Use refs for mutable data instead of closure capture
• Implement WeakRef for large data references
```

### DOM Element Retention

```
🚨 Detached DOM element (2.1MB)
• Remove event listeners before DOM removal
• Clear component state references to elements
• Use WeakRef for DOM references in JavaScript
```

## 📈 CI/CD Integration

### GitHub Actions

```yaml
- name: Memory Leak Analysis
  run: |
    # Generate heap snapshot in your app
    npm run test:memory-snapshot

    # Analyze with heap-analyzer
    npx heap-analyzer --agent ./heap-snapshot.heapsnapshot

    # Process JSON report
    cat ./reports/heap-analysis-*.json | jq '.severity'
```

### Build Script Integration

```json
{
  "scripts": {
    "memory:check": "npx heap-analyzer --agent",
    "memory:watch": "npx heap-analyzer --watch",
    "memory:clean": "npm run clear-reports"
  }
}
```

## 🔧 Configuration Options

### Environment Variables

```bash
# Custom snapshot directory
export HEAP_SNAPSHOTS_DIR="./custom-snapshots"

# Custom reports directory
export HEAP_REPORTS_DIR="./custom-reports"

# Analysis sensitivity (low, medium, high)
export HEAP_ANALYSIS_SENSITIVITY="high"
```

### Package.json Integration

```json
{
  "heap-analyzer": {
    "defaultSnapshot": "./snapshots/production.heapsnapshot",
    "watchDirectory": "./memory-profiles",
    "reportFormat": "json"
  }
}
```

## 🚨 Common Leak Patterns & Fixes

### React Component Leaks

```javascript
// ❌ BAD: Timer not cleared
useEffect(() => {
  const timer = setInterval(() => updateState(), 1000);
  // Missing cleanup!
}, []);

// ✅ GOOD: Proper cleanup
useEffect(() => {
  const timer = setInterval(() => updateState(), 1000);
  return () => clearInterval(timer); // Cleanup
}, []);
```

### Event Listener Leaks

```javascript
// ❌ BAD: Listener not removed
componentDidMount() {
  window.addEventListener('resize', this.handleResize);
}

// ✅ GOOD: Proper cleanup
componentDidMount() {
  window.addEventListener('resize', this.handleResize);
}
componentWillUnmount() {
  window.removeEventListener('resize', this.handleResize);
}
```

### Closure Variable Capture

```javascript
// ❌ BAD: Capturing large data
function createTimer(largeDataArray) {
  return setInterval(() => {
    console.log(largeDataArray.length); // Keeps entire array in memory
  }, 1000);
}

// ✅ GOOD: Extract only needed data
function createTimer(largeDataArray) {
  const arrayLength = largeDataArray.length; // Extract only what's needed
  return setInterval(() => {
    console.log(arrayLength);
  }, 1000);
}
```

## 📊 Report Analysis

### Understanding Confidence Scores

- **90-100%**: Almost certain leak - fix immediately
- **70-89%**: Probable leak - investigate and likely fix
- **50-69%**: Possible leak - monitor and investigate
- **<50%**: Low confidence - likely normal usage

### Memory Size Thresholds

- **>5MB objects**: Investigate immediately
- **1-5MB objects**: Monitor for growth
- **100KB-1MB**: Normal range, check for accumulation patterns
- **<100KB**: Usually not concerning unless many similar objects

### Framework-Specific Patterns

- **React**: Look for Fiber nodes, uncleared useEffect timers
- **Vue**: Check for component instance retention, reactive data leaks
- **Angular**: Monitor for service subscriptions, zone.js timer issues
- **Generic**: Focus on DOM references, event listeners, closures

## 🔗 Quick Commands Reference

```bash
# Basic analysis
npx heap-analyzer --agent

# Specific file
npx heap-analyzer --agent app.heapsnapshot

# Watch mode
npx heap-analyzer --watch

# Help
npx heap-analyzer --help

# Interactive mode
npx heap-analyzer

# Clear old reports
npm run clear-reports
```

## 🆘 Troubleshooting

### No Snapshot Found

```bash
# Create snapshots directory
mkdir -p ./snapshots

# Check current directory
ls -la ./snapshots/
```

### Large Snapshot Files

```bash
# Check file size
ls -lh *.heapsnapshot

# Use compression for CI
gzip large-snapshot.heapsnapshot
```

### Analysis Timeout

```bash
# Reduce snapshot size or increase Node.js memory
node --max-old-space-size=8192 ./node_modules/.bin/heap-analyzer --agent
```

---

**💡 Pro Tip**: Use agent mode in your development workflow by taking snapshots before/after major features to catch leaks early!
