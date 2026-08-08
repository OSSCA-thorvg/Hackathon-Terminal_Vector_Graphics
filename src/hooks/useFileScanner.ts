import { useState, useEffect } from 'react';
import fs from 'fs';
import path from 'path';

export interface FileItem {
  label: string;
  value: string;
  meta: {
    duration: number;
    size: string;
  };
}

const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'build'];

function scanDirectory(dir: string, currentDepth: number, maxDepth: number): FileItem[] {
  if (currentDepth > maxDepth) return [];

  let filesInThisDir: FileItem[] = [];
  let subDirResults: FileItem[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && !EXCLUDED_DIRS.includes(entry.name)) {
        if (currentDepth < maxDepth) {
          subDirResults = subDirResults.concat(scanDirectory(fullPath, currentDepth + 1, maxDepth));
        }
      } else if (entry.isFile()) {
        const file = entry.name;
        if (!file.endsWith('.svg') && !file.endsWith('.json')) continue;

        // Lottie JSON 검증: 'v'+'layers' 또는 'fr'+'layers' 필드 필요
        if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const data = JSON.parse(content);
            if (!data || typeof data !== 'object') continue;
            if (!('v' in data && 'layers' in data) && !('fr' in data && 'layers' in data)) continue;
          } catch { continue; }
        }

        const stats = fs.statSync(fullPath);
        const sizeKb = (stats.size / 1024).toFixed(1) + 'kb';
        const indent = '  '.repeat(currentDepth);

        filesInThisDir.push({
          label: `${indent}📄 ${file}`,
          value: fullPath,
          meta: { duration: 0, size: sizeKb }
        });
      }
    }
  } catch {
    // Ignore access errors
  }

  let results: FileItem[] = [];
  const dirName = path.basename(dir) || dir;

  if (currentDepth > 0 && (filesInThisDir.length > 0 || subDirResults.length > 0)) {
    const indent = '  '.repeat(currentDepth - 1);
    results.push({
      label: `${indent}📂 ${dirName}`,
      value: `__folder__${dir}`,
      meta: { duration: 0, size: '-' }
    });
  }

  return results.concat(filesInThisDir).concat(subDirResults);
}

export function useFileScanner() {
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanDepth, setScanDepth] = useState(0);
  const [basePath, setBasePath] = useState('');

  useEffect(() => {
    if (!basePath) {
      setFileList([]);
      setIsScanning(false);
      return;
    }
    setIsScanning(true);

    setTimeout(() => {
      const items = scanDirectory(basePath, 0, scanDepth);
      if (items.length > 0) {
        setFileList(prevList => items.map(newItem => {
          const existing = prevList.find(f => f.value === newItem.value);
          if (existing && existing.meta.duration > 0) {
            newItem.meta.duration = existing.meta.duration;
          }
          return newItem;
        }));
      } else {
        setFileList([{ label: 'No files found', value: '', meta: { duration: 0, size: '0kb' } }]);
      }
      setIsScanning(false);
    }, 10);
  }, [scanDepth, basePath]);

  /** 특정 파일의 duration 메타데이터를 갱신 */
  const updateFileDuration = (filePath: string, duration: number) => {
    const rounded = Math.round(duration * 100) / 100;
    setFileList(prev => prev.map(f =>
      f.value === filePath ? { ...f, meta: { ...f.meta, duration: rounded } } : f
    ));
  };

  /** 파일 리스트 선두에 새 파일을 추가 */
  const prependFile = (file: FileItem) => {
    setFileList(prev => [file, ...prev]);
  };

  return {
    fileList,
    isScanning,
    scanDepth,
    setScanDepth,
    basePath,
    setBasePath,
    updateFileDuration,
    prependFile,
  };
}
