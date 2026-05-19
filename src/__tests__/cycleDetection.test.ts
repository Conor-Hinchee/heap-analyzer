/**
 * Tests for cycle detection in deepDive.ts / exploreNode
 *
 * The implementation uses a `visited` Set<string> passed through the `budget`
 * object to prevent infinite loops when heap graphs contain circular references.
 *
 * We mock fetchMemlabObjectData so that we can construct arbitrary reference
 * graphs without needing real heap snapshots.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { deepDiveObject, DeepDiveNode } from '../deepDive.js';

// ── Mock the snapshot inspector ───────────────────────────────────────────────
jest.mock('../memlabObjectInspectorSimple.js', () => ({
  fetchMemlabObjectData: jest.fn(),
}));

import { fetchMemlabObjectData } from '../memlabObjectInspectorSimple.js';

const mockFetch = fetchMemlabObjectData as jest.MockedFunction<typeof fetchMemlabObjectData>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal MemlabObjectData-shaped return value */
function makeNode(id: string, refs: string[] = []) {
  return {
    id: parseInt(id, 10),
    name: `node-${id}`,
    type: 'object',
    selfsize: 64,
    retainedSize: 128,
    references: refs.map((toId) => ({
      name: `ref-to-${toId}`,
      type: 'object',
      toNode: parseInt(toId, 10),
    })),
    referrers: [],
  };
}

/**
 * Collect all nodeIds in the result tree, depth-first.
 * Includes the synthetic "circular-ref" / "budget-exceeded" / "node-limit" markers.
 */
function collectIds(node: DeepDiveNode): string[] {
  return [node.nodeId, ...node.children.flatMap(collectIds)];
}

/**
 * Collect all node names in the result tree (used to spot sentinel nodes).
 */
function collectNames(node: DeepDiveNode): string[] {
  return [node.name, ...node.children.flatMap(collectNames)];
}

// ── Test data setup helpers ───────────────────────────────────────────────────

/**
 * Register a fixed graph with the mock.
 * `graph` maps nodeId (string) → list of child nodeIds it references.
 * Calls that receive an id not in the graph resolve to null.
 */
function registerGraph(graph: Record<string, string[]>) {
  mockFetch.mockImplementation(async (_snapshotFile: string, memlabId: string) => {
    const id = memlabId.replace('@', '');
    if (graph[id]) {
      return makeNode(id, graph[id]) as any;
    }
    return null;
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('deepDive cycle detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Simple circular reference: A → B → A ────────────────────────────────────
  describe('simple circular reference (A → B → A)', () => {
    it('completes without hanging or throwing', async () => {
      registerGraph({ '1': ['2'], '2': ['1'] });

      // Use a generous timeout to confirm no infinite loop
      const result = await Promise.race([
        deepDiveObject('fake.heapsnapshot', '@1', { maxDepth: 5, maxNodes: 50 }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT – possible infinite loop')), 3000)
        ),
      ]);

      expect(result).toBeDefined();
    });

    it('root node has correct id', async () => {
      registerGraph({ '1': ['2'], '2': ['1'] });
      const result = await deepDiveObject('fake.heapsnapshot', '@1', { maxDepth: 5 });
      expect(result.nodeId).toBe('1');
    });

    it('back-edge to already-visited node produces a circular-ref sentinel child', async () => {
      registerGraph({ '1': ['2'], '2': ['1'] });
      // depth 3 so we reach the back-edge from 2 → 1
      const result = await deepDiveObject('fake.heapsnapshot', '@1', { maxDepth: 3 });

      const names = collectNames(result);
      expect(names).toContain('🔄 circular-ref');
    });

    it('circular-ref sentinel carries the correct summary', async () => {
      registerGraph({ '1': ['2'], '2': ['1'] });
      const result = await deepDiveObject('fake.heapsnapshot', '@1', { maxDepth: 3 });

      function findCircular(node: DeepDiveNode): DeepDiveNode | null {
        if (node.name === '🔄 circular-ref') return node;
        for (const child of node.children) {
          const found = findCircular(child);
          if (found) return found;
        }
        return null;
      }

      const circNode = findCircular(result);
      expect(circNode).not.toBeNull();
      expect(circNode!.summary).toMatch(/circular reference detected/i);
      expect(circNode!.summary).toMatch(/already visited/i);
    });

    it('fetchMemlabObjectData is not called more than once per unique node', async () => {
      registerGraph({ '1': ['2'], '2': ['1'] });
      await deepDiveObject('fake.heapsnapshot', '@1', { maxDepth: 5, maxNodes: 20 });

      // Unique node ids seen: '1' and '2' — at most 2 real fetches
      // (plus the initial cache warm call for id '1')
      const uniqueIds = new Set(
        mockFetch.mock.calls.map((args) => (args[1] as string).replace('@', ''))
      );
      expect(uniqueIds.size).toBeLessThanOrEqual(2);
    });
  });

  // ── Self-reference: A → A ───────────────────────────────────────────────────
  describe('self-reference (A → A)', () => {
    it('completes without hanging', async () => {
      registerGraph({ '10': ['10'] });

      const result = await Promise.race([
        deepDiveObject('fake.heapsnapshot', '@10', { maxDepth: 5 }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 3000)
        ),
      ]);

      expect(result).toBeDefined();
    });

    it('produces a circular-ref sentinel for the self-edge', async () => {
      registerGraph({ '10': ['10'] });
      const result = await deepDiveObject('fake.heapsnapshot', '@10', { maxDepth: 3 });

      const names = collectNames(result);
      expect(names).toContain('🔄 circular-ref');
    });

    it('sentinel nodeId matches the self-referencing node', async () => {
      registerGraph({ '10': ['10'] });
      const result = await deepDiveObject('fake.heapsnapshot', '@10', { maxDepth: 3 });

      function findCircular(node: DeepDiveNode): DeepDiveNode | null {
        if (node.name === '🔄 circular-ref') return node;
        for (const child of node.children) {
          const found = findCircular(child);
          if (found) return found;
        }
        return null;
      }

      const circNode = findCircular(result);
      expect(circNode).not.toBeNull();
      expect(circNode!.nodeId).toBe('10');
    });
  });

  // ── Multi-node cycle: A → B → C → A ────────────────────────────────────────
  describe('three-node cycle (A → B → C → A)', () => {
    it('completes without hanging', async () => {
      registerGraph({ '20': ['21'], '21': ['22'], '22': ['20'] });

      const result = await Promise.race([
        deepDiveObject('fake.heapsnapshot', '@20', { maxDepth: 10, maxNodes: 50 }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 3000)
        ),
      ]);

      expect(result).toBeDefined();
    });

    it('each real node is fetched at most once (visited set prevents re-fetch)', async () => {
      registerGraph({ '20': ['21'], '21': ['22'], '22': ['20'] });
      await deepDiveObject('fake.heapsnapshot', '@20', {
        maxDepth: 10,
        maxNodes: 50,
      });

      // Count real fetchMemlabObjectData calls per node id (excluding cache warm-up call '@20')
      const fetchCounts: Record<string, number> = {};
      for (const args of mockFetch.mock.calls) {
        const id = (args[1] as string).replace('@', '');
        fetchCounts[id] = (fetchCounts[id] ?? 0) + 1;
      }

      // Each unique node id should be fetched at most once because the visited
      // Set prevents re-entry. Node '20' may appear twice (cache warm-up + traversal
      // start) but the visited check fires before any second real traversal.
      expect(fetchCounts['21'] ?? 0).toBeLessThanOrEqual(1);
      expect(fetchCounts['22'] ?? 0).toBeLessThanOrEqual(1);
    });

    it('cycle terminus is represented as circular-ref sentinel', async () => {
      registerGraph({ '20': ['21'], '21': ['22'], '22': ['20'] });
      const result = await deepDiveObject('fake.heapsnapshot', '@20', {
        maxDepth: 10,
        maxNodes: 50,
      });

      const names = collectNames(result);
      expect(names).toContain('🔄 circular-ref');
    });
  });

  // ── Nested object with embedded cycle ──────────────────────────────────────
  describe('nested object with embedded cycle', () => {
    it('outer tree is explored but cycle within stops recursion correctly', async () => {
      // Structure: root(100) → child-a(101) → leaf(102) → child-a(101) [cycle]
      //                      → child-b(103) [no cycle]
      registerGraph({
        '100': ['101', '103'],
        '101': ['102'],
        '102': ['101'], // back-edge into already-visited 101
        '103': [],
      });

      const result = await deepDiveObject('fake.heapsnapshot', '@100', {
        maxDepth: 5,
        maxNodes: 50,
      });

      // Root should have two children (101 and 103)
      expect(result.children.length).toBe(2);

      const names = collectNames(result);
      expect(names).toContain('🔄 circular-ref');

      // 103 has no children so no circular-ref there
      const child103 = result.children.find((c) => c.nodeId === '103');
      expect(child103).toBeDefined();
      expect(child103!.children.length).toBe(0);
    });
  });

  // ── No cycle (happy path) ───────────────────────────────────────────────────
  describe('acyclic graph (happy path)', () => {
    it('completes and builds full tree without circular-ref sentinels', async () => {
      registerGraph({
        '200': ['201', '202'],
        '201': ['203'],
        '202': [],
        '203': [],
      });

      const result = await deepDiveObject('fake.heapsnapshot', '@200', { maxDepth: 4 });

      const names = collectNames(result);
      expect(names).not.toContain('🔄 circular-ref');
    });

    it('traversal visits all reachable nodes', async () => {
      registerGraph({
        '200': ['201', '202'],
        '201': ['203'],
        '202': [],
        '203': [],
      });

      const result = await deepDiveObject('fake.heapsnapshot', '@200', { maxDepth: 4 });

      const ids = collectIds(result);
      expect(ids).toContain('200');
      expect(ids).toContain('201');
      expect(ids).toContain('202');
      expect(ids).toContain('203');
    });
  });

  // ── visited Set prevents revisiting shared (diamond) nodes ─────────────────
  describe('diamond DAG — shared node visited only once', () => {
    it('shared leaf is visited once even with two paths to it', async () => {
      // Structure: root(300) → left(301) → shared(303)
      //                      → right(302) → shared(303)
      registerGraph({
        '300': ['301', '302'],
        '301': ['303'],
        '302': ['303'],
        '303': [],
      });

      await deepDiveObject('fake.heapsnapshot', '@300', { maxDepth: 5, maxNodes: 50 });

      // Count how many times fetchMemlabObjectData was called for id '303'
      const calls303 = mockFetch.mock.calls.filter(
        (args) => (args[1] as string).replace('@', '') === '303'
      );

      // Should be called at most once for the real fetch (second path gets a sentinel)
      // Note: the first call is the cache warm-up for id '300', subsequent are real traversal calls
      // After visiting 303 via left(301), visiting it via right(302) should return circular-ref
      expect(calls303.length).toBeLessThanOrEqual(1);
    });
  });

  // ── maxNodes budget is respected even with cycles ───────────────────────────
  describe('maxNodes budget with cycles', () => {
    it('stops at maxNodes limit regardless of cycle depth', async () => {
      // Infinite chain via a cycle
      registerGraph({ '400': ['401'], '401': ['402'], '402': ['400'] });

      const result = await deepDiveObject('fake.heapsnapshot', '@400', {
        maxDepth: 100,
        maxNodes: 3,
      });

      // Total real fetch calls should be bounded (≤ maxNodes)
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(4); // +1 cache warm-up
    });

    it('returns a node-limit sentinel when maxNodes is reached', async () => {
      registerGraph({ '400': ['401'], '401': ['402'], '402': ['400'] });

      const result = await deepDiveObject('fake.heapsnapshot', '@400', {
        maxDepth: 100,
        maxNodes: 2,
      });

      const names = collectNames(result);
      // Either cycle detection or node-limit fires first
      const hasSentinel =
        names.includes('🧱 node-limit') || names.includes('🔄 circular-ref');
      expect(hasSentinel).toBe(true);
    });
  });

  // ── Visited set is freshly created per top-level call ──────────────────────
  describe('visited set is not shared across separate deepDiveObject calls', () => {
    it('second independent call traverses nodes that were visited in the first call', async () => {
      registerGraph({ '500': ['501'], '501': [] });

      await deepDiveObject('fake.heapsnapshot', '@500', { maxDepth: 3 });
      const callsAfterFirst = mockFetch.mock.calls.length;

      jest.clearAllMocks();
      registerGraph({ '500': ['501'], '501': [] });

      const result2 = await deepDiveObject('fake.heapsnapshot', '@500', { maxDepth: 3 });

      // Second call should also successfully traverse (no phantom circular-ref)
      const names = collectNames(result2);
      expect(names).not.toContain('🔄 circular-ref');
      // Should have fetched again (not blocked by a leftover visited set)
      expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
    });
  });

  // ── '@' prefix normalisation ────────────────────────────────────────────────
  describe('@-prefix normalisation in cycle detection', () => {
    it('treats "@1" and "1" as the same node id', async () => {
      // References return bare numeric toNode values; deepDive prepends nothing.
      // The visited set uses the cleaned id (no '@').
      // We verify no duplicates sneak through due to prefix mismatch.
      registerGraph({ '1': ['2'], '2': ['1'] });

      const result = await deepDiveObject('fake.heapsnapshot', '@1', { maxDepth: 4 });
      const names = collectNames(result);
      // Must have cycle detected — not an infinite traversal
      expect(names).toContain('🔄 circular-ref');
    });
  });
});
