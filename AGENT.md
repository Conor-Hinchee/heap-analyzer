# 🤖 Heap Analyzer Agent Mode - Complete Guide

**Fast, automated heap snapshot analysis with zero configuration.**

> **🚀 Enhanced Features Available**: This version includes advanced **event listener leak detection**, **closure paradox analysis**, and **enhanced comparison mode**. Both `npx heap-analyzer` and `node bin/cli.js` commands provide access to all latest features.

> **🔧 Real-Time Debugging**: Need to debug leaks as they happen? See [DEBUGGING_SNIPPETS.md](./DEBUGGING_SNIPPETS.md) for browser console scripts to intercept setInterval, addEventListener, Observers, and more!

## 🎯 Quick Decision Tree - Choose Your Analysis Mode

### For Users and AI Agents

```
📸 Do you have heap snapshots?
├─ 🚫 NO  → Use Installation Guide below
└─ ✅ YES → What type of analysis?
    ├─ 🔍 Quick Overview/Triage → Use Agent Mode (Step 1)
    ├─ 📊 Detailed Investigation → Use Enhanced Compare (Step 2)
    └─ 🔬 Pinpoint Exact Leak Type → Use Deep Dive Scripts (Step 3)
```

**Decision Logic:**

1. **Start with Agent Mode** for fast leak detection and severity assessment
2. **Escalate to Enhanced Compare** if agent mode shows HIGH/CRITICAL issues
3. **Run Deep Dive Scripts** to pinpoint exact leak sources (timers, observers, closures)
4. **Use Watch Mode** during development for continuous monitoring

## 🚀 Step 1: Quick Analysis (Agent Mode)

### Analyze Default Snapshot

```bash
# Modern NPX approach (recommended)
npx heap-analyzer --agent

# Alternative direct approach
node bin/cli.js --agent
```

_**Smart Auto-Detection**: Analyzes `./snapshots/after.heapsnapshot` for single snapshot analysis, or **automatically runs before/after comparison** when both `before.heapsnapshot` and `after.heapsnapshot` exist in the snapshots directory_

### Analyze Specific File

```bash
# Modern NPX approach
npx heap-analyzer --agent path/to/your-snapshot.heapsnapshot

# Alternative direct approach
node bin/cli.js --agent path/to/your-snapshot.heapsnapshot
```

### Continuous Monitoring

```bash
# Modern NPX approach
npx heap-analyzer --watch ./snapshots

# Alternative direct approach
node bin/cli.js --watch ./snapshots
```

_Auto-analyzes new `.heapsnapshot` files as they're created_

## 🔬 Step 2: Enhanced Comparison (When You Need Deep Analysis)

### When to Use Enhanced Compare

Use enhanced comparison when agent mode indicates:

- **🔴 HIGH or CRITICAL** severity levels
- **Large memory growth** (>10MB increases)
- **Suspicious object counts** (>50,000 new objects)
- **Need detailed leak attribution** and root cause analysis

### Enhanced Compare Commands

```bash
# Compare two specific snapshots
npx heap-analyzer compare before.heapsnapshot after.heapsnapshot

# Compare with custom output location
npx heap-analyzer compare --before snapshots/initial.heapsnapshot --after snapshots/final.heapsnapshot --output my-analysis.json

# Verbose output for debugging
npx heap-analyzer compare snapshots/before.heapsnapshot snapshots/after.heapsnapshot --verbose
```

### What Enhanced Compare Provides

- **🎯 Precise Leak Attribution**: 95%+ confidence scoring with visual indicators
- **📊 Memory Growth Metrics**: Exact size differences and percentage changes
- **🔍 Object-Level Analysis**: Detailed breakdown of new/grown objects
- **⚡ Performance Insights**: JavaScript execution pattern changes
- **💾 Data Structure Analysis**: Base64, collection growth, and retention patterns
- **📈 Top Memory Consumers**: Ranked list of largest memory impacts
- **📋 Actionable Recommendations**: Specific fix strategies with priority ordering

## � Step 3: Deep Dive Analysis (Pinpoint Exact Leak Sources)

### When to Use Deep Dive

Use these advanced scripts when you need to identify **exactly what type of leak** is occurring:

- Agent mode shows **CRITICAL** but you need specifics
- Multiple leak types suspected (timers vs observers vs closures)
- Idle page growth - need to know if it's intervals, timeouts, or observers
- Want actionable code search commands

### Quick Timer Analysis

```bash
# Identifies which timer type is leaking
node scripts/quick-timer-check.js
```

**What it reveals:**
- setInterval vs setTimeout vs requestAnimationFrame growth
- Promise and microtask accumulation
- WeakArrayList growth (often indicates listener leaks)
- Closure retention patterns

**Example Output:**
```
🔴 Timers              :    240 →    209 (-31, -12.9%)
🔴 Intervals           :    188 →    161 (-27, -14.4%)
🟢 Timeouts            :    729 →    722 (-7, -1.0%)
🔴 Observers           :   1105 →   1295 (+190, 17.2%)
   ⚠️  Significant growth detected!
```

### Observer Leak Analysis

```bash
# Pinpoints which observer type is accumulating
node scripts/observer-leak-check.js
```

**What it reveals:**
- PerformanceObserver vs ResizeObserver vs IntersectionObserver
- Exact instance counts and growth percentages
- Identifies primary leak source with confidence

**Example Output:**
```
🔴 PerformanceObserver      :   392 →   492 (+100, 25.5%)
   ⚠️  LEAK DETECTED: PerformanceObserver instances are accumulating!
🔴 ResizeObserver           :   181 →   195 (+14, 7.7%)
   ⚠️  LEAK DETECTED: ResizeObserver instances are accumulating!
🔴 IntersectionObserver     :   195 →   208 (+13, 6.7%)
   ⚠️  LEAK DETECTED: IntersectionObserver instances are accumulating!

📋 Action Items:
   1. Grep your code: grep -r "PerformanceObserver" .
   2. Check for missing cleanup: Look for observers created without corresponding .disconnect() calls
   3. React pattern: Ensure all observers are in useEffect with cleanup returns
   4. Class components: Ensure componentWillUnmount disconnects observers
   
The PerformanceObserver creating 100 new instances while idle is your smoking gun! 🔫
```

### When to Use Which Script

| Symptom | Script to Run | What You'll Learn |
|---------|--------------|-------------------|
| Memory growing while idle | `quick-timer-check.js` | Is it timers, promises, or observers? |
| High timer count in agent report | `quick-timer-check.js` | Which timer type is leaking? |
| Observer mentioned in insights | `observer-leak-check.js` | Which specific observer is the culprit? |
| Want actionable grep commands | `observer-leak-check.js` | Exact code patterns to search for |

### The Complete Analysis Workflow

```bash
# 1. Quick triage - get severity
npx heap-analyzer --agent

# 2. If HIGH/CRITICAL - get detailed breakdown
npx heap-analyzer compare snapshots/before.heapsnapshot snapshots/after.heapsnapshot

# 3. Pinpoint exact leak source - get actionable commands
node scripts/quick-timer-check.js
node scripts/observer-leak-check.js

# 4. Search your codebase with provided grep commands
grep -r "PerformanceObserver" src/
grep -r "ResizeObserver" src/

# 5. Verify fixes - take new snapshots and repeat
```

### Real-World Example: Idle Page Leak

**Problem:** Page leaking memory while just sitting idle

**Step 1 - Agent Mode:**
```
🔥 Leak Severity: CRITICAL
• Timers: 91 → 106 (+15)
• Closures: 1,608 → 1,636 (+28)
• Global objects: 33 → 63 (+30)
```

**Step 2 - Enhanced Compare:**
```
🔴 LEAK CONFIDENCE: HIGH
Memory: 125 MB → 133.8 MB (+8.8 MB | 7.0%)
```

**Step 3 - Deep Dive:**
```bash
node scripts/observer-leak-check.js
```
```
🔴 PerformanceObserver: +100 instances (+25.5%)
   ⚠️  LEAK DETECTED: PerformanceObserver instances are accumulating!
```

**Step 4 - Action:**
```bash
grep -r "PerformanceObserver" src/
# Found: Creating observer on every performance check without disconnect()
```

**Step 5 - Fix:**
```javascript
// Before (LEAK):
function checkPerformance() {
  const observer = new PerformanceObserver(callback);
  observer.observe({ entryTypes: ['measure'] });
  // Missing disconnect!
}

// After (FIXED):
useEffect(() => {
  const observer = new PerformanceObserver(callback);
  observer.observe({ entryTypes: ['measure'] });
  return () => observer.disconnect(); // Cleanup!
}, []);
```

## �📊 What You Get

### Step 1: Agent Mode - Quick Triage Results

- **🔴 Severity Assessment**: LOW, MEDIUM, HIGH, or CRITICAL
- **🧠 Smart Leak Detection**: AI-powered confidence scoring
- **🎯 Framework Detection**: React, Vue, Angular, Next.js recognition
- **💡 Escalation Guidance**: Clear indicators when enhanced analysis is needed

### Step 2: Enhanced Compare - Deep Investigation Results

- **🎯 Precise Leak Attribution**: 95%+ confidence with visual progress bars
- **📊 Detailed Memory Metrics**: Exact growth percentages and object counts
- **🔍 Object-Level Breakdown**: Top memory consumers with size rankings
- **⚡ Performance Analysis**: JavaScript execution pattern changes
- **📋 Prioritized Recommendations**: Actionable fixes ordered by impact

## 🔄 Complete Workflow Guide

### For Users

```bash
# 1. Install the tool
npm install -g heap-analyzer

# 2. Take heap snapshots (before/after your suspected leak)
# - Use Chrome DevTools Memory tab
# - Save as before.heapsnapshot and after.heapsnapshot in ./snapshots/

# 3. Quick triage with agent mode
npx heap-analyzer --agent
# ↓ Results show severity level

# 4a. If LOW/MEDIUM severity: You're good! Monitor occasionally
# 4b. If HIGH/CRITICAL severity: Run enhanced comparison
npx heap-analyzer compare snapshots/before.heapsnapshot snapshots/after.heapsnapshot

# 5. Pinpoint exact leak type (when needed)
node scripts/quick-timer-check.js      # Check timer/interval/RAF leaks
node scripts/observer-leak-check.js    # Check observer leaks

# 6. Follow the actionable grep commands from the output
# Example: grep -r "PerformanceObserver" src/

# 7. Fix the code and verify with new snapshots
```

### For AI Agents

```bash
# Assessment Protocol:
# 1. Run agent mode for initial triage
npx heap-analyzer --agent

# 2. Parse severity output and decision branch:
if severity in ["HIGH", "CRITICAL"] or memory_growth > 10MB:
    # Escalate to enhanced comparison
    npx heap-analyzer compare snapshots/before.heapsnapshot snapshots/after.heapsnapshot
    
    # 3. Pinpoint exact leak type with deep dive
    node scripts/quick-timer-check.js
    
    # If observers are mentioned:
    node scripts/observer-leak-check.js
    
    # 4. Extract and provide actionable grep commands from output
    # Parse the "Action Items" section and provide to user
    
else:
    # Provide user with agent mode results and monitoring guidance
    # Set up watch mode if in development environment
```

### Decision Matrix

| Agent Mode Result | Memory Growth | Recommended Action                            |
| ----------------- | ------------- | --------------------------------------------- |
| 🟢 LOW            | <5MB          | ✅ Monitor occasionally                       |
| 🟡 MEDIUM         | 5-10MB        | ⚠️ Watch closely, consider enhanced analysis  |
| 🔴 HIGH           | >10MB         | 🚨 **Run enhanced comparison immediately**    |
| 🔴 CRITICAL       | >20MB         | 🚨 **Run enhanced comparison + urgent fixes** |

### Snapshot-Only Analysis Excellence

The heap analyzer detects memory leaks using **only snapshot data**, without requiring:

- **Component source code access** - Works with any application
- **Global variable names** - Identifies patterns through heap structure
- **Specific collection types** - Detects leaks regardless of implementation
- **Exact growth mechanisms** - Finds issues through memory pattern analysis

This snapshot-isolated methodology ensures accurate leak detection across any JavaScript application, making it perfect for analyzing external applications, production systems, or third-party code.

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

### What Dual Analysis Reveals

- **Memory Growth**: Exact size differences between snapshots
- **New Objects**: Objects that appeared between snapshots
- **Grown Objects**: Existing objects that increased in size
- **Leak Patterns**: Timer, event listener, and DOM retention issues
- **Root Cause Analysis**: Specific objects and references causing growth

## 🔍 Advanced Features

### Automatic Analysis Mode Detection (Agent Mode)

The agent automatically determines the best analysis approach:

**When only `after.heapsnapshot` exists:**

- Runs single snapshot analysis with comprehensive leak detection
- Provides detailed object categorization and memory insights

**When both `before.heapsnapshot` and `after.heapsnapshot` exist:**

- **Always** runs before/after comparison analysis
- Focuses on memory growth, object count changes, and leak progression
- Shows exact growth metrics and change percentages

**When analyzing a specific file:**

```bash
npx heap-analyzer --agent custom-snapshot.heapsnapshot
```

- Runs single snapshot analysis regardless of other files present
- Bypasses automatic before/after detection

### Enhanced Comparison Features

**Precise Leak Detection:**

- Collection growth pattern analysis (Arrays, Maps, Sets, Objects)
- Data URL and Base64 accumulation detection
- React component lifecycle leak identification
- Event listener and timer retention analysis
- Closure paradox and memory retention tracking

**Advanced Reporting:**

- Confidence scoring with visual progress indicators
- Object-level memory consumption ranking
- Framework-specific optimization recommendations
- Performance impact assessment and prioritization

### JSON Reports for CI/CD

```bash
# Agent mode reports
npx heap-analyzer --agent
# Creates: ./reports/heap-analysis-TIMESTAMP.json

# Enhanced comparison reports
npx heap-analyzer compare before.heapsnapshot after.heapsnapshot
# Creates: ./reports/enhanced-comparison-TIMESTAMP.json
```

### Watch Mode for Development

```bash
# Monitor directory for new snapshots
npx heap-analyzer --watch ./my-snapshots

# Default monitoring (./snapshots)
npx heap-analyzer --watch
```

## 📁 Installation & Setup Guide

### Package Installation

```bash
# Global installation (recommended for CLI usage)
npm install -g heap-analyzer

# Local installation (for project-specific analysis)
npm install heap-analyzer

# Direct usage without installation
npx heap-analyzer --help
```

### Heap Snapshot Creation

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

### React Component Lifecycle Leaks

```
⚛️ React component lifecycle leak detected
• Add useEffect cleanup: return () => clearInterval(timer)
• Clear component arrays on unmount
• Properly unmount lazy-loaded components
• Remove component refs in cleanup functions
```

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

    # Analyze with heap-analyzer (using direct CLI for latest features)
    node bin/cli.js --agent ./heap-snapshot.heapsnapshot

    # Process JSON report
    cat ./reports/heap-analysis-*.json | jq '.severity'
```

### Build Script Integration

```json
{
  "scripts": {
    "memory:check": "node bin/cli.js --agent",
    "memory:watch": "node bin/cli.js --watch",
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

### React Component Lifecycle Leaks

```javascript
// ❌ BAD: useEffect without cleanup
useEffect(() => {
  const timer = setInterval(() => updateState(), 1000);
  // Missing cleanup - timer keeps running after unmount!
}, []);

// ✅ GOOD: Proper useEffect cleanup
useEffect(() => {
  const timer = setInterval(() => updateState(), 1000);
  return () => clearInterval(timer); // Cleanup on unmount
}, []);

// ❌ BAD: Component array accumulation
const [components, setComponents] = useState([]);
useEffect(() => {
  const newComponent = createComponent();
  setComponents((prev) => [...prev, newComponent]); // Grows forever
}, []);

// ✅ GOOD: Clear arrays on unmount
useEffect(() => {
  return () => {
    setComponents([]); // Clear array on unmount
    // Also clear any global registries
    if (window.componentRegistry) {
      window.componentRegistry = [];
    }
  };
}, []);
```

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
# Basic analysis (with latest enhanced detection)
node bin/cli.js --agent

# Specific file
node bin/cli.js --agent app.heapsnapshot

# Watch mode
node bin/cli.js --watch

# Help
node bin/cli.js --help

# Interactive mode
node bin/cli.js

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
node --max-old-space-size=8192 bin/cli.js --agent
```

## 🧪 Testing Methodology & Snapshot Isolation

### Important Testing Guidelines

When analyzing memory leaks with heap snapshots, **always assume the snapshots are from external applications** and rely solely on the snapshot data itself. This methodology is critical for accurate analysis:

#### Snapshot-Only Analysis Principle

- **✅ DO**: Extract all leak detection signals from the snapshot data itself
- **✅ DO**: Use heap snapshot metadata, object counts, and retention patterns
- **✅ DO**: Analyze detached DOM nodes, timer references, and closure patterns within the snapshot
- **❌ AVOID**: Making assumptions about the current application state
- **❌ AVOID**: Using external signals that might taint test results

#### Why This Matters

```bash
# External signals that can taint results:
- Current application code structure
- Assumed component lifecycle patterns
- Framework-specific implementation details
- Local environment variables or configurations
```

#### Proper Testing Approach

1. **Treat snapshots as black boxes**: Analyze only what's captured in the heap data
2. **Focus on snapshot differentials**: Compare object growth, memory patterns, and retention paths
3. **Use intrinsic signals**: DOM node counts, timer references, closure captures found in the snapshot
4. **Validate through pattern recognition**: Identify leak patterns through heap data analysis, not external assumptions

#### Example: Correct vs Incorrect Analysis

**✅ Correct - Snapshot-Based Detection:**

```
🔍 Found 2,296 detached DOM nodes in snapshot
📊 Timer references increased from 42 → 45
🔗 Closure retention patterns show unbounded array growth
```

**❌ Incorrect - External Assumption-Based:**

```
❌ "This React app probably has useEffect cleanup issues"
❌ "The component structure suggests timer leaks"
❌ "Based on the file structure, this looks like..."
```

### Testing Validation

When testing the heap analyzer itself, ensure your test cases:

- Generate snapshots from isolated test scenarios
- Verify leak detection works purely from snapshot data
- Don't rely on knowledge of the source application structure
- Test edge cases using synthetic heap snapshot data

---

**💡 Pro Tip**: Use agent mode in your development workflow by taking snapshots before/after major features to catch leaks early!
