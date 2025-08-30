# heap-analyzer

A CLI and agent tool for analyzing JavaScript heap snapshots from Google DevTools. Helps developers trace memory issues, browser crashes, and provides actionable insights for fixing leaks in JavaScript apps.

## Features

- 🖥️ **Interactive CLI** for guided manual analysis
- 🤖 **Agent Mode** for automated analysis and reporting
- 📊 **Continuous Monitoring** with watch mode
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

Generate a markdown report:

```sh
npx heap-analyzer --agent --markdown
```

### Watch Mode (Continuous Monitoring)

Monitor a directory for new heap snapshots:

```sh
npx heap-analyzer --watch ./snapshots
```

### Command Line Options

- `-a, --agent` - Run automated analysis on heap snapshot
- `-w, --watch` - Monitor directory for new snapshots
- `-md, --markdown` - Generate markdown report (use with --agent)
- `-h, --help` - Show help information

## Agent Mode Features

Agent mode provides automated analysis with:

- **Severity Assessment**: Categorizes memory issues as LOW, MEDIUM, HIGH, or CRITICAL
- **Smart Insights**: Identifies patterns like large DOM trees, memory leaks, and retention issues
- **Categorized Analysis**: Groups memory consumers by type (DOM, React, Closures, Arrays, etc.)
- **Actionable Recommendations**: Specific suggestions for memory optimization
- **JSON Reports**: Saves detailed analysis to `./reports/` for programmatic usage
- **Markdown Reports**: Human-readable reports perfect for documentation and team sharing

For detailed markdown report features, see [MARKDOWN_REPORTS.md](./MARKDOWN_REPORTS.md).

### Agent Analysis Output

Agent mode provides structured analysis including:

- **Severity Assessment** (LOW, MEDIUM, HIGH, CRITICAL)
- **Memory Summary** with object counts and total size
- **Top Memory Consumers** ranked by size with categories
- **Leak Detection** with confidence scoring
- **Actionable Recommendations** for specific fixes
- **Framework Detection** for targeted advice

Example findings:

- Large memory consumer: ExternalStringData (1.90MB)
- Event listener accumulation: 1202 references detected
- Timer activity: 45 timer references (potential leaks)
- Memory growth: 9.88MB → 11.66MB between snapshots

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
