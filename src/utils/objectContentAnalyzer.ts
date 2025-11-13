/**
 * Object Content Analyzer
 * 
 * Inspired by MemLab's ObjectContentAnalysis
 * Provides detailed inspection of specific objects in heap snapshots,
 * including their properties, references, referrers, and relationships.
 */

import { HeapNode, HeapSnapshot, HeapEdge } from '../types';

interface ObjectReference {
  edge: HeapEdge;
  targetNode: HeapNode;
  propertyName: string;
  edgeType: string;
  targetType: string;
  targetSize: number;
}

interface ObjectReferrer {
  edge: HeapEdge;
  sourceNode: HeapNode;
  propertyName: string;
  edgeType: string;
  sourceType: string;
  sourceSize: number;
}

interface ObjectContentInfo {
  node: HeapNode;
  id: number;
  type: string;
  name: string;
  shallowSize: number;
  retainedSize: number;
  referenceCount: number;
  referrerCount: number;
  dominatorNodeId?: number;
  references: ObjectReference[];
  referrers: ObjectReferrer[];
  properties: Record<string, any>;
  isLargeObject: boolean;
  suspiciousPatterns: string[];
  memoryImpact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface ObjectAnalysisResult {
  targetObject: ObjectContentInfo;
  relatedObjects: ObjectContentInfo[];
  retainerChain: HeapNode[];
  dominatorTree: HeapNode[];
  circularReferences: ObjectReference[];
  largeReferences: ObjectReference[];
  summary: string;
  insights: string[];
  recommendations: string[];
}

export class ObjectContentAnalyzer {
  private readonly LARGE_OBJECT_THRESHOLD = 1024 * 1024; // 1MB
  private readonly SUSPICIOUS_PROPERTY_PATTERNS = [
    'detached',
    'zombie',
    'leaked',
    'stale',
    'orphan',
    'dangling'
  ];

  analyzeObject(snapshot: HeapSnapshot, nodeId: number): ObjectAnalysisResult | null {
    const targetNode = snapshot.nodes.find(node => node.id === nodeId);
    if (!targetNode) {
      return null;
    }

    const objectInfo = this.getObjectContentInfo(targetNode, snapshot);
    const relatedObjects = this.getRelatedObjects(targetNode, snapshot);
    const retainerChain = this.buildRetainerChain(targetNode, snapshot);
    const dominatorTree = this.buildDominatorTree(targetNode, snapshot);
    const circularReferences = this.findCircularReferences(targetNode, snapshot);
    const largeReferences = objectInfo.references.filter(ref => 
      ref.targetSize > this.LARGE_OBJECT_THRESHOLD
    );

    return {
      targetObject: objectInfo,
      relatedObjects,
      retainerChain,
      dominatorTree,
      circularReferences,
      largeReferences,
      summary: this.generateSummary(objectInfo),
      insights: this.generateInsights(objectInfo, circularReferences, largeReferences),
      recommendations: this.generateRecommendations(objectInfo, circularReferences)
    };
  }

  private getObjectContentInfo(node: HeapNode, snapshot: HeapSnapshot): ObjectContentInfo {
    const references = this.getObjectReferences(node, snapshot);
    const referrers = this.getObjectReferrers(node, snapshot);
    const properties = this.extractProperties(node, snapshot);
    const suspiciousPatterns = this.detectSuspiciousPatterns(node, references, properties);
    
    return {
      node,
      id: node.id,
      type: node.type,
      name: node.name,
      shallowSize: node.shallowSize || node.selfSize,
      retainedSize: node.retainedSize,
      referenceCount: references.length,
      referrerCount: referrers.length,
      dominatorNodeId: this.findDominatorNode(node, snapshot)?.id,
      references,
      referrers,
      properties,
      isLargeObject: (node.retainedSize || 0) > this.LARGE_OBJECT_THRESHOLD,
      suspiciousPatterns,
      memoryImpact: this.calculateMemoryImpact(node)
    };
  }

  private getObjectReferences(node: HeapNode, snapshot: HeapSnapshot): ObjectReference[] {
    const references: ObjectReference[] = [];
    
    if (!snapshot.edges) return references;

    // Find all edges going FROM this node
    const outgoingEdges = snapshot.edges.filter(edge => edge.fromNode === node.id);
    
    outgoingEdges.forEach(edge => {
      const targetNode = snapshot.nodes.find(n => n.id === edge.toNode);
      if (targetNode) {
        references.push({
          edge,
          targetNode,
          propertyName: edge.name || edge.type,
          edgeType: edge.type,
          targetType: targetNode.type,
          targetSize: targetNode.retainedSize || 0
        });
      }
    });

    return references.sort((a, b) => b.targetSize - a.targetSize);
  }

  private getObjectReferrers(node: HeapNode, snapshot: HeapSnapshot): ObjectReferrer[] {
    const referrers: ObjectReferrer[] = [];
    
    if (!snapshot.edges) return referrers;

    // Find all edges coming TO this node
    const incomingEdges = snapshot.edges.filter(edge => edge.toNode === node.id);
    
    incomingEdges.forEach(edge => {
      const sourceNode = snapshot.nodes.find(n => n.id === edge.fromNode);
      if (sourceNode) {
        referrers.push({
          edge,
          sourceNode,
          propertyName: edge.name || edge.type,
          edgeType: edge.type,
          sourceType: sourceNode.type,
          sourceSize: sourceNode.retainedSize || 0
        });
      }
    });

    return referrers.sort((a, b) => b.sourceSize - a.sourceSize);
  }

  private extractProperties(node: HeapNode, snapshot: HeapSnapshot): Record<string, any> {
    const properties: Record<string, any> = {};
    
    if (!snapshot.edges) return properties;

    // Extract property-like references
    const propertyEdges = snapshot.edges.filter(edge => 
      edge.fromNode === node.id && 
      (edge.type === 'property' || edge.type === 'element')
    );

    propertyEdges.forEach(edge => {
      const targetNode = snapshot.nodes.find(n => n.id === edge.toNode);
      if (targetNode && edge.name) {
        properties[edge.name] = {
          type: targetNode.type,
          name: targetNode.name,
          size: targetNode.retainedSize || 0,
          nodeId: targetNode.id
        };
      }
    });

    return properties;
  }

  private detectSuspiciousPatterns(
    node: HeapNode, 
    references: ObjectReference[], 
    properties: Record<string, any>
  ): string[] {
    const patterns: string[] = [];

    // Check node name for suspicious patterns
    const nodeName = node.name.toLowerCase();
    this.SUSPICIOUS_PROPERTY_PATTERNS.forEach(pattern => {
      if (nodeName.includes(pattern)) {
        patterns.push(`Suspicious node name contains '${pattern}'`);
      }
    });

    // Check for detached DOM references
    const domReferences = references.filter(ref => 
      ref.targetType.includes('HTML') || 
      ref.targetType.includes('Element') ||
      ref.targetType.includes('Node')
    );
    if (domReferences.length > 0) {
      patterns.push(`Contains ${domReferences.length} DOM element references`);
    }

    // Check for large circular reference chains
    const circularRefs = this.findCircularReferences(node, { nodes: [node], edges: [] });
    if (circularRefs.length > 0) {
      patterns.push(`Involved in ${circularRefs.length} circular references`);
    }

    // Check for excessive references
    if (references.length > 100) {
      patterns.push(`Excessive references: ${references.length} outgoing edges`);
    }

    // Check property names for suspicious patterns
    Object.keys(properties).forEach(propName => {
      this.SUSPICIOUS_PROPERTY_PATTERNS.forEach(pattern => {
        if (propName.toLowerCase().includes(pattern)) {
          patterns.push(`Suspicious property name: '${propName}'`);
        }
      });
    });

    return patterns;
  }

  private calculateMemoryImpact(node: HeapNode): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const size = node.retainedSize || 0;
    
    if (size > 10 * 1024 * 1024) return 'CRITICAL'; // >10MB
    if (size > 5 * 1024 * 1024) return 'HIGH';      // >5MB
    if (size > 1024 * 1024) return 'MEDIUM';        // >1MB
    return 'LOW';
  }

  private getRelatedObjects(node: HeapNode, snapshot: HeapSnapshot): ObjectContentInfo[] {
    const related: HeapNode[] = [];
    const maxRelated = 10;

    // Get immediate references (children)
    const references = this.getObjectReferences(node, snapshot);
    references.slice(0, 5).forEach(ref => {
      related.push(ref.targetNode);
    });

    // Get immediate referrers (parents)
    const referrers = this.getObjectReferrers(node, snapshot);
    referrers.slice(0, 5).forEach(ref => {
      if (!related.find(n => n.id === ref.sourceNode.id)) {
        related.push(ref.sourceNode);
      }
    });

    return related.slice(0, maxRelated).map(relatedNode => 
      this.getObjectContentInfo(relatedNode, snapshot)
    );
  }

  private buildRetainerChain(node: HeapNode, snapshot: HeapSnapshot): HeapNode[] {
    const chain: HeapNode[] = [];
    let currentNode = node;
    const visited = new Set<number>();
    const maxDepth = 15;

    while (chain.length < maxDepth && !visited.has(currentNode.id)) {
      visited.add(currentNode.id);
      chain.push(currentNode);

      // Find the largest retainer
      const referrers = this.getObjectReferrers(currentNode, snapshot);
      if (referrers.length === 0) break;

      const largestReferrer = referrers.reduce((largest, current) => 
        current.sourceSize > largest.sourceSize ? current : largest
      );

      currentNode = largestReferrer.sourceNode;
    }

    return chain;
  }

  private buildDominatorTree(node: HeapNode, snapshot: HeapSnapshot): HeapNode[] {
    const tree: HeapNode[] = [];
    let currentNode = node;
    const visited = new Set<number>();
    const maxDepth = 10;

    while (tree.length < maxDepth && !visited.has(currentNode.id)) {
      visited.add(currentNode.id);
      tree.push(currentNode);

      const dominatorNode = this.findDominatorNode(currentNode, snapshot);
      if (!dominatorNode) break;
      
      currentNode = dominatorNode;
    }

    return tree;
  }

  private findDominatorNode(node: HeapNode, snapshot: HeapSnapshot): HeapNode | null {
    // Simplified dominator logic - find the node that retains this node
    const referrers = this.getObjectReferrers(node, snapshot);
    
    // Look for strong references that likely dominate this node
    const strongReferrers = referrers.filter(ref => 
      ref.edgeType === 'property' || 
      ref.edgeType === 'element' ||
      ref.edgeType === 'internal'
    );

    if (strongReferrers.length > 0) {
      // Return the largest strong referrer as likely dominator
      return strongReferrers.reduce((largest, current) => 
        current.sourceSize > largest.sourceSize ? current : largest
      ).sourceNode;
    }

    return null;
  }

  private findCircularReferences(node: HeapNode, snapshot: HeapSnapshot): ObjectReference[] {
    const circular: ObjectReference[] = [];
    const visited = new Set<number>();
    const path = new Set<number>();

    const dfs = (currentNode: HeapNode, depth: number) => {
      if (depth > 10) return; // Limit recursion depth
      if (visited.has(currentNode.id)) return;
      if (path.has(currentNode.id)) {
        // Found a cycle - mark all references in this path as circular
        return;
      }

      path.add(currentNode.id);
      const references = this.getObjectReferences(currentNode, snapshot);
      
      references.forEach(ref => {
        if (path.has(ref.targetNode.id)) {
          circular.push(ref);
        } else {
          dfs(ref.targetNode, depth + 1);
        }
      });
      
      path.delete(currentNode.id);
      visited.add(currentNode.id);
    };

    dfs(node, 0);
    return circular;
  }

  private generateSummary(objectInfo: ObjectContentInfo): string {
    const impact = objectInfo.memoryImpact;
    const size = this.formatBytes(objectInfo.retainedSize);
    const type = objectInfo.type;
    const name = objectInfo.name;

    const impactEmoji = {
      'CRITICAL': '🔥',
      'HIGH': '🔴', 
      'MEDIUM': '🟡',
      'LOW': '🟢'
    }[impact];

    return `${impactEmoji} ${type} "${name}" (${size}) - ${objectInfo.referenceCount} refs, ${objectInfo.referrerCount} referrers`;
  }

  private generateInsights(
    objectInfo: ObjectContentInfo, 
    circularRefs: ObjectReference[], 
    largeRefs: ObjectReference[]
  ): string[] {
    const insights: string[] = [];

    if (objectInfo.isLargeObject) {
      insights.push(`🔍 Large object detected (${this.formatBytes(objectInfo.retainedSize)})`);
    }

    if (circularRefs.length > 0) {
      insights.push(`🔄 Involved in ${circularRefs.length} circular reference(s)`);
    }

    if (largeRefs.length > 0) {
      insights.push(`📦 References ${largeRefs.length} large object(s)`);
    }

    if (objectInfo.suspiciousPatterns.length > 0) {
      insights.push(`⚠️ ${objectInfo.suspiciousPatterns.length} suspicious pattern(s) detected`);
    }

    if (objectInfo.referrerCount === 0) {
      insights.push(`🚨 No referrers - potentially leaked object`);
    }

    if (objectInfo.referenceCount > 50) {
      insights.push(`📊 High fan-out: ${objectInfo.referenceCount} references`);
    }

    return insights;
  }

  private generateRecommendations(
    objectInfo: ObjectContentInfo, 
    circularRefs: ObjectReference[]
  ): string[] {
    const recommendations: string[] = [];

    if (objectInfo.memoryImpact === 'CRITICAL' || objectInfo.memoryImpact === 'HIGH') {
      recommendations.push('🚨 High memory impact - investigate for potential leaks');
    }

    if (circularRefs.length > 0) {
      recommendations.push('🔄 Break circular references to prevent memory leaks');
    }

    if (objectInfo.suspiciousPatterns.length > 0) {
      recommendations.push('🔍 Review suspicious patterns in object properties');
    }

    if (objectInfo.referrerCount === 0) {
      recommendations.push('🧹 Orphaned object - verify cleanup logic');
    }

    if (objectInfo.type.includes('HTML') || objectInfo.type.includes('Element')) {
      recommendations.push('🌐 DOM element - ensure proper cleanup on component unmount');
    }

    if (objectInfo.referenceCount > 100) {
      recommendations.push('📊 High reference count - consider object pooling or caching strategies');
    }

    recommendations.push('🔍 Use DevTools to inspect object properties and references');
    recommendations.push('📊 Monitor object lifetime and retention patterns');

    return recommendations;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}