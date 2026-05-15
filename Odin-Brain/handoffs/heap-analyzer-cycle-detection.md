# Heap Analyzer: Circular Reference & Cycle Detection Handoff

**Date:** 2026-05-15
**Repo:** heap-analyzer (branch: heap-analyzer/v0)
**Purpose:** Document circular reference risk points in the reference traversal implementation and propose fixes.

---

## 1. Project Overview

heap-analyzer is a CLI tool for loading, comparing, and investigating V8 `.heapsnapshot` files via the `@memlab/core` library. It provides:

- Snapshot loading and size statistics (`src/analyzer.ts`)
- Memory leak detection by comparing 3 snapshots
- Deep object hierarchy traversal (`src/deepDive.ts`)
- Object inspection via memlab's `analyze object` subcommand (`src/memlabObjectInspectorSimple.ts`)
- Timeline analysis across sequential snapshots (`src/analyzers/timeline.ts`, `src/timelineAnalyzer.ts`)
- Markdown report generation and enrichment

---

## 2. Reference Traversal Implementation

### 2.1 Primary Traversal: `deepDive.ts`

The main recursive traversal lives in `src/deepDive.ts`. Entry point is `deepDiveObject()`, which calls the internal `exploreNode()` function recursively.

```
deepDiveObject()
  └─ exploreNode(snapshotPath, objectId, currentDepth=0, ...)
       └─ fetchMemlabObjectData() → MemlabObjectData { references: [...] }
       └─ for each ref.toNode in references:
            └─ exploreNode(snapshotPath, ref.toNode, currentDepth+1, ...)  ← RECURSIVE CALL
```

**File:** `src/deepDive.ts`
**Key functions:**
- `deepDiveObject()` — line 38: public entry point, sets up budget, calls `exploreNode`
- `exploreNode()` — line 78: recursive workhorse; fetches node data, then recurses into `ref.toNode` children
- `detectCommonPatterns()` — line 192: recursively walks the already-built `DeepDiveNode` tree

### 2.2 Post-Build Recursion: `detectCommonPatterns()`

After the tree is built, `detectCommonPatterns()` in `src/deepDive.ts` (line 192) walks the result tree recursively:

```typescript
function detectCommonPatterns(node: DeepDiveNode): void {
  // ... pattern detection logic ...
  for (const child of node.children) {
    detectCommonPatterns(child);   // ← unbounded recursion on the result tree
  }
}
```

Since the result tree is bounded by `maxDepth`/`maxNodes`, this recursion terminates in practice. However, if the `DeepDiveNode` tree were ever built with cycles (a bug scenario), this would loop infinitely.

### 2.3 `countNodes()` Helper

```typescript
function countNodes(node: DeepDiveNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}
```

Also unbounded — same caveat as `detectCommonPatterns()`.

### 2.4 `printDeepDiveTree()` Output Walk

```typescript
export function printDeepDiveTree(node: DeepDiveNode, indent = 0): void {
  // ...
  for (const child of node.children) {
    printDeepDiveTree(child, indent + 1);
  }
}
```

Same pattern — walks the result tree, safe only if the tree is acyclic.

---

## 3. Circular Reference Risk Points

### Risk 1 — `exploreNode()` has NO visited-set (CRITICAL)

**Location:** `src/deepDive.ts:78–189`

The `exploreNode()` function recurses into children by following `ref.toNode` references fetched from the heap snapshot. Heap snapshots can and do contain cycles — for example:
- An object A holds a property pointing to object B
- Object B holds a back-reference to object A (e.g., `child.parent`, `node.owner`, linked-list back-pointers)

The current budget system provides *some* protection via two soft limits:

| Guard | How it works | Weakness |
|---|---|---|
| `maxDepth` | Stops recursion when `currentDepth >= maxDepth` | Default is 2, so shallow cycles won't loop long, but a cycle at depth 0→1→0→1... would still hit the time budget check before hanging for long |
| `maxNodes` / `budget.visitedRef.value` | Counts total nodes visited, stops at `maxNodes` (default 100) | Counts visits, not unique nodes — same node ID can be visited multiple times, counting toward the budget without preventing revisitation |
| `timeBudgetMs` | Aborts if wall time exceeds budget (default 15 000 ms) | Reactive, not preventive — the process will spin until timeout |

**There is no `visited` set tracking node IDs.** If a cycle exists at depth < `maxDepth` and `maxNodes` haven't been exhausted yet, `exploreNode()` will revisit the same nodes repeatedly in a cycle until either `maxNodes` or `timeBudgetMs` fires.

**Concrete example of a problematic graph:**
```
@100 Object { parent: @101 }
@101 Object { child: @100 }   ← circular back-reference
```

With `maxDepth=5, maxNodes=100`, traversal of `@100` at depth 0 yields `@101` at depth 1, which yields `@100` at depth 2, which yields `@101` at depth 3, etc. — until depth 5 is hit. With more generous settings (depth=10, nodes=500), 500 visits could be spent just thrashing between two nodes.

**Worst case:** `maxDepth=10, maxNodes=1000` → up to 500 round-trips between two cyclically-linked nodes before the node budget fires.

### Risk 2 — `detectCommonPatterns()` on the result tree

**Location:** `src/deepDive.ts:192–224`

This walks the already-built `DeepDiveNode` tree recursively. Because `exploreNode()` builds this tree (not the raw graph), and `DeepDiveNode.children` is a plain array populated by the algorithm, cycles in the *result tree* can only happen if `exploreNode()` incorrectly adds a node as its own ancestor's child. This shouldn't happen with the current depth-bounded algorithm, but if the visited-set fix is implemented incorrectly (e.g., returning an existing node object instead of a sentinel), it could reintroduce cycles here.

### Risk 3 — `countNodes()` and `printDeepDiveTree()` on result tree

**Location:** `src/deepDive.ts:322–324, 239–256`

Same exposure as Risk 2 — safe as long as the result tree is acyclic.

### Risk 4 — `reportEnricher.ts` iterates `data.references`

**Location:** `src/reportEnricher.ts:242–269`

`enhanceObjectSection()` iterates `data.references` and `data.referrers` arrays from the memlab JSON output. These are flat arrays (no recursion), so there is no stack-overflow risk. However, if a consumer were to follow `toNode` IDs recursively in the future, the same cycle problem would apply.

---

## 4. Current Mitigations (and Their Limits)

| Mitigation | File | Effectiveness |
|---|---|---|
| `maxDepth` (default 2) | `deepDive.ts:47,147` | Good for typical use. A cycle at depth 0 still repeats depth/2 times before stopping. |
| `maxNodes` counter | `deepDive.ts:100–111` | Visits are counted, not deduped. Two-node cycle can burn all 100 slots. |
| `timeBudgetMs` (default 15 s) | `deepDive.ts:88–99` | Hard wall-clock stop. Prevents hanging, but wastes time and resources on pathological inputs. |
| Batch processing with `Promise.all` | `deepDive.ts:161–186` | Parallel child fetches — can amplify wasted work if multiple children point back to already-seen ancestors. |

---

## 5. Suggested Fix: Visited Set Pattern

The standard cycle-breaking technique is to maintain a `Set<string>` of already-visited node IDs and skip re-visiting any node that's in the set.

### Where to add it

`exploreNode()` in `src/deepDive.ts` needs a `visited: Set<string>` passed through the recursion (or added to the existing `budget` parameter object).

### Proposed signature change

```typescript
// Add `visited` to the budget object (no new parameter needed)
budget: {
  start: number;
  timeBudgetMs: number;
  maxNodes: number;
  visitedRef: { value: number };
  visited: Set<string>;         // ← ADD THIS
}
```

### Proposed guard at top of `exploreNode()`

```typescript
// After budget checks, before fetching data:
const cleanId = objectId.replace('@', '');

if (budget.visited.has(cleanId)) {
  return {
    nodeId: cleanId,
    name: '🔄 [cycle]',
    type: 'cycle',
    selfSize: 0,
    retainedSize: 0,
    depth: currentDepth,
    children: [],
    summary: `Circular reference — node @${cleanId} already visited`
  };
}
budget.visited.add(cleanId);
```

### Initialization in `deepDiveObject()`

```typescript
const root = await exploreNode(snapshotPath, objectId, 0, maxDepth, maxChildrenPerLevel, options, {
  start: Date.now(),
  timeBudgetMs,
  maxNodes,
  visitedRef: { value: 0 },
  visited: new Set<string>()    // ← initialize empty set
});
```

### Effect on `detectCommonPatterns()` / `printDeepDiveTree()` / `countNodes()`

Once `exploreNode()` emits a `[cycle]` sentinel node instead of recursing, the result tree will be acyclic by construction. The three post-build recursive walkers are then safe with no changes needed. However, they could optionally track their own `visited` set for defense-in-depth:

```typescript
function detectCommonPatterns(node: DeepDiveNode, visited = new Set<string>()): void {
  if (visited.has(node.nodeId)) return;
  visited.add(node.nodeId);
  // ... existing logic ...
  for (const child of node.children) {
    detectCommonPatterns(child, visited);
  }
}
```

---

## 6. Files That Need Modification

| File | Lines | Change Required |
|---|---|---|
| `src/deepDive.ts` | 65–75 | Add `visited: new Set<string>()` to the budget object passed to `exploreNode` |
| `src/deepDive.ts` | 78–88 | Add `visited: Set<string>` to the `budget` parameter type |
| `src/deepDive.ts` | 113–135 | Add cycle guard: check & add `cleanId` to `budget.visited` before fetching data |
| `src/deepDive.ts` | 192 | Optional: add `visited` parameter to `detectCommonPatterns` for defense-in-depth |
| `src/deepDive.ts` | 239 | Optional: add `visited` parameter to `printDeepDiveTree` |
| `src/deepDive.ts` | 322 | Optional: add `visited` parameter to `countNodes` |

No other files require changes for the core fix — `memlabObjectInspectorSimple.ts` and `reportEnricher.ts` do not perform recursive graph traversal.

---

## 7. Test Cases to Add

After implementing the fix, the following test scenarios should be added in `src/__tests__/`:

1. **Direct cycle** — Node A → Node B → Node A. Traversal should return a tree with a `[cycle]` sentinel at depth 2, not hang or throw.
2. **Self-reference** — Node A → Node A. Sentinel should appear at depth 1.
3. **Long chain with late cycle** — A→B→C→D→B. Sentinel should appear when D tries to revisit B.
4. **maxNodes still works** — A graph with 200 unique nodes, `maxNodes=50`. Should stop at 50, returning a `[node-limit]` sentinel (existing behavior).
5. **timeBudgetMs still works** — Ensure the time check still fires for pathologically slow `fetchMemlabObjectData` responses.

---

## 8. Summary

- **The critical vulnerability** is in `src/deepDive.ts:exploreNode()` — no visited-set means cycles in heap snapshot reference graphs can cause repeated traversal of the same nodes, burning through the `maxNodes` budget or spinning until `timeBudgetMs` expires.
- **The fix is surgical**: add a `Set<string>` to the budget object, check it before fetching, add the node ID immediately after the check.
- **No other files** require core changes; post-build walkers (`detectCommonPatterns`, `printDeepDiveTree`, `countNodes`) are protected once the traversal is fixed, though defense-in-depth guards are worth adding.
- **Existing budget guards** (`maxDepth`, `maxNodes`, `timeBudgetMs`) are valuable and should be kept alongside the visited-set fix — they protect against other pathological cases (very wide graphs, very deep trees without cycles).
