import * as fs from 'fs';
import * as path from 'path';

interface MemoryObject {
  id: string;
  type: string;
  size: string;
  edges: number;
  refs: string[];
}

interface LeakSummary {
  count: number;
  retainedSize: string;
  description: string;
}

interface LeakPattern {
  keywords: string[];
  description: string;
  category: string;
  priority: number;
}

// Configurable leak patterns - can be externalized to config file
const LEAK_PATTERNS: LeakPattern[] = [
  {
    keywords: ['Timer(', 'setInterval(', 'setTimeout(', 'clearInterval', 'clearTimeout'],
    description: 'Timer/Interval leak - cleanup needed',
    category: 'timers',
    priority: 1
  },
  {
    keywords: ['React.Context', 'FiberNode', 'ReactInternalInstance', 'React.Component'],
    description: 'React component memory retention',
    category: 'react',
    priority: 2
  },
  {
    keywords: ['DOMTimer', 'ScheduledAction', 'MutationObserver', 'addEventListener'],
    description: 'DOM timer/callback leak',
    category: 'dom',
    priority: 1
  },
  {
    keywords: ['DetachedText', 'HTMLElement', 'DocumentFragment', 'Node.appendChild'],
    description: 'Detached DOM elements',
    category: 'dom',
    priority: 2
  },
  {
    keywords: ['PerformanceEventTiming', 'PerformanceEntry', 'PerformanceObserver'],
    description: 'Performance API accumulation',
    category: 'performance',
    priority: 3
  },
  {
    keywords: ['EventListener', 'AbortController', 'Promise.resolve', 'Promise.reject'],
    description: 'Event/Promise leak - cleanup needed',
    category: 'events',
    priority: 2
  },
  {
    keywords: ['Array(', 'Object.create', 'new Map(', 'new Set(', 'new WeakMap('],
    description: 'Large data structure accumulation',
    category: 'data-structures',
    priority: 3
  }
];

/**
 * Detect leak patterns in memlab output using configurable patterns
 * Looks for meaningful patterns in stack traces and object descriptions
 */
function detectLeakPattern(lines: string[], startIndex: number): LeakPattern | null {
  // Look through several lines after the leak entry for patterns
  for (let j = startIndex + 2; j < Math.min(startIndex + 15, lines.length); j++) {
    const currentLine = lines[j].trim();
    
    // Skip empty lines and lines that don't look like stack traces or object descriptions
    if (!currentLine || (!currentLine.includes('at ') && !currentLine.includes(':') && !currentLine.includes('(')))
      continue;
    
    // Check each configured pattern (sorted by priority)
    for (const pattern of LEAK_PATTERNS.sort((a, b) => a.priority - b.priority)) {
      if (pattern.keywords.some(keyword => isRelevantMatch(currentLine, keyword))) {
        return pattern;
      }
    }
  }
  return null;
}

/**
 * Check if a keyword match in a line is contextually relevant
 * Looks for patterns that indicate actual function calls, object types, or stack frames
 */
function isRelevantMatch(line: string, keyword: string): boolean {
  if (!line.includes(keyword)) return false;
  
  // Higher confidence matches
  if (line.includes(`at ${keyword}`) ||           // Stack trace: "at Timer.constructor"
      line.includes(`${keyword}(`) ||             // Function call: "setInterval("
      line.includes(`${keyword}.`) ||             // Method call: "Timer.constructor"
      line.includes(`${keyword}:`)) {             // Object property: "Timer: {...}"
    return true;
  }
  
  // Lower confidence - only match if it looks like a meaningful context
  if (line.includes('at ') && line.includes(keyword)) {  // In a stack trace
    return true;
  }
  
  return false;
}

export async function generateReadableReport(
  outputDir: string, 
  rawAnalysisDir: string, 
  timestamp: string
): Promise<void> {
  try {
    // Find snapshot files
    const snapshotFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.heapsnapshot'));
    const finalSnapshot = snapshotFiles.find(f => f.includes('final')) || snapshotFiles[snapshotFiles.length - 1] || 'final.heapsnapshot';
    
    // Read raw reports
    const memlabReportPath = path.join(rawAnalysisDir, `memlab-analysis-${timestamp}.txt`);
    const objectSizeReportPath = path.join(rawAnalysisDir, `object-size-${timestamp}.txt`);
    
    const memlabContent = fs.readFileSync(memlabReportPath, 'utf8');
    const objectSizeContent = fs.readFileSync(objectSizeReportPath, 'utf8');
    
    // Parse reports
    const topObjects = parseObjectSizeReport(objectSizeContent);
    const leakSummary = parseMemlabReport(memlabContent);
    
    // Generate markdown report
    const markdownReport = generateMarkdownReport(topObjects, leakSummary, timestamp, finalSnapshot, outputDir);
    
    // Save readable report
    const readableReportPath = path.join(outputDir, `ANALYSIS-SUMMARY-${timestamp}.md`);
    fs.writeFileSync(readableReportPath, markdownReport);
    
    console.log(`📋 Readable analysis summary: ${path.basename(readableReportPath)}`);
    
    // Display concise console summary
    console.log('\n📊 Analysis Summary:');
    console.log(`   🚨 ${leakSummary.length} memory leak patterns detected`);
    console.log(`   📈 ${topObjects.length} large memory consumers identified`);
    
    if (topObjects.length > 0) {
      console.log('\n🎯 Top Memory Issues:');
      topObjects.slice(0, 3).forEach((obj, index) => {
        console.log(`   ${index + 1}. ${obj.type} (@${obj.id}) - ${obj.size}`);
      });
    }
    
    // Generate user options
    console.log('\n🎯 Next Steps:');
    console.log(`   📖 Read full report: cat "${readableReportPath}"`);
    console.log('   🔍 Trace top object: npx heap-analyzer inspect-object ' + path.join(outputDir, finalSnapshot) + ' --object-id @' + (topObjects[0]?.id || 'OBJECT_ID'));
    if (topObjects.length > 1) {
      console.log('   📊 Other objects: @' + topObjects.slice(1, 3).map(o => o.id).join(', @'));
    }
    
  } catch (error) {
    console.error('⚠️ Failed to generate readable report:', error);
  }
}

function parseObjectSizeReport(content: string): MemoryObject[] {
  const objects: MemoryObject[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Parse lines like: · @1425693 Array: 1003 edges, 4.5MB, refs: [oceanData]
    const match = line.match(/· @(\d+) ([^:]+): (\d+) edges, ([^,]+), refs: \[([^\]]*)\]/);
    if (match) {
      objects.push({
        id: match[1],
        type: match[2].trim(),
        edges: parseInt(match[3]),
        size: match[4].trim(),
        refs: match[5] ? match[5].split(',').map(r => r.trim()) : []
      });
    }
  }
  
  return objects.slice(0, 10); // Top 10 objects
}

function parseMemlabReport(content: string): LeakSummary[] {
  const leaks: LeakSummary[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Parse lines like: --Similar leaks in this run: 7--
    const countMatch = line.match(/--Similar leaks in this run: (\d+)--/);
    if (countMatch) {
      const count = parseInt(countMatch[1]);
      
      // Look for retained size on next line
      const nextLine = lines[i + 1];
      const sizeMatch = nextLine?.match(/--Retained size of leaked objects: ([^--]+)--/);
      const retainedSize = sizeMatch ? sizeMatch[1].trim() : 'Unknown';
      
      // Skip tiny leaks (less than 1KB) - they're usually noise
      if (retainedSize.includes('bytes') && !retainedSize.includes('KB') && !retainedSize.includes('MB')) {
        const bytes = parseInt(retainedSize);
        if (bytes < 1024) {
          continue; // Skip small leaks
        }
      }
      
      // Look for meaningful description in following lines
      const patternMatch = detectLeakPattern(lines, i);
      const description = patternMatch?.description || '';
      
      // Only include meaningful leaks
      if (description || count > 5 || retainedSize.includes('KB') || retainedSize.includes('MB')) {
        leaks.push({
          count,
          retainedSize,
          description: description || `${count} similar objects retained`
        });
      }
    }
  }
  
  // Sort by impact (MB first, then KB, then by count)
  return leaks.sort((a, b) => {
    const aSize = a.retainedSize;
    const bSize = b.retainedSize;
    
    if (aSize.includes('MB') && !bSize.includes('MB')) return -1;
    if (!aSize.includes('MB') && bSize.includes('MB')) return 1;
    if (aSize.includes('KB') && !bSize.includes('KB')) return -1;
    if (!aSize.includes('KB') && bSize.includes('KB')) return 1;
    
    return b.count - a.count;
  }).slice(0, 10); // Top 10 most significant leaks
}

function generateMarkdownReport(
  topObjects: MemoryObject[], 
  leakSummary: LeakSummary[], 
  timestamp: string,
  finalSnapshot: string,
  outputDir: string
): string {
  const date = new Date().toLocaleDateString();
  const time = new Date().toLocaleTimeString();
  
  return `# 🔍 Memory Analysis Summary

**Generated:** ${date} at ${time}  
**Session:** ${timestamp}

---

## 🎯 Executive Summary

${leakSummary.length > 0 ? `**${leakSummary.length} memory leak patterns detected**` : '**No critical memory leaks detected**'}

${topObjects.length > 0 ? `**${topObjects.length} large memory consumers identified**` : ''}

---

## 📊 Top Memory Consumers

${topObjects.length > 0 ? topObjects.map((obj, index) => `
### ${index + 1}. ${obj.type} (@${obj.id})
- **Size:** ${obj.size}
- **Complexity:** ${obj.edges} edges
- **References:** ${obj.refs.join(', ') || 'None'}
- **Trace Command:** \`npx heap-analyzer inspect-object ${path.join(outputDir, finalSnapshot)} --object-id @${obj.id}\`
`).join('\n') : '*No large objects detected*'}

---

## 🚨 Memory Leak Analysis

${leakSummary.length > 0 ? leakSummary.map((leak, index) => `
### ${index + 1}. ${leak.description}
- **Impact:** ${leak.retainedSize} (${leak.count} instances)
- **Priority:** ${leak.retainedSize.includes('MB') ? '🔴 HIGH' : leak.retainedSize.includes('KB') ? '🟡 MEDIUM' : '🟢 LOW'}
`).join('\n') : '*No significant memory leaks detected*'}

---

## 🛠️ Recommended Actions

### Immediate Actions
${topObjects.slice(0, 3).map((obj, index) => `
${index + 1}. **Investigate ${obj.type} (@${obj.id})**
   - Size: ${obj.size}
   - Command: \`npx heap-analyzer inspect-object ${path.join(outputDir, finalSnapshot)} --object-id @${obj.id}\`
`).join('')}

### Investigation Commands
\`\`\`bash
# Trace largest object
npx heap-analyzer inspect-object ${path.join(outputDir, finalSnapshot)} --object-id @${topObjects[0]?.id || 'OBJECT_ID'}

# Trace other large objects
${topObjects.slice(1, 3).map(o => `npx heap-analyzer inspect-object ${path.join(outputDir, finalSnapshot)} --object-id @${o.id}`).join('\n')}

# Alternative: Use memlab-inspect for detailed analysis
npx heap-analyzer memlab-inspect ${path.join(outputDir, finalSnapshot)} --object-id @${topObjects[0]?.id || 'OBJECT_ID'}
\`\`\`

---

## 📈 Next Steps

1. **🔍 Investigate Top Objects:** Start with the largest memory consumers
2. **🛠️ Apply Fixes:** Use the trace commands to get specific fix recommendations  
3. **🔄 Re-test:** Run another analysis to verify improvements
4. **📊 Compare:** Use \`npx heap-analyzer compare\` to measure progress

---

*Generated by Heap Analyzer v${process.env.npm_package_version || '1.0.0'}*
`;
}