# Registry Pattern and Command Registration

## Overview

The CLI is split into two files:

- **`src/cli.ts`** — Entry point. Parses CLI arguments and resolves the command name.
- **`src/registry.ts`** — Defines all command handlers and exports `commandRegistry`, a plain `Record<string, CommandHandler>` map.

This separation keeps argument parsing decoupled from command logic and makes it easy to add, remove, or test commands in isolation.

```
process.argv
     │
     ▼
 src/cli.ts                        src/registry.ts
 ─────────────────────────────     ──────────────────────────────────────
 parseArgs()                        export const commandRegistry = {
 positionals[0] → command name        analyze:      handleAnalyze,
 values         → parsed flags        compare:      handleCompare,
 opts           → shared opts         'find-leaks': handleFindLeaks,
                                      ...
 commandRegistry[command]           }
     │
     ▼
 handler(positionals, values, opts)
```

---

## Core Types (`src/registry.ts`)

### `ParsedValues`

All CLI flags that `cli.ts` accepts, typed as optional strings/booleans.
Handler functions receive this as the `values` parameter.

```typescript
export interface ParsedValues {
  file?: string;
  baseline?: string;
  target?: string;
  final?: string;
  'snapshot-dir'?: string;
  'node-id'?: string;
  'object-id'?: string;
  depth?: string;
  // ... see src/registry.ts for the full list
}
```

> Numeric flags (e.g. `depth`, `concurrency`) are typed as `string` in `ParsedValues`. Each handler is responsible for parsing them with `parseInt` / `parseFloat`.

### `CommonOpts`

Options derived by `cli.ts` before dispatch, currently containing only `subprocessTimeout`.

```typescript
export interface CommonOpts {
  subprocessTimeout?: number;
}
```

### `CommandHandler`

The signature every command handler must implement:

```typescript
export type CommandHandler = (
  positionals: string[],
  values: ParsedValues,
  opts: CommonOpts
) => Promise<void>;
```

| Parameter | Description |
|---|---|
| `positionals` | Bare arguments in order. `positionals[0]` is the command name; `positionals[1]` is typically the first file/URL argument. |
| `values` | Named flags, e.g. `values['object-id']`, `values.threshold`. |
| `opts` | Shared cross-cutting options (e.g. subprocess timeout). |

---

## The Registry (`commandRegistry`)

```typescript
// src/registry.ts:730
export const commandRegistry: Record<string, CommandHandler> = {
  list:             handleList,
  compare:          handleCompare,
  'inspect-object': handleInspectObject,
  'memlab-inspect': handleMemlabInspect,
  trace:            handleTrace,
  investigate:      handleInvestigate,
  'deep-dive':      handleDeepDive,
  heap:             handleHeap,
  'view-heap':      handleViewHeap,
  lens:             handleLens,
  monitor:          handleMonitor,
  browser:          handleBrowser,
  'analyze-plugin': handleAnalyzePlugin,
  'find-leaks':     handleFindLeaks,
  enrich:           handleEnrich,
  'generate-report':handleGenerateReport,
  timeline:         handleTimeline,
  analyze:          handleAnalyze,
  'node-snapshot':  handleNodeSnapshot,
  'node-monitor':   handleNodeMonitor,
  'node-load-test': handleNodeLoadTest,
};
```

`cli.ts` dispatches to a handler with a single lookup:

```typescript
// src/cli.ts:329-332
const handler = resolvedCommand ? commandRegistry[resolvedCommand] : undefined;
if (handler) {
  await handler(positionals, values, opts);
}
```

---

## How `cli.ts` Builds the Context

Before dispatch, `cli.ts` does three things:

1. **Parses arguments** with `util.parseArgs` (or a polyfill for Node < 18.3).
2. **Resolves the command name** — allows a bare file argument to imply `analyze`:
   ```typescript
   const resolvedCommand = command ?? (values.file ? 'analyze' : undefined);
   ```
3. **Extracts shared opts**:
   ```typescript
   const subprocessTimeout = values['subprocess-timeout']
     ? parseInt(values['subprocess-timeout'])
     : undefined;
   const opts = { subprocessTimeout };
   ```

---

## Registering a New Command

### 1. Write the handler in `src/registry.ts`

Place the handler function above the `commandRegistry` declaration, in the `// ─── Handlers ───` section.

```typescript
async function handleMyCommand(
  positionals: string[],
  values: ParsedValues,
  opts: CommonOpts
): Promise<void> {
  // positionals[1] is the first non-command argument
  const file = positionals[1];

  if (!file) {
    console.error('❌ Error: my-command requires a snapshot file');
    console.log('Usage: heap-analyzer my-command <file> [--depth <n>]');
    process.exit(1);
  }

  const depth = values.depth ? parseInt(values.depth) : 3;

  console.log(`\n🔍 Running my-command on: ${file} (depth ${depth})`);

  const { myAnalysisFunction } = await import('./myModule.js');
  await myAnalysisFunction(file, { depth });
}
```

### 2. Add the entry to `commandRegistry`

```typescript
export const commandRegistry: Record<string, CommandHandler> = {
  // ... existing commands ...
  'my-command': handleMyCommand,   // ← add this line
};
```

### 3. Declare any new flags in `ParsedValues`

If your command uses flags that don't already exist in `ParsedValues`, add them:

```typescript
export interface ParsedValues {
  // ... existing flags ...
  'my-new-flag'?: string;
}
```

### 4. Register the flag in `cli.ts`

Add the flag to the `options` object passed to `parseArgs`:

```typescript
// src/cli.ts — inside the parseArgs({ options: { ... } }) block
'my-new-flag': {
  type: 'string',
  description: 'Description shown in --help output'
},
```

### 5. Document the command in the `--help` block (`cli.ts`)

Add a line to the help text printed by `if (values.help) { ... }`:

```
  my-command <file>        Brief description of what it does
```

---

## Existing Handler Examples

### Minimal: `handleList`

No file argument, no flags. Shows how to call a core analysis function and nothing else.

```typescript
// src/registry.ts:67-74
async function handleList(
  _positionals: string[],
  _values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
  console.log('\n📂 Available snapshots:');
  await listSnapshots(SNAPSHOTS_DIR);
}
```

### Positional file + required flag: `handleTrace`

`positionals[1]` = snapshot file. `values['node-id']` = required string flag.
Shows the standard early-exit validation pattern.

```typescript
// src/registry.ts:156-179
async function handleTrace(
  positionals: string[],
  values: ParsedValues,
  opts: CommonOpts
): Promise<void> {
  const file = positionals[1];
  const nodeId = values['node-id'];

  if (!file) {
    console.error('❌ Error: trace requires a snapshot file');
    console.log('Usage: heap-analyzer trace <file> --node-id <id>');
    process.exit(1);
  }

  if (!nodeId) {
    console.error('❌ Error: trace requires a node ID');
    console.log('Usage: heap-analyzer trace <file> --node-id <id>');
    process.exit(1);
  }

  console.log(`\n🔍 Analyzing retainer trace for node ${nodeId}`);
  await runMemlabTrace(file, nodeId, opts.subprocessTimeout);
}
```

### Multiple optional flags with numeric parsing: `handleDeepDive`

Shows how to handle optional numeric flags with defaults.

```typescript
// src/registry.ts:334-373 (condensed)
async function handleDeepDive(
  positionals: string[],
  values: ParsedValues,
  _opts: CommonOpts
): Promise<void> {
  const ddFile = positionals[1];
  const objectId = values['object-id'];

  // ... validation omitted for brevity ...

  const { deepDiveCLI } = await import('./deepDive.js');
  await deepDiveCLI(ddFile, objectId, {
    maxDepth:           values.depth           ? parseInt(values.depth)           : 2,
    maxChildrenPerLevel: values['max-children'] ? parseInt(values['max-children']) : 5,
    maxNodes:           values['max-nodes']    ? parseInt(values['max-nodes'])    : 100,
    timeBudgetMs:       values['time-budget']  ? parseInt(values['time-budget'])  : 15000,
    outputFormat:       (values['output-format'] as 'tree' | 'json') || 'tree',
    outputFile:         values['output-file']
  });
  process.exit(0);
}
```

### Mutually exclusive inputs: `handleFindLeaks`

Shows branching on either `--snapshot-dir` or `--baseline` + `--target`.

```typescript
// src/registry.ts:500-551 (condensed)
async function handleFindLeaks(
  _positionals: string[],
  values: ParsedValues,
  opts: CommonOpts
): Promise<void> {
  const { runMemlabFindLeaks } = await import('./analyzer.js');

  if (values['snapshot-dir']) {
    await runMemlabFindLeaks({
      snapshotDir: values['snapshot-dir'],
      subprocessTimeout: opts.subprocessTimeout
    });
  } else if (values.baseline && values.target) {
    await runMemlabFindLeaks({
      baseline: values.baseline,
      target:   values.target,
      final:    values.final,
      subprocessTimeout: opts.subprocessTimeout
    });
  } else {
    console.error('❌ Error: find-leaks requires either:');
    console.log('   --snapshot-dir <directory>');
    console.log('   OR --baseline <file> --target <file> [--final <file>]');
    process.exit(1);
  }
}
```

### Dynamic import: lazy loading

Several handlers use `await import('./module.js')` rather than top-level imports. This is intentional: it keeps startup time fast by deferring expensive module loads until the specific command is actually invoked.

```typescript
// Pattern used in handleInspectObject, handleBrowser, handleInvestigate, etc.
const { someFunction } = await import('./someModule.js');
await someFunction(...);
```

---

## Handler Conventions

| Convention | Rationale |
|---|---|
| Validate required inputs first and `process.exit(1)` on error | Fail fast with a clear usage hint |
| Parse numeric flags inline (`parseInt(values.depth)`) | `ParsedValues` types all flags as strings; each handler owns its coercion |
| Use `opts.subprocessTimeout` for any memlab subprocess call | Lets the user impose a global timeout via `--subprocess-timeout` |
| Dynamic `await import(...)` for heavy modules | Keeps CLI startup fast |
| `_positionals` / `_values` prefix on unused params | Standard TypeScript convention for intentionally unused parameters |
| Call `process.exit(0)` explicitly only when the command writes files or spawns long-running processes | Most handlers return naturally; forced exit prevents dangling event-loop handles |

---

## Architecture Diagram

```
heap-analyzer <command> [positional...] [--flags]
        │
        ▼
┌─────────────────────────────────────────────┐
│  src/cli.ts                                 │
│                                             │
│  parseArgs() → { values, positionals }      │
│  resolvedCommand = positionals[0]           │
│    or 'analyze' if --file is set            │
│  opts = { subprocessTimeout }               │
│                                             │
│  commandRegistry[resolvedCommand]           │
│         │                                  │
└─────────┼──────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│  src/registry.ts                            │
│                                             │
│  commandRegistry: Record<string,            │
│                   CommandHandler>           │
│                                             │
│  handleAnalyze   handleCompare              │
│  handleFindLeaks handleTrace                │
│  handleInvestigate handleDeepDive           │
│  handleBrowser   handleMonitor              │
│  ...                                        │
│         │                                  │
└─────────┼──────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│  Domain modules (dynamic imports)           │
│                                             │
│  src/analyzer.ts        analyzeHeapSnapshot │
│  src/monitor.ts         monitorApplication  │
│  src/deepDive.ts        deepDiveCLI         │
│  src/nodeAnalyzer.ts    takeNodeSnapshot    │
│  src/timelineAnalyzer.ts timelineCLI        │
│  src/reportEnricher.ts  enrichReportFromCLI │
│  src/reportGenerator.ts generateMarkdown   │
│  src/memlabObjectInspectorSimple.ts         │
└─────────────────────────────────────────────┘
```

---

## Quick Reference

| Task | Where to edit |
|---|---|
| Add a new command | `src/registry.ts` — add handler + entry in `commandRegistry` |
| Add a new CLI flag | `src/cli.ts` — add to `parseArgs` options; `src/registry.ts` — add to `ParsedValues` |
| Change help text | `src/cli.ts` — the `if (values.help) { console.log(...) }` block |
| Change default snapshot directory | `src/registry.ts` — `const SNAPSHOTS_DIR` constant at line 13 |
| Add a shared cross-cutting option | `src/registry.ts` — extend `CommonOpts`; `src/cli.ts` — extract and pass in `opts` |
