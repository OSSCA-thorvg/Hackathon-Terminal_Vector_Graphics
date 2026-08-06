import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import path from 'path';
import type { FileItem } from '../hooks/useFileScanner.js';
import type { SearchResultItem } from '../hooks/useMcpSearch.js';

interface LeftPanelProps {
  // 파일 상태
  selectedFile: FileItem | null;
  fileList: FileItem[];
  currentPage: number;
  pageSize: number;
  totalPages: number;
  basePath: string;
  // 렌더링 설정
  settingsMode: string;
  invertDark: boolean;
  // 입력 모드
  isInputMode: boolean;
  inputPath: string;
  onInputPathChange: (val: string) => void;
  onInputSubmit: (val: string) => void;
  // 검색 모드
  searchMode: boolean;
  searchQuery: string;
  onSearchQueryChange: (val: string) => void;
  onSearchSubmit: (val: string) => void;
  searchStatus: string;
  searchResults: SearchResultItem[];
  onSearchSelect: (item: any) => void;
  // 파일 선택
  onHighlight: (item: any) => void;
  onSelect: (item: any) => void;
  // 레이아웃
  leftPanelCols: number;
}

/** 파일명을 패널 폭에 맞게 잘라내는 헬퍼 */
const truncLabel = (label: string, maxCols: number): string => {
  if (label.length <= maxCols) return label;
  return label.substring(0, maxCols - 2) + '..';
};

export const LeftPanel: React.FC<LeftPanelProps> = ({
  selectedFile, fileList, currentPage, pageSize, totalPages, basePath,
  settingsMode, invertDark,
  isInputMode, inputPath, onInputPathChange, onInputSubmit,
  searchMode, searchQuery, onSearchQueryChange, onSearchSubmit,
  searchStatus, searchResults, onSearchSelect,
  onHighlight, onSelect,
  leftPanelCols,
}) => {
  return (
    <Box width="28%" flexDirection="column" borderStyle="single" paddingX={1}>
      {/* META & SETTINGS (compact) */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray">Name: <Text color="white">{selectedFile ? truncLabel(path.basename(selectedFile.value), leftPanelCols) : '-'}</Text></Text>
        <Text color="gray">{selectedFile ? `${selectedFile.meta.duration}s | ${selectedFile.meta.size}` : ''}</Text>
        <Text color="gray"><Text color="green">{settingsMode}</Text>(M) Dark:<Text color={invertDark ? 'green' : 'red'}>{invertDark ? 'ON' : 'OFF'}</Text>(D)</Text>
      </Box>

      {/* CONTENT AREA: 검색 / 입력 / 파일 리스트 */}
      {searchMode ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="magenta" bold>🌐 LottieFiles 검색</Text>
          <TextInput
            value={searchQuery}
            onChange={onSearchQueryChange}
            onSubmit={(val) => { if (val.trim()) onSearchSubmit(val.trim()); }}
          />
          <Text color="gray">(Enter로 검색, ESC로 취소)</Text>
          {searchStatus ? <Text color="yellow">{searchStatus}</Text> : null}
          {searchResults.length > 0 ? (
            <SelectInput
              items={searchResults.map(r => ({
                ...r, label: truncLabel(r.label, leftPanelCols)
              }))}
              limit={pageSize}
              onSelect={onSearchSelect}
            />
          ) : null}
        </Box>
      ) : isInputMode ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyan">Enter directory path:</Text>
          <TextInput
            value={inputPath}
            onChange={onInputPathChange}
            onSubmit={onInputSubmit}
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
              ...f, label: truncLabel(f.label, leftPanelCols)
            }))}
            limit={pageSize}
            onSelect={onSelect}
            onHighlight={onHighlight}
          />
        ) : (
          <Text>Loading files...</Text>
        )
      )}

      {/* FOOTER */}
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
  );
};
