# heap-analyzer

A CLI and agent tool for analyzing JavaScript heap snapshots from Google DevTools. Helps developers trace memory issues, browser crashes, and provides actionable insights for fixing leaks in JavaScript apps.

## Features

- 🖥️ **Interactive CLI** for guided manual analysis
- 🤖 **Agent Mode** for automated analysis and reporting
- 📊 **Continuous Monitoring** with watch mode
- 🔍 **Memory leak detection** with categorized insights
- 💡 **Actionable recommendations** for optimization
- 📁 **JSON reports** for CI/CD integration
- 🎯 **Smart categorization** of memory consumers

## Getting Started

Install as a dev dependency:

```sh
npm install --save-dev heap-analyzer
```

## Usage

### Interactive Mode

Run the guided CLI interface:

```sh
npx heap-analyzer
```

### Agent Mode (Automated Analysis)

Analyze a specific heap snapshot:

```sh
npx heap-analyzer --agent path/to/snapshot.heapsnapshot
```

Auto-analyze the default snapshot:

```sh
npx heap-analyzer --agent
```

### Watch Mode (Continuous Monitoring)

Monitor a directory for new heap snapshots:

```sh
npx heap-analyzer --watch ./snapshots
```

### Command Line Options

- `-a, --agent` - Run automated analysis on heap snapshot
- `-w, --watch` - Monitor directory for new snapshots
- `-h, --help` - Show help information

## Agent Mode Features

Agent mode provides automated analysis with:

- **Severity Assessment**: Categorizes memory issues as LOW, MEDIUM, HIGH, or CRITICAL
- **Smart Insights**: Identifies patterns like large DOM trees, memory leaks, and retention issues
- **Categorized Analysis**: Groups memory consumers by type (DOM, React, Closures, Arrays, etc.)
- **Actionable Recommendations**: Specific suggestions for memory optimization
- **JSON Reports**: Saves detailed analysis to `./reports/` for programmatic usage

### Example Agent Output

```
🤖 Running Heap Analyzer in Agent Mode...

📋 AGENT ANALYSIS REPORT
==================================================
🟠 Severity: HIGH
📅 Timestamp: 6/30/2025, 11:07:42 AM
📁 Snapshot: single.heapsnapshot

🔍 KEY INSIGHTS:
  1. Large memory consumer detected: system / ExternalStringData (1.90MB)
  2. Total heap size: 9.73MB with 127,468 objects

🏆 TOP MEMORY CONSUMERS:
  1. ⚫ system / ExternalStringData - 1944.0KB (OBJECT)
  2. ⚫ system / ExternalStringData - 1083.6KB (OBJECT)

💡 RECOMMENDATIONS:
  1. Investigate system / ExternalStringData - consider memory optimization strategies
```

## CI/CD Integration

Agent mode is perfect for CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Analyze Memory Usage
  run: |
    npx heap-analyzer --agent ./heap-snapshot.heapsnapshot
    # Process the JSON report in ./reports/
```

## Heap Snapshot Creation

Create heap snapshots in Chrome DevTools:

1. Open DevTools (F12)
2. Go to Memory tab
3. Select "Heap snapshot"
4. Click "Take snapshot"
5. Save the `.heapsnapshot` file

## License

MIT
