import fs from 'fs';
import path from 'path';
import { analyzeHeapSnapshot, AnalysisResult } from './heapAnalyzer.js';

interface AgentAnalysisReport {
  timestamp: string;
  snapshotPath: string;
  analysis: AnalysisResult;
  insights: string[];
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export async function runAgentMode(snapshotPath: string): Promise<void> {
  console.log('🤖 Running Heap Analyzer in Agent Mode...\n');
  
  try {
    // Check if snapshot file exists
    if (!fs.existsSync(snapshotPath)) {
      console.error(`❌ Snapshot file not found: ${snapshotPath}`);
      process.exit(1);
    }

    console.log(`📊 Analyzing snapshot: ${path.basename(snapshotPath)}`);
    console.log('⏳ Processing heap snapshot data...\n');

    // Analyze the heap snapshot
    const analysis = await analyzeHeapSnapshot(snapshotPath);
    
    // Generate agent report
    const report = generateAgentReport(snapshotPath, analysis);
    
    // Display results
    displayAgentReport(report);
    
    // Optionally save report to file
    const outputPath = saveReportToFile(report);
    console.log(`\n💾 Full report saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('❌ Error during agent analysis:', error);
    process.exit(1);
  }
}

function generateAgentReport(snapshotPath: string, analysis: AnalysisResult): AgentAnalysisReport {
  const insights: string[] = [];
  const recommendations: string[] = [];
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Analyze top retainers for insights
  if (analysis.topRetainers && analysis.topRetainers.length > 0) {
    analysis.topRetainers.forEach((retainer, index) => {
      const sizeInMB = (retainer.node.selfSize / (1024 * 1024)).toFixed(2);
      const sizeInKB = (retainer.node.selfSize / 1024).toFixed(1);
      
      if (retainer.node.selfSize > 1024 * 1024) { // > 1MB
        severity = 'high';
        insights.push(`Large memory consumer detected: ${retainer.node.name || retainer.node.type} (${sizeInMB}MB)`);
        recommendations.push(`Investigate ${retainer.node.name || retainer.node.type} - consider memory optimization strategies`);
      } else if (retainer.node.selfSize > 100 * 1024) { // > 100KB
        if (severity === 'low') severity = 'medium';
        insights.push(`Moderate memory usage: ${retainer.node.name || retainer.node.type} (${sizeInKB}KB)`);
      }

      // Category-specific insights
      switch (retainer.category) {
        case 'DOM':
          insights.push(`DOM-related memory usage detected in ${retainer.node.name || retainer.node.type}`);
          recommendations.push('Consider DOM cleanup strategies and event listener removal');
          break;
        case 'CLOSURE':
          insights.push(`Closure retaining memory: ${retainer.node.name || retainer.node.type}`);
          recommendations.push('Review closure scope and consider breaking circular references');
          break;
        case 'ARRAY':
          insights.push(`Large array detected: ${retainer.node.name || retainer.node.type}`);
          recommendations.push('Consider array size optimization or lazy loading');
          break;
      }
    });
  } else {
    insights.push('No significant memory retainers found in the analysis');
    recommendations.push('Heap snapshot may be small or analysis needs refinement');
  }

  // Overall memory analysis
  const totalMB = (analysis.summary.totalRetainedSize / (1024 * 1024)).toFixed(2);
  insights.push(`Total heap size: ${totalMB}MB with ${analysis.summary.totalObjects} objects`);

  if (analysis.summary.totalRetainedSize > 20 * 1024 * 1024) { // > 20MB
    severity = 'critical';
    recommendations.push('Consider overall memory reduction strategies - heap size is critically high');
  }

  // Category distribution insights
  const categories = analysis.summary.categories;
  if (Object.keys(categories).length > 0) {
    const topCategory = Object.entries(categories).reduce((a, b) => 
      categories[a[0]] > categories[b[0]] ? a : b
    );
    
    insights.push(`Dominant memory category: ${topCategory[0]} (${topCategory[1]} objects)`);
  } else {
    insights.push('No specific memory categories identified');
  }

  return {
    timestamp: new Date().toISOString(),
    snapshotPath,
    analysis,
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

  console.log('📋 AGENT ANALYSIS REPORT');
  console.log('=' .repeat(50));
  console.log(`${severityEmoji[report.severity]} Severity: ${report.severity.toUpperCase()}`);
  console.log(`📅 Timestamp: ${new Date(report.timestamp).toLocaleString()}`);
  console.log(`📁 Snapshot: ${path.basename(report.snapshotPath)}\n`);

  // Key Insights
  console.log('🔍 KEY INSIGHTS:');
  report.insights.forEach((insight, index) => {
    console.log(`  ${index + 1}. ${insight}`);
  });

  // Top Memory Consumers
  console.log('\n🏆 TOP MEMORY CONSUMERS:');
  report.analysis.topRetainers.slice(0, 5).forEach((retainer, index) => {
    const sizeInKB = (retainer.node.selfSize / 1024).toFixed(1);
    const displayName = retainer.node.name || retainer.node.type || 'Unknown';
    console.log(`  ${index + 1}. ${retainer.emoji} ${displayName} - ${sizeInKB}KB (${retainer.category})`);
  });

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  report.recommendations.forEach((rec, index) => {
    console.log(`  ${index + 1}. ${rec}`);
  });

  // Memory Summary
  const totalMB = (report.analysis.summary.totalRetainedSize / (1024 * 1024)).toFixed(2);
  console.log(`\n📊 MEMORY SUMMARY:`);
  console.log(`  • Total Objects: ${report.analysis.summary.totalObjects.toLocaleString()}`);
  console.log(`  • Total Memory: ${totalMB}MB`);
  console.log(`  • Categories: ${Object.keys(report.analysis.summary.categories).length}`);
}

function saveReportToFile(report: AgentAnalysisReport): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = './reports';
  
  // Create reports directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `heap-analysis-${timestamp}.json`);
  
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  
  return outputPath;
}

export async function runContinuousAgent(snapshotDirectory: string, intervalSeconds: number = 60): Promise<void> {
  console.log(`🤖 Running Continuous Heap Analyzer Agent Mode...`);
  console.log(`📁 Monitoring directory: ${snapshotDirectory}`);
  console.log(`⏱️  Check interval: ${intervalSeconds} seconds\n`);

  const processedSnapshots = new Set<string>();

  while (true) {
    try {
      // Check for new snapshot files
      if (fs.existsSync(snapshotDirectory)) {
        const files = fs.readdirSync(snapshotDirectory)
          .filter(file => file.endsWith('.heapsnapshot'))
          .map(file => path.join(snapshotDirectory, file));

        for (const filePath of files) {
          const stat = fs.statSync(filePath);
          const fileKey = `${filePath}-${stat.mtime.getTime()}`;
          
          if (!processedSnapshots.has(fileKey)) {
            console.log(`🔍 New snapshot detected: ${path.basename(filePath)}`);
            await runAgentMode(filePath);
            processedSnapshots.add(fileKey);
            console.log('---\n');
          }
        }
      }

      // Wait for next check
      await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
    } catch (error) {
      console.error('❌ Error in continuous monitoring:', error);
      await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
    }
  }
}
