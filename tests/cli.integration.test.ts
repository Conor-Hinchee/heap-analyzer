import { spawn } from 'child_process';
import path from 'path';

// Helper function to run CLI command
function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
    const child = spawn('node', [cliPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });
  });
}

describe('CLI', () => {
  // Build the project before running CLI tests
  beforeAll(async () => {
    const { execSync } = require('child_process');
    execSync('npm run build', { cwd: path.join(__dirname, '..') });
  }, 30000);

  describe('help command', () => {
    it('should show help with --help flag', async () => {
      const result = await runCLI(['--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Heap Analyzer CLI 🚀');
      expect(result.stdout).toContain('Usage: heap-analyzer [options] [command]');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('analyze <file>');
      expect(result.stdout).toContain('find-leaks');
      expect(result.stdout).toContain('list');
    });

    it('should show help with -h flag', async () => {
      const result = await runCLI(['-h']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Heap Analyzer CLI 🚀');
      expect(result.stdout).toContain('Usage: heap-analyzer');
    });
  });

  describe('list command', () => {
    it('should handle list command', async () => {
      const result = await runCLI(['list']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Heap Analyzer CLI 🚀');
      expect(result.stdout).toContain('Available snapshots:');
    });
  });

  describe('analyze command', () => {
    it('should show error for missing file', async () => {
      const result = await runCLI(['analyze']);
      
      expect(result.code).toBe(1);
      // Error messages might be in stderr or stdout
      const output = result.stdout + result.stderr;
      expect(output).toContain('❌ Error: Please provide a heap snapshot file');
    });

    it('should show error for non-existent file', async () => {
      const result = await runCLI(['analyze', 'non-existent.heapsnapshot']);
      
      expect(result.code).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('❌ File not found: non-existent.heapsnapshot');
    });

    it('should show error for invalid file extension', async () => {
      // Create a temporary file with wrong extension
      const fs = require('fs');
      const tempFile = 'temp-test.txt';
      fs.writeFileSync(tempFile, 'test content');
      
      const result = await runCLI(['analyze', tempFile]);
      
      expect(result.code).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('❌ File must be a .heapsnapshot file');
      
      // Clean up
      fs.unlinkSync(tempFile);
    });
  });

  describe('find-leaks command', () => {
    it('should show error when no snapshots provided', async () => {
      const result = await runCLI(['find-leaks']);
      
      expect(result.code).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('❌ Error: find-leaks requires either:');
      expect(output).toContain('--snapshot-dir <directory>');
      expect(output).toContain('OR --baseline <file> --target <file> [--final <file>]');
    });

    it('should show error for missing baseline when only target provided', async () => {
      const result = await runCLI([
        'find-leaks', 
        '--target', 'target.heapsnapshot'
      ]);
      
      expect(result.code).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('❌ Error: find-leaks requires either:');
    });

    it('should show error for non-existent snapshot directory', async () => {
      const result = await runCLI(['find-leaks', '--snapshot-dir', './non-existent-dir']);
      
      expect(result.code).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('❌ Directory not found: ./non-existent-dir');
    });
  });

  describe('default behavior', () => {
    it('should show helpful message when no command provided', async () => {
      const result = await runCLI([]);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Heap Analyzer CLI 🚀');
      expect(result.stdout).toContain('💡 Use --help to see available commands');
      expect(result.stdout).toContain('💡 Use "list" to see available snapshots');
    });
  });

  describe('file flag', () => {
    it('should handle --file flag', async () => {
      const result = await runCLI(['--file', 'non-existent.heapsnapshot']);
      
      expect(result.code).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('❌ File not found: non-existent.heapsnapshot');
    });

    it('should handle -f flag', async () => {
      const result = await runCLI(['-f', 'non-existent.heapsnapshot']);
      
      expect(result.code).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('❌ File not found: non-existent.heapsnapshot');
    });
  });

  describe('error handling', () => {
    it('should handle invalid arguments gracefully', async () => {
      const result = await runCLI(['invalid-command']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('💡 Use --help to see available commands');
    });
  });
});