import { HeapNode, AnalysisResult } from './heapAnalyzer.js';
import { FrameworkDetectionResult } from './frameworkDetector.js';

export type UserSkillLevel = 'beginner' | 'intermediate' | 'expert';
export type WorkflowType = 'first_time' | 'memory_investigation' | 'performance_audit' | 'ci_integration' | 'team_training';
export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'failed';

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  estimatedTime: number; // in minutes
  prerequisites: string[];
  status: StepStatus;
  component: string; // React component name
  helpContent?: HelpContent;
  validationRules?: ValidationRule[];
  autoAdvanceConditions?: AutoAdvanceCondition[];
}

export interface HelpContent {
  quickTip: string;
  detailedExplanation: string;
  examples: string[];
  commonPitfalls: string[];
  externalResources?: ExternalResource[];
}

export interface ExternalResource {
  title: string;
  url: string;
  type: 'documentation' | 'tutorial' | 'video' | 'article';
  difficulty: UserSkillLevel;
}

export interface ValidationRule {
  id: string;
  check: (context: WorkflowContext) => boolean;
  errorMessage: string;
  autoFix?: () => Promise<void>;
}

export interface AutoAdvanceCondition {
  condition: (context: WorkflowContext) => boolean;
  nextStepId: string;
  message: string;
}

export interface WorkflowContext {
  userSkillLevel: UserSkillLevel;
  detectedFrameworks: FrameworkDetectionResult | null;
  projectStructure: ProjectStructure;
  snapshotFiles: SnapshotFileInfo[];
  analysisHistory: AnalysisResult[];
  userPreferences: UserPreferences;
  sessionData: SessionData;
}

export interface ProjectStructure {
  hasPackageJson: boolean;
  framework: string | null;
  buildTool: string | null;
  testFramework: string | null;
  linting: boolean;
  typescript: boolean;
  monorepo: boolean;
}

export interface SnapshotFileInfo {
  name: string;
  path: string;
  size: number;
  createdAt: Date;
  type: 'before' | 'after' | 'baseline' | 'unknown';
  analyzed: boolean;
}

export interface UserPreferences {
  verboseOutput: boolean;
  autoAdvance: boolean;
  skipTutorials: boolean;
  preferredReportFormat: 'json' | 'markdown' | 'interactive';
  notificationPreferences: NotificationPreference[];
}

export interface NotificationPreference {
  type: 'completion' | 'error' | 'warning' | 'tip';
  method: 'console' | 'desktop' | 'none';
  threshold: 'low' | 'medium' | 'high';
}

export interface SessionData {
  startTime: Date;
  currentWorkflow: string;
  completedSteps: string[];
  bookmarks: string[];
  notes: string[];
}

export interface SmartRecommendation {
  id: string;
  type: 'next_step' | 'optimization' | 'learning' | 'troubleshooting';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  actionable: boolean;
  estimatedImpact: 'low' | 'medium' | 'high';
  autoImplementable: boolean;
  learnMoreUrl?: string;
}

export interface GuidedWorkflow {
  id: string;
  name: string;
  description: string;
  targetAudience: UserSkillLevel[];
  estimatedDuration: number; // in minutes
  steps: WorkflowStep[];
  currentStepIndex: number;
  context: WorkflowContext;
  recommendations: SmartRecommendation[];
  progress: WorkflowProgress;
}

export interface WorkflowProgress {
  totalSteps: number;
  completedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  estimatedTimeRemaining: number;
  completionPercentage: number;
}

/**
 * Advanced Workflow Orchestration Engine for Phase 3
 * Provides intelligent, context-aware guidance through memory analysis workflows
 */
export class WorkflowOrchestrator {
  private availableWorkflows: Map<string, GuidedWorkflow> = new Map();
  private currentWorkflow: GuidedWorkflow | null = null;
  private context: WorkflowContext;

  constructor(initialContext?: Partial<WorkflowContext>) {
    this.context = this.initializeContext(initialContext);
    this.initializeWorkflows();
  }

  /**
   * Initialize workflow context with intelligent defaults
   */
  private initializeContext(partial?: Partial<WorkflowContext>): WorkflowContext {
    const defaultContext: WorkflowContext = {
      userSkillLevel: 'intermediate',
      detectedFrameworks: null,
      projectStructure: {
        hasPackageJson: false,
        framework: null,
        buildTool: null,
        testFramework: null,
        linting: false,
        typescript: false,
        monorepo: false
      },
      snapshotFiles: [],
      analysisHistory: [],
      userPreferences: {
        verboseOutput: true,
        autoAdvance: false,
        skipTutorials: false,
        preferredReportFormat: 'interactive',
        notificationPreferences: [
          { type: 'completion', method: 'console', threshold: 'medium' },
          { type: 'error', method: 'console', threshold: 'low' },
          { type: 'warning', method: 'console', threshold: 'medium' }
        ]
      },
      sessionData: {
        startTime: new Date(),
        currentWorkflow: '',
        completedSteps: [],
        bookmarks: [],
        notes: []
      }
    };

    return { ...defaultContext, ...partial };
  }

  /**
   * Initialize all available workflows
   */
  private initializeWorkflows(): void {
    // First Time User Workflow
    this.availableWorkflows.set('first_time', this.createFirstTimeWorkflow());
    
    // Memory Investigation Workflow
    this.availableWorkflows.set('memory_investigation', this.createMemoryInvestigationWorkflow());
    
    // Performance Audit Workflow
    this.availableWorkflows.set('performance_audit', this.createPerformanceAuditWorkflow());
    
    // CI Integration Workflow
    this.availableWorkflows.set('ci_integration', this.createCIIntegrationWorkflow());
    
    // Team Training Workflow
    this.availableWorkflows.set('team_training', this.createTeamTrainingWorkflow());
  }

  /**
   * Intelligently recommend the best workflow based on context
   */
  public async recommendWorkflow(): Promise<string> {
    const { userSkillLevel, snapshotFiles, analysisHistory, projectStructure } = this.context;

    // First time user detection
    if (analysisHistory.length === 0 && snapshotFiles.length === 0) {
      return 'first_time';
    }

    // Memory investigation scenario
    if (snapshotFiles.length >= 2 && snapshotFiles.some(f => f.type === 'before' || f.type === 'after')) {
      return 'memory_investigation';
    }

    // Performance audit for established projects
    if (projectStructure.hasPackageJson && analysisHistory.length > 0) {
      return 'performance_audit';
    }

    // CI integration for advanced users
    if (userSkillLevel === 'expert' && projectStructure.hasPackageJson) {
      return 'ci_integration';
    }

    // Default to memory investigation
    return 'memory_investigation';
  }

  /**
   * Start a guided workflow with intelligent context detection
   */
  public async startGuidedAnalysis(workflowId?: string): Promise<void> {
    // Auto-detect context
    await this.detectProjectContext();

    // Recommend workflow if not specified
    const selectedWorkflowId = workflowId || await this.recommendWorkflow();
    
    const workflow = this.availableWorkflows.get(selectedWorkflowId);
    if (!workflow) {
      throw new Error(`Workflow '${selectedWorkflowId}' not found`);
    }

    this.currentWorkflow = workflow;
    this.context.sessionData.currentWorkflow = selectedWorkflowId;

    // Generate initial recommendations
    await this.generateSmartRecommendations();

    console.log(`🚀 Starting workflow: ${workflow.name}`);
    console.log(`📊 Estimated duration: ${workflow.estimatedDuration} minutes`);
    console.log(`🎯 Target audience: ${workflow.targetAudience.join(', ')}`);
  }

  /**
   * Auto-detect project context for smarter workflow recommendations
   */
  private async detectProjectContext(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Detect package.json
      const packageJsonPath = './package.json';
      if (fs.existsSync(packageJsonPath)) {
        this.context.projectStructure.hasPackageJson = true;
        
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          
          // Detect framework
          if (packageJson.dependencies?.react || packageJson.devDependencies?.react) {
            this.context.projectStructure.framework = 'react';
          } else if (packageJson.dependencies?.vue || packageJson.devDependencies?.vue) {
            this.context.projectStructure.framework = 'vue';
          } else if (packageJson.dependencies?.['@angular/core'] || packageJson.devDependencies?.['@angular/core']) {
            this.context.projectStructure.framework = 'angular';
          }

          // Detect build tools
          if (packageJson.devDependencies?.webpack) {
            this.context.projectStructure.buildTool = 'webpack';
          } else if (packageJson.devDependencies?.vite) {
            this.context.projectStructure.buildTool = 'vite';
          } else if (packageJson.devDependencies?.parcel) {
            this.context.projectStructure.buildTool = 'parcel';
          }

          // Detect TypeScript
          this.context.projectStructure.typescript = !!(
            packageJson.dependencies?.typescript || 
            packageJson.devDependencies?.typescript ||
            fs.existsSync('./tsconfig.json')
          );

          // Detect linting
          this.context.projectStructure.linting = !!(
            packageJson.devDependencies?.eslint ||
            packageJson.devDependencies?.prettier
          );

        } catch (parseError) {
          console.warn('Could not parse package.json for context detection');
        }
      }

      // Detect snapshot files
      const snapshotsDir = './snapshots';
      if (fs.existsSync(snapshotsDir)) {
        const files = fs.readdirSync(snapshotsDir)
          .filter(file => file.endsWith('.heapsnapshot'))
          .map(file => {
            const filePath = path.join(snapshotsDir, file);
            const stats = fs.statSync(filePath);
            
            let type: SnapshotFileInfo['type'] = 'unknown';
            if (file.includes('before')) type = 'before';
            else if (file.includes('after')) type = 'after';
            else if (file.includes('baseline')) type = 'baseline';

            return {
              name: file,
              path: filePath,
              size: stats.size,
              createdAt: stats.birthtime,
              type,
              analyzed: false
            };
          });

        this.context.snapshotFiles = files;
      }

    } catch (error) {
      console.warn('Context detection failed:', error);
    }
  }

  /**
   * Generate smart recommendations based on current context
   */
  private async generateSmartRecommendations(): Promise<void> {
    const recommendations: SmartRecommendation[] = [];

    // Framework-specific recommendations
    if (this.context.projectStructure.framework === 'react') {
      recommendations.push({
        id: 'react-devtools',
        type: 'optimization',
        priority: 'medium',
        title: 'Install React DevTools Profiler',
        description: 'Enhanced React memory analysis with component-level insights',
        actionable: true,
        estimatedImpact: 'high',
        autoImplementable: false,
        learnMoreUrl: 'https://reactjs.org/blog/2018/09/10/introducing-the-react-profiler.html'
      });
    }

    // Snapshot recommendations
    if (this.context.snapshotFiles.length === 0) {
      recommendations.push({
        id: 'create-snapshots',
        type: 'next_step',
        priority: 'high',
        title: 'Create Your First Memory Snapshots',
        description: 'Generate before/after snapshots to enable leak detection',
        actionable: true,
        estimatedImpact: 'high',
        autoImplementable: false
      });
    } else if (this.context.snapshotFiles.length === 1) {
      recommendations.push({
        id: 'create-comparison',
        type: 'next_step',
        priority: 'high',
        title: 'Create Comparison Snapshot',
        description: 'Add a second snapshot to enable before/after leak analysis',
        actionable: true,
        estimatedImpact: 'high',
        autoImplementable: false
      });
    }

    // TypeScript recommendations
    if (this.context.projectStructure.typescript) {
      recommendations.push({
        id: 'typescript-memory',
        type: 'learning',
        priority: 'low',
        title: 'TypeScript Memory Considerations',
        description: 'Learn about TypeScript-specific memory patterns and optimizations',
        actionable: true,
        estimatedImpact: 'medium',
        autoImplementable: false,
        learnMoreUrl: 'https://www.typescriptlang.org/docs/handbook/performance.html'
      });
    }

    if (this.currentWorkflow) {
      this.currentWorkflow.recommendations = recommendations;
    }
  }

  /**
   * Get current workflow progress and status
   */
  public getProgress(): WorkflowProgress | null {
    if (!this.currentWorkflow) return null;

    const completedSteps = this.currentWorkflow.steps.filter(s => s.status === 'completed').length;
    const skippedSteps = this.currentWorkflow.steps.filter(s => s.status === 'skipped').length;
    const failedSteps = this.currentWorkflow.steps.filter(s => s.status === 'failed').length;
    const totalSteps = this.currentWorkflow.steps.length;
    
    const completionPercentage = Math.round((completedSteps / totalSteps) * 100);
    const estimatedTimeRemaining = this.calculateRemainingTime();

    return {
      totalSteps,
      completedSteps,
      skippedSteps,
      failedSteps,
      estimatedTimeRemaining,
      completionPercentage
    };
  }

  /**
   * Calculate estimated time remaining based on user progress
   */
  private calculateRemainingTime(): number {
    if (!this.currentWorkflow) return 0;

    const remainingSteps = this.currentWorkflow.steps.filter(
      s => s.status === 'pending' || s.status === 'active'
    );
    
    return remainingSteps.reduce((total, step) => total + step.estimatedTime, 0);
  }

  /**
   * Get available workflows for the current context
   */
  public getAvailableWorkflows(): { id: string; name: string; description: string; suitable: boolean }[] {
    return Array.from(this.availableWorkflows.entries()).map(([id, workflow]) => ({
      id,
      name: workflow.name,
      description: workflow.description,
      suitable: this.isWorkflowSuitable(workflow)
    }));
  }

  /**
   * Get detailed workflow information including duration and target audience
   */
  public getDetailedWorkflowInfo(): Array<{
    id: string;
    name: string;
    description: string;
    suitable: boolean;
    estimatedDuration: number;
    targetAudience: UserSkillLevel[];
  }> {
    return Array.from(this.availableWorkflows.entries()).map(([id, workflow]) => ({
      id,
      name: workflow.name,
      description: workflow.description,
      suitable: this.isWorkflowSuitable(workflow),
      estimatedDuration: workflow.estimatedDuration,
      targetAudience: workflow.targetAudience
    }));
  }

  /**
   * Check if a workflow is suitable for current context
   */
  private isWorkflowSuitable(workflow: GuidedWorkflow): boolean {
    return workflow.targetAudience.includes(this.context.userSkillLevel);
  }

  // Workflow creation methods (to be implemented)
  private createFirstTimeWorkflow(): GuidedWorkflow {
    const steps: WorkflowStep[] = [
      {
        id: 'introduction',
        title: 'Welcome & Memory Basics',
        description: 'Learn what memory analysis is and why it matters',
        estimatedTime: 3,
        prerequisites: [],
        status: 'pending',
        component: 'IntroductionStep',
        helpContent: {
          quickTip: 'Memory leaks happen when your app holds references to objects it no longer needs',
          detailedExplanation: 'JavaScript garbage collection automatically frees memory, but circular references and event listeners can prevent cleanup',
          examples: ['DOM elements with event listeners', 'Closures capturing large scope', 'Global variables'],
          commonPitfalls: ['Not removing event listeners', 'Storing DOM references in arrays', 'Circular dependencies']
        }
      },
      {
        id: 'setup_snapshots',
        title: 'Create Memory Snapshots',
        description: 'Take before and after heap snapshots in Chrome DevTools',
        estimatedTime: 8,
        prerequisites: ['introduction'],
        status: 'pending',
        component: 'SnapshotCreationStep',
        helpContent: {
          quickTip: 'Take snapshots at stable points in your app - not during active loading or animations',
          detailedExplanation: 'Heap snapshots capture all JavaScript objects in memory at a specific moment',
          examples: ['Before user interaction', 'After completing user flow', 'During idle state'],
          commonPitfalls: ['Taking snapshots during animations', 'Not waiting for async operations', 'Comparing different app states']
        }
      },
      {
        id: 'guided_analysis',
        title: 'Your First Memory Analysis',
        description: 'Analyze your snapshots with guided explanations',
        estimatedTime: 10,
        prerequisites: ['setup_snapshots'],
        status: 'pending',
        component: 'GuidedAnalysisStep',
        helpContent: {
          quickTip: 'Look for objects that increased significantly between snapshots',
          detailedExplanation: 'The analyzer will show you which objects grew and provide specific fix recommendations',
          examples: ['React components not unmounting', 'Event listeners still attached', 'Large data structures growing'],
          commonPitfalls: ['Focusing on small changes', 'Ignoring framework-specific patterns', 'Not following retainer chains']
        }
      },
      {
        id: 'understanding_results',
        title: 'Understanding Your Results',
        description: 'Learn to interpret findings and implement fixes',
        estimatedTime: 4,
        prerequisites: ['guided_analysis'],
        status: 'pending',
        component: 'ResultsInterpretationStep',
        helpContent: {
          quickTip: 'Focus on high-confidence leaks first - they have the biggest impact',
          detailedExplanation: 'Each finding includes confidence scores, memory impact, and specific fix instructions',
          examples: ['useEffect cleanup functions', 'Event listener removal', 'Ref array clearing'],
          commonPitfalls: ['Trying to fix everything at once', 'Not testing fixes', 'Ignoring root causes']
        }
      }
    ];

    return {
      id: 'first_time',
      name: 'First-Time Memory Analysis',
      description: 'Complete guide for developers new to memory analysis',
      targetAudience: ['beginner'],
      estimatedDuration: 25,
      steps,
      currentStepIndex: 0,
      context: this.context,
      recommendations: [],
      progress: {
        totalSteps: steps.length,
        completedSteps: 0,
        skippedSteps: 0,
        failedSteps: 0,
        estimatedTimeRemaining: 25,
        completionPercentage: 0
      }
    };
  }

  private createMemoryInvestigationWorkflow(): GuidedWorkflow {
    const steps: WorkflowStep[] = [
      {
        id: 'context_detection',
        title: 'Project Context Detection',
        description: 'Automatically detect your framework and project setup',
        estimatedTime: 2,
        prerequisites: [],
        status: 'pending',
        component: 'ContextDetectionStep',
        helpContent: {
          quickTip: 'The analyzer detects React, Vue, Angular and provides framework-specific advice',
          detailedExplanation: 'Different frameworks have different memory patterns and leak sources',
          examples: ['React useEffect dependencies', 'Vue watchers', 'Angular subscriptions'],
          commonPitfalls: ['Ignoring framework patterns', 'Generic fixes for framework-specific issues']
        }
      },
      {
        id: 'snapshot_validation',
        title: 'Validate Snapshot Quality',
        description: 'Ensure your snapshots are suitable for comparison',
        estimatedTime: 3,
        prerequisites: ['context_detection'],
        status: 'pending',
        component: 'SnapshotValidationStep'
      },
      {
        id: 'automated_analysis',
        title: 'Automated Leak Detection',
        description: 'Run comprehensive memory leak analysis',
        estimatedTime: 5,
        prerequisites: ['snapshot_validation'],
        status: 'pending',
        component: 'AutomatedAnalysisStep'
      },
      {
        id: 'prioritized_findings',
        title: 'Prioritized Action Plan',
        description: 'Get a ranked list of issues to fix first',
        estimatedTime: 5,
        prerequisites: ['automated_analysis'],
        status: 'pending',
        component: 'PrioritizedFindingsStep'
      }
    ];

    return {
      id: 'memory_investigation',
      name: 'Memory Leak Investigation',
      description: 'Systematic approach to finding and fixing memory leaks',
      targetAudience: ['intermediate', 'expert'],
      estimatedDuration: 15,
      steps,
      currentStepIndex: 0,
      context: this.context,
      recommendations: [],
      progress: {
        totalSteps: steps.length,
        completedSteps: 0,
        skippedSteps: 0,
        failedSteps: 0,
        estimatedTimeRemaining: 15,
        completionPercentage: 0
      }
    };
  }

  private createPerformanceAuditWorkflow(): GuidedWorkflow {
    const steps: WorkflowStep[] = [
      {
        id: 'baseline_establishment',
        title: 'Establish Performance Baseline',
        description: 'Create baseline memory metrics for your application',
        estimatedTime: 8,
        prerequisites: [],
        status: 'pending',
        component: 'BaselineStep'
      },
      {
        id: 'comprehensive_profiling',
        title: 'Comprehensive Memory Profiling',
        description: 'Deep analysis of memory usage patterns',
        estimatedTime: 12,
        prerequisites: ['baseline_establishment'],
        status: 'pending',
        component: 'ComprehensiveProfilingStep'
      },
      {
        id: 'optimization_opportunities',
        title: 'Optimization Opportunities',
        description: 'Identify areas for memory optimization',
        estimatedTime: 8,
        prerequisites: ['comprehensive_profiling'],
        status: 'pending',
        component: 'OptimizationStep'
      },
      {
        id: 'implementation_plan',
        title: 'Implementation Roadmap',
        description: 'Create a plan for implementing optimizations',
        estimatedTime: 2,
        prerequisites: ['optimization_opportunities'],
        status: 'pending',
        component: 'ImplementationPlanStep'
      }
    ];

    return {
      id: 'performance_audit',
      name: 'Performance Memory Audit',
      description: 'Comprehensive memory performance assessment',
      targetAudience: ['intermediate', 'expert'],
      estimatedDuration: 30,
      steps,
      currentStepIndex: 0,
      context: this.context,
      recommendations: [],
      progress: {
        totalSteps: steps.length,
        completedSteps: 0,
        skippedSteps: 0,
        failedSteps: 0,
        estimatedTimeRemaining: 30,
        completionPercentage: 0
      }
    };
  }

  private createCIIntegrationWorkflow(): GuidedWorkflow {
    const steps: WorkflowStep[] = [
      {
        id: 'ci_assessment',
        title: 'CI/CD Environment Assessment',
        description: 'Analyze your current CI/CD setup for memory monitoring integration',
        estimatedTime: 5,
        prerequisites: [],
        status: 'pending',
        component: 'CIAssessmentStep'
      },
      {
        id: 'automation_setup',
        title: 'Automated Memory Testing',
        description: 'Set up automated memory leak detection in your pipeline',
        estimatedTime: 10,
        prerequisites: ['ci_assessment'],
        status: 'pending',
        component: 'AutomationSetupStep'
      },
      {
        id: 'threshold_configuration',
        title: 'Configure Alert Thresholds',
        description: 'Set up smart thresholds and alerts for memory issues',
        estimatedTime: 3,
        prerequisites: ['automation_setup'],
        status: 'pending',
        component: 'ThresholdConfigurationStep'
      },
      {
        id: 'integration_testing',
        title: 'Test CI Integration',
        description: 'Verify your automated memory monitoring works correctly',
        estimatedTime: 2,
        prerequisites: ['threshold_configuration'],
        status: 'pending',
        component: 'IntegrationTestingStep'
      }
    ];

    return {
      id: 'ci_integration',
      name: 'CI/CD Memory Monitoring',
      description: 'Set up automated memory leak detection in your pipeline',
      targetAudience: ['expert'],
      estimatedDuration: 20,
      steps,
      currentStepIndex: 0,
      context: this.context,
      recommendations: [],
      progress: {
        totalSteps: steps.length,
        completedSteps: 0,
        skippedSteps: 0,
        failedSteps: 0,
        estimatedTimeRemaining: 20,
        completionPercentage: 0
      }
    };
  }

  private createTeamTrainingWorkflow(): GuidedWorkflow {
    const steps: WorkflowStep[] = [
      {
        id: 'team_assessment',
        title: 'Team Skills Assessment',
        description: 'Evaluate your team\'s current memory debugging skills',
        estimatedTime: 8,
        prerequisites: [],
        status: 'pending',
        component: 'TeamAssessmentStep'
      },
      {
        id: 'interactive_tutorial',
        title: 'Interactive Memory Tutorial',
        description: 'Hands-on learning with real memory leak examples',
        estimatedTime: 20,
        prerequisites: ['team_assessment'],
        status: 'pending',
        component: 'InteractiveTutorialStep'
      },
      {
        id: 'practice_exercises',
        title: 'Practice Exercises',
        description: 'Guided exercises using your own codebase',
        estimatedTime: 15,
        prerequisites: ['interactive_tutorial'],
        status: 'pending',
        component: 'PracticeExercisesStep'
      },
      {
        id: 'knowledge_verification',
        title: 'Knowledge Verification',
        description: 'Verify team members can identify and fix common leaks',
        estimatedTime: 2,
        prerequisites: ['practice_exercises'],
        status: 'pending',
        component: 'KnowledgeVerificationStep'
      }
    ];

    return {
      id: 'team_training',
      name: 'Team Memory Training',
      description: 'Educational workflow for training development teams',
      targetAudience: ['beginner', 'intermediate'],
      estimatedDuration: 45,
      steps,
      currentStepIndex: 0,
      context: this.context,
      recommendations: [],
      progress: {
        totalSteps: steps.length,
        completedSteps: 0,
        skippedSteps: 0,
        failedSteps: 0,
        estimatedTimeRemaining: 45,
        completionPercentage: 0
      }
    };
  }

  // Getters for external access
  public getCurrentWorkflow(): GuidedWorkflow | null {
    return this.currentWorkflow;
  }

  public getContext(): WorkflowContext {
    return this.context;
  }

  public updateContext(updates: Partial<WorkflowContext>): void {
    this.context = { ...this.context, ...updates };
  }
}
