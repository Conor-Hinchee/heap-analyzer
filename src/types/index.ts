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

export interface AnalysisResult {
  topRetainers: RetainerResult[];
  detachedDOMNodes: DetachedDOMNode[];
  domLeakSummary: DOMLeakSummary;
  summary: {
    totalObjects: number;
    totalRetainedSize: number;
    categories: Record<string, number>;
  };
  // Legacy properties for backward compatibility
  leaks?: {
    type: string;
    description: string;
    suggestions: string[];
  }[];
}

export type AppStep = 
  | 'welcome' 
  | 'checkDirectory' 
  | 'promptDirectory' 
  | 'directoryCreated' 
  | 'guideSnapshot'
  | 'ready' 
  | 'analyze'
  | 'singleAnalysis'
  | 'snapshotInfo'
  | 'reportGeneration'
  | 'reportCompletion'
  | 'results';

export interface MenuOption {
  label: string;
  value: string;
  description?: string;
}
