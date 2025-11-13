# Object Content Analyzer Documentation

## Overview

The **Object Content Analyzer** is a powerful debugging tool inspired by MemLab's `ObjectContentAnalysis` that provides deep inspection of specific objects in heap snapshots. It helps you understand object relationships, memory usage patterns, and potential leak sources.

## Quick Start

```bash
# Show usage information
npm run inspect-object

# Analyze a specific object by node ID
npm run inspect-object snapshots/after.heapsnapshot 12345
```

## When to Use

### 🎯 **Follow-up Investigation**
After running the main heap comparison (`npm run dev compare`), use this tool to investigate specific suspicious objects identified in the analysis.

```bash
# Main analysis shows:
# "1. 🔴 userCache (HIGH) - Size: 5.2 MB | Node ID: 445123"

# Deep dive into the suspicious object:
npm run inspect-object snapshots/after.heapsnapshot 445123
```

### 🔍 **Common Investigation Scenarios**

| **Main Analysis Shows** | **Use Object Inspector For** |
|------------------------|------------------------------|
| Large global variables | See what properties consume memory |
| Detached DOM elements | Find what's retaining them |
| Growing collections | Examine collection contents and references |
| High retained size objects | Understand object relationships |
| Circular reference warnings | Map the exact reference cycles |

## Command Syntax

```bash
npm run inspect-object <snapshot-file> <node-id>
```

### Parameters

- **`<snapshot-file>`**: Path to the heap snapshot file (`.heapsnapshot`)
- **`<node-id>`**: Numeric ID of the object to analyze (found in main analysis output)

### Examples

```bash
# Analyze object with ID 287534 in the after snapshot
npm run inspect-object snapshots/after.heapsnapshot 287534

# Analyze object in before snapshot
npm run inspect-object snapshots/before.heapsnapshot 445123

# Analyze object in a custom snapshot
npm run inspect-object /path/to/custom.heapsnapshot 556677
```

## Output Sections

### 📊 **Object Summary**
Quick overview with emoji indicators showing memory impact and basic stats.

```
🔴 Map "userCache" (5.2 MB) - 1,247 refs, 3 referrers
```

### 🔍 **Object Details**
Comprehensive information about the target object:

- **Name**: Object identifier or constructor name
- **Type**: JavaScript type (Object, Array, Map, HTMLElement, etc.)
- **Shallow Size**: Memory used by the object itself
- **Retained Size**: Total memory kept alive by this object
- **References**: Number of objects this object points to
- **Referrers**: Number of objects pointing to this object
- **Memory Impact**: Severity level (LOW/MEDIUM/HIGH/CRITICAL)

### 🏷️ **Object Properties**
Shows the actual properties/fields within the object:

```
🏷️  OBJECT PROPERTIES
=====================
  users: Map (2.1 MB)
  cache: Object (1.8 MB)
  config: Object (45 KB)
```

### 📤 **Top References**
Objects that this object references (what it points to):

```
📤 TOP REFERENCES
=================
1. [property] users → Map
   Size: 2.1 MB | Node ID: 334455
2. [element] user_12345 → Object  
   Size: 45 KB | Node ID: 667788
```

### 📥 **Top Referrers**
Objects that reference this object (what points to it):

```
📥 TOP REFERRERS
================
1. Object [property] globalState
   Size: 8.5 MB | Node ID: 112233
2. Window [property] myApp
   Size: 15.2 MB | Node ID: 998877
```

### 🔗 **Retainer Chain**
Shows the path from this object to the root, revealing what keeps it alive:

```
🔗 RETAINER CHAIN
=================
🎯 Map "userCache" (ID: 445123)
⬆️ Object "globalState" (ID: 334455) 
⬆️ Object "window" (ID: 112233)
```

This shows: `window.globalState.userCache` is the retention path.

### 🔄 **Circular References**
Displays any circular reference cycles involving this object:

```
🔄 CIRCULAR REFERENCES
======================
1. [property] parent → HTMLDivElement
2. [property] children → Array
```

### 💡 **Insights**
Automated analysis of potential issues:

```
💡 INSIGHTS
===========
• 🔍 Large object detected (5.2 MB)
• 📊 High fan-out: 1,247 references
• ⚠️ 2 suspicious pattern(s) detected
```

### ⚠️ **Suspicious Patterns**
Flags potential memory leak indicators:

```
⚠️  SUSPICIOUS PATTERNS
=======================
• Contains 45 DOM element references
• Excessive references: 1,247 outgoing edges
• Suspicious property name: 'detachedNodes'
```

### 🎯 **Recommendations**
Actionable advice for fixing detected issues:

```
🎯 RECOMMENDATIONS
==================
• 🚨 High memory impact - implement cache size limits
• 📊 High reference count - implement LRU eviction  
• 🔍 Map contains user objects - add cleanup on logout
• 🔍 Use DevTools to inspect object properties
```

## Integration Workflow

### 1. **Run Main Analysis**
```bash
npm run dev compare
```
Identifies suspicious objects with their node IDs.

### 2. **Investigate Suspects**
```bash
npm run inspect-object snapshots/after.heapsnapshot <node-id>
```
Get detailed analysis of specific objects.

### 3. **Apply Fixes**
Use the recommendations to implement fixes in your code.

### 4. **Verify Fixes**
```bash
npm run dev compare
```
Re-run main analysis to confirm improvements.

## Finding Node IDs

Node IDs are displayed in the main heap analysis output:

```bash
npm run dev compare
```

Look for output like:
```
🚨 TOP GLOBAL VARIABLE LEAKS:
1. 🔴 userCache (HIGH) - Node ID: 445123  # ← Use this ID
   Size: 5.2 MB | Confidence: 95%

🔍 LARGEST DETACHED ELEMENTS:
1. 🔴 <div> Node ID: 556677  # ← Or this ID
   Memory: 2.1 MB | Reason: Not reachable from document
```

## Memory Impact Levels

| **Level** | **Emoji** | **Threshold** | **Action Required** |
|-----------|-----------|---------------|-------------------|
| LOW | 🟢 | < 1 MB | Monitor |
| MEDIUM | 🟡 | 1-5 MB | Investigate |
| HIGH | 🔴 | 5-10 MB | Fix Soon |
| CRITICAL | 🔥 | > 10 MB | Fix Immediately |

## Advanced Usage Tips

### **Understanding Retainer Chains**
The retainer chain shows the **exact path** keeping an object alive:
```
🎯 HTMLDivElement "login-form" (ID: 445123)
⬆️ Array "eventHandlers" (ID: 334455)
⬆️ Object "globalEventManager" (ID: 223344)
⬆️ Window "window" (ID: 112233)
```

This means: `window.globalEventManager.eventHandlers[i] = loginFormDiv`

**Fix**: Remove the event handler when the form is destroyed.

### **Circular Reference Detection**
When you see circular references:
```
🔄 CIRCULAR REFERENCES
======================
1. [property] parent → HTMLDivElement
2. [property] children → Array
```

This indicates: `parent.children[i].parent = parent` (circular!)

**Fix**: Use `WeakMap` or break the reference manually.

### **Large Reference Analysis**
Objects with many references (high fan-out) often indicate:
- **Caches without size limits**
- **Event handler accumulation**
- **DOM node collections**
- **Memory leaks in collections**

## Troubleshooting

### **"Object not found" Error**
```bash
❌ Object with ID 12345 not found in snapshot
```

**Causes**:
- Node ID doesn't exist in the snapshot
- Typo in the node ID
- Using ID from a different snapshot

**Solutions**:
- Verify the node ID from the main analysis output
- Ensure you're using the correct snapshot file
- Check that the object still exists in the target snapshot

### **"Failed to parse heap snapshot" Error**
```bash
❌ Failed to parse heap snapshot
```

**Causes**:
- Corrupted snapshot file
- Wrong file format
- Insufficient memory to parse large snapshots

**Solutions**:
- Verify the snapshot file is complete and not corrupted
- Ensure you have enough RAM for large snapshots
- Try with a smaller snapshot first

## Performance Notes

- **Large snapshots** (>100MB) may take time to parse and analyze
- **Complex objects** with many references will show more detailed output
- **Memory usage** during analysis is proportional to snapshot size
- **Circular reference detection** has depth limits to prevent infinite loops

## Example Investigation Session

```bash
# 1. Run main analysis
npm run dev compare

# Output shows:
# "🔴 userSessionCache (HIGH) - Size: 8.2 MB | Node ID: 287534"

# 2. Investigate the suspicious object
npm run inspect-object snapshots/after.heapsnapshot 287534

# Output reveals:
# - Map with 2,345 user session objects
# - Retainer chain: window.app.userSessionCache
# - No cleanup logic for expired sessions
# - Recommendation: Implement session expiration

# 3. Apply fix in code:
# Add session timeout and cleanup logic

# 4. Verify fix
npm run dev compare
# Confirm userSessionCache memory usage is reduced
```

This tool transforms memory debugging from guesswork into **scientific investigation**! 🔬✨