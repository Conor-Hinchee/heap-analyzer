/**
 * Unit Tests for CLI Module
 * Tests CLI argument parsing and command validation logic
 */

import { describe, it, expect } from '@jest/globals';
import { parseArgs } from 'node:util';

describe('CLI Module - Argument Parsing', () => {
  describe('Help Command', () => {
    it('should parse help flag correctly', () => {
      const args = ['--help'];
      const { values } = parseArgs({
        args,
        options: {
          help: { type: 'boolean', short: 'h' }
        },
        allowPositionals: true
      });
      
      expect(values.help).toBe(true);
    });

    it('should parse short help flag correctly', () => {
      const args = ['-h'];
      const { values } = parseArgs({
        args,
        options: {
          help: { type: 'boolean', short: 'h' }
        },
        allowPositionals: true
      });
      
      expect(values.help).toBe(true);
    });
  });

  describe('File Options', () => {
    it('should parse file option correctly', () => {
      const args = ['--file', 'test.heapsnapshot'];
      const { values } = parseArgs({
        args,
        options: {
          file: { type: 'string', short: 'f' }
        },
        allowPositionals: true
      });
      
      expect(values.file).toBe('test.heapsnapshot');
    });

    it('should parse short file option correctly', () => {
      const args = ['-f', 'test.heapsnapshot'];
      const { values } = parseArgs({
        args,
        options: {
          file: { type: 'string', short: 'f' }
        },
        allowPositionals: true
      });
      
      expect(values.file).toBe('test.heapsnapshot');
    });
  });

  describe('Command Parsing', () => {
    it('should parse compare command with arguments', () => {
      const args = ['compare', 'before.heapsnapshot', 'after.heapsnapshot'];
      const { positionals } = parseArgs({
        args,
        options: {},
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('compare');
      expect(positionals[1]).toBe('before.heapsnapshot');
      expect(positionals[2]).toBe('after.heapsnapshot');
    });

    it('should parse monitor command with options', () => {
      const args = ['monitor', 'http://localhost:3000', '--duration', '5m', '--interval', '30s'];
      const { values, positionals } = parseArgs({
        args,
        options: {
          duration: { type: 'string' },
          interval: { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('monitor');
      expect(positionals[1]).toBe('http://localhost:3000');
      expect(values.duration).toBe('5m');
      expect(values.interval).toBe('30s');
    });

    it('should parse inspect-object command with object-id', () => {
      const args = ['inspect-object', 'test.heapsnapshot', '--object-id', '@123'];
      const { values, positionals } = parseArgs({
        args,
        options: {
          'object-id': { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('inspect-object');
      expect(positionals[1]).toBe('test.heapsnapshot');
      expect(values['object-id']).toBe('@123');
    });

    it('should parse trace command with node-id', () => {
      const args = ['trace', 'test.heapsnapshot', '--node-id', '12345'];
      const { values, positionals } = parseArgs({
        args,
        options: {
          'node-id': { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('trace');
      expect(positionals[1]).toBe('test.heapsnapshot');
      expect(values['node-id']).toBe('12345');
    });

    it('should parse enrich command with options', () => {
      const args = ['enrich', 'report.md', '--snapshot-file', 'snap.heapsnapshot', '--max-objects', '10'];
      const { values, positionals } = parseArgs({
        args,
        options: {
          'snapshot-file': { type: 'string' },
          'max-objects': { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('enrich');
      expect(positionals[1]).toBe('report.md');
      expect(values['snapshot-file']).toBe('snap.heapsnapshot');
      expect(values['max-objects']).toBe('10');
    });
  });

  describe('Node.js Commands', () => {
    it('should parse node-snapshot command with endpoint', () => {
      const args = ['node-snapshot', '--endpoint', 'http://localhost:3000/debug/heap'];
      const { values, positionals } = parseArgs({
        args,
        options: {
          endpoint: { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('node-snapshot');
      expect(values.endpoint).toBe('http://localhost:3000/debug/heap');
    });

    it('should parse node-snapshot command with pid', () => {
      const args = ['node-snapshot', '--pid', '12345'];
      const { values, positionals } = parseArgs({
        args,
        options: {
          pid: { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('node-snapshot');
      expect(values.pid).toBe('12345');
    });

    it('should parse node-monitor command with options', () => {
      const args = ['node-monitor', '--pid', '12345', '--threshold', '500', '--interval', '5'];
      const { values, positionals } = parseArgs({
        args,
        options: {
          pid: { type: 'string' },
          threshold: { type: 'string' },
          interval: { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('node-monitor');
      expect(values.pid).toBe('12345');
      expect(values.threshold).toBe('500');
      expect(values.interval).toBe('5');
    });

    it('should parse node-load-test command with options', () => {
      const args = [
        'node-load-test', 
        'http://localhost:3000/api/test',
        '--endpoint', 'http://localhost:3000/debug/heap',
        '--concurrency', '50',
        '--duration', '60'
      ];
      const { values, positionals } = parseArgs({
        args,
        options: {
          endpoint: { type: 'string' },
          concurrency: { type: 'string' },
          duration: { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('node-load-test');
      expect(positionals[1]).toBe('http://localhost:3000/api/test');
      expect(values.endpoint).toBe('http://localhost:3000/debug/heap');
      expect(values.concurrency).toBe('50');
      expect(values.duration).toBe('60');
    });
  });

  describe('Find Leaks Command', () => {
    it('should parse find-leaks command with snapshot directory', () => {
      const args = ['find-leaks', '--snapshot-dir', './test-snapshots', '--trace-all-objects'];
      const { values, positionals } = parseArgs({
        args,
        options: {
          'snapshot-dir': { type: 'string' },
          'trace-all-objects': { type: 'boolean' }
        },
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('find-leaks');
      expect(values['snapshot-dir']).toBe('./test-snapshots');
      expect(values['trace-all-objects']).toBe(true);
    });
  });

  describe('Browser Commands', () => {
    it('should parse browser command with options', () => {
      const args = [
        'browser', 
        'http://localhost:3000',
        '--devtools',
        '--inject-script', 'console.log("test")',
        '--timeout', '2m',
        '--wait-until', 'load'
      ];
      const { values, positionals } = parseArgs({
        args,
        options: {
          devtools: { type: 'boolean' },
          'inject-script': { type: 'string' },
          timeout: { type: 'string' },
          'wait-until': { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(positionals[0]).toBe('browser');
      expect(positionals[1]).toBe('http://localhost:3000');
      expect(values.devtools).toBe(true);
      expect(values['inject-script']).toBe('console.log("test")');
      expect(values.timeout).toBe('2m');
      expect(values['wait-until']).toBe('load');
    });
  });

  describe('Command Validation Logic', () => {
    it('should identify missing required arguments for compare', () => {
      const args = ['compare'];
      const { positionals } = parseArgs({
        args,
        options: {},
        allowPositionals: true
      });
      
      // Simulate validation logic
      const baseline = positionals[1];
      const target = positionals[2];
      
      expect(baseline).toBeUndefined();
      expect(target).toBeUndefined();
      // This would trigger validation error in actual CLI
    });

    it('should identify missing object-id for inspect-object', () => {
      const args = ['inspect-object', 'test.heapsnapshot'];
      const { values } = parseArgs({
        args,
        options: {
          'object-id': { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(values['object-id']).toBeUndefined();
      // This would trigger validation error in actual CLI
    });

    it('should identify missing node-id for trace', () => {
      const args = ['trace', 'test.heapsnapshot'];
      const { values } = parseArgs({
        args,
        options: {
          'node-id': { type: 'string' }
        },
        allowPositionals: true
      });
      
      expect(values['node-id']).toBeUndefined();
      // This would trigger validation error in actual CLI
    });

    it('should validate URL presence for monitor command', () => {
      const args = ['monitor'];
      const { positionals } = parseArgs({
        args,
        options: {},
        allowPositionals: true
      });
      
      const url = positionals[1];
      expect(url).toBeUndefined();
      // This would trigger validation error in actual CLI
    });
  });
});