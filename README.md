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

### Interactive Mode

Run the guided CLI interface:

```sh
npx heap-analyzer
```

### Agent Mode (Automated Analysis)

**Single Snapshot Analysis:**

```sh
npx heap-analyzer --agent path/to/snapshot.heapsnapshot
```

**Auto-detect Analysis:**

```sh
npx heap-analyzer --agent
```

_Automatically detects `./snapshots/after.heapsnapshot` for single analysis, or runs before/after comparison if both `before.heapsnapshot` and `after.heapsnapshot` exist_

### Enhanced Compare Mode (Detailed Analysis)

**Direct Comparison:**

```sh
npx heap-analyzer compare before.heapsnapshot after.heapsnapshot
```

**With Custom Options:**

```sh
npx heap-analyzer compare --before initial.heapsnapshot --after final.heapsnapshot --output detailed-report.json --verbose
```

_Use enhanced compare when agent mode shows HIGH/CRITICAL issues for precise leak attribution and detailed investigation_

**Generate Markdown Report:**

```sh
npx heap-analyzer --agent --markdown
```

### Watch Mode (Continuous Monitoring)

Monitor a directory for new heap snapshots:

```sh
npx heap-analyzer --watch ./snapshots
```

### Command Line Options

**Agent Mode:**

- `-a, --agent` - Run automated analysis on heap snapshot
- `-md, --markdown` - Generate markdown report (use with --agent)

**Compare Mode:**

- `compare <before> <after>` - Run enhanced comparison between two snapshots
- `--before <file>` - Specify before snapshot (alternative syntax)
- `--after <file>` - Specify after snapshot (alternative syntax)
- `--output <file>` - Custom output location for detailed JSON report
- `--verbose, -v` - Enable verbose output for debugging

**Watch Mode:**

- `-w, --watch` - Monitor directory for new snapshots

**General:**

- `-h, --help` - Show help information

## Agent Mode Features

**Quick Triage (Agent Mode)** provides automated analysis with:

- **Severity Assessment**: Categorizes memory issues as LOW, MEDIUM, HIGH, or CRITICAL
- **Smart Insights**: Identifies patterns like large DOM trees, memory leaks, and retention issues
- **Categorized Analysis**: Groups memory consumers by type (DOM, React, Closures, Arrays, etc.)
- **Escalation Guidance**: Clear indicators when enhanced comparison is needed

**Deep Investigation (Enhanced Compare Mode)** provides detailed analysis with:

- **Precise Leak Attribution**: 95%+ confidence scoring with visual indicators
- **Object-Level Analysis**: Detailed breakdown of new/grown objects with size rankings
- **Collection Growth Detection**: Arrays, Maps, Sets, and Object accumulation patterns
- **Performance Impact Assessment**: JavaScript execution pattern changes
- **Actionable Recommendations**: Specific suggestions for memory optimization with priority ordering
- **JSON Reports**: Saves detailed analysis to `./reports/` for programmatic usage
- **Markdown Reports**: Human-readable reports perfect for documentation and team sharing

### Snapshot-Only Analysis Capability

The heap analyzer detects memory leaks using **only snapshot data**, without requiring:

- Component source code access
- Global variable names or application structure
- Specific collection types or framework details
- Exact growth mechanisms or application logic

This snapshot-isolated approach ensures accurate leak detection across any JavaScript application, regardless of framework or implementation patterns.

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
