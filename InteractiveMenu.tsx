import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { realWasmModule } from './realWasmModule.js';
import { useFileScanner, type FileItem } from './hooks/useFileScanner.js';
import { useMcpSearch } from './hooks/useMcpSearch.js';
import { LeftPanel } from './components/LeftPanel.js';
import { PreviewPanel } from './components/PreviewPanel.js';

export const InteractiveMenu = ({ wasmModule = realWasmModule }: { wasmModule?: any }) => {
  // ─── 터미널 크기 ───
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

  // ─── 파일 스캐너 ───
  const scanner = useFileScanner();

  // ─── UI 상태 ───
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [settingsMode, setSettingsMode] = useState<'half-block' | 'quadrant' | 'braille'>('quadrant');
  const [invertDark, setInvertDark] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isInputMode, setIsInputMode] = useState(false);
  const [inputPath, setInputPath] = useState('');

  // ─── 재생 제어 ───
  const [isPaused, setIsPaused] = useState(false);
  const [seekDelta, setSeekDelta] = useState(0);
  const [frameProgress, setFrameProgress] = useState({ current: 0, total: 1, fps: 0 });

  // ─── MCP 검색 ───
  const mcp = useMcpSearch((newFile) => {
    scanner.prependFile(newFile);
    setSelectedFile(newFile);
  }, scanner.basePath);

  // ─── 레이아웃 계산 ───
  const pageSize = Math.min(15, Math.max(5, termSize.rows - 17));
  const totalPages = Math.ceil(scanner.fileList.length / pageSize) || 1;
  const leftPanelCols = Math.floor(termSize.columns * 0.30) - 4;
  const previewWidth = Math.max(20, Math.floor((termSize.columns - 2) * 0.68) - 4);
  const previewHeight = Math.max(10, termSize.rows - 6);

  // ─── 키보드 핸들러 ───
  useInput((input, key) => {
    if (isInputMode || mcp.searchMode) {
      if (key.escape) {
        setIsInputMode(false);
        mcp.closeSearch();
      }
      return;
    }
    if (key.leftArrow) {
      isPaused ? setSeekDelta(-1) : setCurrentPage(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      isPaused ? setSeekDelta(1) : setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
      return;
    }
    if (input === ' ') { setIsPaused(prev => !prev); return; }
    if (input.toLowerCase() === 'm') {
      setSettingsMode(prev => prev === 'half-block' ? 'quadrant' : prev === 'quadrant' ? 'braille' : 'half-block');
    }
    if (input.toLowerCase() === 'd') { setInvertDark(prev => !prev); }
    if (input.toLowerCase() === 's') { scanner.setScanDepth(prev => prev + 1); }
    if (input.toLowerCase() === 'o') { setInputPath(scanner.basePath); setIsInputMode(true); }
    if (input.toLowerCase() === 'l') { mcp.openSearch(); }
  });

  // ─── 이벤트 핸들러 ───
  const handleHighlight = (item: any) => {
    const file = scanner.fileList.find(f => f.value === item.value);
    setSelectedFile(file && !file.value.startsWith('__folder__') && file.value !== '' ? file : null);
  };

  const handleDurationLoad = (duration: number) => {
    if (selectedFile) {
      const rounded = Math.round(duration * 100) / 100;
      setSelectedFile(prev => prev ? { ...prev, meta: { ...prev.meta, duration: rounded } } : null);
      scanner.updateFileDuration(selectedFile.value, duration);
    }
  };

  const handleFrameUpdate = (frame: number, totalFrames: number, fps: number) => {
    setFrameProgress({ current: Math.floor(frame), total: totalFrames, fps });
  };

  // ─── 렌더링 ───
  return (
    <Box flexDirection="column" paddingX={1} width={termSize.columns} height={termSize.rows - 1}>
      <Box>
        <Text bold color="cyan">🚀 termvg - ThorVG Terminal Player</Text>
      </Box>

      <Box flexDirection="row">
        <LeftPanel
          selectedFile={selectedFile}
          fileList={scanner.fileList}
          currentPage={currentPage}
          pageSize={pageSize}
          totalPages={totalPages}
          basePath={scanner.basePath}
          settingsMode={settingsMode}
          invertDark={invertDark}
          isInputMode={isInputMode}
          inputPath={inputPath}
          onInputPathChange={setInputPath}
          onInputSubmit={(val) => {
            scanner.setBasePath(val);
            scanner.setScanDepth(5);
            setIsInputMode(false);
          }}
          searchMode={mcp.searchMode}
          searchQuery={mcp.searchQuery}
          onSearchQueryChange={mcp.setSearchQuery}
          onSearchSubmit={(val) => mcp.doSearch(val)}
          searchStatus={mcp.searchStatus}
          searchResults={mcp.searchResults}
          onSearchSelect={(item) => mcp.doDownload(item)}
          onHighlight={handleHighlight}
          onSelect={() => {}}
          leftPanelCols={leftPanelCols}
        />

        <PreviewPanel
          selectedFile={selectedFile}
          wasmModule={wasmModule}
          settingsMode={settingsMode}
          invertDark={invertDark}
          previewWidth={previewWidth}
          previewHeight={previewHeight}
          isPaused={isPaused}
          seekDelta={seekDelta}
          frameProgress={frameProgress}
          onDurationLoad={handleDurationLoad}
          onSeekConsumed={() => setSeekDelta(0)}
          onFrameUpdate={handleFrameUpdate}
        />
      </Box>
    </Box>
  );
};
