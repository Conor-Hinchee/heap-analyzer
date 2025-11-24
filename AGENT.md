# Memory Leak Analysis Agent Guide

This guide walks you through the complete process of analyzing memory leaks using the heap-analyzer tool - from collecting snapshots to identifying and fixing specific leaks.

## 🎯 Complete 4-Step Diagnostic Workflow

### Step 1: Collect Heap Snapshots

First, you need heap snapshots from your application. Place them in the `./snapshots/` directory:

```
snapshots/
├── baseline.heapsnapshot    # Initial state (before user interaction)
├── target.heapsnapshot      # After user interaction (potential leaks)
└── final.heapsnapshot       # After cleanup attempt (leaked objects)
```

**Snapshot Collection Tips:**
- **Baseline**: Take when your app is in a clean, initial state
- **Target**: Take after performing the action that might cause leaks
- **Final**: Take after attempting garbage collection or cleanup
- **Minimum**: You need at least 2 snapshots (can use target as final)

### Step 2: Analyze Individual Snapshots (Understanding)

Get a baseline understanding of each snapshot's composition:

```bash
# Analyze each snapshot to understand heap composition
heap-analyzer analyze baseline.heapsnapshot
heap-analyzer analyze target.heapsnapshot
heap-analyzer analyze final.heapsnapshot  # if available
```

**What This Tells You:**
- Total memory usage per snapshot
- Object type breakdown (arrays, objects, strings, etc.)
- Node counts and heap size
- Overall heap health

### Step 3: Compare Snapshots (Growth Pattern Analysis)

Understand what changed and identify growth patterns:

```bash
# Compare before/after to understand growth patterns
heap-analyzer compare baseline.heapsnapshot target.heapsnapshot
```

**What This Tells You:**
- Memory growth amount and percentage
- Object count changes
- Which object types grew the most
- **Smart pattern recognition**: Data accumulation vs object creation
- **Diagnostic hints**: Arrays growing, cache buildup, etc.

### Step 4: Find Memory Leaks (Get Node IDs)

Detect specific leaked objects with detailed node information:

```bash
# CRITICAL: Use --trace-all-objects to get node IDs for tracing
heap-analyzer find-leaks --baseline baseline.heapsnapshot --target target.heapsnapshot --final final.heapsnapshot --trace-all-objects

# Or with just 2 snapshots (using target as final)
heap-analyzer find-leaks --baseline sim-1.heapsnapshot --target sim-2.heapsnapshot --final sim-2.heapsnapshot --trace-all-objects
```

**What This Tells You:**
- Exact leaked objects with sizes
- Node IDs for precise tracing
- Number of similar leaks
- Retained memory per leak cluster

**Example Output:**
```
--Similar leaks in this run: 4950--
--Retained size of leaked objects: 18.1MB--
[Window / https://example.com] (native) @41759 [11.2KB]
  --memoryLeakArray (variable)--->  [Array] (object) @170921 [52.3MB]
                                                      ↑
                                              This is your node ID!

MemLab found 23 leak(s)
```

**⚠️ Important**: Without `--trace-all-objects`, you won't get node IDs and can't trace specific objects!

### Step 5: Trace Specific Leaks (Root Cause Analysis)

For each significant leak (prioritize by size), trace the retention path using the node IDs from Step 4:

```bash
# Trace the biggest leak first (52.3MB Array)
heap-analyzer trace final.heapsnapshot --node-id 170921

# Trace other concerning leaks 
heap-analyzer trace final.heapsnapshot --node-id 628662
heap-analyzer trace final.heapsnapshot --node-id 628670
```

**What This Tells You:**
- **Exact variable names** causing retention (`memoryLeakArray`)
- **Retention chain** from global scope to leaked object
- **Root cause location** in your code
- **Fix strategy** (clear variables, remove listeners, etc.)

**⚠️ Critical Workflow**: You MUST run find-leaks with `--trace-all-objects` first to get the node IDs, then run trace commands for each object you want to investigate.

**Example Trace Output:**
```
Retainer trace for node 170921:
Window → NativeContext → ScriptContextTable → <function scope> → memoryLeakArray (variable) → ContextCell → Array (52.3MB)
                                                                    ↑
                                                            This is your leak source!
```

### Step 4: Interpret Results & Fix

**Understanding the Trace:**
- **Window** → Global scope (browser environment)
- **memoryLeakArray** → Your variable name causing the leak
- **Array (52.3MB)** → The leaked object and its size

**Action Items:**
1. **Identify the variable**: Look for `memoryLeakArray` in your code
2. **Find the retention**: Check why it's not being cleaned up
3. **Fix the leak**: Clear references, remove event listeners, etc.
4. **Verify**: Take new snapshots and re-run analysis

## 🎯 Prioritization Strategy

### Focus Order:
1. **Large objects first** (MB range) - biggest impact
2. **Growing collections** (Arrays, Maps, Sets) - potential unbounded growth  
3. **DOM-related leaks** (Timers, Event Listeners) - common patterns
4. **Small objects** (bytes) - usually low priority unless numerous

### Red Flags to Look For:
- **Variables in global scope** retaining large objects
- **Event listeners** not being removed
- **Timers** (setTimeout/setInterval) not being cleared
- **Circular references** preventing garbage collection

## 🔧 Advanced Analysis Commands

### Compare Snapshots Directly
```bash
# Get detailed comparison between snapshots
heap-analyzer compare baseline.heapsnapshot target.heapsnapshot
```

### Analyze Object Growth
```bash
# See which object types are growing
heap-analyzer analyze final.heapsnapshot
```

### View Heap Structure
```bash
# Get overall heap statistics
heap-analyzer heap final.heapsnapshot
```

## 📊 Interpreting Results

### Leak Severity Guide:
- **Critical (MB range)**: Fix immediately - major memory impact
- **High (100KB+)**: Fix soon - could accumulate over time  
- **Medium (10KB+)**: Monitor - might indicate pattern issues
- **Low (bytes)**: Fix if numerous - usually not urgent

### Common Leak Patterns:
- **Global variables** holding references to large objects
- **Event listeners** attached but never removed
- **Timers** created but never cleared
- **Closures** capturing large scopes unnecessarily
- **DOM nodes** detached but still referenced

## 🚀 Automation & CI Integration

### Batch Analysis Script:
```bash
#!/bin/bash
# analyze-leaks.sh

echo "🔍 Running memory leak analysis..."
heap-analyzer find-leaks --trace-all-objects > leak-report.txt

# Extract node IDs and trace them
grep "Node ID:" leak-report.txt | while read -r line; do
    node_id=$(echo $line | grep -o '[0-9]\+')
    echo "Tracing node $node_id..."
    heap-analyzer trace final.heapsnapshot --node-id $node_id >> trace-results.txt
done

echo "✅ Analysis complete! Check leak-report.txt and trace-results.txt"
```

### CI Pipeline Integration:
```yaml
# .github/workflows/memory-analysis.yml
- name: Analyze Memory Leaks
  run: |
    npm run test:memory  # Generate snapshots
    heap-analyzer find-leaks --trace-all-objects
    # Fail build if leaks > threshold
```

## 🚨 Critical Workflow Notes

### **Two-Step Process Required**
1. **Step 1**: `heap-analyzer find-leaks --trace-all-objects` → Gets node IDs
2. **Step 2**: `heap-analyzer trace snapshot.heapsnapshot --node-id XXXXX` → Gets retention paths

### **Common Mistakes to Avoid**
- ❌ **Forgetting `--trace-all-objects`** → No node IDs, can't trace objects
- ❌ **Running find-leaks without final snapshot** → May get "missing tabs" warning
- ❌ **Trying to trace without node IDs** → Need Step 1 output first
- ❌ **Tracing every object** → Focus on largest leaks first (MB range)

### **Flag Requirements**
- **find-leaks**: MUST use `--trace-all-objects` to get node IDs
- **trace**: MUST use `--node-id` with specific ID from find-leaks output

## 🎯 Success Criteria

**Before Fixing:**
- [ ] Snapshots collected from real user scenarios
- [ ] find-leaks run with `--trace-all-objects` flag
- [ ] All significant leaks identified with node IDs
- [ ] Retention paths traced for major leaks using node IDs
- [ ] Root causes understood from trace output

**After Fixing:**
- [ ] New snapshots show reduced memory usage
- [ ] find-leaks reports fewer/smaller leaks
- [ ] Application performance improved
- [ ] Memory growth patterns eliminated

## 📝 Best Practices

1. **Always start with find-leaks + --trace-all-objects** - gives you node IDs for tracing
2. **Two-step workflow is mandatory** - find-leaks first, then trace specific objects
3. **Prioritize by size** - trace big leaks first (52MB Array vs 248-byte objects)
4. **Use node IDs from find-leaks output** - copy exact IDs like @170921, @628662
5. **Trace before fixing** - understand the retention path (`memoryLeakArray` variable)
6. **Verify fixes** - re-run analysis after changes
7. **Automate detection** - integrate into your CI/CD pipeline

## 📋 Complete Command Chain for Comprehensive Reports

### **Full Diagnostic Workflow:**
```bash
# Step 1: Analyze individual snapshots (understanding)
heap-analyzer analyze baseline.heapsnapshot
heap-analyzer analyze target.heapsnapshot
heap-analyzer analyze final.heapsnapshot

# Step 2: Compare snapshots (growth pattern analysis)
heap-analyzer compare baseline.heapsnapshot target.heapsnapshot

# Step 3: Find leaks with node IDs (leak detection)
heap-analyzer find-leaks --baseline baseline.heapsnapshot --target target.heapsnapshot --final final.heapsnapshot --trace-all-objects

# Step 4: Trace biggest leaks (root cause analysis)
heap-analyzer trace final.heapsnapshot --node-id 170921  # 52.3MB Array
heap-analyzer trace final.heapsnapshot --node-id 628662  # PerformanceEventTiming
heap-analyzer trace final.heapsnapshot --node-id 628670  # DOMTimer
```

### **What Each Step Provides for Your Report:**

1. **📊 Individual Analysis**: Baseline health metrics for each snapshot
2. **📈 Growth Analysis**: Pattern recognition and diagnostic hints
3. **🔍 Leak Detection**: Specific leaked objects with sizes and node IDs
4. **🎯 Root Cause**: Exact variable names and retention paths

### **Professional Report Structure:**
```
Memory Analysis Report
├── Executive Summary (from compare output)
│   ├── Memory Growth: +50.01 MB (239.7%)
│   ├── Pattern: Data accumulation in arrays
│   └── Impact: Critical - immediate action required
├── Snapshot Analysis (from analyze output)
│   ├── Baseline: 20.87 MB, 403K objects
│   ├── Target: 70.88 MB, 430K objects
│   └── Object Composition breakdown
├── Leak Detection Results (from find-leaks output)
│   ├── 23 distinct leaks found
│   ├── 18.1MB total retained memory
│   └── Top leaks with node IDs
└── Root Cause Analysis (from trace output)
    ├── Primary: memoryLeakArray variable (52.3MB)
    ├── Secondary: DOM event listeners
    └── Recommended fixes
```

This workflow transforms memory debugging from guesswork into systematic leak detection and resolution. The combination of automated leak detection with `--trace-all-objects` and precise tracing gives you actionable intelligence to fix memory issues efficiently.
