import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { realWasmModule } from './realWasmModule.js';
import { LottiePlayer } from './LottiePlayer.js';
import { getAccessToken, MCP_ENDPOINT } from './lottieAuth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
  const [basePath, setBasePath] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  // LottieFiles 검색 상태
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
  const [mcpClient, setMcpClient] = useState<Client | null>(null);

  // 재생 제어 상태
  const [isPaused, setIsPaused] = useState(false);
  const [seekDelta, setSeekDelta] = useState(0);
  const [frameProgress, setFrameProgress] = useState({ current: 0, total: 1, fps: 0 });

  useEffect(() => {
    if (!basePath) {
      setFileList([]);
      setIsScanning(false);
      return;
    }
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

  const pageSize = Math.min(15, Math.max(5, termSize.rows - 17));
  const totalPages = Math.ceil(fileList.length / pageSize) || 1;
  const leftPanelCols = Math.floor(termSize.columns * 0.28) - 4; // border + padding 보정

  useInput((input, key) => {
    if (isInputMode || searchMode) {
      if (key.escape) {
        setIsInputMode(false);
        setSearchMode(false);
        setSearchResults([]);
        setSearchStatus('');
      }
      return;
    }
    if (key.leftArrow) {
      if (isPaused) {
        setSeekDelta(-1); // 일시정지 중: 이전 프레임
      } else {
        setCurrentPage(prev => Math.max(0, prev - 1));
      }
      return;
    }
    if (key.rightArrow) {
      if (isPaused) {
        setSeekDelta(1); // 일시정지 중: 다음 프레임
      } else {
        setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
      }
      return;
    }
    if (input === ' ') {
      setIsPaused(prev => !prev);
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
    if (input.toLowerCase() === 'l') {
      setSearchQuery('');
      setSearchResults([]);
      setSearchStatus('');
      setSearchMode(true);
    }
  });

  // MCP 검색 실행
  const doSearch = async (query: string) => {
    setIsSearching(true);
    setSearchStatus('🔌 MCP 연결 중...');
    try {
      let client = mcpClient;
      if (!client) {
        const accessToken = await getAccessToken();
        client = new Client({ name: 'termvg', version: '1.0.0' }, { capabilities: {} });
        const transport = new StreamableHTTPClientTransport(
          new URL(MCP_ENDPOINT),
          { requestInit: { headers: { 'Authorization': `Bearer ${accessToken}` } } }
        );
        await client.connect(transport);
        setMcpClient(client);
      }
      setSearchStatus(`🔍 '${query}' 검색 중...`);
      const result = await client.callTool({
        name: 'graphql_execute',
        arguments: {
          query: `query Search($q: String!) { searchPublicAnimations(query: $q, first: 10) { edges { node { id name url jsonUrl lottieUrl likesCount downloads description sourceName createdBy { username } } } } }`,
          variables: { q: query }
        }
      });
      const structured = (result as any).structuredContent;
      const edges = structured?.data?.searchPublicAnimations?.edges || [];
      const items = edges.map((e: any, i: number) => ({
        label: `${e.node.name} | 👤${e.node.createdBy?.username || '?'} ❤️${e.node.likesCount || 0} ⬇️${Math.round(e.node.downloads || 0)}`,
        value: `__mcp__${i}`,
        meta: {
          jsonUrl: e.node.jsonUrl || e.node.lottieUrl || null,
          name: e.node.name,
          author: e.node.createdBy?.username || 'unknown',
          id: String(e.node.id),
        }
      }));
      setSearchResults(items);
      setSearchStatus(items.length > 0 ? `✅ ${items.length}개 결과` : '❌ 결과 없음');
    } catch (e: any) {
      setSearchStatus(`❌ 오류: ${e.message.substring(0, 50)}`);
    }
    setIsSearching(false);
  };

  // MCP 다운로드 + 파일목록 추가
  const doDownload = async (item: any) => {
    const { jsonUrl, name, author, id } = item.meta;
    if (!jsonUrl) { setSearchStatus('❌ 다운로드 URL 없음'); return; }
    setSearchStatus('⬇️ 다운로드 중...');
    try {
      const dir = path.join(os.homedir(), '.termvg', 'downloads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const safeName = `${name}_by_${author}_${id}`.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
      const filePath = path.join(dir, `${safeName}.json`);
      const res = await fetch(jsonUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(filePath, await res.text(), 'utf8');
      // 파일 목록에 추가하고 선택
      const stats = fs.statSync(filePath);
      const newFile: FileItem = {
        label: `🌐 ${name} (${author})`,
        value: filePath,
        meta: { duration: 0, size: `${Math.round(stats.size / 1024)}kb` }
      };
      setFileList(prev => [newFile, ...prev]);
      setSelectedFile(newFile);
      setSearchMode(false);
      setSearchResults([]);
      setSearchStatus('');
    } catch (e: any) {
      setSearchStatus(`❌ 다운로드 실패: ${e.message.substring(0, 40)}`);
    }
  };

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

  const handleFrameUpdate = (frame: number, totalFrames: number, fps: number) => {
    setFrameProgress({ current: Math.floor(frame), total: totalFrames, fps });
  };

  const previewWidth = Math.max(20, Math.floor((termSize.columns - 2) * 0.72) - 4);
  const previewHeight = Math.max(10, termSize.rows - 6);

  // 파일명 트러링 헬퍼
  const truncLabel = (label: string) => {
    if (label.length <= leftPanelCols) return label;
    return label.substring(0, leftPanelCols - 2) + '..';
  };

  return (
    <Box flexDirection="column" paddingX={1} width={termSize.columns}>
      <Box>
        <Text bold color="cyan">🚀 termvg - ThorVG Terminal Player</Text>
      </Box>

      <Box flexDirection="row">
        {/* LEFT PANEL: Meta + File List */}
        <Box width="28%" flexDirection="column" borderStyle="single" paddingX={1}>
          {/* META & SETTINGS (compact) */}
          <Box flexDirection="column" marginBottom={1}>
            <Text color="gray">Name: <Text color="white">{selectedFile ? truncLabel(path.basename(selectedFile.value)) : '-'}</Text></Text>
            <Text color="gray">{selectedFile ? `${selectedFile.meta.duration}s | ${selectedFile.meta.size}` : ''}</Text>
            <Text color="gray"><Text color="green">{settingsMode}</Text>(M) Dark:<Text color={invertDark ? 'green' : 'red'}>{invertDark ? 'ON' : 'OFF'}</Text>(D)</Text>
          </Box>

          {/* FILE LIST */}
          {searchMode ? (
            <Box flexDirection="column" marginBottom={1}>
              <Text color="magenta" bold>🌐 LottieFiles 검색</Text>
              <TextInput 
                value={searchQuery} 
                onChange={setSearchQuery} 
                onSubmit={(val) => { if (val.trim()) doSearch(val.trim()); }} 
              />
              <Text color="gray">(Enter로 검색, ESC로 취소)</Text>
              {searchStatus ? <Text color="yellow">{searchStatus}</Text> : null}
              {searchResults.length > 0 ? (
                <SelectInput 
                  items={searchResults}
                  limit={pageSize}
                  onSelect={(item) => doDownload(item)}
                />
              ) : null}
            </Box>
          ) : isInputMode ? (
            <Box flexDirection="column" marginBottom={1}>
              <Text color="cyan">Enter directory path:</Text>
              <TextInput 
                value={inputPath} 
                onChange={setInputPath} 
                onSubmit={(val) => {
                  setBasePath(val);
                  setScanDepth(5);
                  setIsInputMode(false);
                }} 
              />
              <Text color="gray">(Press Enter to apply, ESC to cancel)</Text>
            </Box>
          ) : !basePath ? (
            <Box flexDirection="column">
              <Text color="gray">O 키를 눌러 SVG/Lottie 파일 경로를 지정하세요</Text>
            </Box>
          ) : (
            fileList.length > 0 ? (
              <SelectInput 
                items={fileList.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(f => ({
                  ...f, label: truncLabel(f.label)
                }))} 
                limit={pageSize}
                onSelect={handleSelect} 
                onHighlight={handleHighlight} 
              />
            ) : (
              <Text>Loading files...</Text>
            )
          )}
          <Box marginTop={1} flexDirection="column">
            {basePath ? (
              <>
                <Text color="cyan">Page {currentPage + 1} / {totalPages} (Total: {fileList.length})</Text>
                <Text color="gray">↑↓ browse  ←→ pages</Text>
                <Text color="green">S:Scan  <Text color="magenta">L:LottieFiles</Text></Text>
              </>
            ) : (
              <Text color="gray" dimColor>ThorVG Terminal Vector Graphics Player</Text>
            )}
            <Text color="cyan">O:Open Path</Text>
          </Box>
        </Box>

        {/* RIGHT PANEL: Preview Only */}
        <Box width="75%" flexDirection="column" marginLeft={1} borderStyle="single" paddingX={1}>
          <Box justifyContent="space-between">
            <Text bold color="yellow">Live Preview {isPaused ? <Text color="red"> ⏸ PAUSED</Text> : <Text color="green"> ▶</Text>}</Text>
            <Text color="gray">{frameProgress.current}/{frameProgress.total} <Text color={frameProgress.fps >= 25 ? 'green' : frameProgress.fps >= 15 ? 'yellow' : 'red'}>{frameProgress.fps}fps</Text> <Text color="cyan">Space:⏯ </Text>{isPaused ? <Text color="yellow">←→:Seek</Text> : null}</Text>
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
              paused={isPaused}
              seekDelta={seekDelta}
              onSeekConsumed={() => setSeekDelta(0)}
              onFrameUpdate={handleFrameUpdate}
            />
          ) : (
            <Text color="gray">No file selected to preview.</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
