import fs from 'node:fs';
import path from 'node:path';
import { analyzeHeapSnapshot, listSnapshots } from '../src/analyzer';

// Mock @memlab/core
jest.mock('@memlab/core', () => ({
  __esModule: true,
  default: {
    utils: {
      getSnapshotFromFile: jest.fn(),
    },
  },
}));

// Mock fs module
jest.mock('node:fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('analyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset console mocks
    (console.log as jest.Mock).mockClear();
    (console.error as jest.Mock).mockClear();
  });

  describe('listSnapshots', () => {
    it('should handle non-existent directory', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await listSnapshots('./non-existent');

      expect(console.log).toHaveBeenCalledWith('📁 Snapshots directory not found: ./non-existent');
      expect(console.log).toHaveBeenCalledWith('💡 Create the directory and add .heapsnapshot files to get started');
    });

    it('should handle empty directory', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readdirSync as jest.Mock).mockReturnValue([]);

      await listSnapshots('./snapshots');

      expect(console.log).toHaveBeenCalledWith('📂 No .heapsnapshot files found in ./snapshots');
      expect(console.log).toHaveBeenCalledWith('💡 Add some .heapsnapshot files to analyze them');
    });

    it('should list heapsnapshot files with details', async () => {
      const mockStats = {
        size: 1024 * 1024 * 20, // 20MB
        mtime: new Date('2025-11-14'),
      };

      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readdirSync as jest.Mock).mockReturnValue(['test.heapsnapshot', 'other.txt', 'test2.heapsnapshot']);
      mockFs.statSync.mockReturnValue(mockStats as any);

      await listSnapshots('./snapshots');

      expect(console.log).toHaveBeenCalledWith('📊 Found 2 snapshot file(s):\n');
      expect(console.log).toHaveBeenCalledWith('   📄 test.heapsnapshot');
      expect(console.log).toHaveBeenCalledWith('      Size: 20.00 MB');
    });
  });

  describe('analyzeHeapSnapshot', () => {
    const mockHeap = {
      nodes: {
        length: 1000,
        forEach: jest.fn((callback) => {
          // Simulate some nodes
          callback({ type: 'object', self_size: 100 });
          callback({ type: 'string', self_size: 50 });
          callback({ type: 'object', self_size: 200 });
        }),
      },
      edges: { length: 5000 },
    };

    beforeEach(() => {
      const mockMemlab = require('@memlab/core').default;
      mockMemlab.utils.getSnapshotFromFile.mockResolvedValue(mockHeap);
    });

    it('should handle non-existent file', async () => {
      mockFs.existsSync.mockReturnValue(false);

      // Mock process.exit to prevent test from actually exiting
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(analyzeHeapSnapshot('./non-existent.heapsnapshot')).rejects.toThrow();
      
      expect(console.error).toHaveBeenCalledWith('❌ File not found: ./non-existent.heapsnapshot');
      expect(mockExit).toHaveBeenCalledWith(1);
      
      mockExit.mockRestore();
    });

    it('should handle invalid file extension', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(analyzeHeapSnapshot('./test.txt')).rejects.toThrow();
      
      expect(console.error).toHaveBeenCalledWith('❌ File must be a .heapsnapshot file');
      expect(mockExit).toHaveBeenCalledWith(1);
      
      mockExit.mockRestore();
    });

    it('should successfully analyze heap snapshot', async () => {
      mockFs.existsSync.mockReturnValue(true);

      await analyzeHeapSnapshot('./test.heapsnapshot');

      expect(console.log).toHaveBeenCalledWith('📊 Loading heap snapshot...');
      expect(console.log).toHaveBeenCalledWith('\n✅ Heap snapshot loaded successfully!');
      expect(console.log).toHaveBeenCalledWith('\n📈 Basic Statistics:');
      expect(console.log).toHaveBeenCalledWith('   Total nodes: 1,000');
      expect(console.log).toHaveBeenCalledWith('   Total edges: 5,000');
      expect(console.log).toHaveBeenCalledWith('\n🎉 Analysis complete!');
    });

    it('should calculate heap size correctly', async () => {
      mockFs.existsSync.mockReturnValue(true);

      await analyzeHeapSnapshot('./test.heapsnapshot');

      // Should calculate total size (100 + 50 + 200 = 350 bytes = 0.00033 MB)
      expect(console.log).toHaveBeenCalledWith('   Total heap size: 0.00 MB');
    });

    it('should categorize node types', async () => {
      mockFs.existsSync.mockReturnValue(true);

      await analyzeHeapSnapshot('./test.heapsnapshot');

      expect(console.log).toHaveBeenCalledWith('\n🔍 Node Types:');
      expect(console.log).toHaveBeenCalledWith('   object: 2');
      expect(console.log).toHaveBeenCalledWith('   string: 1');
    });
  });
});