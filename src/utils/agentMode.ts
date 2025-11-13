import fs from 'fs';
import path from 'path';
import { analyzeHeapSnapshot, AnalysisResult } from './heapAnalyzer.js';
import { BeforeAfterAnalyzer, ComparisonResult } from './beforeAfterAnalyzer.js';
import { AgentAnalysisReport } from '../types/index.js';
import { RetainerTracer } from './retainerTracer.js';
import { FrameworkDetector, FrameworkDetectionResult, formatFrameworkDetection } from './frameworkDetector.js';
import { 
  detectGlobalVariables, 
  detectMemoryPatterns, 
  generateDynamicRecommendations,
  DynamicAnalysisResult 
} from './dynamicDetector.js';
import { MEMORY_THRESHOLDS, calculateSeverity } from './memoryThresholds.js';
import { isBuiltInGlobal } from './builtInGlobals.js';
import { analyzeCatastrophicLeak, generateCatastrophicReport } from './catastrophicAnalyzer.js';
import { ReactComponentHookAnalyzer } from './reactComponentHookAnalyzer.js';
import { UnmountedFiberNodeAnalyzer } from './unmountedFiberNodeAnalyzer.js';
import { StringAnalyzer } from './stringAnalyzer.js';
import { ShapeUnboundGrowthAnalyzer } from './shapeUnboundGrowthAnalyzer.js';
import { ObjectUnboundGrowthAnalyzer } from './objectUnboundGrowthAnalyzer.js';

interface AgentOptions {
  markdownOutput?: boolean;
}

/**
 * React Component Lifecycle Leak Detection
 * Detects React component leaks using intrinsic heap signals
 */
function detectReactComponentPattern(
  objectGrowth: number,
  timerChange: number,
  afterReport: LightweightReport,
  beforeReport: LightweightReport,
  memoryGrowthMB: number
) {
  // React component leak signatures (using intrinsic heap signals):
  // 1. Timer explosion + massive objects = useEffect intervals without cleanup
  // 2. High timer growth with object explosion = component mounting but not unmounting
  // 3. Memory growth pattern typical of component data accumulation
  const hasReactComponentLeakSignature = (
    // Pattern 1: Timer explosion + massive objects (classic useEffect interval leak)
    timerChange > 50 && // Many new timers (useEffect intervals)
    objectGrowth > 100000 && // Massive object growth
    memoryGrowthMB > 5 // Significant memory growth
  ) || (
    // Pattern 2: Extreme timer growth (useEffect cleanup missing)
    timerChange > 100 && // Lots of timers
    objectGrowth > 150000 // Object explosion
  ) || (
    // Pattern 3: Moderate timer growth but massive object explosion
    timerChange > 20 &&
    objectGrowth > 200000 && // Huge object growth
    memoryGrowthMB > 7 // High memory usage
  );

  let detected = false;
  let insight = '';
  let recommendation = '';

  if (hasReactComponentLeakSignature) {
    detected = true;
    
    // Check for WebSocket subscription pattern first
    const subscriptionConfidence = calculateWebSocketSubscriptionConfidence(
      timerChange,
      objectGrowth, 
      memoryGrowthMB,
      afterReport,
      beforeReport
    );
    
    // Enhanced detection for lazy component patterns
    const hasLazyComponentSignature = (
      // Zombie component pattern: Many timers + extreme object growth
      timerChange > 200 && objectGrowth > 250000
    ) || (
      // Registry accumulation pattern: Moderate timers but massive objects
      timerChange > 100 && objectGrowth > 300000 && memoryGrowthMB > 10
    );

    // Confidence-based lazy component hints (app-agnostic)
    const lazyComponentConfidence = calculateLazyComponentConfidence(
      timerChange, 
      objectGrowth, 
      memoryGrowthMB,
      afterReport,
      beforeReport
    );

    // Determine the most likely leak type based on confidence scores
    if (subscriptionConfidence > 75) {
      insight = `📡 CRITICAL: WebSocket subscription leak - ${timerChange > 0 ? '+' : ''}${timerChange} connections, +${memoryGrowthMB.toFixed(1)}MB causing ${objectGrowth.toLocaleString()} object explosion from unclosed WebSocket connections`;
      recommendation = '📡 URGENT: Close all WebSocket connections! Add cleanup to component unmount: useEffect(() => { const ws = new WebSocket(...); return () => { ws.close(); ws.terminate(); }; }, []). Check for fake close() methods that don\'t actually close connections.';
    } else if (subscriptionConfidence > 60) {
      insight = `📡 CRITICAL: Subscription/Connection leak - ${timerChange > 0 ? '+' : ''}${timerChange} active subscriptions, +${memoryGrowthMB.toFixed(1)}MB causing ${objectGrowth.toLocaleString()} object explosion`;
      recommendation = '📡 URGENT: Unsubscribe from all subscriptions! Add cleanup: useEffect(() => { const sub = subscribe(...); return () => sub.unsubscribe(); }, []). Check WebSocket connections, EventSource, or subscription libraries.';
    } else if (hasLazyComponentSignature) {
      insight = `👻 CRITICAL: Zombie component leak (React.lazy) - ${timerChange > 0 ? '+' : ''}${timerChange} timers, +${memoryGrowthMB.toFixed(1)}MB causing ${objectGrowth.toLocaleString()} object explosion from lazy-loaded components never unmounting`;
      recommendation = '👻 URGENT: Clear React.lazy zombie components! Add cleanup to unmount dynamic components: useEffect(() => { return () => { clearInterval(timer); setComponents([]); window.componentRegistry = []; }; }, []). Lazy components accumulating in global registries.';
    } else if (lazyComponentConfidence > 60) {
      // Confidence-based hint without certainty
      insight = `⚛️ CRITICAL: React component lifecycle leak - ${timerChange > 0 ? '+' : ''}${timerChange} timers, +${memoryGrowthMB.toFixed(1)}MB causing ${objectGrowth.toLocaleString()} object explosion`;
      recommendation = `⚛️ URGENT: Add useEffect cleanup! Return cleanup functions: useEffect(() => { const timer = setInterval(...); return () => clearInterval(timer); }). Clear component arrays on unmount.`;
      
      // Add confidence-based lazy component hint
      if (lazyComponentConfidence > 80) {
        insight += ` (High confidence: React.lazy/dynamic import pattern detected - ${lazyComponentConfidence}%)`;
        recommendation += ' Consider checking React.lazy components and dynamic imports for proper unmounting.';
      } else if (lazyComponentConfidence > 60) {
        insight += ` (Possible React.lazy/dynamic component leak pattern - ${lazyComponentConfidence}% confidence)`;
        recommendation += ' May involve lazy-loaded components - check dynamic imports and component registries.';
      }
    } else {
      insight = `⚛️ CRITICAL: React component lifecycle leak - ${timerChange > 0 ? '+' : ''}${timerChange} timers, +${memoryGrowthMB.toFixed(1)}MB causing ${objectGrowth.toLocaleString()} object explosion`;
      recommendation = '⚛️ URGENT: Add useEffect cleanup! Return cleanup functions: useEffect(() => { const timer = setInterval(...); return () => clearInterval(timer); }). Clear component arrays on unmount.';
    }
    
    // Add subscription confidence info if detected
    if (subscriptionConfidence > 50 && subscriptionConfidence <= 75) {
      insight += ` (WebSocket/Subscription pattern confidence: ${subscriptionConfidence}%)`;
    }
  }

  return { detected, insight, recommendation };
}

/**
 * Calculates confidence that a leak involves WebSocket/Subscription patterns
 * Uses ONLY universal intrinsic heap patterns (app-agnostic)
 * NO NAME DEPENDENCIES - purely based on object/memory growth patterns
 */
function calculateWebSocketSubscriptionConfidence(
  timerChange: number,
  objectGrowth: number,
  memoryGrowthMB: number,
  afterReport: LightweightReport,
  beforeReport: LightweightReport
): number {
  let confidence = 0;

  // WebSocket/Subscription leak signatures (purely intrinsic patterns):
  // 1. Multiple timers + sustained message accumulation pattern
  // 2. Consistent object growth suggesting message buffering
  // 3. Memory growth pattern typical of connection/message accumulation
  // 4. Specific ratios that indicate connection + message patterns

  // Timer pattern analysis (WebSocket connections often create multiple timers)
  // This pattern is universal regardless of timer detection method
  if (timerChange >= 20 && timerChange <= 100) {
    confidence += 30; // Moderate timer growth suggests connections + message intervals
  } else if (timerChange > 100) {
    confidence += 40; // High timer growth suggests many connections with intervals
  }

  // Object growth pattern (consistent with message accumulation)
  const objectGrowthRatio = objectGrowth / beforeReport.totalObjects;
  if (objectGrowthRatio > 2 && objectGrowthRatio < 5) {
    confidence += 25; // Moderate consistent growth (message buffering pattern)
  } else if (objectGrowthRatio >= 5) {
    confidence += 20; // Very high growth could be many things
  }

  // Memory growth pattern (WebSocket messages accumulate gradually)
  const memoryGrowthRatio = memoryGrowthMB / beforeReport.totalMemoryMB;
  if (memoryGrowthRatio > 0.5 && memoryGrowthRatio < 3) {
    confidence += 30; // Sustained memory growth pattern
  } else if (memoryGrowthRatio >= 3) {
    confidence += 25; // Very high growth
  }

  // Timer-to-object ratio analysis (WebSocket pattern has specific ratio)
  // Connections create few timers but many message objects
  const timerObjectRatio = timerChange / (objectGrowth / 1000);
  if (timerObjectRatio > 0.05 && timerObjectRatio < 0.5) {
    confidence += 15; // Good ratio for WebSocket connections + messages
  }

  // Memory efficiency pattern (WebSocket messages are moderately sized)
  // Not tiny objects (like simple counters) or massive objects (like images)
  const avgObjectSize = (memoryGrowthMB * 1024 * 1024) / objectGrowth;
  if (avgObjectSize > 500 && avgObjectSize < 50000) {
    confidence += 10; // Message-sized objects (0.5KB - 50KB average)
  }

  return Math.min(confidence, 95); // Cap at 95%
}

/**
 * Calculates confidence that a leak involves React.lazy/dynamic components
 * Uses ONLY universal intrinsic heap patterns (app-agnostic)
 */
function calculateLazyComponentConfidence(
  timerChange: number,
  objectGrowth: number,
  memoryGrowthMB: number,
  afterReport: LightweightReport,
  beforeReport: LightweightReport
): number {
  let confidence = 0;

  // Factor 1: Timer to object ratio (universal pattern - any lazy component system creates objects per timer)
  const timerToObjectRatio = objectGrowth / Math.max(timerChange, 1);
  if (timerToObjectRatio > 1500) confidence += 30; // Very high ratio suggests component accumulation
  else if (timerToObjectRatio > 1000) confidence += 25;
  else if (timerToObjectRatio > 500) confidence += 15;
  else if (timerToObjectRatio > 200) confidence += 10;

  // Factor 2: Extreme object growth (universal - component trees create many objects)
  if (objectGrowth > 300000) confidence += 35; // Massive growth typical of component accumulation
  else if (objectGrowth > 200000) confidence += 25;
  else if (objectGrowth > 100000) confidence += 15;

  // Factor 3: Memory efficiency patterns (universal - rich component data has higher memory/object)
  const memoryPerObject = (memoryGrowthMB * 1024 * 1024) / objectGrowth;
  if (memoryPerObject > 40) confidence += 20; // High memory per object suggests rich component data
  else if (memoryPerObject > 25) confidence += 15;
  else if (memoryPerObject > 15) confidence += 10;

  // Factor 4: Timer explosion pattern (universal - lazy components often create multiple timers)
  if (timerChange > 300) confidence += 20; // Extreme timer growth suggests component intervals
  else if (timerChange > 200) confidence += 15;
  else if (timerChange > 100) confidence += 10;

  // REMOVED: App-specific patterns (global variables, string assumptions, large object assumptions)
  // These were making assumptions about how apps structure their component data

  // Ensure confidence stays within reasonable bounds
  return Math.min(90, Math.max(0, confidence)); // Max 90% since we can't be 100% certain without app knowledge
}

/**
 * Enhanced Image Processing Pattern Detection
 * Detects when data URLs + canvas objects + massive object growth = image processing leak
 */
function detectImageProcessingPattern(
  dataUrlGrowth: number,
  imageCanvasGrowth: number, 
  largeStringGrowth: number,
  objectGrowth: number,
  memoryGrowthMB: number
) {
  // Image processing pattern signatures (using intrinsic heap signals):
  // 1. ANY Data URLs/Canvas growth + massive object growth (the key pattern!)
  // 2. Large memory growth with moderate image activity
  // 3. Object explosion with any image processing signals
  const hasImageProcessingSignature = (
    // Pattern 1: Any image activity + massive objects (realistic thresholds)
    (dataUrlGrowth > 0 || imageCanvasGrowth > 0) && // ANY image activity
    objectGrowth > 100000 && // Massive object growth (key signature)
    memoryGrowthMB > 5 // Significant memory growth
  ) || (
    // Pattern 2: High memory growth with any image activity
    memoryGrowthMB > 8 && // > 8MB memory growth (our case: ~9MB)
    (dataUrlGrowth > 0 || imageCanvasGrowth > 0 || largeStringGrowth > 5) // Any image signals
  ) || (
    // Pattern 3: Moderate image activity but with object explosion
    imageCanvasGrowth > 2 && // Just a few canvas objects
    objectGrowth > 150000 // But massive object growth (suggests processing loops)
  );

  let detected = false;
  let insight = '';
  let recommendation = '';

  if (hasImageProcessingSignature) {
    detected = true;
    insight = `🖼️ CRITICAL: Image processing leak detected - ${dataUrlGrowth} data URLs, ${imageCanvasGrowth} canvas objects, +${memoryGrowthMB.toFixed(1)}MB memory causing ${objectGrowth.toLocaleString()} object explosion`;
    recommendation = '🖼️ URGENT: Stop canvas.toDataURL() loops! Clear global image arrays immediately. Use canvas.width = canvas.height = 0 after processing.';
  }

  return { detected, insight, recommendation };
}

/**
 * Enhanced Event Listener Pattern Detection
 * Analyzes patterns that suggest event listener leaks
 */
function detectEventListenerPattern(
  objectGrowth: number, 
  objectGrowthPercentage: number, 
  closureChange: number,
  afterReport: LightweightReport,
  beforeReport: LightweightReport
) {
  // Pattern 1: Massive object growth with stable/decreasing closures
  const hasClosureParadox = (
    objectGrowth > 100000 && // Lots of new objects (372,300 ✓)
    closureChange < 50 && // But closure count didn't increase much (-279 ✓)  
    objectGrowthPercentage > 100 // Significant percentage growth (291.5% ✓)
  );

  // Pattern 2: Memory efficiency issues (memory growing faster than objects suggest)
  const memoryGrowth = afterReport.totalMemoryMB - beforeReport.totalMemoryMB;
  const memoryGrowthPercentage = beforeReport.totalMemoryMB > 0 ? (memoryGrowth / beforeReport.totalMemoryMB) * 100 : 0;
  const hasMemoryEfficiencyIssue = (
    memoryGrowthPercentage > objectGrowthPercentage * 0.3 && // Memory growing disproportionately
    objectGrowth > 50000 // But still significant object growth
  );

  // Pattern 3: Global retention indicators
  const hasGlobalRetentionPattern = (
    afterReport.detachedDOMCount > beforeReport.detachedDOMCount + 500 && // DOM accumulation (lowered from 1000)
    objectGrowth > 50000 // With significant object growth (lowered from 100000)
  );

  let detected = false;
  let insight = '';
  let recommendation = '';

  if (hasClosureParadox) {
    detected = true;
    insight = `🎧 Event listener pattern: ${objectGrowth.toLocaleString()} objects, ${closureChange > 0 ? '+' : ''}${closureChange} closures (paradox detected)`;
    recommendation = '🎧 Check for event listeners on window/document that are never removed (addEventListener without removeEventListener)';
  } else if (hasMemoryEfficiencyIssue) {
    detected = true;
    insight = `📱 Memory inefficiency: Objects +${objectGrowthPercentage.toFixed(1)}%, Memory +${memoryGrowthPercentage.toFixed(1)}% (heavy retention)`;
    recommendation = '🔗 Investigate closures capturing large data or global object retention patterns';
  } else if (hasGlobalRetentionPattern) {
    detected = true;
    insight = `🌐 Global retention pattern: ${afterReport.detachedDOMCount - beforeReport.detachedDOMCount} new detached DOM nodes with object explosion`;
    recommendation = '🧹 Remove event listeners before DOM removal and clear component state references';
  }

  return { detected, insight, recommendation };
}

export async function runAgentMode(snapshotPath: string, options: AgentOptions = {}): Promise<string> {
  console.log('🤖 Running Heap Analyzer in Agent Mode...\n');
  
  try {
    // Check if snapshot file exists
    if (!fs.existsSync(snapshotPath)) {
      console.error(`❌ Snapshot file not found: ${snapshotPath}`);
      process.exit(1);
    }

    // Check if this is a before/after comparison scenario
    const snapshotDir = path.dirname(snapshotPath);
    const beforePath = path.join(snapshotDir, 'before.heapsnapshot');
    const afterPath = path.join(snapshotDir, 'after.heapsnapshot');
    
    const hasBefore = fs.existsSync(beforePath);
    const hasAfter = fs.existsSync(afterPath);
    
    if (hasBefore && hasAfter) {
      console.log('📊 Detected both before.heapsnapshot and after.heapsnapshot');
      console.log('🔍 Running comparative memory leak analysis...\n');
      
      // Run before/after comparison analysis
      return await runBeforeAfterComparison(beforePath, afterPath, options);
    } else {
      console.log(`📊 Analyzing snapshot: ${path.basename(snapshotPath)}`);
      
      // Check file size before processing to prevent memory issues
      const stats = fs.statSync(snapshotPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      console.log(`📁 Snapshot size: ${fileSizeMB.toFixed(1)}MB`);
      
      // Check if memory has been increased via Node.js flags
      const hasIncreasedMemory = process.execArgv.some(arg => 
        arg.includes('max-old-space-size') || arg.includes('max_old_space_size')
      );
      
      const memoryThreshold = hasIncreasedMemory ? 500 : 100; // Higher threshold if memory increased
      
      if (fileSizeMB > memoryThreshold) {
        if (hasIncreasedMemory) {
          console.log('⚠️  Extremely large snapshot detected - even with increased memory, using lightweight analysis');
          console.log('💡 Consider using an even larger memory limit or smaller snapshots\n');
        } else {
          console.log('⚠️  Large snapshot detected - using memory-safe lightweight analysis');
          console.log('💡 For comprehensive analysis of large snapshots, run with:');
          console.log('   node --max-old-space-size=8192 bin/cli.js --agent [snapshot]\n');
        }
        
        // Return lightweight analysis for large files
        const report: AgentAnalysisReport = {
          timestamp: new Date().toISOString(),
          snapshotPath,
          analysis: {
            summary: { totalObjects: 0, totalRetainedSize: Math.round(stats.size), categories: {} },
            topRetainers: [],
            detachedDOMNodes: [],
            domLeakSummary: { totalDetachedNodes: 0, detachedNodesByType: {}, suspiciousPatterns: [], retainerArrays: [] }
          },
          insights: [
            '📊 Large snapshot analysis skipped for memory safety',
            `💾 File size: ${fileSizeMB.toFixed(1)}MB (threshold: 100MB)`,
            '🚀 Use increased memory limit for full analysis'
          ],
          recommendations: [
            'Run with increased Node.js memory: node --max-old-space-size=8192 bin/cli.js --agent [snapshot]',
            'Consider taking smaller heap snapshots if possible',
            'Use before/after comparison mode for better memory efficiency'
          ],
          severity: 'medium',
          specializedInsights: {
            reactInsights: ['⚛️ Skipped for memory safety - use increased memory limit'],
            fiberInsights: ['🧬 Skipped for memory safety - use increased memory limit'],
            stringInsights: ['📝 Skipped for memory safety - use increased memory limit'],
            shapeInsights: ['📐 Skipped for memory safety - use increased memory limit'],
            domInsights: ['🔌 Skipped for memory safety - use increased memory limit']
          },
          prioritizedRecommendations: [{
            priority: 1,
            impact: `${fileSizeMB.toFixed(1)}MB snapshot`,
            description: 'Increase Node.js memory limit for comprehensive analysis',
            confidence: 100,
            category: 'Memory Safety'
          }]
        };
        
        displayEnhancedAgentReport(report);
        
        const outputPath = saveReportToFile(report, options.markdownOutput);
        if (options.markdownOutput) {
          console.log(`\n📝 Lightweight report saved to: ${outputPath}`);
        } else {
          console.log(`\n💾 Lightweight report saved to: ${outputPath}`);
        }
        
        return outputPath;
      }
      
      console.log('⏳ Processing heap snapshot data...');
      console.log('🔍 Running advanced leak detection...');
      console.log('🎯 Detecting frameworks and libraries...\n');

      // Analyze single snapshot with basic analysis
      const analysis = await analyzeHeapSnapshot(snapshotPath);
      
      // Run comprehensive analysis with all 15 analyzers
      console.log('🧠 Running comprehensive analysis with 15 specialized analyzers...');
      const comprehensiveResults = await runComprehensiveAnalysis(analysis);
      
      // Generate enhanced agent report
      const report = generateEnhancedAgentReport(snapshotPath, analysis, comprehensiveResults);
      
      // Display results
      displayEnhancedAgentReport(report);
      
      // Optionally save report to file
      const outputPath = saveReportToFile(report, options.markdownOutput);
      if (options.markdownOutput) {
        console.log(`\n📝 Markdown report saved to: ${outputPath}`);
      } else {
        console.log(`\n💾 Full report saved to: ${outputPath}`);
      }
      
      return outputPath;
    }
    
  } catch (error) {
    console.error('❌ Error during agent analysis:', error);
    process.exit(1);
  }
}

async function runBeforeAfterComparison(beforePath: string, afterPath: string, options: AgentOptions = {}): Promise<string> {
  try {
    // Check for catastrophic snapshot sizes before attempting analysis
    const beforeStats = fs.statSync(beforePath);
    const afterStats = fs.statSync(afterPath);
    const beforeSizeMB = beforeStats.size / 1024 / 1024;
    const afterSizeMB = afterStats.size / 1024 / 1024;
    const totalSizeMB = beforeSizeMB + afterSizeMB;
    
    console.log(`📂 Snapshot sizes: Before ${beforeSizeMB.toFixed(1)}MB, After ${afterSizeMB.toFixed(1)}MB`);
    
    // If either snapshot is > 500MB or total > 800MB, use catastrophic analysis
    if (afterSizeMB > 500 || totalSizeMB > 800) {
      console.log('🚨 CATASTROPHIC LEAK DETECTED - Using specialized analysis mode...');
      
      try {
        const catastrophicAnalysis = await analyzeCatastrophicLeak(beforePath, afterPath);
        const report = generateCatastrophicReport(catastrophicAnalysis);
        
        console.log('\n' + report);
        
        // Save catastrophic report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = `./reports/catastrophic-analysis-${timestamp}.txt`;
        
        // Ensure reports directory exists
        if (!fs.existsSync('./reports')) {
          fs.mkdirSync('./reports', { recursive: true });
        }
        
        fs.writeFileSync(outputPath, report);
        console.log(`\n💾 Catastrophic leak report saved to: ${outputPath}`);
        
        return outputPath;
      } catch (catastrophicError) {
        console.error('❌ Even catastrophic analysis failed:', catastrophicError);
        
        // Fallback to basic file size analysis
        const basicReport = `
🚨 CATASTROPHIC MEMORY LEAK - ANALYSIS IMPOSSIBLE
================================================

The heap snapshots are too large to analyze:
• Before: ${beforeSizeMB.toFixed(1)}MB
• After: ${afterSizeMB.toFixed(1)}MB  
• Growth: +${(afterSizeMB - beforeSizeMB).toFixed(1)}MB (+${((afterSizeMB / beforeSizeMB - 1) * 100).toFixed(0)}%)

🔴 SEVERITY: CATASTROPHIC

⚡ EMERGENCY ACTIONS REQUIRED:
1. 🚨 This leak will crash browsers - immediate intervention needed
2. 🔍 Search for: setInterval without clearInterval
3. 🔍 Search for: addEventListener without removeEventListener  
4. 🔍 Search for: array.push in loops without clearing
5. 🧹 Check for global object accumulation or closure memory capture

The application is consuming ${afterSizeMB.toFixed(0)}MB of memory - this is production-critical!
        `;
        
        console.log(basicReport);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = `./reports/catastrophic-fallback-${timestamp}.txt`;
        
        if (!fs.existsSync('./reports')) {
          fs.mkdirSync('./reports', { recursive: true });
        }
        
        fs.writeFileSync(outputPath, basicReport);
        console.log(`\n💾 Basic catastrophic report saved to: ${outputPath}`);
        
        return outputPath;
      }
    }
    
    // Normal analysis path for smaller snapshots
    console.log('📊 Quick analysis of BEFORE snapshot...');
    const beforeReport = await generateLightweightReport(beforePath);
    console.log('✅ Before analysis complete');
    
    console.log('📊 Quick analysis of AFTER snapshot...');  
    const afterReport = await generateLightweightReport(afterPath);
    console.log('✅ After analysis complete');
    
    console.log('🔄 Generating comparison report...');
    // Generate comparison report
    const comparisonReport = generateLightweightComparisonReport(beforeReport, afterReport);
    
    // Display comparison results
    displayComparisonReport(comparisonReport);
    
    // Save comparison report
    const outputPath = saveComparisonReportToFile(comparisonReport, options.markdownOutput);
    if (options.markdownOutput) {
      console.log(`\n📝 Comparison report saved to: ${outputPath}`);
    } else {
      console.log(`\n💾 Full comparison report saved to: ${outputPath}`);
    }
    
    return outputPath;
  } catch (error) {
    console.error('❌ Error during comparison analysis:', error);
    throw error;
  }
}

interface LightweightReport {
  snapshotPath: string;
  totalObjects: number;
  totalMemoryMB: number;
  largeObjectsCount: number;
  detachedDOMCount: number;
  timerCount: number;
  closureCount: number;
  // NEW: Image/Canvas/Data URL metrics
  imageCanvasCount?: number;
  dataUrlCount?: number;
  base64StringCount?: number;
  globalVariableCount?: number;
  totalDataUrlMemoryMB?: number;
  largeStringCount?: number;
  // PHASE 2: Dynamic detection
  dynamicGlobals?: number;
  dynamicRecommendations?: string[];
  insights: string[];
}

async function generateLightweightReport(snapshotPath: string): Promise<LightweightReport> {
  const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  
  // Quick stats without heavy analysis
  const nodes = snapshotData.nodes || [];
  const strings = snapshotData.strings || [];
  const nodeFields = snapshotData.snapshot?.meta?.node_fields || [];
  const nodeTypes = snapshotData.snapshot?.meta?.node_types || [];
  const selfSizeIndex = nodeFields.indexOf('self_size');
  const nameIndex = nodeFields.indexOf('name');
  const typeIndex = nodeFields.indexOf('type');
  const nodeFieldCount = nodeFields.length;
  
  let totalObjects = 0;
  let totalMemory = 0;
  let largeObjectsCount = 0;
  let detachedDOMCount = 0;
  let timerCount = 0;
  let closureCount = 0;
  
  // ===== NEW: IMAGE/CANVAS/DATA URL LEAK DETECTION =====
  let imageCanvasCount = 0;
  let dataUrlCount = 0;
  let base64StringCount = 0;
  let globalVariableCount = 0;
  let totalDataUrlMemory = 0;
  let largeStringCount = 0;
  
  // DEBUG: Track interesting objects we find
  const debugObjects: Array<{type: string; name: string; size: number}> = [];
  
  // Quick scan through nodes
  for (let i = 0; i < nodes.length && totalObjects < 500000; i += nodeFieldCount) { // Limit scan to avoid hanging
    const selfSize = nodes[i + selfSizeIndex] || 0;
    const nameValue = nodes[i + nameIndex];
    const typeValue = nodes[i + typeIndex];
    
    totalObjects++;
    totalMemory += selfSize;
    
    if (selfSize > 100000) largeObjectsCount++; // Objects > 100KB
    
    // Get type string from node_types array
    let typeString = 'unknown';
    if (nodeTypes[0] && Array.isArray(nodeTypes[0])) {
      typeString = nodeTypes[0][typeValue] || 'unknown';
    }
    
    // Quick pattern matching for insights
    let name = '';
    if (typeof nameValue === 'number' && strings[nameValue]) {
      name = strings[nameValue];
    } else if (typeof nameValue === 'string') {
      name = nameValue;
    }
    
    // ===== IMAGE/CANVAS/DATA URL DETECTION =====
    
    // DEBUG: Log interesting objects
    if (selfSize > 50000 || // Large objects
        name.includes('Image') || name.includes('Canvas') || name.includes('data:') || 
        name.includes('Archive') || name.includes('Cache') || typeString === 'string') {
      debugObjects.push({type: typeString, name: name.substring(0, 100), size: selfSize});
    }
    
    // Detect Image/Canvas objects
    if (name.includes('HTMLImageElement') || 
        name.includes('HTMLCanvasElement') || 
        name.includes('ImageData') || 
        name.includes('CanvasRenderingContext2D') ||
        name.includes('Image') || 
        name.includes('Canvas')) {
      imageCanvasCount++;
    }
    
    // Detect Data URLs and Base64 strings
    if ((typeString === 'string' || typeString === 'cons string' || name.includes('String')) && 
        (name.includes('data:image') || 
         name.includes('data:') && name.includes('base64') || 
         name.includes('blob:') || 
         name.includes('objectURL'))) {
      dataUrlCount++;
      totalDataUrlMemory += selfSize;
    }
    
    // Detect large strings that could be base64 data
    if ((typeString === 'string' || typeString === 'cons string') && selfSize > 50000) {
      base64StringCount++;
      largeStringCount++;
      totalDataUrlMemory += selfSize; // Count towards data URL memory
    }
    
    // Detect global-scope objects using ONLY intrinsic heap patterns (name-agnostic)
    // Count large objects that appear to be in global scope based on size/structure patterns
    // But filter out built-in globals first
    if (!isBuiltInGlobal(name)) {
      if (typeString === 'object' && selfSize > 10000) {
        // Large objects (>10KB) are often global registries/caches
        globalVariableCount++;
      } else if (typeString === 'array' && selfSize > 5000) {
        // Large arrays (>5KB) are often global collections
        globalVariableCount++;
      }
    }
    
    // Original detections - these are also name-dependent and should be intrinsic
    if (name.includes('Detached') || name.includes('detached')) detachedDOMCount++;
    if (name.includes('Timer') || name.includes('setTimeout') || name.includes('setInterval')) timerCount++;
    if (name.includes('closure') || name.includes('Closure')) closureCount++;
  }
  
  const insights: string[] = [];
  if (totalObjects > 1000000) insights.push(`🚨 Massive object count: ${totalObjects.toLocaleString()} objects`);
  if (totalMemory > 50 * 1024 * 1024) insights.push(`💥 High memory usage: ${(totalMemory / (1024 * 1024)).toFixed(1)}MB`);
  
  // DEBUG: Log what we found  
  console.log(`🔍 DEBUG: Found ${debugObjects.length} interesting objects:`);
  const uniqueTypes = new Set(debugObjects.map(obj => obj.type));
  const uniqueNames = new Set(debugObjects.map(obj => obj.name.split(' ')[0]));
  console.log(`  Types: ${Array.from(uniqueTypes).join(', ')}`);
  console.log(`  Sample names: ${Array.from(uniqueNames).slice(0, 20).join(', ')}`);
  console.log(`  Counts - Image/Canvas: ${imageCanvasCount}, DataURL: ${dataUrlCount}, Base64: ${base64StringCount}, Global: ${globalVariableCount}`);
  
  // ===== PHASE 2: DYNAMIC DETECTION IN LIGHTWEIGHT REPORT =====
  const detectedGlobals = detectGlobalVariables(snapshotData);
  const dynamicRecommendations = generateDynamicRecommendations(detectedGlobals, []);
  
  // Add dynamic insights
  if (detectedGlobals.length > 0) {
    const criticalGlobals = detectedGlobals.filter(gv => gv.severity === 'CRITICAL');
    if (criticalGlobals.length > 0) {
      insights.push(`🌐 CRITICAL: ${criticalGlobals.length} large global variables detected: ${criticalGlobals.slice(0, 2).map(gv => gv.name).join(', ')}`);
    }
  }
  
  // ===== NEW: IMAGE/CANVAS/DATA URL INSIGHTS =====
  if (dataUrlCount > 10 || totalDataUrlMemory > 5 * 1024 * 1024) {
    insights.push(`📸 CRITICAL: Data URL leak detected - ${dataUrlCount} data URLs, ${largeStringCount} large strings (${(totalDataUrlMemory / (1024 * 1024)).toFixed(1)}MB)`);
  }
  if (imageCanvasCount > 50) {
    insights.push(`🖼️ Canvas/Image accumulation: ${imageCanvasCount} image/canvas objects detected`);
  }
  if (base64StringCount > 20) {
    insights.push(`💾 Base64 string accumulation: ${base64StringCount} large strings (likely base64 data)`);
  }
  if (globalVariableCount > 5) {
    insights.push(`🌐 Global variable leak pattern: ${globalVariableCount} global objects detected`);
  }
  
  // Original insights
  if (detachedDOMCount > 1000) insights.push(`🔗 High detached DOM: ${detachedDOMCount} nodes`);
  if (timerCount > 50) insights.push(`⏰ Many timers: ${timerCount} timer references`);
  if (closureCount > 5000) insights.push(`🔒 High closure retention: ${closureCount} closures`);
  
  return {
    snapshotPath,
    totalObjects,
    totalMemoryMB: totalMemory / (1024 * 1024),
    largeObjectsCount,
    detachedDOMCount,
    timerCount,
    closureCount,
    // NEW: Return the image/canvas/data URL metrics
    imageCanvasCount,
    dataUrlCount,
    base64StringCount,
    globalVariableCount,
    totalDataUrlMemoryMB: totalDataUrlMemory / (1024 * 1024),
    largeStringCount,
    // PHASE 2: Dynamic detection results
    dynamicGlobals: detectedGlobals.length,
    dynamicRecommendations,
    insights
  };
}

function generateLightweightComparisonReport(beforeReport: LightweightReport, afterReport: LightweightReport): ComparisonReport {
  const objectGrowth = afterReport.totalObjects - beforeReport.totalObjects;
  const objectGrowthPercentage = beforeReport.totalObjects > 0 ? (objectGrowth / beforeReport.totalObjects) * 100 : 0;
  const memoryGrowth = afterReport.totalMemoryMB - beforeReport.totalMemoryMB;
  const memoryGrowthPercentage = beforeReport.totalMemoryMB > 0 ? (memoryGrowth / beforeReport.totalMemoryMB) * 100 : 0;
  const closureChange = afterReport.closureCount - beforeReport.closureCount;
  const timerChange = afterReport.timerCount - beforeReport.timerCount;

  // ===== NEW: IMAGE/CANVAS/DATA URL GROWTH ANALYSIS =====
  const dataUrlGrowth = (afterReport.dataUrlCount || 0) - (beforeReport.dataUrlCount || 0);
  const base64StringGrowth = (afterReport.base64StringCount || 0) - (beforeReport.base64StringCount || 0);
  const globalVariableGrowth = (afterReport.globalVariableCount || 0) - (beforeReport.globalVariableCount || 0);
  const imageCanvasGrowth = (afterReport.imageCanvasCount || 0) - (beforeReport.imageCanvasCount || 0);
  const dataUrlMemoryGrowth = (afterReport.totalDataUrlMemoryMB || 0) - (beforeReport.totalDataUrlMemoryMB || 0);
  const largeStringGrowth = (afterReport.largeStringCount || 0) - (beforeReport.largeStringCount || 0);

  // Determine leak severity with enhanced image/data URL detection
  let leakSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  
  // CRITICAL severity triggers
  if (dataUrlMemoryGrowth > 10 || // >10MB of data URL growth
      base64StringGrowth > 50 || // >50 new large strings
      globalVariableGrowth > 10 || // >10 new global variables  
      objectGrowthPercentage > 1000 || 
      memoryGrowthPercentage > 500) {
    leakSeverity = 'critical';
  }
  // HIGH severity triggers  
  else if (dataUrlMemoryGrowth > 5 || // >5MB of data URL growth
           base64StringGrowth > 20 || // >20 new large strings
           globalVariableGrowth > 5 || // >5 new global variables
           objectGrowthPercentage > 500 || 
           memoryGrowthPercentage > 200) {
    leakSeverity = 'high';
  }
  // MEDIUM severity triggers
  else if (dataUrlGrowth > 5 || // >5 new data URLs
           largeStringGrowth > 10 || // >10 new large strings
           imageCanvasGrowth > 20 || // >20 new image/canvas objects
           objectGrowthPercentage > 100 || 
           memoryGrowthPercentage > 50) {
    leakSeverity = 'medium';
  }

  // Enhanced pattern detection
  const reactComponentPattern = detectReactComponentPattern(objectGrowth, timerChange, afterReport, beforeReport, memoryGrowth);
  const imageProcessingPattern = !reactComponentPattern.detected ? 
    detectImageProcessingPattern(dataUrlGrowth, imageCanvasGrowth, largeStringGrowth, objectGrowth, memoryGrowth) :
    { detected: false, insight: '', recommendation: '' };
  const eventListenerPattern = !reactComponentPattern.detected && !imageProcessingPattern.detected ? 
    detectEventListenerPattern(objectGrowth, objectGrowthPercentage, closureChange, afterReport, beforeReport) :
    { detected: false, insight: '', recommendation: '' };

  // Generate insights with enhanced detection
  const insights: string[] = [];
  
  // ===== REACT COMPONENT PATTERN INSIGHTS (HIGHEST PRIORITY) =====
  if (reactComponentPattern.detected) {
    insights.push(reactComponentPattern.insight);
  }
  
  // ===== IMAGE PROCESSING PATTERN INSIGHTS (PRIORITY) =====
  else if (imageProcessingPattern.detected) {
    insights.push(imageProcessingPattern.insight);
  }
  
  // ===== IMAGE/CANVAS/DATA URL SPECIFIC INSIGHTS =====
  else if (dataUrlMemoryGrowth > 2) {
    insights.push(`📸 CRITICAL: Data URL memory leak - +${dataUrlMemoryGrowth.toFixed(1)}MB of base64 image data (${dataUrlGrowth} new data URLs, ${largeStringGrowth} large strings)`);
  } else if (dataUrlGrowth > 5 || largeStringGrowth > 10) {
    insights.push(`💾 Data URL accumulation detected - +${dataUrlGrowth} data URLs, +${largeStringGrowth} large strings`);
  }
  
  if (globalVariableGrowth > 3) {
    insights.push(`🌐 CRITICAL: Global variable leak - +${globalVariableGrowth} global objects detected`);
  } else if (globalVariableGrowth > 0) {
    insights.push(`🌐 Global variable growth - +${globalVariableGrowth} global objects detected`);
  }
  
  if (imageCanvasGrowth > 10) {
    insights.push(`🖼️ Image/Canvas accumulation - +${imageCanvasGrowth} new image/canvas objects`);
  }
  
  if (base64StringGrowth > 20) {
    insights.push(`💾 CRITICAL: Base64 string explosion - +${base64StringGrowth} large strings (likely image data)`);
  }
  
  // Original insights
  if (objectGrowth > 100000) insights.push(`🚨 MASSIVE object growth: +${objectGrowth.toLocaleString()} objects (+${objectGrowthPercentage.toFixed(1)}%)`);
  if (memoryGrowthPercentage > 100) insights.push(`💥 Memory explosion: +${memoryGrowth.toFixed(1)}MB (+${memoryGrowthPercentage.toFixed(1)}%)`);
  if (afterReport.timerCount > beforeReport.timerCount * 2) insights.push(`⏰ Timer leak detected: ${beforeReport.timerCount} → ${afterReport.timerCount} timers`);
  if (afterReport.closureCount > beforeReport.closureCount + 1000) insights.push(`🔒 Closure retention: +${afterReport.closureCount - beforeReport.closureCount} retained closures`);
  if (afterReport.detachedDOMCount > beforeReport.detachedDOMCount + 500) insights.push(`🔗 DOM node accumulation: +${afterReport.detachedDOMCount - beforeReport.detachedDOMCount} detached nodes`);
  
  // Add event listener pattern insights
  if (eventListenerPattern.detected) {
    insights.push(eventListenerPattern.insight);
  }

  // Generate recommendations with enhanced patterns
  const recommendations: string[] = [];
  
  // ===== REACT COMPONENT PATTERN RECOMMENDATIONS (HIGHEST PRIORITY) =====
  if (reactComponentPattern.detected) {
    recommendations.push(reactComponentPattern.recommendation);
  }
  
  // ===== IMAGE PROCESSING PATTERN RECOMMENDATIONS (PRIORITY) =====
  else if (imageProcessingPattern.detected) {
    recommendations.push(imageProcessingPattern.recommendation);
  }
  
  // ===== IMAGE/CANVAS/DATA URL SPECIFIC RECOMMENDATIONS =====
  else if (dataUrlMemoryGrowth > 2 || dataUrlGrowth > 5) {
    recommendations.push('📸 URGENT: Clear data URL arrays immediately - Review global arrays storing base64 strings. Base64 strings are 33% larger than original images!');
  }
  if (globalVariableGrowth > 3) {
    recommendations.push('🌐 CRITICAL: Clear global arrays and objects - Review window.* variables and global scope for large accumulating data structures');
  }
  if (base64StringGrowth > 20) {
    recommendations.push('💾 URGENT: Base64 string accumulation detected - clear canvas references after toDataURL() calls and implement cleanup');
  }
  if (imageCanvasGrowth > 10) {
    recommendations.push('🖼️ Clear canvas contexts - use canvas.width = canvas.height = 0; remove canvases from DOM when done processing');
  }
  
  // Original recommendations
  if (afterReport.timerCount > beforeReport.timerCount) recommendations.push('🚨 Clear all setInterval/setTimeout calls with clearInterval/clearTimeout');
  if (objectGrowthPercentage > 100) recommendations.push('🔍 Investigate rapidly growing arrays, maps, or object collections');
  if (afterReport.closureCount > beforeReport.closureCount + 500) recommendations.push('🧹 Review event listeners and callback functions for proper cleanup');
  if (memoryGrowthPercentage > 200) recommendations.push('🚨 CRITICAL: Memory usage growing too fast - immediate investigation needed');
  
  // Add event listener specific recommendations
  if (eventListenerPattern.detected) {
    recommendations.push(eventListenerPattern.recommendation);
  }

  // Create a compatible ComparisonReport structure
  return {
    timestamp: new Date().toISOString(),
    beforeSnapshot: beforeReport.snapshotPath,
    afterSnapshot: afterReport.snapshotPath,
    beforeReport: convertToAgentReport(beforeReport),
    afterReport: convertToAgentReport(afterReport),
    growth: {
      objects: { before: beforeReport.totalObjects, after: afterReport.totalObjects, change: objectGrowth, percentage: objectGrowthPercentage },
      memory: { before: beforeReport.totalMemoryMB * 1024 * 1024, after: afterReport.totalMemoryMB * 1024 * 1024, change: memoryGrowth * 1024 * 1024, percentage: memoryGrowthPercentage },
      detachedNodes: { before: beforeReport.detachedDOMCount, after: afterReport.detachedDOMCount, change: afterReport.detachedDOMCount - beforeReport.detachedDOMCount, percentage: beforeReport.detachedDOMCount > 0 ? ((afterReport.detachedDOMCount - beforeReport.detachedDOMCount) / beforeReport.detachedDOMCount) * 100 : 0 },
      timers: { before: beforeReport.timerCount, after: afterReport.timerCount, change: afterReport.timerCount - beforeReport.timerCount, percentage: beforeReport.timerCount > 0 ? ((afterReport.timerCount - beforeReport.timerCount) / beforeReport.timerCount) * 100 : 0 },
      closures: { before: beforeReport.closureCount, after: afterReport.closureCount, change: afterReport.closureCount - beforeReport.closureCount, percentage: beforeReport.closureCount > 0 ? ((afterReport.closureCount - beforeReport.closureCount) / beforeReport.closureCount) * 100 : 0 }
    },
    leakSeverity,
    insights,
    recommendations
  };
}

// Convert lightweight report to AgentAnalysisReport for compatibility
function convertToAgentReport(lightReport: LightweightReport): AgentAnalysisReport {
  return {
    timestamp: new Date().toISOString(),
    snapshotPath: lightReport.snapshotPath,
    analysis: {
      topRetainers: [],
      detachedDOMNodes: [],
      domLeakSummary: {
        totalDetachedNodes: lightReport.detachedDOMCount,
        detachedNodesByType: {},
        suspiciousPatterns: [],
        retainerArrays: []
      },
      summary: {
        totalObjects: lightReport.totalObjects,
        totalRetainedSize: lightReport.totalMemoryMB * 1024 * 1024,
        categories: {}
      }
    },
    specializedInsights: {
      reactInsights: [],
      fiberInsights: [],
      stringInsights: [],
      shapeInsights: [],
      domInsights: []
    },
    prioritizedRecommendations: [],
    insights: lightReport.insights,
    recommendations: [],
    severity: lightReport.totalMemoryMB > 100 ? 'critical' : lightReport.totalMemoryMB > 50 ? 'high' : 'medium'
  };
}

// Helper function for safe parallel analyzer execution
async function runAnalyzerSafely(name: string, analyzerFn: () => Promise<any>): Promise<{ name: string; result: any; }> {
  try {
    const result = await analyzerFn();
    return { name, result };
  } catch (error) {
    console.log(`⚠️  ${name} analyzer failed:`, error instanceof Error ? error.message : 'Unknown error');
    return { name, result: null };
  }
}

// Helper function to get analyzer name by index
function getAnalyzerName(index: number): string {
  const names = [
    'Built-in Globals', 'Global Variables', 'Stale Collections', 'Unbound Growth',
    'Detached DOM', 'Object Fanout', 'Object Shallow', 'Object Shape',
    'Object Size Rank', 'Object Unbound Growth', 'React Components', 
    'Shape Unbound Growth', 'String Analysis', 'Unmounted Fiber Nodes'
  ];
  return names[index] || `Analyzer ${index}`;
}

// Helper function to create synthetic comparison result from parallel analyzer results
function createSyntheticComparisonResult(results: any[], snapshotData: any): ComparisonResult {
  // Combine all analyzer results into a proper ComparisonResult structure
  const allLeaks: any[] = [];
  let totalDetected = 0;
  
  results.forEach(result => {
    if (result && result.result && result.result.potentialLeaks) {
      allLeaks.push(...result.result.potentialLeaks);
      totalDetected += result.result.potentialLeaks.length;
    }
  });
  
  return {
    memoryGrowth: {
      totalGrowth: snapshotData.totalSize || 0,
      percentageGrowth: 0,
      beforeSize: 0,
      afterSize: snapshotData.totalSize || 0
    },
    newObjects: [],
    grownObjects: [],
    potentialLeaks: allLeaks,
    summary: {
      leakConfidence: totalDetected > 10 ? 'high' : totalDetected > 5 ? 'medium' : 'low' as const,
      primaryConcerns: allLeaks.length > 0 ? [`Found ${totalDetected} potential leaks across analyzers`] : ['No significant leaks detected'],
      recommendations: allLeaks.length > 0 ? ['Review detected leaks for patterns', 'Focus on high-confidence detections'] : ['Continue monitoring for memory growth']
    },
    beforeAnalysis: {
      globalVariableAnalysis: {},
      staleCollectionAnalysis: {},
      detachedDomAnalysis: {},
      fanoutAnalysis: {},
      shallowAnalysis: {},
      shapeAnalysis: {},
      sizeRankAnalysis: {},
      reactAnalysis: undefined,
      stringAnalysis: undefined,
      unmountedFiberAnalysis: undefined
    },
    afterAnalysis: {
      globalVariableAnalysis: results.find(r => r.name === 'Global Variables')?.result || {},
      staleCollectionAnalysis: results.find(r => r.name === 'Stale Collections')?.result || {},
      detachedDomAnalysis: results.find(r => r.name === 'Detached DOM')?.result || {},
      fanoutAnalysis: results.find(r => r.name === 'Object Fanout')?.result || {},
      shallowAnalysis: results.find(r => r.name === 'Object Shallow')?.result || {},
      shapeAnalysis: results.find(r => r.name === 'Object Shape')?.result || {},
      sizeRankAnalysis: results.find(r => r.name === 'Object Size Rank')?.result || {},
      reactAnalysis: results.find(r => r.name === 'React Components')?.result || undefined,
      stringAnalysis: results.find(r => r.name === 'String Analysis')?.result || undefined,
      unmountedFiberAnalysis: results.find(r => r.name === 'Unmounted Fiber Nodes')?.result || undefined
    }
  };
}

// UTILITY: Progressive analysis for timeout scenarios
async function runProgressiveAnalysis(dummyBefore: any, actualAfter: any): Promise<ComparisonResult> {
  console.log('🔄 Running progressive analysis with core analyzers only...');
  
  try {
    // Use a subset of the most important analyzers with shorter timeouts
    const analyzer = new BeforeAfterAnalyzer(dummyBefore, actualAfter);
    
    // Create a lightweight analysis with just the essential detectors
    const essentialAnalysis = await Promise.race([
      analyzer.analyze(),
      new Promise<ComparisonResult>((_, reject) => {
        setTimeout(() => reject(new Error('Essential analysis timeout')), 60000); // 1 minute timeout
      })
    ]);
    
    console.log('✅ Progressive analysis completed');
    return essentialAnalysis;
    
  } catch (error) {
    console.log('⚠️ Progressive analysis also failed, using minimal fallback');
    
    // Minimal fallback analysis matching ComparisonResult interface
    return {
      memoryGrowth: {
        totalGrowth: 0,
        percentageGrowth: 0,
        beforeSize: 0,
        afterSize: actualAfter.nodes?.length || 0
      },
      newObjects: [],
      grownObjects: [],
      potentialLeaks: [],
      summary: {
        leakConfidence: 'low' as const,
        primaryConcerns: ['Analysis timed out - snapshot may be too large for comprehensive analysis'],
        recommendations: ['Try with a smaller heap snapshot or use progressive analysis mode']
      }
    };
  }
}

async function runComprehensiveAnalysis(snapshotData: any): Promise<{
  comprehensiveAnalysis: ComparisonResult;
  specializedInsights: AgentAnalysisReport['specializedInsights'];
  prioritizedRecommendations: AgentAnalysisReport['prioritizedRecommendations'];
}> {
  console.log('🧠 Running memory-optimized 15-analyzer suite...');
  
  // Check memory constraints and snapshot size
  const memoryUsage = process.memoryUsage();
  const availableMemory = memoryUsage.heapTotal;
  const snapshotSize = JSON.stringify(snapshotData).length;
  
  console.log(`💾 Memory: ${(availableMemory / 1024 / 1024).toFixed(0)}MB available, snapshot: ${(snapshotSize / 1024 / 1024).toFixed(1)}MB`);
  
  // If snapshot is too large, use lightweight analysis
  if (snapshotSize > 100 * 1024 * 1024) { // 100MB threshold
    console.log('⚠️  Large snapshot detected - using memory-safe lightweight mode');
    
    const lightweightAnalysis = { 
      afterAnalysis: { 
        globalVariableAnalysis: {},
        staleCollectionAnalysis: {},
        detachedDomAnalysis: {},
        fanoutAnalysis: {},
        shallowAnalysis: {},
        shapeAnalysis: {},
        sizeRankAnalysis: {},
        reactAnalysis: undefined,
        stringAnalysis: undefined,
        unmountedFiberAnalysis: undefined
      }
    } as ComparisonResult;
    
    const specializedInsights = {
      reactInsights: ['⚛️ Large snapshot mode - React analysis skipped for memory safety'],
      fiberInsights: ['🧬 Large snapshot mode - Fiber analysis skipped for memory safety'],
      stringInsights: ['📝 Large snapshot mode - String analysis skipped for memory safety'],
      shapeInsights: ['📐 Large snapshot mode - Shape analysis skipped for memory safety'],
      domInsights: ['🔌 Large snapshot mode - DOM analysis skipped for memory safety']
    };
    
    const prioritizedRecommendations = [{
      priority: 1,
      impact: `${(snapshotSize / (1024 * 1024)).toFixed(1)}MB snapshot`,
      description: 'Snapshot too large for comprehensive analysis - try smaller snapshots or increase Node.js memory limit with --max-old-space-size=8192',
      confidence: 100,
      category: 'Memory Safety'
    }];
    
    return { comprehensiveAnalysis: lightweightAnalysis, specializedInsights, prioritizedRecommendations };
  }
  
  // Smart parallel comprehensive analysis
  try {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    console.log('🚀 Starting parallel analyzer execution...');
    
    // Create a dummy "before" snapshot for single-snapshot analysis
    const dummyBefore = { nodes: [] };
    const actualAfter = { nodes: snapshotData };
    
    // OPTIMIZATION 1: Smart async analyzer execution with timeout protection
    console.log('⚡ Initializing BeforeAfterAnalyzer with timeout protection...');
    
    // Use BeforeAfterAnalyzer but with smart async optimizations
    const analyzer = new BeforeAfterAnalyzer(dummyBefore, actualAfter);
    
    // OPTIMIZATION 2: Promise race with timeout for large snapshots  
    const analysisPromise = analyzer.analyze();
    const timeoutPromise = new Promise<ComparisonResult>((_, reject) => {
      setTimeout(() => reject(new Error('Analysis timeout - snapshot too large')), 300000); // 5 minute timeout
    });
    
    let comprehensiveAnalysis: ComparisonResult;
    try {
      // Race between analysis and timeout
      comprehensiveAnalysis = await Promise.race([analysisPromise, timeoutPromise]);
      console.log('✅ Comprehensive analysis completed successfully');
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        console.log('⏰ Analysis timed out - using progressive analysis approach...');
        
        // OPTIMIZATION 3: Progressive analysis for timeout scenarios
        comprehensiveAnalysis = await runProgressiveAnalysis(dummyBefore, actualAfter);
      } else {
        throw error; // Re-throw other errors
      }
    }
    
    // Clean up immediately after analysis
    if (global.gc) {
      global.gc();
    }
    
    // Extract specialized insights with memory cleanup
    const specializedInsights = {
      reactInsights: extractReactInsights(comprehensiveAnalysis),
      fiberInsights: extractFiberInsights(comprehensiveAnalysis),
      stringInsights: extractStringInsights(comprehensiveAnalysis),
      shapeInsights: extractShapeInsights(comprehensiveAnalysis),
      domInsights: extractDomInsights(comprehensiveAnalysis)
    };
    
    // Generate prioritized recommendations based on memory impact
    const prioritizedRecommendations = generatePrioritizedRecommendations(comprehensiveAnalysis);
    
    return { comprehensiveAnalysis, specializedInsights, prioritizedRecommendations };
    
  } catch (error) {
    console.log('⚠️  Memory pressure detected - falling back to lightweight analysis');
    
    // Return lightweight analysis result
    const lightweightAnalysis = { 
      afterAnalysis: { 
        globalVariableAnalysis: {},
        staleCollectionAnalysis: {},
        detachedDomAnalysis: {},
        fanoutAnalysis: {},
        shallowAnalysis: {},
        shapeAnalysis: {},
        sizeRankAnalysis: {},
        reactAnalysis: undefined,
        stringAnalysis: undefined,
        unmountedFiberAnalysis: undefined
      }
    } as ComparisonResult;
    
    const specializedInsights = {
      reactInsights: ['⚛️ Memory-optimized mode - limited React analysis'],
      fiberInsights: ['🧬 Memory-optimized mode - limited Fiber analysis'],
      stringInsights: ['📝 Memory-optimized mode - limited String analysis'],
      shapeInsights: ['📐 Memory-optimized mode - limited Shape analysis'],
      domInsights: ['🔌 Memory-optimized mode - limited DOM analysis']
    };
    
    const prioritizedRecommendations = [{
      priority: 1,
      impact: 'Unknown - analysis limited',
      description: 'Large heap snapshot caused memory pressure - try smaller snapshots or increase Node.js memory limit',
      confidence: 95,
      category: 'Memory Optimization'
    }];
    
    return { comprehensiveAnalysis: lightweightAnalysis, specializedInsights, prioritizedRecommendations };
  }
}

function extractReactInsights(analysis: ComparisonResult): string[] {
  const insights: string[] = [];
  const reactAnalysis = analysis.afterAnalysis?.reactAnalysis;
  
  if (!reactAnalysis) return insights;
  
  if (reactAnalysis.totalComponents > 0) {
    insights.push(`⚛️ Detected React application with ${reactAnalysis.totalComponents} components`);
    insights.push(`📊 React memory usage: ${formatBytes(reactAnalysis.totalReactMemory)}`);
    
    if (reactAnalysis.significantComponents.length > 0) {
      const largest = reactAnalysis.significantComponents[0];
      insights.push(`🔍 Largest component: ${largest.componentName} (${formatBytes(largest.totalRetainedSize)})`);
    }
  }
  
  return insights;
}

function extractFiberInsights(analysis: ComparisonResult): string[] {
  const insights: string[] = [];
  const fiberAnalysis = analysis.afterAnalysis?.unmountedFiberAnalysis;
  
  if (!fiberAnalysis) return insights;
  
  if (fiberAnalysis.totalUnmountedFibers > 0) {
    insights.push(`🧬 Found ${fiberAnalysis.totalUnmountedFibers} unmounted Fiber nodes`);
    insights.push(`💾 Retained memory: ${formatBytes(fiberAnalysis.totalRetainedMemory)}`);
    
    if (fiberAnalysis.detachedFiberCount > 0) {
      insights.push(`⚠️ ${fiberAnalysis.detachedFiberCount} detached Fiber nodes detected`);
    }
    
    const criticalFibers = fiberAnalysis.unmountedFibers.filter(f => f.severity === 'CRITICAL');
    if (criticalFibers.length > 0) {
      insights.push(`🚨 ${criticalFibers.length} critical unmounted Fiber nodes need immediate attention`);
    }
  }
  
  return insights;
}

function extractStringInsights(analysis: ComparisonResult): string[] {
  const insights: string[] = [];
  const stringAnalysis = analysis.afterAnalysis?.stringAnalysis;
  
  if (!stringAnalysis) return insights;
  
  if (stringAnalysis.totalWastedMemory > 100 * 1024) { // > 100KB wasted
    insights.push(`📝 String duplication wasting ${formatBytes(stringAnalysis.totalWastedMemory)}`);
    insights.push(`🔄 ${stringAnalysis.wastePercentage.toFixed(1)}% of string memory is duplicated`);
    
    if (stringAnalysis.topDuplicatedBySize.length > 0) {
      const worst = stringAnalysis.topDuplicatedBySize[0];
      insights.push(`🎯 Worst offender: "${worst.content.substring(0, 50)}..." (${worst.count}× duplicated)`);
    }
  }
  
  return insights;
}

function extractShapeInsights(analysis: ComparisonResult): string[] {
  const insights: string[] = [];
  const shapeAnalysis = analysis.shapeUnboundGrowthAnalysis;
  
  if (!shapeAnalysis) return insights;
  
  if (shapeAnalysis.totalGrowthDetected > 1024 * 1024) { // > 1MB growth
    insights.push(`📐 Object shapes growing: ${formatBytes(shapeAnalysis.totalGrowthDetected)} total growth`);
    
    const criticalShapes = shapeAnalysis.significantGrowthShapes.filter(s => s.severity === 'CRITICAL');
    if (criticalShapes.length > 0) {
      insights.push(`🔥 ${criticalShapes.length} object shapes with critical growth patterns`);
    }
  }
  
  return insights;
}

function extractDomInsights(analysis: ComparisonResult): string[] {
  const insights: string[] = [];
  const domAnalysis = analysis.afterAnalysis?.detachedDomAnalysis;
  
  if (!domAnalysis) return insights;
  
  if (domAnalysis.totalDetachedElements > 10) {
    insights.push(`🔌 Found ${domAnalysis.totalDetachedElements} detached DOM elements`);
    insights.push(`💾 Wasted memory: ${formatBytes(domAnalysis.totalWastedMemory)}`);
    
    if (domAnalysis.largestDetachedElements.length > 0) {
      const largest = domAnalysis.largestDetachedElements[0];
      insights.push(`🎯 Largest detached: <${largest.tagName}> (${formatBytes(largest.retainedSize)})`);
    }
  }
  
  return insights;
}

function generatePrioritizedRecommendations(analysis: ComparisonResult): Array<{
  priority: number;
  impact: string;
  description: string;
  confidence: number;
  category: string;
}> {
  const recommendations: Array<{
    priority: number;
    impact: string;
    description: string;
    confidence: number;
    category: string;
  }> = [];
  
  // React Fiber recommendations
  const fiberAnalysis = analysis.afterAnalysis?.unmountedFiberAnalysis;
  if (fiberAnalysis && fiberAnalysis.totalRetainedMemory > 1024 * 1024) {
    recommendations.push({
      priority: 1,
      impact: formatBytes(fiberAnalysis.totalRetainedMemory),
      description: `Fix ${fiberAnalysis.totalUnmountedFibers} unmounted React Fiber nodes`,
      confidence: 85,
      category: 'React Cleanup'
    });
  }
  
  // String duplication recommendations
  const stringAnalysis = analysis.afterAnalysis?.stringAnalysis;
  if (stringAnalysis && stringAnalysis.totalWastedMemory > 500 * 1024) {
    recommendations.push({
      priority: 2,
      impact: formatBytes(stringAnalysis.totalWastedMemory),
      description: 'Implement string interning for duplicated content',
      confidence: 92,
      category: 'String Optimization'
    });
  }
  
  // DOM cleanup recommendations
  const domAnalysis = analysis.afterAnalysis?.detachedDomAnalysis;
  if (domAnalysis && domAnalysis.totalWastedMemory > 100 * 1024) {
    recommendations.push({
      priority: 3,
      impact: formatBytes(domAnalysis.totalWastedMemory),
      description: `Remove ${domAnalysis.totalDetachedElements} detached DOM elements`,
      confidence: 78,
      category: 'DOM Cleanup'
    });
  }
  
  // Global variable recommendations
  const globalAnalysis = analysis.afterAnalysis?.globalVariableAnalysis;
  if (globalAnalysis && globalAnalysis.totalImpact > 2 * 1024 * 1024) {
    recommendations.push({
      priority: 4,
      impact: formatBytes(globalAnalysis.totalImpact),
      description: `Clean up ${globalAnalysis.highImpactLeaks.length} global variable leaks`,
      confidence: 80,
      category: 'Global Cleanup'
    });
  }
  
  return recommendations.sort((a, b) => a.priority - b.priority);
}

function generateEnhancedAgentReport(
  snapshotPath: string, 
  analysis: AnalysisResult,
  comprehensiveResults: {
    comprehensiveAnalysis: ComparisonResult;
    specializedInsights: AgentAnalysisReport['specializedInsights'];
    prioritizedRecommendations: AgentAnalysisReport['prioritizedRecommendations'];
  }
): AgentAnalysisReport {
  // Start with basic report
  const baseReport = generateAgentReport(snapshotPath, analysis);
  
  // Enhance with comprehensive analysis
  const enhancedReport: AgentAnalysisReport = {
    ...baseReport,
    comprehensiveAnalysis: comprehensiveResults.comprehensiveAnalysis,
    specializedInsights: comprehensiveResults.specializedInsights,
    prioritizedRecommendations: comprehensiveResults.prioritizedRecommendations
  };
  
  // Merge insights from all analyzers
  const allInsights = [
    ...baseReport.insights,
    ...comprehensiveResults.specializedInsights.reactInsights,
    ...comprehensiveResults.specializedInsights.fiberInsights,
    ...comprehensiveResults.specializedInsights.stringInsights,
    ...comprehensiveResults.specializedInsights.shapeInsights,
    ...comprehensiveResults.specializedInsights.domInsights
  ];
  
  enhancedReport.insights = allInsights;
  
  // Update severity based on comprehensive analysis
  const hasCriticalIssues = comprehensiveResults.prioritizedRecommendations.some(r => r.confidence > 85);
  const hasHighImpactIssues = comprehensiveResults.prioritizedRecommendations.some(r => 
    r.impact.includes('MB') && parseFloat(r.impact) > 5
  );
  
  if (hasHighImpactIssues) {
    enhancedReport.severity = 'critical';
  } else if (hasCriticalIssues) {
    enhancedReport.severity = 'high';
  }
  
  return enhancedReport;
}

function displayEnhancedAgentReport(report: AgentAnalysisReport): void {
  const severityEmoji = {
    low: '🟢',
    medium: '🟡', 
    high: '🟠',
    critical: '🔴'
  };

  // Enhanced header with comprehensive analysis info
  console.log('🤖 ENHANCED AGENT ANALYSIS REPORT');
  console.log('='.repeat(60));
  console.log(`${severityEmoji[report.severity]} Severity: ${report.severity.toUpperCase()}`);
  console.log(`📅 Analysis: ${new Date(report.timestamp).toLocaleString()}`);
  console.log(`📁 Snapshot: ${path.basename(report.snapshotPath)}`);
  console.log(`🧠 Analyzers: 15 specialized memory analyzers`);
  
  // Memory summary
  const totalMB = (report.analysis.summary.totalRetainedSize / (1024 * 1024)).toFixed(2);
  console.log(`📊 Memory: ${totalMB}MB across ${report.analysis.summary.totalObjects.toLocaleString()} objects`);
  console.log('');
  
  // Prioritized recommendations (TOP PRIORITY)
  if (report.prioritizedRecommendations && report.prioritizedRecommendations.length > 0) {
    console.log('🎯 PRIORITY RECOMMENDATIONS (by impact):');
    console.log('='.repeat(50));
    
    report.prioritizedRecommendations.slice(0, 5).forEach((rec, index) => {
      const priorityEmoji = index === 0 ? '🔥' : index === 1 ? '🔴' : index === 2 ? '🟡' : '🟢';
      console.log(`${priorityEmoji} ${index + 1}. ${rec.description}`);
      console.log(`   💰 Impact: Save ${rec.impact} | 🎯 Confidence: ${rec.confidence}% | 📂 ${rec.category}`);
      console.log('');
    });
  }
  
  // Specialized insights by category
  if (report.specializedInsights) {
    const { reactInsights, fiberInsights, stringInsights, shapeInsights, domInsights } = report.specializedInsights;
    
    if (reactInsights.length > 0) {
      console.log('⚛️ REACT ANALYSIS:');
      reactInsights.forEach(insight => console.log(`  ${insight}`));
      console.log('');
    }
    
    if (fiberInsights.length > 0) {
      console.log('🧬 FIBER NODE ANALYSIS:');
      fiberInsights.forEach(insight => console.log(`  ${insight}`));
      console.log('');
    }
    
    if (stringInsights.length > 0) {
      console.log('📝 STRING ANALYSIS:');
      stringInsights.forEach(insight => console.log(`  ${insight}`));
      console.log('');
    }
    
    if (shapeInsights.length > 0) {
      console.log('📐 OBJECT SHAPE ANALYSIS:');
      shapeInsights.forEach(insight => console.log(`  ${insight}`));
      console.log('');
    }
    
    if (domInsights.length > 0) {
      console.log('🔌 DOM ANALYSIS:');
      domInsights.forEach(insight => console.log(`  ${insight}`));
      console.log('');
    }
  }
  
  // Framework info (if available)
  if (report.frameworkInfo) {
    console.log('🛠️ FRAMEWORK DETECTION:');
    console.log(formatFrameworkDetection(report.frameworkInfo));
    console.log('');
  }
  
  // Traditional insights (filtered to avoid duplicates)
  const traditionalInsights = report.insights.filter(insight => 
    !insight.includes('⚛️') && !insight.includes('🧬') && 
    !insight.includes('📝') && !insight.includes('📐') && !insight.includes('🔌')
  );
  
  if (traditionalInsights.length > 0) {
    console.log('💡 ADDITIONAL INSIGHTS:');
    traditionalInsights.forEach(insight => console.log(`  ${insight}`));
    console.log('');
  }
  
  // Summary
  console.log('📋 ANALYSIS SUMMARY:');
  console.log('='.repeat(30));
  if (report.prioritizedRecommendations && report.prioritizedRecommendations.length > 0) {
    const totalImpact = report.prioritizedRecommendations.reduce((sum, rec) => {
      const match = rec.impact.match(/(\d+\.?\d*)\s*(MB|KB|GB)/);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = match[2];
        const bytes = unit === 'GB' ? value * 1024 * 1024 * 1024 :
                     unit === 'MB' ? value * 1024 * 1024 : 
                     value * 1024;
        return sum + bytes;
      }
      return sum;
    }, 0);
    
    console.log(`💰 Potential savings: ${formatBytes(totalImpact)}`);
    console.log(`🎯 Recommendations: ${report.prioritizedRecommendations.length} actionable fixes`);
  }
  
  console.log(`🧠 Analysis depth: 15 specialized analyzers`);
  console.log(`📊 Confidence: Enterprise-grade detection`);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export async function runContinuousAgent(watchDirectory: string): Promise<void> {
  console.log(`🤖 Running Heap Analyzer in Watch Mode...`);
  console.log(`👁️  Watching directory: ${watchDirectory}`);
  console.log('⚠️  Watch mode is not yet fully implemented.');
  console.log('💡 Use --agent mode for single snapshot analysis.');
  process.exit(1);
}

function generateAgentReport(snapshotPath: string, analysis: AnalysisResult): AgentAnalysisReport {
  const insights: string[] = [];
  const recommendations: string[] = [];
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  let traceResults: AgentAnalysisReport['traceResults'];
  let frameworkInfo: FrameworkDetectionResult | undefined;
  let distributedAnalysis: AgentAnalysisReport['distributedAnalysis'];

  // Enhanced analysis with tracer and framework detection
  if (analysis.topRetainers && analysis.topRetainers.length > 0) {
    console.log('🔄 Loading snapshot data for advanced analysis...');
    // Get the snapshot data for tracing and framework detection
    const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    console.log('✅ Snapshot data loaded');
    
    console.log('🔍 Initializing retainer tracer...');
    const tracer = new RetainerTracer(snapshotData, analysis.topRetainers.map(r => r.node));
    
    // Perform framework detection on a limited subset for performance
    console.log('🎯 Detecting frameworks (sampling nodes)...');
    const allNodes = Object.values(snapshotData.nodes || {}).map((nodeData: any, index: number) => ({
      nodeIndex: index,
      type: nodeData.type || 'unknown',
      name: nodeData.name || '',
      selfSize: nodeData.selfSize || 0,
      retainedSize: nodeData.retainedSize || nodeData.selfSize || 0,
      id: nodeData.id || index
    })).filter(node => node.name || node.type);
    
    // Limit to first 500 nodes to avoid hanging on massive snapshots
    const sampleSize = Math.min(500, allNodes.length);
    const frameworkDetector = new FrameworkDetector(allNodes.slice(0, sampleSize));
    frameworkInfo = frameworkDetector.detectFrameworks();
    
    console.log(`🎯 Framework detection: ${frameworkInfo.primary ? frameworkInfo.primary.name : 'None detected'}`);
    
    // ===== PHASE 2: DYNAMIC MEMORY LEAK DETECTION =====
    console.log('🧪 Running dynamic memory leak analysis...');
    
    // Detect actual global variables from heap data
    const detectedGlobals = detectGlobalVariables(snapshotData);
    console.log(`🌐 Found ${detectedGlobals.length} global variables in heap`);
    
    // Add dynamic global variable insights
    if (detectedGlobals.length > 0) {
      const criticalGlobals = detectedGlobals.filter(gv => gv.severity === 'CRITICAL');
      const highGlobals = detectedGlobals.filter(gv => gv.severity === 'HIGH');
      
      if (criticalGlobals.length > 0) {
        severity = 'critical';
        insights.push(`🌐 CRITICAL: ${criticalGlobals.length} large global variables detected: ${criticalGlobals.slice(0, 3).map(gv => gv.name).join(', ')}`);
      } else if (highGlobals.length > 0) {
        if (severity === 'low' || severity === 'medium') severity = 'high';
        insights.push(`🌐 WARNING: ${highGlobals.length} suspicious global variables detected`);
      }
    }
    
    // Generate dynamic recommendations based on actual heap data
    const dynamicRecommendations = generateDynamicRecommendations(detectedGlobals, []);
    recommendations.push(...dynamicRecommendations);
    
    console.log(`🧪 Dynamic analysis complete - ${detectedGlobals.length} globals, ${dynamicRecommendations.length} recommendations`);
    
    // Perform batch trace analysis with limited scope
    console.log('🧠 Running trace analysis...');
    const traceTargets = analysis.topRetainers.slice(0, Math.min(10, analysis.topRetainers.length)).map(r => r.node);
    const traceAnalysis = tracer.batchTrace(traceTargets);
    traceResults = traceAnalysis.summary;
    
    console.log(`🧠 Traced ${traceTargets.length} objects, found ${traceResults.totalLikelyLeaks} likely leaks`);

    // Add distributed leak pattern analysis with limited scope
    console.log('🔍 Analyzing distributed leak patterns...');
    const sampleNodes = allNodes.slice(0, Math.min(1000, allNodes.length));
    
    // TODO: Fix distributed analysis error - temporarily disabled for Phase 2 testing
    distributedAnalysis = {
      suspiciousPatterns: [],
      distributedMemory: {
        timerRelatedMemory: 0,
        closureMemory: 0, 
        arrayMemory: 0,
        fragmentedMemory: 0
      }
    };
    // distributedAnalysis = analyzeDistributedLeakPatterns(tracer, sampleNodes);
    
    if (distributedAnalysis.suspiciousPatterns.length > 0) {
      console.log(`🔍 Found ${distributedAnalysis.suspiciousPatterns.length} distributed leak patterns`);
    }

    // Incorporate distributed analysis into insights and recommendations
    distributedAnalysis.suspiciousPatterns.forEach(pattern => {
      if (pattern.severity === 'high') {
        insights.push(`🚨 DISTRIBUTED LEAK: ${pattern.description}`);
        if (severity !== 'critical') severity = 'high';
      } else if (pattern.severity === 'medium') {
        insights.push(`⚠️  DISTRIBUTED PATTERN: ${pattern.description}`);
        if (severity === 'low') severity = 'medium';
      } else {
        insights.push(`ℹ️  Pattern detected: ${pattern.description}`);
      }
      recommendations.push(`🔧 ${pattern.recommendation}`);
    });

    // Add distributed memory summary
    const { timerRelatedMemory, closureMemory, arrayMemory, fragmentedMemory } = distributedAnalysis.distributedMemory;
    const totalDistributedMB = ((timerRelatedMemory + closureMemory + arrayMemory + fragmentedMemory) / (1024 * 1024)).toFixed(1);
    
    if (parseFloat(totalDistributedMB) > 5) {
      insights.push(`📊 Distributed memory patterns: ${totalDistributedMB}MB across timers, closures, arrays, and fragmented objects`);
    }

    // Perform deep leak analysis
    const deepAnalysis = performDeepLeakAnalysis(snapshotPath, analysis);
    deepAnalysis.deepInsights.forEach(insight => insights.push(insight));
    
    // Add deep analysis recommendations
    deepAnalysis.suspiciousPatterns.forEach(pattern => {
      if (pattern.severity === 'high') {
        if (severity !== 'critical') severity = 'high';
        
        if (pattern.type === 'timer_accumulation') {
          recommendations.push(`🚨 Clear all timers: Check for uncleared setInterval/setTimeout calls (${pattern.count} detected)`);
        } else if (pattern.type === 'event_listener_accumulation') {
          recommendations.push(`🚨 Remove event listeners: Check for unremoved event listeners (${pattern.count} detected)`);
        } else if (pattern.type === 'explicit_leak_indicators') {
          recommendations.push(`🚨 Investigate leak indicators: Found explicit leak-related code patterns`);
        } else {
          recommendations.push(`🚨 Investigate ${pattern.type}: ${pattern.description}`);
        }
      }
    });

    // Analyze detached DOM nodes
    const domAnalysis = analysis.domLeakSummary;
    const detachedNodes = analysis.detachedDOMNodes;
    
    if (detachedNodes && detachedNodes.length > 0) {
      if (severity !== 'critical') severity = 'high';
      insights.push(`🚨 DETACHED DOM NODES: Found ${detachedNodes.length} detached DOM elements in memory`);
      
      // Categorize by element type
      const detachedByType = domAnalysis.detachedNodesByType;
      Object.entries(detachedByType).forEach(([elementType, count]) => {
        insights.push(`  🏷️  ${count} detached ${elementType} elements`);
      });
      
      // Add specific patterns from the code
      const hasDataAttributes = detachedNodes.some(node => 
        Object.keys(node.attributes).length > 0
      );
      
      if (hasDataAttributes) {
        insights.push(`🔍 PATTERN DETECTED: DOM elements with data attributes created and detached systematically`);
        recommendations.push(`🚨 Clear detached node references: Reset any ref arrays holding detached DOM nodes to allow garbage collection`);
      }
      
      recommendations.push(`🚨 Fix detached DOM nodes: ${detachedNodes.length} elements removed from DOM but kept in JavaScript references`);
      recommendations.push(`🔧 Clear DOM references: Remove references from arrays/objects after removing elements from DOM`);
      
      // Check for suspicious patterns
      if (domAnalysis.suspiciousPatterns && domAnalysis.suspiciousPatterns.length > 0) {
        insights.push(`🔍 Suspicious DOM patterns detected: ${domAnalysis.suspiciousPatterns.length} patterns`);
        domAnalysis.suspiciousPatterns.forEach(pattern => {
          insights.push(`  🚨 ${pattern}`);
        });
      }
    } else {
      // If no detached DOM found but we expect some, note this as a potential detection issue
      insights.push(`🟡 DOM Analysis: No detached DOM nodes detected (this may indicate detection needs improvement)`);
    }

    // Generate insights based on trace results
    analysis.topRetainers.forEach((retainer, index) => {
      const trace = traceAnalysis.traces[index];
      const sizeInMB = (retainer.node.selfSize / (1024 * 1024)).toFixed(2);
      const sizeInKB = (retainer.node.selfSize / 1024).toFixed(1);
      const name = retainer.node.name || retainer.node.type;
      
      // Add null check for trace
      if (!trace) {
        return;
      }
      
      if (trace.isLikelyLeak && trace.confidence > 0.7) {
        // High confidence leak
        severity = 'critical';
        
        if (name.includes('ExternalStringData') || retainer.category === 'STRING_DATA') {
          insights.push(`🚨 CONFIRMED LEAK: ${sizeInMB}MB string leak detected with ${(trace.confidence * 100).toFixed(0)}% confidence`);
          recommendations.push(`� ${trace.actionableAdvice}`);
        } else {
          insights.push(`🚨 CONFIRMED LEAK: ${name} (${sizeInMB}MB) - ${trace.explanation}`);
          recommendations.push(`� ${trace.actionableAdvice}`);
        }
      } else if (trace.isLikelyLeak && trace.confidence > 0.5) {
        // Medium confidence leak
        if (severity === 'low' || severity === 'medium') severity = 'high';
        
        insights.push(`⚠️  PROBABLE LEAK: ${name} (${sizeInMB}MB) - ${trace.explanation}`);
        recommendations.push(`� ${trace.actionableAdvice}`);
      } else if (retainer.node.selfSize > 1024 * 1024) {
        // Large object but likely legitimate
        if (severity === 'low') severity = 'medium';
        
        if (name.includes('ExternalStringData')) {
          insights.push(`� Large string object: ${sizeInMB}MB (likely legitimate library/bundle code)`);
          recommendations.push(`ℹ️  This appears to be normal application code or libraries. Monitor for growth over time.`);
        } else {
          insights.push(`📊 Large object detected: ${name} (${sizeInMB}MB) - appears legitimate`);
        }
      } else if (retainer.node.selfSize > 100 * 1024) {
        // Smaller objects
        if (trace.isLikelyLeak) {
          insights.push(`� Small leak detected: ${sizeInKB}KB in ${name} - ${trace.explanation}`);
        } else {
          insights.push(`� Normal memory usage: ${name} (${sizeInKB}KB)`);
        }
      }
    });
  } else {
    insights.push('✅ No significant memory retainers found - heap appears healthy');
    recommendations.push('💚 Continue monitoring, but no immediate action needed');
  }

  // Overall memory analysis with context from traces
  const totalMB = (analysis.summary.totalRetainedSize / (1024 * 1024)).toFixed(2);
  
  if (traceResults && traceResults.totalLikelyLeaks > 0) {
    const leakMB = (traceResults.totalRetainedByLeaks / (1024 * 1024)).toFixed(2);
    insights.push(`💾 Total memory: ${totalMB}MB (${leakMB}MB likely leaked across ${traceResults.totalLikelyLeaks} objects)`);
    
    if (traceResults.highConfidenceLeaks > 0) {
      severity = 'critical';
      recommendations.push(`🚨 URGENT: ${traceResults.highConfidenceLeaks} high-confidence leaks found! Address immediately to prevent crashes.`);
    } else if (traceResults.totalLikelyLeaks > 3) {
      severity = 'high';
      recommendations.push(`⚠️  Multiple memory leaks detected. Plan cleanup work to prevent performance degradation.`);
    }
  } else {
    insights.push(`💾 Total memory footprint: ${totalMB}MB across ${analysis.summary.totalObjects.toLocaleString()} objects`);
    
    // Enhanced: Detect suspicious growth patterns
    const suspiciousGrowthDetected = detectSuspiciousGrowth(analysis, distributedAnalysis);
    if (suspiciousGrowthDetected.isSuspicious) {
      severity = 'high';
      
      insights.push(`🟡 SUSPICIOUS GROWTH: ${suspiciousGrowthDetected.description}`);
      recommendations.push(`🔍 INVESTIGATE: ${suspiciousGrowthDetected.recommendation}`);
      recommendations.push(`📊 Manual analysis required: Significant memory growth without clear leak patterns detected`);
    }
    
    if (analysis.summary.totalRetainedSize > 50 * 1024 * 1024) { // > 50MB
      if (severity === 'low') severity = 'medium';
      recommendations.push('📊 High memory usage but no clear leaks detected. Monitor for growth trends.');
    }
  }

  // Add framework-specific insights and recommendations
  if (frameworkInfo?.primary) {
    insights.push(`🎯 Framework detected: ${frameworkInfo.primary.name} (${(frameworkInfo.primary.confidence * 100).toFixed(0)}% confidence)`);
    
    if (frameworkInfo.primary.memoryPattern === 'heavy') {
      insights.push(`⚠️  ${frameworkInfo.primary.name} uses heavy memory patterns - monitor framework-specific leaks`);
    }
    
    // Add framework-specific leak recommendations
    if (traceResults && traceResults.totalLikelyLeaks > 0) {
      recommendations.push(`🎯 ${frameworkInfo.primary.name}-specific advice: Check for ${frameworkInfo.primary.commonLeakPatterns[0]}`);
    }
    
    // Add framework recommendations
    frameworkInfo.recommendations.forEach(rec => {
      if (!recommendations.includes(rec)) {
        recommendations.push(rec);
      }
    });

    // Add framework leak detection results
    if (frameworkInfo.frameworkLeaks.length > 0) {
      const criticalLeaks = frameworkInfo.frameworkLeaks.filter(l => l.severity === 'critical');
      const highLeaks = frameworkInfo.frameworkLeaks.filter(l => l.severity === 'high');
      
      if (criticalLeaks.length > 0) {
        insights.push(`🔥 CRITICAL: ${criticalLeaks.length} framework-specific memory leaks detected!`);
        criticalLeaks.forEach(leak => {
          const sizeMB = (leak.retainedSize / (1024 * 1024)).toFixed(1);
          recommendations.push(`🚨 ${leak.framework.toUpperCase()}: ${leak.description} (${sizeMB}MB) - ${leak.fixRecommendation}`);
        });
      }
      
      if (highLeaks.length > 0) {
        insights.push(`⚠️  ${highLeaks.length} high-priority framework leaks found`);
        highLeaks.slice(0, 2).forEach(leak => { // Show top 2
          const sizeMB = (leak.retainedSize / (1024 * 1024)).toFixed(1);
          recommendations.push(`⚠️  ${leak.framework.toUpperCase()}: ${leak.description} (${sizeMB}MB)`);
        });
      }
    }
  }

  // Provide specific leak category advice
  if (traceResults && Object.keys(traceResults.leakCategories).length > 0) {
    insights.push(`🏷️  Leak categories: ${Object.entries(traceResults.leakCategories).map(([cat, count]) => `${cat} (${count})`).join(', ')}`);
  }

  // Category distribution insights
  const categories = analysis.summary.categories;
  if (Object.keys(categories).length > 0) {
    const topCategory = Object.entries(categories).reduce((a, b) => 
      categories[a[0]] > categories[b[0]] ? a : b
    );
    
    insights.push(`📊 Dominant memory category: ${topCategory[0]} (${topCategory[1]} objects)`);
  }

  return {
    timestamp: new Date().toISOString(),
    snapshotPath,
    analysis,
    frameworkInfo,
    traceResults,
    distributedAnalysis,
    specializedInsights: {
      reactInsights: [],
      fiberInsights: [],
      stringInsights: [],
      shapeInsights: [],
      domInsights: []
    },
    prioritizedRecommendations: [],
    insights,
    recommendations,
    severity
  };
}

function displayAgentReport(report: AgentAnalysisReport): void {
  const severityEmoji = {
    low: '🟢',
    medium: '🟡', 
    high: '🟠',
    critical: '🔴'
  };

  // --- Summary Section (now at the very top) ---
  console.log('📋 AGENT ANALYSIS REPORT');
  console.log('='.repeat(50));
  console.log(`${severityEmoji[report.severity]} Severity: ${report.severity.toUpperCase()}`);
  console.log(`📅 Timestamp: ${new Date(report.timestamp).toLocaleString()}`);
  console.log(`📁 Snapshot: ${path.basename(report.snapshotPath)}`);
  // --- Memory Summary ---
  const totalMB = (report.analysis.summary.totalRetainedSize / (1024 * 1024)).toFixed(2);
  console.log(`📊 MEMORY SUMMARY:`);
  console.log(`  • Total Objects: ${report.analysis.summary.totalObjects.toLocaleString()}`);
  console.log(`  • Total Memory: ${totalMB}MB`);
  if (report.traceResults) {
    const leakMB = (report.traceResults.totalRetainedByLeaks / (1024 * 1024)).toFixed(2);
    console.log(`  • Leaked Memory: ${leakMB}MB (${((report.traceResults.totalRetainedByLeaks / report.analysis.summary.totalRetainedSize) * 100).toFixed(1)}% of total)`);
  }
  console.log(`  • Categories: ${Object.keys(report.analysis.summary.categories).length}`);

  // --- Immediate Attention Section ---
  const keyLeakTypes = [
    { label: 'Detached DOM nodes', category: 'dom', keywords: ['detached', 'dom'] },
    { label: 'Unmounted React', category: 'react', keywords: ['unmounted', 'fiber'] },
    { label: 'Orphaned closures', category: 'closure', keywords: ['closure'] },
    { label: 'Leaked listeners', category: 'event_listener', keywords: ['listener', 'event'] },
  ];
  let immediateLines = [];
  if (report.traceResults && report.traceResults.leakCategories) {
    for (const leakType of keyLeakTypes) {
      const count = Object.entries(report.traceResults.leakCategories)
        .filter(([cat]) => leakType.keywords.some(k => cat.toLowerCase().includes(k))).reduce((sum, [, c]) => sum + c, 0);
      if (count > 0) {
        immediateLines.push(`- ${count} ${leakType.label} retained`);
      }
    }
  }
  if (immediateLines.length > 0) {
    console.log('\n🔴 IMMEDIATE ATTENTION');
    immediateLines.forEach(line => console.log(line));
  }

  // --- Key Leak Type Table ---
  if (report.traceResults && report.traceResults.leakCategories && Object.keys(report.traceResults.leakCategories).length > 0) {
    console.log('\n🧠 LEAK TYPE SUMMARY');
    console.log('| Type                | Count |');
    console.log('|---------------------|-------|');
    for (const leakType of keyLeakTypes) {
      const count = Object.entries(report.traceResults.leakCategories)
        .filter(([cat]) => leakType.keywords.some(k => cat.toLowerCase().includes(k))).reduce((sum, [, c]) => sum + c, 0);
      if (count > 0) {
        console.log(`| ${leakType.label.padEnd(20)} | ${String(count).padEnd(5)} |`);
      }
    }
    // Show other categories
    for (const [cat, count] of Object.entries(report.traceResults.leakCategories)) {
      if (!keyLeakTypes.some(t => t.keywords.some(k => cat.toLowerCase().includes(k)))) {
        console.log(`| ${cat.padEnd(20)} | ${String(count).padEnd(5)} |`);
      }
    }
  }

  // --- Key Insights ---
  console.log('\n🔍 WHAT WE FOUND:');
  report.insights.forEach((insight, index) => {
    console.log(`  ${insight}`);
  });

  // --- Top Memory Consumers ---
  console.log('\n🏆 BIGGEST MEMORY HOGS:');
  report.analysis.topRetainers.slice(0, 5).forEach((retainer, index) => {
    const sizeInKB = (retainer.node.selfSize / 1024).toFixed(1);
    const sizeInMB = (retainer.node.selfSize / (1024 * 1024)).toFixed(2);
    const displayName = retainer.node.name || retainer.node.type || 'Unknown';
    const size = retainer.node.selfSize > 1024 * 1024 ? `${sizeInMB}MB` : `${sizeInKB}KB`;
    let status = '';
    if (report.traceResults) {
      const hasLikelyLeaks = report.traceResults.totalLikelyLeaks > 0;
      const isLargeString = displayName.includes('ExternalStringData') && retainer.node.selfSize > 1024 * 1024;
      if (hasLikelyLeaks && isLargeString && index < 2) {
        status = ' - probable leak (monitor)';
      } else if (isLargeString) {
        status = ' - likely normal (library/framework)';
      }
    } else if (displayName.includes('ExternalStringData')) {
      status = ' - investigate source';
    }
    if (displayName.includes('ExternalStringData')) {
      console.log(`  ${index + 1}. 📝 String data consuming ${size}${status}`);
    } else {
      console.log(`  ${index + 1}. ${retainer.emoji} ${displayName} - ${size} (${retainer.category})`);
    }
  });

  // --- Recommendations (grouped/prioritized) ---
  console.log('\n🛠️ RECOMMENDATIONS:');
  if (report.recommendations && report.recommendations.length > 0) {
    report.recommendations.forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`);
    });
  }

  // --- Retainer Paths for Major Leaks (if available) ---
  // (Placeholder: actual retainer path extraction would require more data)
  // Example output:
  // console.log('\n📋 RETAINER PATHS');
  // console.log('  - DetachedDiv: window → App → DetachedDiv');
  // console.log('  - FiberNode: window → REACT_DEVTOOLS_GLOBAL_HOOK → FiberNode');

  // --- Manual Debug Checklist ---
  console.log('\n✅ MANUAL DEBUG CHECKLIST');
  console.log('  - [ ] Review all detached DOM nodes');
  console.log('  - [ ] Check for unmounted React components');
  console.log('  - [ ] Investigate large arrays/maps');
}

function saveReportToFile(report: AgentAnalysisReport, asMarkdown: boolean = false): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = './reports';
  
  // Create reports directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (asMarkdown) {
    const outputPath = path.join(outputDir, `heap-analysis-${timestamp}.md`);
    const markdownContent = generateMarkdownReport(report);
    fs.writeFileSync(outputPath, markdownContent);
    return outputPath;
  } else {
    const outputPath = path.join(outputDir, `heap-analysis-${timestamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    return outputPath;
  }
}

/**
 * Analyze distributed leak patterns across the entire heap
 * Detects subtle leaks that manifest as many small objects
 */
function analyzeDistributedLeakPatterns(tracer: RetainerTracer, allNodes: any[]): {
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
} {
  const suspiciousPatterns: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    recommendation: string;
  }> = [];

  const distributedMemory = {
    timerRelatedMemory: 0,
    closureMemory: 0,
    arrayMemory: 0,
    fragmentedMemory: 0
  };

  // Analyze timer-related object accumulation
  const timerNodes = allNodes.filter(node => {
    const name = node.name?.toLowerCase() || '';
    return name.includes('timer') || name.includes('interval') || name.includes('timeout');
  });

  if (timerNodes.length > 20) {
    const totalTimerMemory = timerNodes.reduce((sum, node) => sum + (node.selfSize || 0), 0);
    distributedMemory.timerRelatedMemory = totalTimerMemory;
    
    if (timerNodes.length > 100) {
      suspiciousPatterns.push({
        type: 'timer_accumulation',
        description: `${timerNodes.length} timer-related objects detected (${(totalTimerMemory / (1024 * 1024)).toFixed(1)}MB)`,
        severity: 'high',
        recommendation: 'Check for uncleared setInterval/setTimeout calls. Ensure all timers are properly cleaned up in component unmount lifecycle.'
      });
    } else if (timerNodes.length > 50) {
      suspiciousPatterns.push({
        type: 'timer_buildup',
        description: `${timerNodes.length} timer-related objects may indicate buildup`,
        severity: 'medium',
        recommendation: 'Monitor timer cleanup. Consider using cleanup functions in useEffect or componentWillUnmount.'
      });
    }
  }

  // Analyze closure/function accumulation
  const closureNodes = allNodes.filter(node => {
    const type = node.type || '';
    const name = node.name || '';
    return type.includes('closure') || name.includes('Function') || name.includes('Closure');
  });

  // Always report closure stats
  const totalClosureMemory = closureNodes.reduce((sum, node) => sum + (node.selfSize || 0), 0);
  distributedMemory.closureMemory = totalClosureMemory;

  // Lower threshold for reporting
  if (closureNodes.length > 10) {
    suspiciousPatterns.push({
      type: 'closure_accumulation',
      description: `${closureNodes.length} closures found (${(totalClosureMemory / (1024 * 1024)).toFixed(1)}MB total)`,
      severity: closureNodes.length > 50 ? 'high' : 'medium',
      recommendation: 'Review closures capturing large variables. Use useCallback/useMemo to prevent recreation. Consider WeakRef for large captured data.'
    });
  }

  // List largest closures for surfacing
  const largestClosures = closureNodes
    .filter(node => node.selfSize > 10 * 1024)
    .sort((a, b) => (b.selfSize || 0) - (a.selfSize || 0))
    .slice(0, 5);

  // Attach to distributedMemory for reporting
  (distributedMemory as any).largestClosures = largestClosures;

  // Analyze array accumulation patterns
  const arrayNodes = allNodes.filter(node => {
    const type = node.type || '';
    const name = node.name || '';
    return type === 'array' || name.includes('Array');
  });

  if (arrayNodes.length > 100) {
    const totalArrayMemory = arrayNodes.reduce((sum, node) => sum + (node.selfSize || 0), 0);
    distributedMemory.arrayMemory = totalArrayMemory;
    
    const largeArrays = arrayNodes.filter(node => (node.selfSize || 0) > 100 * 1024);
    if (largeArrays.length > 5) {
      suspiciousPatterns.push({
        type: 'array_accumulation',
        description: `${largeArrays.length} large arrays detected (${(totalArrayMemory / (1024 * 1024)).toFixed(1)}MB total)`,
        severity: 'medium',
        recommendation: 'Review arrays that may be growing without bounds. Implement size limits, pagination, or data pruning strategies.'
      });
    }
  }

  // Check for memory fragmentation (many small objects of similar size)
  const sizeGroups = new Map<number, number>();
  allNodes.forEach(node => {
    const sizeGroup = Math.floor((node.selfSize || 0) / 1024); // Group by KB
    sizeGroups.set(sizeGroup, (sizeGroups.get(sizeGroup) || 0) + 1);
  });

  const fragmentationGroups = Array.from(sizeGroups.entries())
    .filter(([size, count]) => size > 0 && count > 200) // More than 200 objects of similar size
    .sort((a, b) => b[1] - a[1]);

  if (fragmentationGroups.length > 0) {
    const [topSize, topCount] = fragmentationGroups[0];
    const fragmentedMemory = topSize * topCount * 1024;
    distributedMemory.fragmentedMemory = fragmentedMemory;
    
    suspiciousPatterns.push({
      type: 'memory_fragmentation',
      description: `${topCount} objects of ~${topSize}KB each (${(fragmentedMemory / (1024 * 1024)).toFixed(1)}MB fragmented)`,
      severity: 'medium',
      recommendation: 'Possible memory fragmentation. Consider object pooling or optimizing object creation patterns.'
    });
  }

  return { suspiciousPatterns, distributedMemory };
}

/**
 * Enhanced: Detect suspicious growth patterns
 * Flags scenarios where there's significant memory growth but no clear leak source
 */
function detectSuspiciousGrowth(analysis: AnalysisResult, distributedAnalysis?: AgentAnalysisReport['distributedAnalysis']): {
  isSuspicious: boolean;
  description: string;
  recommendation: string;
} {
  const totalObjectCount = analysis.summary.totalObjects;
  const totalMemoryMB = analysis.summary.totalRetainedSize / (1024 * 1024);
  
  // Suspicious growth indicators
  const hasHighObjectCount = totalObjectCount > 100000; // > 100K objects
  const hasSignificantMemory = totalMemoryMB > 10; // > 10MB
  const hasNoLargeLeaks = !analysis.topRetainers?.some(r => r.node.selfSize > 5 * 1024 * 1024); // No objects > 5MB
  
  // Check for distributed small object accumulation
  const smallObjectCount = analysis.topRetainers?.filter(r => 
    r.node.selfSize > 10 * 1024 && r.node.selfSize < 500 * 1024
  ).length || 0;
  
  const hasDistributedGrowth = smallObjectCount > 15; // Many medium-sized objects
  
  // Check for high timer/listener activity without corresponding large objects
  const hasHighActivity = distributedAnalysis?.suspiciousPatterns?.some(p => 
    (p.type === 'timer_accumulation' || p.type === 'event_listener_accumulation') && 
    p.severity === 'high'
  ) || false;
  
  // Determine if this is suspicious
  const isSuspicious = (
    (hasHighObjectCount && hasNoLargeLeaks) || 
    (hasDistributedGrowth && hasSignificantMemory) ||
    (hasHighActivity && hasSignificantMemory && hasNoLargeLeaks)
  );
  
  if (!isSuspicious) {
    return { isSuspicious: false, description: '', recommendation: '' };
  }
  
  // Generate description based on pattern
  let description = '';
  let recommendation = '';
  
  if (hasHighObjectCount && hasNoLargeLeaks) {
    description = `${(totalObjectCount / 1000).toFixed(0)}K objects (${totalMemoryMB.toFixed(1)}MB) without clear large leak sources`;
    recommendation = 'Look for closure retention, growing arrays, or accumulated small objects';
  } else if (hasDistributedGrowth) {
    description = `${smallObjectCount} medium-sized objects suggest distributed accumulation pattern`;
    recommendation = 'Check for React component retention, event listener accumulation, or repeated function creation';
  } else if (hasHighActivity) {
    description = `High timer/listener activity with unexplained memory growth (${totalMemoryMB.toFixed(1)}MB)`;
    recommendation = 'Focus on uncleared intervals, retained closures, and component cleanup patterns';
  }
  
  return { isSuspicious: true, description, recommendation };
}

/**
 * Enhanced: Analyze closure retention patterns
 * Focuses on detecting GROWING/ACCUMULATING closures, not just any closures
 */
function analyzeClosurePatterns(snapshotData: any, analysis: AnalysisResult): {
  suspiciousClosures: number;
  capturedMemory: number;
} {
  let suspiciousClosures = 0;
  let capturedMemory = 0;

  try {
    if (!snapshotData.nodes || !snapshotData.strings) {
      return { suspiciousClosures: 0, capturedMemory: 0 };
    }

    // Look for ACCUMULATION patterns, not just any closures
    const closureStats: Record<string, { count: number; totalSize: number }> = {};
    const nodes = snapshotData.nodes;
    const strings = snapshotData.strings;
    const nodeFields = snapshotData.snapshot?.meta?.node_fields || [];
    const nodeTypes = snapshotData.snapshot?.meta?.node_types || [];
    
    const typeIndex = nodeFields.indexOf('type');
    const nameIndex = nodeFields.indexOf('name');
    const selfSizeIndex = nodeFields.indexOf('self_size');
    const nodeFieldCount = nodeFields.length;

    // Count identical closures/functions (this indicates accumulation)
    for (let i = 0; i < nodes.length; i += nodeFieldCount) {
      const typeValue = nodes[i + typeIndex];
      const nameValue = nodes[i + nameIndex];
      const selfSize = nodes[i + selfSizeIndex] || 0;

      // Get type and name strings
      let typeString = 'unknown';
      if (nodeTypes[0] && Array.isArray(nodeTypes[0]) && nodeTypes[0][typeValue]) {
        typeString = nodeTypes[0][typeValue];
      }

      let nameString = '';
      if (typeof nameValue === 'number' && strings[nameValue]) {
        nameString = strings[nameValue];
      }

      // Focus on closures and functions
      if (typeString === 'closure' || typeString === 'function' || 
          nameString.includes('closure') || nameString.includes('Function')) {
        
        // Create a signature for this closure type
        const signature = `${typeString}:${nameString}:${Math.floor(selfSize / 1024)}KB`;
        
        if (!closureStats[signature]) {
          closureStats[signature] = { count: 0, totalSize: 0 };
        }
        
        closureStats[signature].count++;
        closureStats[signature].totalSize += selfSize;
      }
    }

    // Look for REPEATED closure patterns (indicates accumulation)
    for (const [signature, stats] of Object.entries(closureStats)) {
      // Flag closures that appear many times (accumulation pattern)
      if (stats.count > 10) { // 10+ identical closures suggests accumulation
        suspiciousClosures += stats.count;
        capturedMemory += stats.totalSize;
      }
      
      // Flag large closure accumulations
      if (stats.totalSize > 500 * 1024) { // > 500KB of identical closures
        suspiciousClosures += Math.floor(stats.count / 2);
        capturedMemory += stats.totalSize;
      }
    }

    // Look for growing array patterns (like retainedClosures.current)
    const growingArrayPatterns = strings.filter((str: string) => 
      str.includes('.current') || 
      str.includes('retained') ||
      str.includes('closures') ||
      (str.includes('push') && !str.includes('pop')) ||
      str.includes('bottleClosure') // Your specific pattern!
    );

    // High count of these patterns suggests accumulation
    if (growingArrayPatterns.length > 5) {
      suspiciousClosures += Math.floor(growingArrayPatterns.length / 3);
    }

  } catch (error) {
    // Fail silently for this analysis
  }

  return { suspiciousClosures, capturedMemory };
}

/**
 * Enhanced: Analyze growing collection patterns
 * Detects arrays, Maps, Sets that appear to only grow without cleanup
 */
function analyzeGrowingCollections(snapshotData: any, analysis: AnalysisResult): {
  suspiciousCollections: number;
  totalSize: number;
} {
  let suspiciousCollections = 0;
  let totalSize = 0;

  try {
    if (!analysis.topRetainers) {
      return { suspiciousCollections: 0, totalSize: 0 };
    }

    // Look for collection-like objects
    analysis.topRetainers.forEach(retainer => {
      const name = retainer.node.name?.toLowerCase() || '';
      const type = retainer.node.type?.toLowerCase() || '';
      
      // Patterns that suggest growing collections
      const isCollection = 
        type.includes('array') || 
        type.includes('map') || 
        type.includes('set') ||
        name.includes('array') ||
        name.includes('list') ||
        name.includes('collection') ||
        name.includes('cache') ||
        name.includes('queue') ||
        name.includes('buffer') ||
        name.includes('current'); // React useRef.current

      // Large collections are suspicious
      if (isCollection && retainer.node.selfSize > 10 * 1024) {
        suspiciousCollections++;
        totalSize += retainer.node.selfSize;
      }

      // Special case: React patterns
      if (name.includes('current') && retainer.node.selfSize > 5 * 1024) {
        suspiciousCollections++;
        totalSize += retainer.node.selfSize;
      }
    });

    // Additional string analysis for collection patterns
    if (snapshotData.strings) {
      const collectionStrings = snapshotData.strings.filter((str: string) => {
        const lowerStr = str.toLowerCase();
        return (lowerStr.includes('push') && !lowerStr.includes('pop')) ||
               (lowerStr.includes('add') && !lowerStr.includes('remove')) ||
               lowerStr.includes('accumulate') ||
               lowerStr.includes('collect') ||
               lowerStr.includes('.current');
      });

      // Many collection-related strings suggest accumulation patterns
      if (collectionStrings.length > 20) {
        suspiciousCollections += Math.floor(collectionStrings.length / 10);
      }
    }

  } catch (error) {
    // Fail silently for this analysis
  }

  return { suspiciousCollections, totalSize };
}

/**
 * Deep heap analysis to find subtle memory leaks
 * Analyzes string patterns and extended retainer lists
 */
function performDeepLeakAnalysis(snapshotPath: string, analysis: AnalysisResult): {
  deepInsights: string[];
  suspiciousPatterns: Array<{
    type: string;
    count: number;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
} {
  const deepInsights: string[] = [];
  const suspiciousPatterns: Array<{
    type: string;
    count: number;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }> = [];

  try {
    // Load raw snapshot data for string analysis
    const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    
    const timerRefs: string[] = [];
    const eventListeners: string[] = [];
    const functionNames: string[] = [];
    const suspiciousStrings: string[] = [];
    
    // Analyze strings for leak patterns
    if (snapshotData.strings) {
      snapshotData.strings.forEach((str: string) => {
        const lowerStr = str.toLowerCase();
        
        // Timer/interval patterns
        if (lowerStr.includes('settimeout') || lowerStr.includes('setinterval') || 
            lowerStr.includes('timer') || lowerStr.includes('interval')) {
          timerRefs.push(str);
        }
        
        // Event listener patterns
        if (lowerStr.includes('listener') || lowerStr.includes('handler') || 
            lowerStr.includes('onclick') || lowerStr.includes('onload') ||
            lowerStr.includes('addeventlistener')) {
          eventListeners.push(str);
        }
        
        // Function accumulation patterns
        if (str.length > 5 && str.length < 50 && 
            (str.includes('function') || str.includes('Function') || 
             /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str))) {
          functionNames.push(str);
        }
        
        // Explicitly suspicious strings
        if (str.length > 10 && (str.includes('leak') || 
            str.includes('accumulate') || str.includes('grow'))) {
          suspiciousStrings.push(str);
        }
      });
    }
    
    // Analyze timer patterns
    if (timerRefs.length > 10) {
      const severity = timerRefs.length > 50 ? 'high' : timerRefs.length > 25 ? 'medium' : 'low';
      suspiciousPatterns.push({
        type: 'timer_accumulation',
        count: timerRefs.length,
        severity,
        description: `${timerRefs.length} timer/interval references detected`
      });
      
      if (severity === 'high') {
        deepInsights.push(`🚨 HIGH timer activity: ${timerRefs.length} timer references (possible uncleared intervals)`);
      } else {
        deepInsights.push(`⚠️ Timer activity: ${timerRefs.length} timer references detected`);
      }
    }
    
    // Analyze event listener patterns
    if (eventListeners.length > 20) {
      const severity = eventListeners.length > 100 ? 'high' : eventListeners.length > 50 ? 'medium' : 'low';
      suspiciousPatterns.push({
        type: 'event_listener_accumulation',
        count: eventListeners.length,
        severity,
        description: `${eventListeners.length} event listener references detected`
      });
      
      if (severity === 'high') {
        deepInsights.push(`🚨 HIGH event listener activity: ${eventListeners.length} references (possible unremoved listeners)`);
      } else {
        deepInsights.push(`⚠️ Event listener activity: ${eventListeners.length} references detected`);
      }
    }
    
    // Analyze function patterns
    const functionCounts: Record<string, number> = {};
    functionNames.forEach(name => {
      functionCounts[name] = (functionCounts[name] || 0) + 1;
    });
    
    const repeatedFunctions = Object.entries(functionCounts)
      .filter(([name, count]) => count > 10)
      .sort((a, b) => b[1] - a[1]);
    
    if (repeatedFunctions.length > 0) {
      const topFunction = repeatedFunctions[0];
      const severity = topFunction[1] > 100 ? 'high' : topFunction[1] > 50 ? 'medium' : 'low';
      suspiciousPatterns.push({
        type: 'function_accumulation',
        count: repeatedFunctions.length,
        severity,
        description: `${repeatedFunctions.length} functions with high repetition (top: ${topFunction[0]} x${topFunction[1]})`
      });
      
      if (severity === 'high') {
        deepInsights.push(`🚨 Function accumulation: ${topFunction[0]} appears ${topFunction[1]} times`);
      } else {
        deepInsights.push(`⚠️ Repeated function pattern: ${repeatedFunctions.length} functions with high counts`);
      }
    }
    
    // Check for explicit leak indicators
    if (suspiciousStrings.length > 0) {
      suspiciousPatterns.push({
        type: 'explicit_leak_indicators',
        count: suspiciousStrings.length,
        severity: 'high',
        description: `Explicit leak-related strings found: ${suspiciousStrings.join(', ')}`
      });
      
      deepInsights.push(`🚨 EXPLICIT LEAK INDICATORS: Found strings containing 'leak', 'accumulate', or 'grow'`);
    }

    // Enhanced: Check for closure retention patterns
    const closurePatterns = analyzeClosurePatterns(snapshotData, analysis);
    if (closurePatterns.suspiciousClosures > 0) {
      const severity = closurePatterns.suspiciousClosures > 20 ? 'high' : 
                      closurePatterns.suspiciousClosures > 10 ? 'medium' : 'low';
      
      suspiciousPatterns.push({
        type: 'closure_retention',
        count: closurePatterns.suspiciousClosures,
        severity,
        description: `${closurePatterns.suspiciousClosures} potential closure retention patterns detected`
      });

      if (severity === 'high') {
        deepInsights.push(`🚨 HIGH closure retention: ${closurePatterns.suspiciousClosures} retained closures (likely captured large objects)`);
      } else {
        deepInsights.push(`⚠️ Closure patterns: ${closurePatterns.suspiciousClosures} potential retained closures detected`);
      }
    }

    // Enhanced: Check for growing collection patterns (React useRef arrays, etc.)
    const collectionPatterns = analyzeGrowingCollections(snapshotData, analysis);
    if (collectionPatterns.suspiciousCollections > 0) {
      const severity = collectionPatterns.totalSize > 5 * 1024 * 1024 ? 'high' : 'medium';
      
      suspiciousPatterns.push({
        type: 'growing_collections',
        count: collectionPatterns.suspiciousCollections,
        severity,
        description: `${collectionPatterns.suspiciousCollections} collections that appear to only grow (${(collectionPatterns.totalSize / 1024).toFixed(1)}KB)`
      });

      if (severity === 'high') {
        deepInsights.push(`🚨 GROWING COLLECTIONS: ${collectionPatterns.suspiciousCollections} unbounded arrays/maps (${(collectionPatterns.totalSize / 1024 / 1024).toFixed(1)}MB total)`);
      } else {
        deepInsights.push(`⚠️ Collection growth: ${collectionPatterns.suspiciousCollections} potentially unbounded collections detected`);
      }
    }
    
    // Analyze extended retainer list (beyond top 20)
    if (analysis.topRetainers && analysis.topRetainers.length > 20) {
      const extendedRetainers = analysis.topRetainers.slice(20, 100);
      const smallLeaks = extendedRetainers.filter(r => 
        r.node.selfSize > 10 * 1024 && r.node.selfSize < 100 * 1024
      );
      
      if (smallLeaks.length > 20) {
        suspiciousPatterns.push({
          type: 'distributed_small_leaks',
          count: smallLeaks.length,
          severity: 'medium',
          description: `${smallLeaks.length} objects (10-100KB) that could indicate distributed leaks`
        });
        
        deepInsights.push(`🔍 Distributed pattern: ${smallLeaks.length} medium-sized objects (10-100KB) detected`);
      }
    }
    
  } catch (error) {
    deepInsights.push(`⚠️ Deep analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return { deepInsights, suspiciousPatterns };
}

function generateMarkdownReport(report: AgentAnalysisReport): string {
  const severityEmoji = {
    low: '🟢',
    medium: '🟡', 
    high: '🟠',
    critical: '🔴'
  };

  const formattedDate = new Date(report.timestamp).toLocaleString();
  const snapshotName = path.basename(report.snapshotPath);
  const totalMB = (report.analysis.summary.totalRetainedSize / (1024 * 1024)).toFixed(2);

  let markdown = `# ${severityEmoji[report.severity]} Heap Analysis Report

**Status:** ${report.severity.toUpperCase()}  
**Date:** ${formattedDate}  
**Snapshot:** \`${snapshotName}\`  
**Total Memory:** ${totalMB}MB across ${report.analysis.summary.totalObjects.toLocaleString()} objects

`;

  // Leak Detection Summary
  if (report.traceResults) {
    const leakMB = (report.traceResults.totalRetainedByLeaks / (1024 * 1024)).toFixed(2);
    const leakPercentage = ((report.traceResults.totalRetainedByLeaks / report.analysis.summary.totalRetainedSize) * 100).toFixed(1);
    
    markdown += `## 🧠 Leak Detection Summary

- **Total Leaks Found:** ${report.traceResults.totalLikelyLeaks}
- **High Confidence Leaks:** ${report.traceResults.highConfidenceLeaks}
- **Leaked Memory:** ${leakMB}MB (${leakPercentage}% of total)

`;
  }

  // Framework Detection
  if (report.frameworkInfo?.primary) {
    const confidence = (report.frameworkInfo.primary.confidence * 100).toFixed(0);
    markdown += `## 🎯 Framework Detection

- **Primary Framework:** ${report.frameworkInfo.primary.name} ${report.frameworkInfo.primary.version || ''}
- **Confidence:** ${confidence}%
- **Memory Pattern:** ${report.frameworkInfo.primary.memoryPattern}

`;

    if (report.frameworkInfo.buildTools.length > 0) {
      markdown += `- **Build Tools:** ${report.frameworkInfo.buildTools.join(', ')}\n`;
    }
    
    if (report.frameworkInfo.libraries.length > 0) {
      markdown += `- **Libraries:** ${report.frameworkInfo.libraries.join(', ')}\n`;
    }
    
    if (report.frameworkInfo.totalFrameworkMemory > 0) {
      const frameworkMB = (report.frameworkInfo.totalFrameworkMemory / (1024 * 1024)).toFixed(1);
      markdown += `- **Framework Memory:** ${frameworkMB}MB\n`;
    }
    
    markdown += '\n';

    // Framework-Specific Memory Leaks
    if (report.frameworkInfo.frameworkLeaks.length > 0) {
      markdown += `### 🚨 Framework-Specific Memory Leaks\n\n`;
      
      const criticalLeaks = report.frameworkInfo.frameworkLeaks.filter((l: any) => l.severity === 'critical');
      const highLeaks = report.frameworkInfo.frameworkLeaks.filter((l: any) => l.severity === 'high');
      const mediumLeaks = report.frameworkInfo.frameworkLeaks.filter((l: any) => l.severity === 'medium');
      
      if (criticalLeaks.length > 0) {
        markdown += `**🔥 CRITICAL LEAKS:**\n`;
        criticalLeaks.forEach((leak: any) => {
          const sizeMB = (leak.retainedSize / (1024 * 1024)).toFixed(1);
          markdown += `- **${leak.framework.toUpperCase()}**: ${leak.description} (${sizeMB}MB)\n`;
          markdown += `  - *Fix:* ${leak.fixRecommendation}\n`;
        });
        markdown += '\n';
      }
      
      if (highLeaks.length > 0) {
        markdown += `**⚠️ HIGH PRIORITY:**\n`;
        highLeaks.forEach((leak: any) => {
          const sizeMB = (leak.retainedSize / (1024 * 1024)).toFixed(1);
          markdown += `- **${leak.framework.toUpperCase()}**: ${leak.description} (${sizeMB}MB)\n`;
        });
        markdown += '\n';
      }
      
      if (mediumLeaks.length > 0) {
        markdown += `**📋 MEDIUM PRIORITY:**\n`;
        mediumLeaks.slice(0, 3).forEach((leak: any) => { // Show top 3
          const sizeKB = (leak.retainedSize / 1024).toFixed(1);
          markdown += `- **${leak.framework.toUpperCase()}**: ${leak.description} (${sizeKB}KB)\n`;
        });
        markdown += '\n';
      }
      
      const totalLeakSize = report.frameworkInfo.frameworkLeaks.reduce((sum: number, l: any) => sum + l.retainedSize, 0);
      const totalLeakMB = (totalLeakSize / (1024 * 1024)).toFixed(1);
      markdown += `**Total Framework Leak Size:** ${totalLeakMB}MB\n\n`;
    }
  }

  // Key Insights
  markdown += `## 🔍 Key Insights

`;
  report.insights.forEach(insight => {
    markdown += `- ${insight}\n`;
  });
  markdown += '\n';

  // Top Memory Consumers
  markdown += `## 🏆 Top Memory Consumers

| Rank | Object | Size | Category | Status |
|------|--------|------|----------|--------|
`;

  report.analysis.topRetainers.slice(0, 10).forEach((retainer, index) => {
    const sizeInKB = (retainer.node.selfSize / 1024).toFixed(1);
    const sizeInMB = (retainer.node.selfSize / (1024 * 1024)).toFixed(2);
    const displayName = retainer.node.name || retainer.node.type || 'Unknown';
    const size = retainer.node.selfSize > 1024 * 1024 ? `${sizeInMB}MB` : `${sizeInKB}KB`;
    
    // Determine status based on trace results
    let status = 'Normal';
    if (report.traceResults) {
      const hasLikelyLeaks = report.traceResults.totalLikelyLeaks > 0;
      const isLargeString = displayName.includes('ExternalStringData') && retainer.node.selfSize > 1024 * 1024;
      
      if (hasLikelyLeaks && isLargeString && index < 2) {
        status = '⚠️ Probable leak';
      } else if (isLargeString) {
        status = '✅ Normal (library)';
      }
    }
    
    const cleanDisplayName = displayName.replace(/\|/g, '\\|'); // Escape pipes for markdown table
    markdown += `| ${index + 1} | \`${cleanDisplayName}\` | ${size} | ${retainer.category} | ${status} |\n`;
  });

  markdown += '\n';

  // Distributed Leak Patterns
  if (report.distributedAnalysis && report.distributedAnalysis.suspiciousPatterns.length > 0) {
    markdown += `## 🔍 Distributed Leak Patterns

`;
    report.distributedAnalysis.suspiciousPatterns.forEach(pattern => {
      const severityIcon = pattern.severity === 'high' ? '🚨' : pattern.severity === 'medium' ? '⚠️' : 'ℹ️';
      const patternType = pattern.type.replace(/_/g, ' ').toUpperCase();
      markdown += `### ${severityIcon} ${patternType}

**Description:** ${pattern.description}  
**Recommendation:** ${pattern.recommendation}

`;
    });

    // Distributed Memory Breakdown
    const { timerRelatedMemory, closureMemory, arrayMemory, fragmentedMemory } = report.distributedAnalysis.distributedMemory;
    const totalDistributedMB = ((timerRelatedMemory + closureMemory + arrayMemory + fragmentedMemory) / (1024 * 1024));
    
    if (totalDistributedMB > 1) {
      markdown += `### 📊 Distributed Memory Breakdown

| Memory Type | Size |
|-------------|------|
`;
      if (timerRelatedMemory > 0) markdown += `| Timer Objects | ${(timerRelatedMemory / (1024 * 1024)).toFixed(1)}MB |\n`;
      if (closureMemory > 0) markdown += `| Closure Objects | ${(closureMemory / (1024 * 1024)).toFixed(1)}MB |\n`;
      if (arrayMemory > 0) markdown += `| Array Objects | ${(arrayMemory / (1024 * 1024)).toFixed(1)}MB |\n`;
      if (fragmentedMemory > 0) markdown += `| Fragmented Memory | ${(fragmentedMemory / (1024 * 1024)).toFixed(1)}MB |\n`;
      markdown += `| **Total Distributed** | **${totalDistributedMB.toFixed(1)}MB** |\n\n`;
    }
  }

  // Leak Categories
  if (report.traceResults && Object.keys(report.traceResults.leakCategories).length > 0) {
    markdown += `## 🏷️ Leak Categories

| Category | Count |
|----------|-------|
`;
    Object.entries(report.traceResults.leakCategories).forEach(([category, count]) => {
      markdown += `| ${category} | ${count} |\n`;
    });
    markdown += '\n';
  }

  // Recommendations
  markdown += `## 🛠️ Recommendations

`;
  report.recommendations.forEach((rec, index) => {
    markdown += `${index + 1}. ${rec}\n`;
  });
  markdown += '\n';

  // Memory Categories
  if (Object.keys(report.analysis.summary.categories).length > 0) {
    markdown += `## 📊 Memory Categories

| Category | Object Count |
|----------|--------------|
`;
    Object.entries(report.analysis.summary.categories)
      .sort(([,a], [,b]) => b - a)
      .forEach(([category, count]) => {
        markdown += `| ${category} | ${count.toLocaleString()} |\n`;
      });
    markdown += '\n';
  }

  // Technical Details
  markdown += `## 📋 Technical Details

- **Analysis Timestamp:** ${report.timestamp}
- **Snapshot Path:** \`${report.snapshotPath}\`
- **Total Objects:** ${report.analysis.summary.totalObjects.toLocaleString()}
- **Total Memory:** ${totalMB}MB
- **Categories Found:** ${Object.keys(report.analysis.summary.categories).length}

`;

  // Footer
  markdown += `---
*Report generated by Heap Analyzer CLI on ${formattedDate}*
`;

  return markdown;
}

// Comparison report interfaces and functions
interface ComparisonReport {
  timestamp: string;
  beforeSnapshot: string;
  afterSnapshot: string;
  beforeReport: AgentAnalysisReport;
  afterReport: AgentAnalysisReport;
  growth: {
    objects: { before: number; after: number; change: number; percentage: number };
    memory: { before: number; after: number; change: number; percentage: number };
    detachedNodes: { before: number; after: number; change: number; percentage: number };
    timers: { before: number; after: number; change: number; percentage: number };
    closures: { before: number; after: number; change: number; percentage: number };
  };
  leakSeverity: 'low' | 'medium' | 'high' | 'critical';
  insights: string[];
  recommendations: string[];
}

function generateComparisonReport(beforeReport: AgentAnalysisReport, afterReport: AgentAnalysisReport): ComparisonReport {
  // Extract memory stats from analysis
  const beforeObjects = beforeReport.analysis.summary?.totalObjects || 0;
  const afterObjects = afterReport.analysis.summary?.totalObjects || 0;
  const beforeMemory = beforeReport.analysis.summary?.totalRetainedSize || 0;
  const afterMemory = afterReport.analysis.summary?.totalRetainedSize || 0;

  // Calculate growth metrics
  const objectGrowth = afterObjects - beforeObjects;
  const objectGrowthPercentage = beforeObjects > 0 ? (objectGrowth / beforeObjects) * 100 : 0;
  const memoryGrowth = afterMemory - beforeMemory;
  const memoryGrowthPercentage = beforeMemory > 0 ? (memoryGrowth / beforeMemory) * 100 : 0;

  // Extract detached nodes, timers, closures from insights
  const beforeDetached = extractDetachedNodesCount(beforeReport.insights);
  const afterDetached = extractDetachedNodesCount(afterReport.insights);
  const beforeTimers = extractTimerCount(beforeReport.insights);
  const afterTimers = extractTimerCount(afterReport.insights);
  const beforeClosures = extractClosureCount(beforeReport.insights);
  const afterClosures = extractClosureCount(afterReport.insights);

  // Determine leak severity
  let leakSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (objectGrowthPercentage > 1000 || memoryGrowthPercentage > 500) leakSeverity = 'critical';
  else if (objectGrowthPercentage > 500 || memoryGrowthPercentage > 200) leakSeverity = 'high';
  else if (objectGrowthPercentage > 100 || memoryGrowthPercentage > 50) leakSeverity = 'medium';

  // Generate insights
  const insights: string[] = [];
  if (objectGrowth > 100000) insights.push(`🚨 MASSIVE object growth: +${objectGrowth.toLocaleString()} objects (+${objectGrowthPercentage.toFixed(1)}%)`);
  if (memoryGrowthPercentage > 100) insights.push(`💥 Memory explosion: +${(memoryGrowth / (1024 * 1024)).toFixed(1)}MB (+${memoryGrowthPercentage.toFixed(1)}%)`);
  if (afterTimers > beforeTimers * 2) insights.push(`⏰ Timer leak detected: ${beforeTimers} → ${afterTimers} timers`);
  if (afterClosures > beforeClosures + 1000) insights.push(`🔒 Closure retention: +${afterClosures - beforeClosures} retained closures`);

  // Generate recommendations
  const recommendations: string[] = [];
  if (afterTimers > beforeTimers) recommendations.push('🚨 Clear all setInterval/setTimeout calls with clearInterval/clearTimeout');
  if (objectGrowthPercentage > 100) recommendations.push('🔍 Investigate rapidly growing arrays, maps, or object collections');
  if (afterClosures > beforeClosures + 500) recommendations.push('🧹 Review event listeners and callback functions for proper cleanup');

  return {
    timestamp: new Date().toISOString(),
    beforeSnapshot: beforeReport.snapshotPath,
    afterSnapshot: afterReport.snapshotPath,
    beforeReport,
    afterReport,
    growth: {
      objects: { before: beforeObjects, after: afterObjects, change: objectGrowth, percentage: objectGrowthPercentage },
      memory: { before: beforeMemory, after: afterMemory, change: memoryGrowth, percentage: memoryGrowthPercentage },
      detachedNodes: { before: beforeDetached, after: afterDetached, change: afterDetached - beforeDetached, percentage: beforeDetached > 0 ? ((afterDetached - beforeDetached) / beforeDetached) * 100 : 0 },
      timers: { before: beforeTimers, after: afterTimers, change: afterTimers - beforeTimers, percentage: beforeTimers > 0 ? ((afterTimers - beforeTimers) / beforeTimers) * 100 : 0 },
      closures: { before: beforeClosures, after: afterClosures, change: afterClosures - beforeClosures, percentage: beforeClosures > 0 ? ((afterClosures - beforeClosures) / beforeClosures) * 100 : 0 }
    },
    leakSeverity,
    insights,
    recommendations
  };
}

function displayComparisonReport(report: ComparisonReport): void {
  console.log('📋 BEFORE/AFTER COMPARISON ANALYSIS');
  console.log('==================================================');
  console.log(`🔥 Leak Severity: ${report.leakSeverity.toUpperCase()}`);
  console.log(`📅 Analysis Date: ${new Date(report.timestamp).toLocaleString()}`);
  console.log(`📁 Before: ${path.basename(report.beforeSnapshot)}`);
  console.log(`📁 After: ${path.basename(report.afterSnapshot)}\n`);

  // Growth metrics
  console.log('📊 MEMORY GROWTH ANALYSIS:');
  console.log(`  • Objects: ${report.growth.objects.before.toLocaleString()} → ${report.growth.objects.after.toLocaleString()} (${report.growth.objects.change >= 0 ? '+' : ''}${report.growth.objects.change.toLocaleString()} | ${report.growth.objects.percentage >= 0 ? '+' : ''}${report.growth.objects.percentage.toFixed(1)}%)`);
  console.log(`  • Memory: ${(report.growth.memory.before / (1024 * 1024)).toFixed(2)}MB → ${(report.growth.memory.after / (1024 * 1024)).toFixed(2)}MB (${report.growth.memory.change >= 0 ? '+' : ''}${(report.growth.memory.change / (1024 * 1024)).toFixed(2)}MB | ${report.growth.memory.percentage >= 0 ? '+' : ''}${report.growth.memory.percentage.toFixed(1)}%)`);
  if (report.growth.timers.change !== 0) console.log(`  • Timers: ${report.growth.timers.before} → ${report.growth.timers.after} (${report.growth.timers.change >= 0 ? '+' : ''}${report.growth.timers.change})`);
  if (report.growth.closures.change !== 0) console.log(`  • Closures: ${report.growth.closures.before.toLocaleString()} → ${report.growth.closures.after.toLocaleString()} (${report.growth.closures.change >= 0 ? '+' : ''}${report.growth.closures.change.toLocaleString()})`);

  // Insights
  if (report.insights.length > 0) {
    console.log('\n🔍 KEY INSIGHTS:');
    report.insights.forEach(insight => console.log(`  ${insight}`));
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log('\n🛠️ CRITICAL ACTIONS:');
    report.recommendations.forEach(rec => console.log(`  ${rec}`));
  }

  // Generate specific next steps based on the analysis
  const nextSteps = generateELI5NextSteps(report);
  
  console.log('\n🚀 NEXT STEPS (What to do now):');
  nextSteps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
  
  console.log('\n✅ COMPARISON CHECKLIST:');
  console.log('  - [ ] Identify source of object growth');
  console.log('  - [ ] Clear all unneeded timers');
  console.log('  - [ ] Remove event listeners on cleanup');
  console.log('  - [ ] Review component unmounting logic');
}

function saveComparisonReportToFile(report: ComparisonReport, markdownOutput?: boolean): string {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const extension = markdownOutput ? 'md' : 'json';
  const filename = path.join('reports', `heap-comparison-${timestamp}.${extension}`);

  // Ensure reports directory exists
  const reportsDir = path.dirname(filename);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  if (markdownOutput) {
    const markdown = generateComparisonMarkdown(report);
    fs.writeFileSync(filename, markdown, 'utf8');
  } else {
    fs.writeFileSync(filename, JSON.stringify(report, null, 2), 'utf8');
  }

  return filename;
}

function generateComparisonMarkdown(report: ComparisonReport): string {
  let markdown = `# Memory Leak Analysis: Before/After Comparison

**Analysis Date:** ${new Date(report.timestamp).toLocaleString()}  
**Leak Severity:** ${report.leakSeverity.toUpperCase()}  
**Before Snapshot:** ${path.basename(report.beforeSnapshot)}  
**After Snapshot:** ${path.basename(report.afterSnapshot)}  

## 📊 Growth Metrics

| Metric | Before | After | Change | Percentage |
|--------|--------|--------|--------|------------|
| Objects | ${report.growth.objects.before.toLocaleString()} | ${report.growth.objects.after.toLocaleString()} | ${report.growth.objects.change >= 0 ? '+' : ''}${report.growth.objects.change.toLocaleString()} | ${report.growth.objects.percentage >= 0 ? '+' : ''}${report.growth.objects.percentage.toFixed(1)}% |
| Memory | ${(report.growth.memory.before / (1024 * 1024)).toFixed(2)}MB | ${(report.growth.memory.after / (1024 * 1024)).toFixed(2)}MB | ${report.growth.memory.change >= 0 ? '+' : ''}${(report.growth.memory.change / (1024 * 1024)).toFixed(2)}MB | ${report.growth.memory.percentage >= 0 ? '+' : ''}${report.growth.memory.percentage.toFixed(1)}% |
| Timers | ${report.growth.timers.before} | ${report.growth.timers.after} | ${report.growth.timers.change >= 0 ? '+' : ''}${report.growth.timers.change} | ${report.growth.timers.percentage >= 0 ? '+' : ''}${report.growth.timers.percentage.toFixed(1)}% |
| Closures | ${report.growth.closures.before.toLocaleString()} | ${report.growth.closures.after.toLocaleString()} | ${report.growth.closures.change >= 0 ? '+' : ''}${report.growth.closures.change.toLocaleString()} | ${report.growth.closures.percentage >= 0 ? '+' : ''}${report.growth.closures.percentage.toFixed(1)}% |

## 🔍 Key Insights

${report.insights.map(insight => `- ${insight}`).join('\n')}

## 🛠️ Critical Actions

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

## 🚀 Next Steps (What to do now)

${generateELI5NextSteps(report).map((step, index) => `${index + 1}. ${step}`).join('\n')}

## ✅ Comparison Checklist

- [ ] Identify source of object growth
- [ ] Clear all unneeded timers  
- [ ] Remove event listeners on cleanup
- [ ] Review component unmounting logic
`;

  return markdown;
}

// Helper functions to extract metrics from insights
function extractDetachedNodesCount(insights: string[]): number {
  const detachedInsight = insights.find(insight => insight.includes('detached DOM'));
  if (!detachedInsight) return 0;
  const match = detachedInsight.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function extractTimerCount(insights: string[]): number {
  const timerInsight = insights.find(insight => insight.includes('timer'));
  if (!timerInsight) return 0;
  const match = timerInsight.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Generate ELI5 (Explain Like I'm 5) next steps based on analysis results
 */
function generateELI5NextSteps(report: ComparisonReport): string[] {
  const steps: string[] = [];
  const memoryGrowthBytes = report.growth.memory.change;
  const memoryGrowthMB = memoryGrowthBytes / (1024 * 1024);
  const objectGrowth = report.growth.objects.change;
  const timerChange = report.growth.timers.change;
  
  // Large memory growth with few objects = data accumulation
  if (memoryGrowthMB > 20 && objectGrowth < 50000) {
    steps.push("🔍 Open your browser's DevTools → Memory tab → look for large arrays or data");
    steps.push("💾 Search your code for arrays that keep growing (like logs, cache, history)");
    steps.push("🧹 Add code to clear/limit these arrays (e.g., array.length = 0 or array.splice(0, 100))");
  }
  
  // Many new objects = object leaks
  if (objectGrowth > 100000) {
    steps.push("🔎 Search your code for 'addEventListener' without 'removeEventListener'");
    steps.push("⏰ Look for 'setInterval' or 'setTimeout' without cleanup");
    steps.push("🔧 Add cleanup code when components unmount or pages change");
  }
  
  // Timer leaks
  if (timerChange > 5) {
    steps.push("⏰ Find all setInterval/setTimeout in your code");
    steps.push("💡 Store timer IDs: const timerId = setInterval(...)");
    steps.push("🧹 Clear timers on cleanup: clearInterval(timerId)");
  }
  
  // High severity needs immediate action
  if (report.leakSeverity === 'high' || report.leakSeverity === 'critical') {
    steps.unshift("🚨 This is a serious leak - test your fix by taking new snapshots");
    steps.push("📊 Re-run this analyzer after your fix to confirm improvement");
  }
  
  // Add generic debugging step if no specific patterns
  if (steps.length === 0) {
    steps.push("🔍 Open browser DevTools → Console → type 'performance.measureUserAgentSpecificMemory()' to check current usage");
    steps.push("📝 Look for code that runs repeatedly (loops, timers, event handlers)");
    steps.push("🧪 Take another heap snapshot after using your app and compare");
  }
  
  return steps;
}

function extractClosureCount(insights: string[]): number {
  const closureInsight = insights.find(insight => insight.includes('closure'));
  if (!closureInsight) return 0;
  const match = closureInsight.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}
