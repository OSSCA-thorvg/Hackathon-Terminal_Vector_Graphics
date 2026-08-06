import React, { useEffect, useState, useRef } from 'react';
import { Text, Box } from 'ink';

// Mock WASM module interface for ThorVG
interface TvgWasmModule {
  init: () => Promise<void> | void;
  load: (path: string) => boolean;
  setSize: (width: number, height: number) => void;
  getDuration: () => number;
  getTotalFrames: () => number;
  renderToString: (frame: number, renderMode: number, invertDark: boolean) => string;
}

interface LottiePlayerProps {
  wasmModule: any;
  filePath: string;
  width?: number;
  height?: number; // Should be even for half-block, mod 4 for braille
  renderMode?: 'half-block' | 'quadrant' | 'braille';
  invertDark?: boolean;
  onLoad?: (duration: number) => void;
  loop?: boolean;
  onComplete?: () => void;
}

/**
 * 터미널 Synchronized Output Mode (더블 버퍼링)
 * 
 * 터미널이 \x1b[?2026h ~ \x1b[?2026l 사이의 모든 출력을 내부 버퍼에 쌓아두고,
 * 종료 마커를 받으면 한 번에 플러시(Flush)합니다.
 * 이를 통해 Clear→Write 사이의 빈 화면이 사용자에게 보이지 않습니다.
 * 
 * 지원 터미널: iTerm2, kitty, WezTerm, Windows Terminal, foot, etc.
 */
const enableSyncOutput = () => {
  process.stdout.write('\x1b[?2026h');
};

const disableSyncOutput = () => {
  process.stdout.write('\x1b[?2026l');
};

export const LottiePlayer: React.FC<LottiePlayerProps> = ({
  wasmModule,
  filePath,
  width = 80,
  height = 40,
  renderMode = 'quadrant',
  invertDark = false,
  onLoad,
  loop = true,
  onComplete
}) => {
  const [ansiFrame, setAnsiFrame] = useState<string>('Loading...');
  const prevFrameRef = useRef<string>('');

  useEffect(() => {
    let timer: NodeJS.Timeout;
    let currentFrame = 0;

    const setup = async () => {
      // 1. Initialize
      await wasmModule.init();

      // Calculate pixel resolution based on render mode
      let pixelWidth = width;
      let pixelHeight = height * 2;

      if (renderMode === 'braille') {
        pixelWidth = width * 2;
        pixelHeight = height * 4;
      } else if (renderMode === 'quadrant') {
        pixelWidth = width * 2;
        pixelHeight = height * 2;
      }

      wasmModule.setSize(pixelWidth, pixelHeight);

      if (!wasmModule.load(filePath)) {
        setAnsiFrame('Failed to load file');
        return;
      }

      const totalFrames = Math.max(1, wasmModule.getTotalFrames());
      const duration = wasmModule.getDuration();
      const fps = 30;
      const frameDelayMs = 1000 / fps;

      if (onLoad) {
        onLoad(duration);
      }

      // 2. Render Loop
      const renderNextFrame = () => {
        // Map renderMode string to integer for C++
        let modeInt = 0;
        if (renderMode === 'quadrant') modeInt = 1;
        if (renderMode === 'braille') modeInt = 2;

        // Get ANSI string directly from WASM C++ engine!
        const ansiString = wasmModule.renderToString(currentFrame, modeInt, invertDark);

        // ─── 방법 1: 동일 프레임 스킵 ───
        // 이전 프레임과 동일하면 setState를 호출하지 않아
        // React 재조정 + Ink 리렌더를 완전히 건너뜀
        if (ansiString !== prevFrameRef.current) {
          prevFrameRef.current = ansiString;

          // ─── 방법 2: Synchronized Output (터미널 더블 버퍼링) ───
          // Begin Sync → Ink가 Clear+Write → End Sync → 터미널이 한 번에 플러시
          enableSyncOutput();
          setAnsiFrame(ansiString);
          // Ink의 렌더 사이클이 완료된 직후 sync 해제
          // React의 setState는 비동기이므로 microtask로 예약
          queueMicrotask(() => {
            disableSyncOutput();
          });
        }

        // Advance frame only if animation has duration
        if (duration > 0) {
          currentFrame += totalFrames / (duration * fps);
          if (currentFrame >= totalFrames) {
            if (loop) {
              currentFrame = 0;
            } else {
              clearInterval(timer);
              if (onComplete) onComplete();
            }
          }
        }
      };

      timer = setInterval(renderNextFrame, frameDelayMs);
    };

    setup();

    return () => {
      if (timer) clearInterval(timer);
      prevFrameRef.current = '';
    };
  }, [wasmModule, filePath, width, height]);

  // Note: We don't need clear screen or cursor move escape codes 
  // because Ink handles the terminal layout updating.
  return (
    <Box flexDirection="column">
      <Text wrap="truncate">{ansiFrame}</Text>
    </Box>
  );
};
