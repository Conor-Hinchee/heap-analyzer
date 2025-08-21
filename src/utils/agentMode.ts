import fs from 'fs';
import path from 'path';
import { analyzeHeapSnapshot, AnalysisResult } from './heapAnalyzer.js';
import { RetainerTracer } from './retainerTracer.js';
import { FrameworkDetector, FrameworkDetectionResult, formatFrameworkDetection } from './frameworkDetector.js';

interface AgentAnalysisReport {
  timestamp: string;
  snapshotPath: string;
  analysis: AnalysisResult;
  frameworkInfo?: FrameworkDetectionResult;
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
  insights: string[];
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface AgentOptions {
  markdownOutput?: boolean;
}

export async function runAgentMode(snapshotPath: string, options: AgentOptions = {}): Promise<string> {
  console.log('🤖 Running Heap Analyzer in Agent Mode...\n');
  
  try {
    // Check if snapshot file exists
    if (!fs.existsSync(snapshotPath)) {
      console.error(`❌ Snapshot file not found: ${snapshotPath}`);
      process.exit(1);
    }

    console.log(`📊 Analyzing snapshot: ${path.basename(snapshotPath)}`);
    console.log('⏳ Processing heap snapshot data...');
    console.log('🔍 Running advanced leak detection...');
    console.log('🎯 Detecting frameworks and libraries...\n');

    // Analyze the heap snapshot
    const analysis = await analyzeHeapSnapshot(snapshotPath);
    
    // Generate agent report with enhanced tracing
    const report = generateAgentReport(snapshotPath, analysis);
    
    // Display results
    displayAgentReport(report);
    
    // Optionally save report to file
    const outputPath = saveReportToFile(report, options.markdownOutput);
    if (options.markdownOutput) {
      console.log(`\n📝 Markdown report saved to: ${outputPath}`);
    } else {
      console.log(`\n💾 Full report saved to: ${outputPath}`);
    }
    
    return outputPath;
    
  } catch (error) {
    console.error('❌ Error during agent analysis:', error);
    process.exit(1);
  }
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
    // Get the snapshot data for tracing and framework detection
    const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const tracer = new RetainerTracer(snapshotData, analysis.topRetainers.map(r => r.node));
    
    // Perform framework detection on all nodes for better coverage
    const allNodes = Object.values(snapshotData.nodes || {}).map((nodeData: any, index: number) => ({
      nodeIndex: index,
      type: nodeData.type || 'unknown',
      name: nodeData.name || '',
      selfSize: nodeData.selfSize || 0,
      retainedSize: nodeData.retainedSize || nodeData.selfSize || 0,
      id: nodeData.id || index
    })).filter(node => node.name || node.type);
    
    const frameworkDetector = new FrameworkDetector(allNodes.slice(0, 1000)); // Sample first 1000 for performance
    frameworkInfo = frameworkDetector.detectFrameworks();
    
    console.log(`🎯 Framework detection: ${frameworkInfo.primary ? frameworkInfo.primary.name : 'None detected'}`);
    
    // Perform batch trace analysis
    const traceAnalysis = tracer.batchTrace(analysis.topRetainers.map(r => r.node));
    traceResults = traceAnalysis.summary;
    
    console.log(`🧠 Traced ${analysis.topRetainers.length} objects, found ${traceResults.totalLikelyLeaks} likely leaks`);

    // Add distributed leak pattern analysis
    distributedAnalysis = analyzeDistributedLeakPatterns(tracer, allNodes);
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

    // Generate insights based on trace results
    analysis.topRetainers.forEach((retainer, index) => {
      const trace = traceAnalysis.traces[index];
      const sizeInMB = (retainer.node.selfSize / (1024 * 1024)).toFixed(2);
      const sizeInKB = (retainer.node.selfSize / 1024).toFixed(1);
      const name = retainer.node.name || retainer.node.type;
      
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
  // --- Closure surfacing: always show closure stats ---
  if (distributedAnalysis && distributedAnalysis.distributedMemory.closureMemory > 0) {
    const closureCount = (analysis.topRetainers || []).filter((r: any) => {
      const t = r.node.type || '';
      const n = r.node.name || '';
      return t.includes('closure') || n.includes('Function') || n.includes('Closure');
    }).length;
    insights.push(`🧩 Closures: ${closureCount} closures, ${(distributedAnalysis.distributedMemory.closureMemory / (1024 * 1024)).toFixed(2)}MB total`);
  }

  // --- List largest closures ---
  if (distributedAnalysis && (distributedAnalysis.distributedMemory as any).largestClosures?.length) {
    insights.push('🔎 Largest closures:');
    (distributedAnalysis.distributedMemory as any).largestClosures.forEach((node: any, idx: number) => {
      insights.push(`   ${idx + 1}. ${node.name || node.type} - ${(node.selfSize / 1024).toFixed(1)} KB`);
    });
  }

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
