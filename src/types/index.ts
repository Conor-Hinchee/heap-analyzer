// Re-export from heap analyzer for type consistency
import { AnalysisResult as HeapAnalysisResult } from '../utils/heapAnalyzer.js';
export type AnalysisResult = HeapAnalysisResult;

export interface SnapshotFile {
  name: string;
  path: string;
  size: number;
  created: Date;
}

export interface HeapNode {
  nodeIndex: number;
  type: string;
  name: string;
  selfSize: number;
  retainedSize: number;
  id: number;
  shallowSize?: number;
}

export interface HeapEdge {
  type: string;
  name?: string;
  fromNode: number;
  toNode: number;
}

export interface HeapSnapshot {
  nodes: HeapNode[];
  edges?: HeapEdge[];
  strings?: string[];
}

export interface RetainerResult {
  node: HeapNode;
  category: string;
  emoji: string;
  retainerPaths: string[][];
  suggestion: string;
}

export interface DetachedDOMNode {
  node: HeapNode;
  isDetached: boolean;
  retainerInfo: string[];
  attributes: Record<string, string>;
  elementType: string;
}

export interface DOMLeakSummary {
  totalDetachedNodes: number;
  detachedNodesByType: Record<string, number>;
  suspiciousPatterns: string[];
  retainerArrays: Array<{
    name: string;
    nodeCount: number;
    retainedNodes: string[];
  }>;
}

export type AppStep = 
  | 'welcome' 
  | 'workflowSelector'
  | 'workflowProgress'
  | 'checkDirectory' 
  | 'promptDirectory' 
  | 'directoryCreated' 
  | 'guideSnapshot'
  | 'ready' 
  | 'analyze'
  | 'snapshotInfo'
  | 'reportGeneration'
  | 'reportCompletion'
  | 'results';

export interface MenuOption {
  label: string;
  value: string;
  description?: string;
}

export interface AgentAnalysisReport {
  timestamp: string;
  snapshotPath: string;
  analysis: AnalysisResult;
  comprehensiveAnalysis?: any; // ComparisonResult from beforeAfterAnalyzer
  frameworkInfo?: any; // FrameworkDetectionResult
  traceResults?: {
    totalLikelyLeaks: number;
    highConfidenceLeaks: number;
    totalRetainedByLeaks: number;
    leakCategories: Record<string, number>;
  };
  distributedAnalysis?: {
    suspiciousPatterns: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      recommendation: string;
    }>;
    distributedMemory: {
      timerRelatedMemory: number;
      closureMemory: number;
      arrayMemory: number;
      fragmentedMemory: number;
    };
  };
  specializedInsights: {
    reactInsights: string[];
    fiberInsights: string[];
    stringInsights: string[];
    shapeInsights: string[];
    domInsights: string[];
  };
  prioritizedRecommendations: Array<{
    priority: number;
    impact: string;
    description: string;
    confidence: number;
    category: string;
  }>;
  insights: string[];
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}
