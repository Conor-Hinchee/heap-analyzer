# Heap Analyzer Documentation

## Overview

Advanced JavaScript memory analysis toolkit with MemLab-inspired analyzers for detecting and diagnosing memory leaks in web applications.

## Core Tools

### 🔬 **Main Analysis Commands**

- **`npm run dev compare`** - Comprehensive before/after heap snapshot comparison
- **`npx heap-analyzer --agent`** - Automated single snapshot analysis
- **`npx heap-analyzer`** - Interactive CLI mode

### 🔍 **Development Tools**

- **`npm run inspect-object`** - Deep object inspection and debugging
- **`npm run pick-snapshot`** - Snapshot file management utility
- **`npm run clear-reports`** - Clean up generated report files

## Advanced Analyzers

### MemLab-Inspired Detection Engine

The heap analyzer includes 11 sophisticated analyzers based on Meta's MemLab:

1. **🌐 Global Variable Analysis** - Detects Window object property leaks
2. **🗂️ Stale Collection Analysis** - Finds collections holding detached objects  
3. **📈 Unbound Growth Analysis** - Cross-snapshot collection growth tracking
4. **🔌 Detached DOM Analysis** - Identifies disconnected DOM elements
5. **🔍 Object Content Analysis** - Deep object relationship inspection
6. **📊 Object Fanout Analysis** - Finds objects with excessive outgoing references
7. **📋 Object Shallow Analysis** - Detects duplicated objects and memory waste
8. **📐 Object Shape Analysis** - Analyzes object structural patterns and memory consumption
9. **📏 Object Size Rank Analysis** - Identifies largest objects by retained size for optimization
10. **📈 Object Unbound Growth Analysis** - Tracks individual objects with monotonic growth patterns
11. **🛡️ Built-in Globals Filter** - Filters 501 legitimate browser globals

### Analysis Capabilities

- **🎯 Confidence Scoring** - 95%+ accuracy with severity classification
- **📊 Pattern Recognition** - Dynamic leak detection without hardcoded checks
- **🔗 Relationship Mapping** - Retainer chains and reference graphs
- **💡 Actionable Insights** - Framework-specific recommendations
- **📈 Growth Tracking** - Cross-snapshot memory pattern analysis

## Documentation

### Quick References

- **[Object Content Analyzer](./OBJECT_CONTENT_ANALYZER.md)** - Deep object inspection guide
- **[Main README](../README.md)** - Getting started and core features
- **[Agent Mode Guide](../AGENT.md)** - Automated analysis documentation
- **[Debugging Snippets](../DEBUGGING_SNIPPETS.md)** - Browser console helpers

### Analysis Workflows

#### 🚀 **Quick Memory Health Check**
```bash
npm run dev compare
```
Get comprehensive leak detection with severity assessment.

#### 🔍 **Deep Object Investigation** 
```bash
# After finding suspicious objects in main analysis
npm run inspect-object snapshots/after.heapsnapshot <node-id>
```
Forensic analysis of specific memory suspects.

#### 🤖 **CI/CD Integration**
```bash
npx heap-analyzer --agent --markdown
```
Automated analysis with structured reports.

## Output Formats

### 📊 **Console Output**
Real-time analysis with color-coded severity indicators and emoji categorization.

### 📄 **JSON Reports** 
Machine-readable structured data in `./reports/` directory for CI/CD integration.

### 📝 **Markdown Reports**
Human-readable documentation-friendly reports for team sharing.

## Memory Leak Detection Patterns

### 🎯 **What We Detect**

- **Global Variable Accumulation** - Window object property leaks
- **Detached DOM Elements** - Disconnected but retained DOM nodes  
- **Stale Collections** - Arrays/Maps/Sets holding dead references
- **Unbounded Growth** - Collections growing without limits
- **Circular References** - Memory ownership cycles
- **Event Handler Leaks** - Unremoved DOM event listeners
- **Timer Leaks** - Uncleaned intervals and timeouts

### 🔬 **How We Detect**

- **Snapshot-Only Analysis** - No source code access required
- **Pattern Recognition** - Dynamic detection algorithms
- **Cross-Framework Support** - Works with React, Vue, Angular, vanilla JS
- **Confidence Scoring** - Probabilistic leak assessment
- **Severity Classification** - CRITICAL → HIGH → MEDIUM → LOW

## Best Practices

### 📋 **Investigation Workflow**

1. **Run main analysis** to identify memory hotspots
2. **Use object inspector** for deep dives into suspicious objects  
3. **Apply recommended fixes** based on analysis insights
4. **Re-run analysis** to verify improvements
5. **Set up CI/CD monitoring** for continuous memory health

### 🎯 **Performance Tips**

- **Large snapshots** (>100MB) require more memory and time
- **Focus on CRITICAL/HIGH** severity issues first
- **Use retainer chains** to understand object lifetime
- **Monitor collection growth** across multiple snapshots
- **Implement cleanup patterns** recommended by analyzers

## Advanced Features

### 🧠 **Smart Analysis**

- **Framework Detection** - Tailored recommendations for React, Vue, etc.
- **Memory Threshold Adaptation** - Dynamic severity classification
- **Pattern Learning** - Improved detection accuracy over time
- **Cross-Snapshot Correlation** - Growth pattern analysis

### 🔧 **Developer Experience**

- **Zero Configuration** - Works out of the box
- **Visual Indicators** - Emoji-based categorization and severity
- **Actionable Recommendations** - Specific fix suggestions
- **Integration Ready** - CI/CD friendly outputs

---

**Need help?** Check the specific tool documentation or create an issue in the repository.

**Contributing?** See the main README for development setup and contribution guidelines.