/**
 * Integration tests for the CLI enrich command
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('CLI Integration - Enrich Command', () => {
  const testDir = './test-integration';
  const testReportPath = path.join(testDir, 'test-report.md');
  const testSnapshotPath = path.join(testDir, 'test.heapsnapshot');
  
  const sampleReport = `# 🔍 Memory Analysis Summary

## 📊 Top Memory Consumers

### 1. Array (@123456)
- **Size:** 1.5MB
- **Complexity:** 100 edges
- **References:** testData
- **Trace Command:** \`npx heap-analyzer inspect-object ${testSnapshotPath} --object-id @123456\`

---

## 🔧 Command Reference
`;

  beforeEach(() => {
    // Create test directory and files
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(testReportPath, sampleReport);
    fs.writeFileSync(testSnapshotPath, 'mock heap snapshot data');
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should show help when no report file is provided', (done) => {
    const child = spawn('node', ['./dist/cli.js', 'enrich'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      expect(code).toBe(1);
      expect(output).toContain('Error: enrich requires a report file path');
      expect(output).toContain('Usage: heap-analyzer enrich <report.md>');
      expect(output).toContain('--snapshot-file <file>');
      expect(output).toContain('--max-objects <num>');
      expect(output).toContain('--backup');
      done();
    });
  });

  it('should show help command in the help text', (done) => {
    const child = spawn('node', ['./dist/cli.js', '--help'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      expect(code).toBe(0);
      expect(output).toContain('enrich <report>');
      expect(output).toContain('Enrich analysis report with detailed object inspections');
      expect(output).toContain('heap-analyzer enrich ANALYSIS-SUMMARY.md');
      done();
    });
  });

  // Note: We can't easily test the full enrichment process in CI
  // because it requires memlab to be installed and working snapshots
  // But we can test the command structure and error handling
});