/**
 * Deep Dive Analysis - Automatically explore object hierarchies
 * 
 * This module recursively inspects objects and their children to build
 * a comprehensive understanding of data structures in heap snapshots.
 */

import { fetchMemlabObjectData } from './memlabObjectInspectorSimple.js';

// Global cache for parsed snapshots to avoid re-parsing on every object inspection
const snapshotCache = new Map<string, any>();

export interface DeepDiveOptions {
  maxDepth?: number;           // How many levels deep to go (default: 2)
  maxChildrenPerLevel?: number; // How many children to inspect per level (default: 5)
  followArrays?: boolean;      // Automatically expand arrays (default: true)
  followObjects?: boolean;     // Automatically expand objects (default: true)
  showPrimitives?: boolean;    // Show primitive values (numbers, strings) (default: true)
  detectPatterns?: boolean;    // Try to detect common patterns (IDs, React, etc) (default: true)
  maxNodes?: number;           // Hard cap on total nodes to inspect (default: 100)
  timeBudgetMs?: number;       // Abort if analysis exceeds this time (default: 15000ms)
  outputFormat?: 'tree' | 'json'; // Output format (default: 'tree')
  outputFile?: string;         // Optional file path for JSON output
}

export interface DeepDiveNode {
  nodeId: string;
  name: string;
  type: string;
  selfSize: number;
  retainedSize: number;
  depth: number;
  children: DeepDiveNode[];
  pattern?: string;            // Detected pattern: "array-of-numbers", "product-ids", etc
  summary?: string;            // Human-readable summary
}

export async function deepDiveObject(
  snapshotPath: string,
  objectId: string,
  options: DeepDiveOptions = {}
): Promise<DeepDiveNode> {
  const {
    maxDepth = 2,
    maxChildrenPerLevel = 5,
    followArrays = true,
    followObjects = true,
    showPrimitives = true,
    detectPatterns = true,
    maxNodes = 100,
    timeBudgetMs = 15000
  } = options;

  console.log(`🔍 Starting deep dive analysis for ${objectId}`);
  console.log(`📊 Settings: depth=${maxDepth}, children=${maxChildrenPerLevel}, maxNodes=${maxNodes}, timeBudgetMs=${timeBudgetMs}`);
  
  // Pre-warm the cache with one parse
  if (!snapshotCache.has(snapshotPath)) {
    console.log('🔥 Warming up snapshot cache (one-time parse)...');
    await fetchMemlabObjectData(snapshotPath, objectId);
    snapshotCache.set(snapshotPath, true);
    console.log('✅ Cache warmed - subsequent inspections will be fast!');
  }
  
  const root = await exploreNode(snapshotPath, objectId, 0, maxDepth, maxChildrenPerLevel, {
    followArrays,
    followObjects,
    showPrimitives
  }, { start: Date.now(), timeBudgetMs, maxNodes, visitedRef: { value: 0 } });

  if (detectPatterns) {
    detectCommonPatterns(root);
  }

  return root;
}

async function exploreNode(
  snapshotPath: string,
  objectId: string,
  currentDepth: number,
  maxDepth: number,
  maxChildren: number,
  options: { followArrays: boolean; followObjects: boolean; showPrimitives: boolean },
  budget: { start: number; timeBudgetMs: number; maxNodes: number; visitedRef: { value: number } }
): Promise<DeepDiveNode> {
  // Budget checks
  if (Date.now() - budget.start > budget.timeBudgetMs) {
    return {
      nodeId: objectId.replace('@', ''),
      name: '⏱️ budget-exceeded',
      type: 'info',
      selfSize: 0,
      retainedSize: 0,
      depth: currentDepth,
      children: [],
      summary: `Stopped due to time budget (${budget.timeBudgetMs}ms)`
    };
  }
  if (budget.visitedRef.value >= budget.maxNodes) {
    return {
      nodeId: objectId.replace('@', ''),
      name: '🧱 node-limit',
      type: 'info',
      selfSize: 0,
      retainedSize: 0,
      depth: currentDepth,
      children: [],
      summary: `Stopped after visiting ${budget.visitedRef.value} nodes (limit ${budget.maxNodes})`
    };
  }
  budget.visitedRef.value += 1;
  
    // Fetch object data (now uses caching internally)
  const cleanId = objectId.replace('@', '');
  
    // Show progress only at depth 0 and 1 to avoid spam
    if (currentDepth <= 1) {
      console.log(`${'  '.repeat(currentDepth)}├─ Inspecting @${cleanId} (depth ${currentDepth})`);
    }
  
  const data = await fetchMemlabObjectData(snapshotPath, `@${cleanId}`);
  
  if (!data) {
    return {
      nodeId: cleanId,
      name: 'unknown',
      type: 'unknown',
      selfSize: 0,
      retainedSize: 0,
      depth: currentDepth,
      children: []
    };
  }

  const node: DeepDiveNode = {
    nodeId: cleanId,
    name: data.name,
    type: data.type,
    selfSize: data.selfsize || 0,
    retainedSize: data.retainedSize || 0,
    depth: currentDepth,
    children: []
  };

  // Stop if we've reached max depth
  if (currentDepth >= maxDepth) {
    return node;
  }

  // Stop if it's a primitive and we're not showing them
  if (isPrimitive(data.type) && !options.showPrimitives) {
    return node;
  }

  // Explore children (references)
  const references = data.references || [];
  const childrenToExplore = references.slice(0, maxChildren);

    // Process children in batches for better performance
    const batchSize = 5;
    for (let i = 0; i < childrenToExplore.length; i += batchSize) {
      const batch = childrenToExplore.slice(i, i + batchSize);
    
      const childPromises = batch.map(async (ref) => {
        const shouldFollow = 
          (options.followArrays && isArrayType(data.type)) ||
          (options.followObjects && isObjectType(data.type));

        if (shouldFollow && ref.toNode) {
          return await exploreNode(
            snapshotPath,
            String(ref.toNode),
            currentDepth + 1,
            maxDepth,
            maxChildren,
            options,
            budget
          );
        }
        return null;
      });
    
      // Process batch in parallel
      const batchResults = await Promise.all(childPromises);
      node.children.push(...batchResults.filter(n => n !== null) as DeepDiveNode[]);
    }

  return node;
}

function detectCommonPatterns(node: DeepDiveNode): void {
  // Detect array of numbers
  if (node.type === 'object' && node.name === 'Array') {
    const childTypes = node.children.map(c => c.type);
    const allNumbers = childTypes.every(t => t === 'number');
    const allArrays = childTypes.every(t => t === 'object' || t === 'array');
    
    if (allNumbers && node.children.length > 5) {
      node.pattern = 'array-of-numbers';
      node.summary = `Array of ${node.children.length} numbers (likely IDs or indices)`;
    } else if (allArrays && node.children.length > 10) {
      node.pattern = 'array-of-arrays';
      node.summary = `Array of ${node.children.length} arrays (matrix/grid structure)`;
    }
  }

  // Detect object with product-like properties
  const propNames = node.children.map(c => c.name.toLowerCase());
  if (propNames.some(p => p.includes('product') || p.includes('sku') || p.includes('price'))) {
    node.pattern = 'product-object';
    node.summary = 'Likely a product/catalog object';
  }

  // Detect React structures
  if (node.name.includes('Fiber') || propNames.includes('memoizedstate')) {
    node.pattern = 'react-fiber';
    node.summary = 'React Fiber node (internal React state)';
  }

  // Recurse into children
  for (const child of node.children) {
    detectCommonPatterns(child);
  }
}

function isPrimitive(type: string): boolean {
  return ['number', 'string', 'boolean', 'symbol', 'bigint'].includes(type);
}

function isArrayType(type: string): boolean {
  return type === 'object' || type === 'array';
}

function isObjectType(type: string): boolean {
  return type === 'object';
}

export function printDeepDiveTree(node: DeepDiveNode, indent = 0): void {
  const prefix = '  '.repeat(indent);
  const sizeStr = formatBytes(node.retainedSize);
  const patternStr = node.pattern ? ` [${node.pattern}]` : '';
  
  console.log(`${prefix}├─ ${node.name} (@${node.nodeId}) ${sizeStr}${patternStr}`);
  
  if (node.summary) {
    console.log(`${prefix}│  💡 ${node.summary}`);
  }

  if (node.children.length > 0) {
    console.log(`${prefix}│  └─ ${node.children.length} children:`);
    for (const child of node.children) {
      printDeepDiveTree(child, indent + 1);
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// CLI Integration
export async function deepDiveCLI(snapshotPath: string, objectId: string, options: DeepDiveOptions = {}): Promise<void> {
  console.log('\n🔬 Deep Dive Analysis\n');
  
  const startTime = Date.now();
  const tree = await deepDiveObject(snapshotPath, objectId, options);
  const duration = Date.now() - startTime;
  
  const nodeCount = countNodes(tree);
  
  // Handle JSON output
  if (options.outputFormat === 'json') {
    const jsonResult = {
      metadata: {
        snapshotPath,
        objectId,
        timestamp: new Date().toISOString(),
        duration,
        nodeCount,
        options: {
          maxDepth: options.maxDepth || 2,
          maxChildrenPerLevel: options.maxChildrenPerLevel || 5,
          maxNodes: options.maxNodes || 100,
          timeBudgetMs: options.timeBudgetMs || 15000
        }
      },
      tree
    };
    
    if (options.outputFile) {
      const fs = await import('node:fs');
      const path = await import('node:path');
      
      // Ensure directory exists
      const dir = path.default.dirname(options.outputFile);
      if (!fs.default.existsSync(dir)) {
        fs.default.mkdirSync(dir, { recursive: true });
      }
      
      fs.default.writeFileSync(options.outputFile, JSON.stringify(jsonResult, null, 2));
      console.log(`✅ Deep dive complete! JSON saved to: ${options.outputFile}`);
    } else {
      console.log(JSON.stringify(jsonResult, null, 2));
    }
    
    console.log(`\n💡 Inspected ${nodeCount} objects in ${(duration / 1000).toFixed(2)}s`);
    return;
  }
  
  // Default tree output
  console.log('\n📊 Results:\n');
  printDeepDiveTree(tree);
  
  console.log('\n✅ Deep dive complete!');
  console.log(`\n💡 Inspected ${nodeCount} objects across ${options.maxDepth || 2} levels in ${(duration / 1000).toFixed(2)}s`);
  console.log(`⚡ Performance: ${(nodeCount / (duration / 1000)).toFixed(1)} objects/sec (with caching)`);
}

function countNodes(node: DeepDiveNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}
