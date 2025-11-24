/**
 * Tests for Report Enrichment functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { enrichMarkdownReport, enrichReportFromCLI } from '../reportEnricher';

// Mock the memlab inspector module
jest.mock('../memlabObjectInspectorSimple', () => ({
  inspectMemlabObject: jest.fn()
}));

// Mock child_process spawn for memlab commands
jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

const mockSpawn = jest.mocked(require('node:child_process').spawn);

describe('Report Enrichment', () => {
  const testReportPath = './test-report.md';
  const testSnapshotPath = './test-snapshot.heapsnapshot';
  
  const sampleReport = `# 🔍 Memory Analysis Summary

**Generated:** 11/20/2025 at 1:50:06 PM  
**Session:** 2025-11-20T18-49-59-471Z

---

## 📊 Top Memory Consumers

### 1. Array (@1857901)
- **Size:** 4.5MB
- **Complexity:** 1003 edges
- **References:** oceanData
- **Trace Command:** \`npx heap-analyzer inspect-object test-snapshot.heapsnapshot --object-id @1857901\`

### 2. Array (@1857335)
- **Size:** 4.5MB  
- **Complexity:** 1003 edges
- **References:** oceanData
- **Trace Command:** \`npx heap-analyzer inspect-object test-snapshot.heapsnapshot --object-id @1857335\`

---

## 🔧 Command Reference
`;

  const mockObjectData = {
    id: 1857901,
    name: 'Array',
    type: 'object',
    selfsize: 16,
    retainedSize: 4600000,
    references: [
      { name: '0', toNode: 1857917 },
      { name: '1', toNode: 1857919 },
      { name: '2', toNode: 1857921 }
    ],
    referrers: [
      { name: 'oceanData', fromNode: 1420217 }
    ]
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create test files
    fs.writeFileSync(testReportPath, sampleReport);
    fs.writeFileSync(testSnapshotPath, 'mock snapshot data');
    
    // Mock spawn to return successful memlab command
    mockSpawn.mockImplementation(() => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from(JSON.stringify(mockObjectData)));
            }
          })
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0); // Success exit code
          }
        })
      };
      return mockProcess as any;
    });
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testReportPath)) fs.unlinkSync(testReportPath);
    if (fs.existsSync(testReportPath + '.backup')) fs.unlinkSync(testReportPath + '.backup');
    if (fs.existsSync(testSnapshotPath)) fs.unlinkSync(testSnapshotPath);
  });

  describe('enrichMarkdownReport', () => {
    it('should successfully enrich a report with object inspection data', async () => {
      const result = await enrichMarkdownReport({
        reportPath: testReportPath,
        snapshotFile: testSnapshotPath,
        maxObjects: 2,
        saveBackup: true
      });

      expect(result).toBe(true);
      
      // Check that backup was created
      expect(fs.existsSync(testReportPath + '.backup')).toBe(true);
      
      // Check that report was updated
      const enrichedContent = fs.readFileSync(testReportPath, 'utf8');
      expect(enrichedContent).toContain('**Type:** object');
      expect(enrichedContent).toContain('**Self Size:** 16 B');
      expect(enrichedContent).toContain('**Retained Size:** 4.4 MB');
      expect(enrichedContent).toContain('**🔗 Referenced By:**');
      expect(enrichedContent).toContain('oceanData (@1420217)');
      expect(enrichedContent).toContain('**👉 Points To:**');
      expect(enrichedContent).toContain('Report enriched with detailed object analysis');
    });

    it('should extract object IDs from report content', async () => {
      const result = await enrichMarkdownReport({
        reportPath: testReportPath,
        snapshotFile: testSnapshotPath,
        maxObjects: 1
      });

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('npx', [
        'memlab', 'analyze', 'object',
        '--node-id', '1857901',
        '--snapshot', testSnapshotPath,
        '--output', 'json'
      ], { stdio: ['pipe', 'pipe', 'inherit'] });
    });

    it('should auto-detect snapshot file from trace commands', async () => {
      const result = await enrichMarkdownReport({
        reportPath: testReportPath,
        maxObjects: 1
      });

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('npx', [
        'memlab', 'analyze', 'object',
        '--node-id', '1857901',
        '--snapshot', 'test-snapshot.heapsnapshot',
        '--output', 'json'
      ], { stdio: ['pipe', 'pipe', 'inherit'] });
    });

    it('should handle missing report file', async () => {
      const result = await enrichMarkdownReport({
        reportPath: './nonexistent-report.md',
        snapshotFile: testSnapshotPath
      });

      expect(result).toBe(false);
    });

    it('should handle missing snapshot file', async () => {
      const result = await enrichMarkdownReport({
        reportPath: testReportPath,
        snapshotFile: './nonexistent-snapshot.heapsnapshot'
      });

      expect(result).toBe(false);
    });

    it('should limit objects based on maxObjects parameter', async () => {
      await enrichMarkdownReport({
        reportPath: testReportPath,
        snapshotFile: testSnapshotPath,
        maxObjects: 1
      });

      // Should only call spawn once for the first object
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith('npx', [
        'memlab', 'analyze', 'object',
        '--node-id', '1857901',
        '--snapshot', testSnapshotPath,
        '--output', 'json'
      ], { stdio: ['pipe', 'pipe', 'inherit'] });
    });

    it('should handle memlab command failures gracefully', async () => {
      // Mock spawn to return failure
      mockSpawn.mockImplementation(() => {
        const mockProcess = {
          stdout: { on: jest.fn() },
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(1); // Failure exit code
            }
          })
        };
        return mockProcess as any;
      });

      const result = await enrichMarkdownReport({
        reportPath: testReportPath,
        snapshotFile: testSnapshotPath,
        maxObjects: 1
      });

      expect(result).toBe(true); // Should still succeed even if some objects fail
    });
  });

  describe('enrichReportFromCLI', () => {
    it('should successfully enrich report from CLI', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await enrichReportFromCLI(testReportPath, {
        snapshotFile: testSnapshotPath,
        maxObjects: 1,
        backup: true
      });

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('🔍 Starting markdown report enrichment...');
      expect(consoleSpy).toHaveBeenCalledWith('\n🎉 Report enrichment completed successfully!');
      
      consoleSpy.mockRestore();
    });

    it('should handle CLI enrichment failure', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await enrichReportFromCLI('./nonexistent-report.md', {
        snapshotFile: testSnapshotPath,
        maxObjects: 1
      });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('\n❌ Report enrichment failed');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Object Data Processing', () => {
    it('should format bytes correctly', async () => {
      const largeObjectData = {
        ...mockObjectData,
        selfsize: 1024,
        retainedSize: 1024 * 1024 * 5.5 // 5.5 MB
      };

      mockSpawn.mockImplementation(() => {
        const mockProcess = {
          stdout: {
            on: jest.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                callback(Buffer.from(JSON.stringify(largeObjectData)));
              }
            })
          },
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(0);
            }
          })
        };
        return mockProcess as any;
      });

      await enrichMarkdownReport({
        reportPath: testReportPath,
        snapshotFile: testSnapshotPath,
        maxObjects: 1
      });

      const enrichedContent = fs.readFileSync(testReportPath, 'utf8');
      expect(enrichedContent).toContain('**Self Size:** 1 KB');
      expect(enrichedContent).toContain('**Retained Size:** 5.5 MB');
    });

    it('should handle objects with many references', async () => {
      const manyRefsData = {
        ...mockObjectData,
        references: Array.from({ length: 15 }, (_, i) => ({ name: `${i}`, toNode: 1000 + i })),
        referrers: Array.from({ length: 8 }, (_, i) => ({ name: `ref${i}`, fromNode: 2000 + i }))
      };

      mockSpawn.mockImplementation(() => {
        const mockProcess = {
          stdout: {
            on: jest.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                callback(Buffer.from(JSON.stringify(manyRefsData)));
              }
            })
          },
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(0);
            }
          })
        };
        return mockProcess as any;
      });

      await enrichMarkdownReport({
        reportPath: testReportPath,
        snapshotFile: testSnapshotPath,
        maxObjects: 1
      });

      const enrichedContent = fs.readFileSync(testReportPath, 'utf8');
      expect(enrichedContent).toContain('*... and 10 more references*');
      expect(enrichedContent).toContain('*... and 3 more referrers*');
    });

    it('should preserve original trace commands', async () => {
      await enrichMarkdownReport({
        reportPath: testReportPath,
        snapshotFile: testSnapshotPath,
        maxObjects: 1
      });

      const enrichedContent = fs.readFileSync(testReportPath, 'utf8');
      expect(enrichedContent).toContain('**Object Inspection:** `npx heap-analyzer inspect-object test-snapshot.heapsnapshot --object-id @1857901`');
      expect(enrichedContent).toContain('**Retention Path:** `npx memlab trace --node-id 1857901 --snapshot [snapshot-file]`');
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parsing errors', async () => {
      mockSpawn.mockImplementation(() => {
        const mockProcess = {
          stdout: {
            on: jest.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                callback(Buffer.from('invalid json'));
              }
            })
          },
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(0);
            }
          })
        };
        return mockProcess as any;
      });

      const result = await enrichMarkdownReport({
        reportPath: testReportPath,
        snapshotFile: testSnapshotPath,
        maxObjects: 1
      });

      expect(result).toBe(true); // Should continue despite parsing errors
    });

    it('should handle spawn errors', async () => {
      mockSpawn.mockImplementation(() => {
        const mockProcess = {
          stdout: { on: jest.fn() },
          on: jest.fn((event: string, callback: (error: Error) => void) => {
            if (event === 'error') {
              callback(new Error('Spawn failed'));
            }
          })
        };
        return mockProcess as any;
      });

      const result = await enrichMarkdownReport({
        reportPath: testReportPath,
        snapshotFile: testSnapshotPath,
        maxObjects: 1
      });

      expect(result).toBe(true); // Should handle errors gracefully
    });
  });
});