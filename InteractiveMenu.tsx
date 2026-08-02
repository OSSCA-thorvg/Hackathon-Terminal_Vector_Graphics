import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { realWasmModule } from './realWasmModule.js';
import { LottiePlayer } from './LottiePlayer.js';
import fs from 'fs';
import path from 'path';

interface FileItem {
  label: string;
  value: string;
  meta: {
    duration: number;
    size: string;
  };
}

export const InteractiveMenu = ({ wasmModule = realWasmModule }: { wasmModule?: any }) => {
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [settingsMode, setSettingsMode] = useState<'half-block' | 'quadrant' | 'braille'>('quadrant');
  const [invertDark, setInvertDark] = useState(false);
  const [termSize, setTermSize] = useState({ 
    columns: process.stdout.columns || 100, 
    rows: process.stdout.rows || 40 
  });

  useEffect(() => {
    const onResize = () => setTermSize({ 
      columns: process.stdout.columns || 100, 
      rows: process.stdout.rows || 40 
    });
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  const [scanDepth, setScanDepth] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [isInputMode, setIsInputMode] = useState(false);
  const [inputPath, setInputPath] = useState('');
  const [basePath, setBasePath] = useState(process.cwd());
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    setIsScanning(true);
    
    // Non-blocking scan simulation
    setTimeout(() => {
      const scanDirectory = (dir: string, currentDepth: number, maxDepth: number): FileItem[] => {
        if (currentDepth > maxDepth) return [];
        let filesInThisDir: FileItem[] = [];
        let subDirResults: FileItem[] = [];
        
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
              if (currentDepth < maxDepth) {
                subDirResults = subDirResults.concat(scanDirectory(fullPath, currentDepth + 1, maxDepth));
              }
            } else if (entry.isFile()) {
              const file = entry.name;
              if (file.endsWith('.svg') || file.endsWith('.json')) {
                if (file.endsWith('.json')) {
                  try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const data = JSON.parse(content);
                    if (data && typeof data === 'object') {
                      if (!('v' in data && 'layers' in data) && !('fr' in data && 'layers' in data)) {
                        continue;
                      }
                    } else { continue; }
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
          }
        } catch (e) {
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
        
        results = results.concat(filesInThisDir).concat(subDirResults);
        return results;
      };

      const items = scanDirectory(basePath, 0, scanDepth);
      if (items.length > 0) {
        // Keep previously loaded duration meta if same file
        setFileList(prevList => {
          return items.map(newItem => {
            const existing = prevList.find(f => f.value === newItem.value);
            if (existing && existing.meta.duration > 0) {
              newItem.meta.duration = existing.meta.duration;
            }
            return newItem;
          });
        });
        setSelectedFile(prev => prev || items[0]);
      } else {
        setFileList([{ label: 'No files found', value: '', meta: { duration: 0, size: '0kb' } }]);
      }
      setIsScanning(false);
      setCurrentPage(0); // Reset page on new scan
    }, 10);
  }, [scanDepth, basePath]);

  const pageSize = Math.max(5, termSize.rows - 17);
  const totalPages = Math.ceil(fileList.length / pageSize) || 1;

  useInput((input, key) => {
    if (isInputMode) {
      if (key.escape) {
        setIsInputMode(false);
      }
      return; // Let TextInput handle characters
    }
    if (key.leftArrow) {
      setCurrentPage(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
      return;
    }
    if (input.toLowerCase() === 'm') {
      setSettingsMode(prev => {
        if (prev === 'half-block') return 'quadrant';
        if (prev === 'quadrant') return 'braille';
        return 'half-block';
      });
    }
    if (input.toLowerCase() === 'd') {
      setInvertDark(prev => !prev);
    }
    if (input.toLowerCase() === 's') {
      setScanDepth(prev => prev + 1);
    }
    if (input.toLowerCase() === 'o') {
      setInputPath(basePath);
      setIsInputMode(true);
    }
  });

  const handleHighlight = (item: any) => {
    const file = fileList.find(f => f.value === item.value);
    if (file && !file.value.startsWith('__folder__') && file.value !== '') {
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
    }
  };

  const handleSelect = (item: any) => {
    // Selection logic (e.g., transition to full screen)
  };

  const handleDurationLoad = (duration: number) => {
    if (selectedFile) {
      // Fix float rounding (e.g. 1.23456 -> 1.23)
      const rounded = Math.round(duration * 100) / 100;
      setSelectedFile(prev => prev ? { ...prev, meta: { ...prev.meta, duration: rounded } } : null);
      setFileList(prev => prev.map(f => f.value === selectedFile.value ? { ...f, meta: { ...f.meta, duration: rounded } } : f));
    }
  };

  const previewWidth = Math.max(20, Math.floor((termSize.columns - 2) * 0.7) - 8);
  const previewHeight = Math.max(10, termSize.rows - 20);

  return (
    <Box flexDirection="column" padding={1} width={termSize.columns}>
      <Box marginBottom={1}>
        <Text bold color="cyan">🚀 termvg - ThorVG Terminal Player</Text>
      </Box>

      <Box flexDirection="row">
        {/* LEFT PANEL: File List */}
        <Box width="30%" flexDirection="column" borderStyle="single" padding={1}>
          <Box marginBottom={1}>
            <Text bold color="yellow">Files in Directory</Text>
          </Box>
          {isInputMode ? (
            <Box flexDirection="column" marginBottom={1}>
              <Text color="cyan">Enter directory path:</Text>
              <TextInput 
                value={inputPath} 
                onChange={setInputPath} 
                onSubmit={(val) => {
                  setBasePath(val);
                  setScanDepth(5); // Auto deep scan up to 5 levels
                  setIsInputMode(false);
                }} 
              />
              <Text color="gray">(Press Enter to apply, ESC to cancel)</Text>
            </Box>
          ) : (
            fileList.length > 0 ? (
              <SelectInput 
                items={fileList.slice(currentPage * pageSize, (currentPage + 1) * pageSize)} 
                limit={pageSize}
                onSelect={handleSelect} 
                onHighlight={handleHighlight} 
              />
            ) : (
              <Text>Loading files...</Text>
            )
          )}
          <Box marginTop={1} flexDirection="column">
            <Text color="cyan">Page {currentPage + 1} / {totalPages} (Total: {fileList.length})</Text>
            <Text color="gray">Use ↑/↓ to browse, ←/→ to flip pages</Text>
            <Text color="gray">Press Enter to Play</Text>
            <Text color="green">Press S to Scan Deeper</Text>
            <Text color="cyan">Press O to Open Path</Text>
          </Box>
        </Box>

        {/* RIGHT PANEL: Meta & Preview */}
        <Box width="70%" flexDirection="column" marginLeft={2}>
          
          {/* META & SETTINGS */}
          <Box borderStyle="single" padding={1} flexDirection="row" justifyContent="space-between">
            <Box flexDirection="column">
              <Text bold>Metadata</Text>
              <Text color="gray">Name: {selectedFile ? path.basename(selectedFile.value) : '-'}</Text>
              <Text color="gray">Duration: {selectedFile ? selectedFile.meta.duration : 0}s</Text>
              <Text color="gray">Size: {selectedFile ? selectedFile.meta.size : '0kb'}</Text>
            </Box>
            <Box flexDirection="column" alignItems="flex-end">
              <Text bold>Settings</Text>
              <Text color="gray">Search Depth: <Text color={isScanning ? "yellow" : "cyan"}>{scanDepth} {isScanning ? '(Scanning...)' : ''}</Text> (S)</Text>
              <Text color="gray">Mode: <Text color="green">{settingsMode}</Text> (M)</Text>
              <Text color="gray">Auto-Dark: <Text color={invertDark ? 'green' : 'red'}>{invertDark ? 'ON' : 'OFF'}</Text> (D)</Text>
            </Box>
          </Box>

          {/* PREVIEW */}
          <Box marginTop={1} flexDirection="column" borderStyle="single" padding={1}>
            <Box marginBottom={1}>
              <Text bold color="yellow">Live Preview</Text>
            </Box>
            {selectedFile && selectedFile.value !== '' && !selectedFile.value.startsWith('__folder__') ? (
              <LottiePlayer 
                key={`${selectedFile.value}-${settingsMode}-${previewWidth}-${previewHeight}`}
                wasmModule={wasmModule} 
                filePath={selectedFile.value} 
                width={previewWidth} 
                height={previewHeight} 
                renderMode={settingsMode}
                invertDark={invertDark}
                onLoad={handleDurationLoad}
              />
            ) : (
              <Text color="gray">No file selected to preview.</Text>
            )}
          </Box>

        </Box>
      </Box>
    </Box>
  );
};
