import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import path from 'path';
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
  const [isLocalSearchMode, setIsLocalSearchMode] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [authCodeInput, setAuthCodeInput] = useState('');

  // ─── 재생 제어 ───
  const [isPaused, setIsPaused] = useState(false);
  const [seekDelta, setSeekDelta] = useState(0);
  const [frameProgress, setFrameProgress] = useState({ current: 0, total: 1, fps: 0 });

  // ─── MCP 검색 ───
  const mcp = useMcpSearch((newFile) => {
    scanner.prependFile(newFile);
    setSelectedFile(newFile);
  }, scanner.basePath);

  // ─── 레이아웃 및 필터링 ───
  const displayFileList = scanner.fileList.filter(f => {
    if (isLocalSearchMode || localSearchQuery) {
      if (f.value.startsWith('__folder__')) return false;
      return path.basename(f.value).toLowerCase().includes(localSearchQuery.toLowerCase());
    }
    return true;
  });
  const extraHeight = isLocalSearchMode ? 4 : 0;
  const pageSize = Math.min(15, Math.max(5, termSize.rows - 17 - extraHeight));
  const totalPages = Math.ceil(displayFileList.length / pageSize) || 1;
  const leftPanelCols = Math.floor(termSize.columns * 0.30) - 4;
  const previewWidth = Math.max(20, Math.floor((termSize.columns - 2) * 0.68) - 4);
  const previewHeight = Math.max(10, termSize.rows - 6);

  // ─── 키보드 핸들러 ───
  useInput((input, key) => {
    if (isInputMode || mcp.searchMode || isLocalSearchMode || mcp.authState.status !== 'idle') {
      if (key.escape) {
        setIsInputMode(false);
        setIsLocalSearchMode(false);
        if (isLocalSearchMode) setLocalSearchQuery('');
        setAuthCodeInput('');
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
    if (input.toLowerCase() === 's') { setIsLocalSearchMode(true); }
    if (input.toLowerCase() === 'o') { setInputPath(scanner.basePath); setIsInputMode(true); }
    if (input.toLowerCase() === 'l' && scanner.basePath) { mcp.openSearch(); }
  });

  // ─── 이벤트 핸들러 ───
  const handleHighlight = (item: any) => {
    if (!item) return;
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

  // 인증 모드: 전체 화면 QR 코드 + 수동 입력
  const prevAuthStatus = useRef(mcp.authState.status);
  useEffect(() => {
    if (mcp.authState.status !== 'idle' && prevAuthStatus.current === 'idle') {
      // 인증 화면 진입 시 화면 클리어 (이전 Lottie 렌더링 잔상 제거)
      process.stdout.write('\x1b[2J\x1b[H');
    }
    prevAuthStatus.current = mcp.authState.status;
  }, [mcp.authState.status]);

  if (mcp.authState.status !== 'idle') {
    return (
      <Box flexDirection="column" paddingX={2} width={termSize.columns} height={termSize.rows - 1}>
        <Box marginBottom={1}>
          <Text bold color="green">🔐 LottieFiles 인증</Text>
        </Box>
        {mcp.authState.status === 'initializing' && (
          <Text color="yellow">⏳ 인증 준비 중... (Client 등록 + PKCE 생성)</Text>
        )}
        {mcp.authState.status === 'waiting' && (
          <>
            <Text color="white">📱 QR 코드를 스캔하여 로그인하세요:</Text>
            <Box marginY={1}>
              <Text>{mcp.authState.qrText}</Text>
            </Box>
            <Text color="gray" wrap="truncate-end">🔗 {mcp.authState.authUrl}</Text>
            <Box marginTop={1} flexDirection="column">
              <Text color="white">─────────────────────────────────────</Text>
              <Text color="cyan">📋 또는 리다이렉트 URL/코드를 붙여넣으세요:</Text>
              <TextInput
                value={authCodeInput}
                onChange={setAuthCodeInput}
                onSubmit={(val) => {
                  if (val.trim()) {
                    mcp.submitAuthCode(val.trim());
                    setAuthCodeInput('');
                  }
                }}
              />
            </Box>
            <Box marginTop={1}>
              <Text color="gray">(ESC:취소)</Text>
            </Box>
          </>
        )}
        {mcp.authState.status === 'exchanging' && (
          <Text color="yellow">🔄 토큰 교환 중...</Text>
        )}
        {mcp.authState.status === 'error' && (
          <Text color="red">❌ {mcp.authState.error}</Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} width={termSize.columns} height={termSize.rows - 1}>
      <Box>
        <Text bold color="cyan">🚀 termvg - ThorVG Terminal Player</Text>
      </Box>

      <Box flexDirection="row">
        <LeftPanel
          selectedFile={selectedFile}
          fileList={displayFileList}
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
            scanner.setScanDepth(1);
            setIsInputMode(false);
            setLocalSearchQuery('');
          }}
          isLocalSearchMode={isLocalSearchMode}
          localSearchQuery={localSearchQuery}
          onLocalSearchQueryChange={(val) => {
            setLocalSearchQuery(val);
            setCurrentPage(0);
          }}
          onLocalSearchSubmit={() => setIsLocalSearchMode(false)}
          searchMode={mcp.searchMode}
          searchQuery={mcp.searchQuery}
          onSearchQueryChange={mcp.setSearchQuery}
          onSearchSubmit={(val) => mcp.doSearch(val)}
          searchStatus={mcp.searchStatus}
          searchResults={mcp.searchResults}
          onSearchSelect={(item) => mcp.doDownload(item)}
          onHighlight={handleHighlight}
          onSelect={handleHighlight}
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
