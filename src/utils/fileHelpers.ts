import fs from 'fs';
import path from 'path';
import { SnapshotFile } from '../types/index.js';

export function checkSnapshotDirectory(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function createSnapshotDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getSnapshotFiles(dirPath: string): SnapshotFile[] {
  if (!checkSnapshotDirectory(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath)
    .filter(file => file.endsWith('.heapsnapshot'))
    .map(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        size: stats.size,
        created: stats.birthtime
      };
    });
}

export function validateSnapshotFile(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() && path.extname(filePath) === '.heapsnapshot';
  } catch {
    return false;
  }
}
