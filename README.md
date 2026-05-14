# Heap Analyzer

> Memory leak detection and heap analysis for Node.js and browser applications

[![npm version](https://badge.fury.io/js/heap-analyzer.svg)](https://www.npmjs.com/package/heap-analyzer)
[![Node.js Support](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

Heap Analyzer is a CLI tool built on [memlab](https://facebook.github.io/memlab/) that makes heap snapshot analysis, memory leak detection, and object investigation accessible from the terminal. It works with snapshots from Chrome DevTools, Puppeteer, or running Node.js processes.

- **Leak detection** via 3-snapshot diffing (baseline → target → final)
- **Object investigation** with retention path tracing and deep structure exploration
- **Timeline analysis** across many sequential snapshots
- **Browser automation** with Puppeteer or a floating in-page UI
- **Node.js process monitoring** with threshold-based auto-snapshots and HTTP endpoint integration

---

## Installation

```bash
# Use without installing
npx heap-analyzer --help

# Or install globally
npm install -g heap-analyzer
```

---

## Quick Start

The core workflow is always: take three snapshots, then find leaks.

```bash
# 1. Take a baseline snapshot (app in clean state)
npx heap-analyzer node-snapshot --endpoint http://localhost:3000/debug/heap-snapshot

# 2. Perform actions that may cause a leak, then take a target snapshot
npx heap-analyzer node-snapshot --endpoint http://localhost:3000/debug/heap-snapshot

# 3. Wait for GC, then take a final snapshot
sleep 5
npx heap-analyzer node-snapshot --endpoint http://localhost:3000/debug/heap-snapshot

# 4. Detect leaks across the three snapshots
npx heap-analyzer find-leaks \
  --baseline heap-1.heapsnapshot \
  --target heap-2.heapsnapshot \
  --final heap-3.heapsnapshot \
  --trace-all-objects

# 5. Trace a specific leaked object (use node ID from find-leaks output)
npx heap-analyzer trace heap-3.heapsnapshot --node-id 170921

# 6. Investigate it fully (inspect + trace + deep-dive in one command)
npx heap-analyzer investigate heap-3.heapsnapshot --object-id @170921
```

For the browser workflow, see [Browser Analysis](#-browser-analysis). For the AI-agent diagnostic workflow, see [AGENT.md](AGENT.md).

---

## Command Reference

| Command | Description |
|---------|-------------|
| `analyze <file>` | Node counts, type breakdown, and heap size for one snapshot |
| `compare <baseline> <target>` | Side-by-side memory growth between two snapshots |
| `timeline <dir>` | Sequential snapshot trend analysis with table output |
| `find-leaks` | 3-snapshot memlab leak detection |
| `trace <file> --node-id <id>` | Retainer path trace for a specific node |
| `investigate <file> --object-id <@id>` | Combined: inspect + trace + deep-dive |
| `inspect-object <file> --object-id <@id>` | Structured object inspection (references, referrers) |
| `memlab-inspect <file> --object-id <@id>` | Native memlab object inspection |
| `deep-dive <file> --object-id <@id>` | Recursive object hierarchy exploration |
| `browser <url>` | Launch browser with floating UI for manual snapshot workflow |
| `monitor <url>` | Puppeteer-based monitoring with automated snapshots |
| `node-snapshot` | Capture snapshot from a running Node.js process |
| `node-monitor` | Auto-snapshot Node.js process when memory exceeds threshold |
| `node-load-test <url>` | Load test with concurrent requests and automatic snapshots |
| `enrich <report.md>` | Update a Markdown report with object inspection details |
| `generate-report <file.json>` | Convert a JSON analysis file to a Markdown report |
| `heap <file>` | Launch interactive memlab CLI |
| `view-heap <file>` | Heap visualization (memlab wrapper) |
| `lens <file>` | Web-based MemLens visualization |
| `analyze-plugin <plugin>` | Run a memlab analysis plugin |
| `list` | List `.heapsnapshot` files in `./snapshots/` |

---

## 🌐 Browser Analysis

### Manual snapshot workflow

Launch a browser with a floating UI overlay that guides you through taking baseline, target, and final snapshots:

```bash
npx heap-analyzer browser http://localhost:3000
```

The overlay lets you take each snapshot in sequence, then auto-runs leak detection and generates a report in `./snapshots/`.

```bash
# Launch options
npx heap-analyzer browser http://localhost:3000 --headful          # visible browser
npx heap-analyzer browser http://localhost:3000 --devtools         # open DevTools
npx heap-analyzer browser http://localhost:3000 --disable-csp      # bypass CSP (testing only)
npx heap-analyzer browser http://localhost:3000 --no-sandbox       # CI/container environments
npx heap-analyzer browser http://localhost:3000 --wait-until networkidle0
```

### Automated monitoring

```bash
# Capture snapshots automatically over a period
npx heap-analyzer monitor http://localhost:3000 --duration 5m
```

### Using snapshots from Chrome DevTools

If you already have `.heapsnapshot` files from DevTools:

```bash
npx heap-analyzer find-leaks \
  --baseline before.heapsnapshot \
  --target after.heapsnapshot \
  --final cleanup.heapsnapshot

# Or point at a directory containing files named baseline/target/final
npx heap-analyzer find-leaks --snapshot-dir ./snapshots/my-test/
```

**Browser flags:**

| Flag | Description |
|------|-------------|
| `--headful` | Launch visible browser (default: headless) |
| `--devtools` | Open Chrome DevTools automatically |
| `--disable-csp` | Bypass Content Security Policy |
| `--no-sandbox` | Run without sandbox (CI environments) |
| `--user-agent <string>` | Custom User-Agent |
| `--wait-until <condition>` | Page load condition: `load`, `domcontentloaded`, `networkidle0`, `networkidle2` |

---

## 🖥️ Node.js Analysis

### Expose a snapshot endpoint

Add a `/debug/heap-snapshot` endpoint to your app. See [examples/node-server-with-heap-analysis.js](examples/node-server-with-heap-analysis.js) for a complete Express example using `v8.writeHeapSnapshot()`.

### Take snapshots

```bash
# Via HTTP endpoint
npx heap-analyzer node-snapshot --endpoint http://localhost:3000/debug/heap-snapshot

# Via process ID (send SIGUSR2)
npx heap-analyzer node-snapshot --pid 12345
```

### Automated monitoring

```bash
# Auto-snapshot when RSS exceeds 500 MB, polling every 5 seconds
npx heap-analyzer node-monitor --pid 12345 --threshold 500 --interval 5

# Load test: 50 concurrent requests for 60 seconds, auto-snapshot throughout
npx heap-analyzer node-load-test http://localhost:3000/api/endpoint \
  --endpoint http://localhost:3000/debug/heap-snapshot \
  --concurrency 50 \
  --duration 60
```

**Node.js flags:**

| Flag | Description |
|------|-------------|
| `--pid <n>` | Target process ID |
| `--endpoint <url>` | HTTP endpoint that writes a snapshot and returns its filename |
| `--threshold <mb>` | Memory threshold in MB to trigger auto-snapshot |
| `--interval <s>` | Poll interval in seconds (default: 5) |
| `--duration <s>` | Total monitoring duration in seconds |
| `--concurrency <n>` | Concurrent requests for `node-load-test` |

---

## 🔍 Finding and Investigating Leaks

### Step 1 — Detect leaks

```bash
npx heap-analyzer find-leaks \
  --baseline heap-1.heapsnapshot \
  --target heap-2.heapsnapshot \
  --final heap-3.heapsnapshot \
  --trace-all-objects
```

`--trace-all-objects` is required to get node IDs in the output. Without it you cannot trace specific objects.

Example output:

```
--Similar leaks in this run: 4950--
--Retained size of leaked objects: 18.1MB--
[Window] @41759
  --memoryLeakArray (variable)-->  [Array] @170921 [52.3MB]
                                              ↑ node ID for tracing

MemLab found 23 leak(s)
```

### Step 2 — Trace retention paths

```bash
npx heap-analyzer trace heap-3.heapsnapshot --node-id 170921
```

Output shows the full chain from GC root to the leaked object:

```
Window → NativeContext → ScriptContextTable → <function scope> → memoryLeakArray → Array (52.3MB)
```

### Step 3 — Deep investigation

```bash
# All three steps in one command: inspect + trace + deep-dive
npx heap-analyzer investigate heap-3.heapsnapshot --object-id @170921

# Or run each step individually:
npx heap-analyzer inspect-object heap-3.heapsnapshot --object-id @170921
npx heap-analyzer trace heap-3.heapsnapshot --node-id 170921
npx heap-analyzer deep-dive heap-3.heapsnapshot --object-id @170921 \
  --depth 5 \
  --max-children 20 \
  --output-format json \
  --output-file dive-170921.json
```

**Investigation flags:**

| Flag | Description |
|------|-------------|
| `--trace-all-objects` | Include node IDs in `find-leaks` output |
| `--node-id <n>` | Target node for `trace` |
| `--object-id <@n>` | Target object for `inspect-object`, `investigate`, `deep-dive` |
| `--depth <n>` | Max depth for deep-dive (default: 2) |
| `--max-children <n>` | Max children per level in deep-dive (default: 5) |
| `--max-nodes <n>` | Hard node cap for deep-dive (default: 100) |
| `--time-budget <ms>` | Time budget for deep-dive (default: 15000) |
| `--output-format <tree\|json>` | Output format (default: tree) |
| `--output-file <path>` | Write output to file |

---

## 📊 Snapshot Comparison and Timeline

### Compare two snapshots

```bash
npx heap-analyzer compare before.heapsnapshot after.heapsnapshot
```

Output shows memory growth, object count delta, and per-type breakdown with smart pattern hints (cache buildup, unbounded arrays, etc.).

### Analyze a single snapshot

```bash
npx heap-analyzer analyze snapshot.heapsnapshot
```

### Timeline across many snapshots

Useful for production monitoring or long-running test runs. Expects a directory with timestamped snapshot filenames:

```bash
npx heap-analyzer timeline ./snapshots/production-run/
npx heap-analyzer timeline ./snapshots/ --threshold 20   # flag ops growing >20 MB
```

Example output:

```
Timeline Report
═══════════════════════════════════════

Summary:
   Start memory:  113.37 MB
   End memory:    310.39 MB
   Total growth:  +197.02 MB (173.8%)

Leak Detection:
   ⚠️  Potential leak detected
   Problematic operations: beatHeartbeat, getTrendingSearches

Sequential Comparisons:
┌─────┬──────────────────┬──────────────┬───────────────┐
│  #  │ Operation        │ Memory Growth│ Total Size    │
├─────┼──────────────────┼──────────────┼───────────────┤
│ ⚠️ 1│ beatHeartbeat    │    +25.50 MB │    138.87 MB  │
│   2 │ getUniversalNav  │     +2.30 MB │    141.17 MB  │
```

---

## 📝 Reports

### Enrich a Markdown report with object details

Reads a report, finds `@objectId` references, calls the inspector for each, and rewrites the report in place with detailed inspection tables:

```bash
npx heap-analyzer enrich ANALYSIS-SUMMARY.md
npx heap-analyzer enrich ANALYSIS-SUMMARY.md --snapshot-file final.heapsnapshot --max-objects 15
```

### Generate a Markdown report from JSON

```bash
npx heap-analyzer generate-report ANALYSIS-DATA-2025-01-01.json
```

---

## 🔬 Interactive and Visual Exploration

```bash
# Interactive memlab CLI (navigate heap graph)
npx heap-analyzer heap snapshot.heapsnapshot

# Visual heap explorer
npx heap-analyzer view-heap snapshot.heapsnapshot

# Web-based MemLens visualization
npx heap-analyzer lens snapshot.heapsnapshot

# Run a memlab analysis plugin
npx heap-analyzer analyze-plugin <plugin-name>

# List all .heapsnapshot files in ./snapshots/
npx heap-analyzer list
```

---

## 📁 Output Files

| File pattern | Contents |
|---|---|
| `*.heapsnapshot` | Chrome heap snapshot format — can be opened in DevTools |
| `ANALYSIS-SUMMARY-*.md` | Human-readable Markdown report |
| `ANALYSIS-DATA-*.json` | Machine-readable JSON with full analysis data |
| `deep-dive-*.json` | Recursive object structure from `deep-dive` |
| `memlab-analysis-raw/*.txt` | Raw memlab output for reference |

---

## 💡 Best Practices

### For browser applications

- Repeat the triggering action multiple times (e.g., open/close a modal 5×) — leaks accumulate
- Wait a few seconds before the final snapshot to allow garbage collection to run
- Focus on common user flows: navigation, form submissions, modal dialogs
- Event listeners added but never removed are the most common browser leak source

### For Node.js applications

- Use `node-load-test` to simulate realistic production load before analyzing
- Use `timeline` with many snapshots to detect slow, gradual leaks
- Watch global caches and in-memory stores — they grow unboundedly without eviction
- Test specific endpoints in isolation: snapshot → hit endpoint → GC → snapshot → compare

### Prioritizing leaks

| Size | Priority |
|------|----------|
| MB range | Fix immediately |
| 100 KB+ | Fix soon — accumulates over time |
| 10 KB+ | Monitor — may indicate a pattern |
| Bytes | Low priority unless count is very high |

Common leak patterns:
- Global variables holding references to large objects
- Event listeners attached but never removed
- `setTimeout`/`setInterval` handles not cleared
- Closures capturing large outer scopes

---

## 🤝 Contributing

Contributions welcome. This tool builds on [memlab](https://facebook.github.io/memlab/) and aims to make memory analysis more accessible.

## 📄 License

ISC

## 🙏 Acknowledgments

Built on top of [memlab](https://facebook.github.io/memlab/) by Meta's JavaScript Infrastructure team.
