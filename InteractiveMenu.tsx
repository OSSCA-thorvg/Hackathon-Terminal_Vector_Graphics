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
  const [basePath, setBasePath] = useState(process.cwd());
  const [currentPage, setCurrentPage] = useState(0);

  // LottieFiles 검색 상태
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
  const [mcpClient, setMcpClient] = useState<Client | null>(null);

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
            <Text color="magenta">Press L to Search LottieFiles</Text>
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
