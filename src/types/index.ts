export interface SnapshotFile {
  name: string;
  path: string;
  size: number;
  created: Date;
}

export interface AnalysisResult {
  summary: {
    totalObjects: number;
    totalSize: number;
    topConstructors: string[];
  };
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
  | 'results';

export interface MenuOption {
  label: string;
  value: string;
  description?: string;
}
