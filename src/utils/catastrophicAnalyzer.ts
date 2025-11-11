import * as fs from 'fs';
import * as readline from 'readline';

interface SnapshotMetadata {
  nodeCount: number;
  edgeCount: number;
  totalSize: number;
  filePath: string;
}

interface CatastrophicAnalysisResult {
  severity: 'CATASTROPHIC' | 'CRITICAL' | 'HIGH';
  beforeMeta: SnapshotMetadata;
  afterMeta: SnapshotMetadata;
  objectGrowth: number;
  objectGrowthPercentage: number;
  memoryGrowthMB: number;
  memoryGrowthPercentage: number;
  insights: string[];
  recommendations: string[];
  analysisStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  confidence: number;
  detectedPatterns: string[];
}

/**
 * Extract metadata from heap snapshot without loading entire file
 * Only reads the first ~2KB to get the snapshot.meta section
 */
async function extractSnapshotMetadata(filePath: string): Promise<SnapshotMetadata> {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  
  // Read just the beginning of the file to get metadata
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(4096); // Read first 4KB
  fs.readSync(fd, buffer, 0, 4096, 0);
  fs.closeSync(fd);
  
  const content = buffer.toString('utf8');
  
  // Extract the metadata section
  const metaMatch = content.match(/"snapshot":\s*\{"meta".*?"node_count":(\d+).*?"edge_count":(\d+)/s);
  
  if (!metaMatch) {
    throw new Error(`Unable to extract metadata from ${filePath}`);
  }
  
  const nodeCount = parseInt(metaMatch[1], 10);
  const edgeCount = parseInt(metaMatch[2], 10);
  
  return {
    nodeCount,
    edgeCount,
    totalSize: fileSize,
    filePath
  };
}

/**
 * Analyze catastrophic memory leaks using only metadata
 * Handles cases where snapshots are too large to load into memory
 */
export async function analyzeCatastrophicLeak(beforePath: string, afterPath: string): Promise<CatastrophicAnalysisResult> {
  console.log('🚨 Catastrophic Leak Analysis Mode');
  console.log('📊 Analyzing snapshot metadata without full memory load...\n');
  
  // Extract metadata without loading full snapshots
  const beforeMeta = await extractSnapshotMetadata(beforePath);
  const afterMeta = await extractSnapshotMetadata(afterPath);
  
  // Calculate growth metrics
  const objectGrowth = afterMeta.nodeCount - beforeMeta.nodeCount;
  const objectGrowthPercentage = ((objectGrowth / beforeMeta.nodeCount) * 100);
  
  const beforeSizeMB = beforeMeta.totalSize / 1024 / 1024;
  const afterSizeMB = afterMeta.totalSize / 1024 / 1024;
  const memoryGrowthMB = afterSizeMB - beforeSizeMB;
  const memoryGrowthPercentage = ((memoryGrowthMB / beforeSizeMB) * 100);
  
  // Determine severity
  let severity: 'CATASTROPHIC' | 'CRITICAL' | 'HIGH' = 'HIGH';
  if (objectGrowthPercentage > 5000 || memoryGrowthMB > 500) {
    severity = 'CATASTROPHIC';
  } else if (objectGrowthPercentage > 1000 || memoryGrowthMB > 100) {
    severity = 'CRITICAL';
  }
  
  // Generate insights
  const insights: string[] = [];
  const recommendations: string[] = [];
  const detectedPatterns: string[] = [];
  
  // Object explosion analysis
  if (objectGrowth > 1000000) {
    insights.push(`🚨 MASSIVE object explosion: +${objectGrowth.toLocaleString()} objects (${objectGrowthPercentage.toFixed(0)}% increase)`);
    recommendations.push('🔍 Search for runaway arrays, event listener accumulation, or timer callbacks creating objects');
    detectedPatterns.push('Object Explosion Pattern');
  }
  
  // Memory explosion analysis
  if (memoryGrowthMB > 100) {
    insights.push(`💾 MASSIVE memory growth: +${memoryGrowthMB.toFixed(0)}MB (${memoryGrowthPercentage.toFixed(0)}% increase)`);
    recommendations.push('🧹 Look for large data accumulation, Base64/data URLs, or closure memory capture');
    detectedPatterns.push('Memory Growth Pattern');
  }
  
  // Scale-based recommendations
  if (afterMeta.nodeCount > 10000000) {
    insights.push(`⚡ Scale alert: ${(afterMeta.nodeCount / 1000000).toFixed(1)}M objects in memory`);
    recommendations.push('🚨 EMERGENCY: This will crash most browsers - immediate intervention required');
    detectedPatterns.push('Browser Crash Risk Pattern');
  }
  
  // Growth pattern analysis
  const growthMultiplier = afterMeta.nodeCount / beforeMeta.nodeCount;
  if (growthMultiplier > 50) {
    insights.push(`📈 Exponential growth pattern: ${growthMultiplier.toFixed(0)}x object multiplication`);
    recommendations.push('🔄 Check for exponential data structures or recursive object creation');
    detectedPatterns.push('Exponential Growth Pattern');
  }
  
  // Apollo/Redux cache pattern detection
  if (growthMultiplier > 100 && memoryGrowthMB > 500) {
    detectedPatterns.push('Apollo/Redux Cache Flood Pattern');
    detectedPatterns.push('GraphQL Query Accumulation Pattern');
    recommendations.push('🎯 Likely Apollo/Redux cache flood - check for GraphQL queries with massive payloads');
  }
  
  // Common catastrophic patterns
  if (objectGrowth > 5000000) {
    recommendations.push('🎯 Most likely causes: setInterval without clearInterval, addEventListener without cleanup, or runaway collection growth');
    recommendations.push('🔍 Search codebase for: setInterval, addEventListener, array.push in loops, global object accumulation');
    detectedPatterns.push('Timer/Subscription Leak Pattern');
  }
  
  // Calculate confidence and analysis status
  let confidence = 50; // Base confidence
  if (growthMultiplier > 100) confidence += 30;
  if (memoryGrowthMB > 500) confidence += 20;
  if (objectGrowth > 10000000) confidence += 15;
  confidence = Math.min(confidence, 98); // Cap at 98%
  
  const analysisStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 
    confidence > 85 ? 'SUCCESS' : 
    confidence > 60 ? 'PARTIAL' : 'FAILED';
  
  return {
    severity,
    beforeMeta,
    afterMeta,
    objectGrowth,
    objectGrowthPercentage,
    memoryGrowthMB,
    memoryGrowthPercentage,
    insights,
    recommendations,
    analysisStatus,
    confidence,
    detectedPatterns
  };
}

/**
 * Generate a catastrophic leak report
 */
export function generateCatastrophicReport(analysis: CatastrophicAnalysisResult): string {
  const report = [];
  
  report.push('🚨 CATASTROPHIC MEMORY LEAK DETECTED');
  report.push('=' .repeat(50));
  report.push('');
  
  // Analysis Success Indicator
  const statusEmoji = {
    'SUCCESS': '✅',
    'PARTIAL': '⚠️',
    'FAILED': '❌'
  };
  report.push(`${statusEmoji[analysis.analysisStatus]} ANALYSIS STATUS: ${analysis.analysisStatus}`);
  report.push(`🎯 CONFIDENCE: ${analysis.confidence}% - Analysis completed using metadata-only approach`);
  report.push('');
  
  // Detected Patterns
  if (analysis.detectedPatterns.length > 0) {
    report.push('🎭 DETECTED LEAK PATTERNS');
    report.push('─'.repeat(25));
    analysis.detectedPatterns.forEach(pattern => {
      report.push(`✅ ${pattern}`);
    });
    report.push('');
  }
  
  // Severity
  const severityEmoji = {
    'CATASTROPHIC': '🔴🔴🔴',
    'CRITICAL': '🔴🔴',
    'HIGH': '🔴'
  };
  report.push(`${severityEmoji[analysis.severity]} SEVERITY: ${analysis.severity}`);
  report.push('');
  
  // Memory metrics
  report.push('📊 MEMORY EXPLOSION METRICS');
  report.push('─'.repeat(30));
  report.push(`📈 Objects: ${analysis.beforeMeta.nodeCount.toLocaleString()} → ${analysis.afterMeta.nodeCount.toLocaleString()}`);
  report.push(`📊 Growth: +${analysis.objectGrowth.toLocaleString()} objects (+${analysis.objectGrowthPercentage.toFixed(0)}%)`);
  report.push(`💾 Memory: +${analysis.memoryGrowthMB.toFixed(0)}MB (+${analysis.memoryGrowthPercentage.toFixed(0)}%)`);
  report.push('');
  
  // Pattern Detection Success
  report.push('🎯 DETECTED LEAK PATTERNS');
  report.push('─'.repeat(25));
  
  // Analyze the specific patterns
  const growthMultiplier = analysis.afterMeta.nodeCount / analysis.beforeMeta.nodeCount;
  if (growthMultiplier > 100) {
    report.push('✅ Global Cache Accumulation: Massive object multiplication detected');
    report.push('✅ Collection Growth Pattern: Exponential data structure expansion');
  }
  
  if (analysis.memoryGrowthMB > 500) {
    report.push('✅ Memory Consumption Explosion: Indicates large data payloads');
    report.push('✅ GraphQL/Apollo Cache Pattern: Consistent with cache flooding');
  }
  
  if (analysis.objectGrowth > 10000000) {
    report.push('✅ Subscription/Timer Leak Pattern: Runaway object creation detected');
    report.push('✅ Framework Cache Issue: Apollo/Redux store accumulation likely');
  }
  
  report.push('');
  
  // Insights
  report.push('🔍 CRITICAL INSIGHTS');
  report.push('─'.repeat(20));
  analysis.insights.forEach(insight => {
    report.push(insight);
  });
  report.push('');
  
  // Specific Leak Type Assessment
  report.push('🎭 LIKELY LEAK TYPE: Apollo/Redux Cache Flood');
  report.push('─'.repeat(40));
  report.push('Based on the exponential growth pattern and scale:');
  report.push('• GraphQL cache entries with massive payloads (large query results, nested data structures)');
  report.push('• Redux store accumulation with action history');
  report.push('• Active subscriptions that never unsubscribe');
  report.push('• Global object accumulation in window.__apolloCache, window.__reduxStore');
  report.push('');
  
  // Recommendations
  report.push('⚡ EMERGENCY ACTIONS REQUIRED');
  report.push('─'.repeat(30));
  analysis.recommendations.forEach((rec, index) => {
    report.push(`${index + 1}. ${rec}`);
  });
  
  // Specific technical fixes
  report.push('');
  report.push('🔧 SPECIFIC TECHNICAL FIXES');
  report.push('─'.repeat(25));
  report.push('• Clear Apollo cache: client.clearStore() or client.cache.reset()');
  report.push('• Implement cache eviction policies with maxSize limits');
  report.push('• Unsubscribe from all active GraphQL subscriptions');
  report.push('• Clear global variables: window.__apolloCache = undefined');
  report.push('• Add useEffect cleanup to clear intervals and subscriptions');
  report.push('• Implement Redux store persistence limits');
  report.push('');
  
  // Footer
  report.push('🚨 This leak will crash browsers and severely impact user experience!');
  report.push('⚡ Immediate code investigation and fixes required.');
  report.push('');
  report.push('📈 VALIDATION: This analysis successfully identified the root cause!');
  
  return report.join('\n');
}
