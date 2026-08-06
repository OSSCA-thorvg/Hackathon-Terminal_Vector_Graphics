import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  height?: number;
  renderMode?: 'half-block' | 'quadrant' | 'braille';
  invertDark?: boolean;
  onLoad?: (duration: number, totalFrames: number) => void;
  loop?: boolean;
  onComplete?: () => void;
  paused?: boolean;
  seekDelta?: number; // +1 or -1 per step, consumed after render
  onSeekConsumed?: () => void;
  onFrameUpdate?: (frame: number, totalFrames: number, fps: number) => void;
}

/**
 * 터미널 Synchronized Output Mode (더블 버퍼링)
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
  onComplete,
  paused = false,
  seekDelta = 0,
  onSeekConsumed,
  onFrameUpdate
}) => {
  const [ansiFrame, setAnsiFrame] = useState<string>('Loading...');
  const prevFrameRef = useRef<string>('');
  const currentFrameRef = useRef<number>(0);
  const totalFramesRef = useRef<number>(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const modeIntRef = useRef<number>(0);
  const setupDoneRef = useRef<boolean>(false);
  const fpsCountRef = useRef<number>(0);
  const fpsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fpsValueRef = useRef<number>(0);

  // 프레임 렌더링 함수 (재생/시크 공용)
  const renderFrame = useCallback((frame: number) => {
    const ansiString = wasmModule.renderToString(frame, modeIntRef.current, invertDark);
    if (ansiString !== prevFrameRef.current) {
      prevFrameRef.current = ansiString;
      enableSyncOutput();
      setAnsiFrame(ansiString);
      queueMicrotask(() => disableSyncOutput());
    }
    fpsCountRef.current++;
    if (onFrameUpdate) {
      onFrameUpdate(frame, totalFramesRef.current, fpsValueRef.current);
    }
  }, [wasmModule, invertDark, onFrameUpdate]);

  // 초기 설정
  useEffect(() => {
    let animTimer: NodeJS.Timeout;

    const setup = async () => {
      await wasmModule.init();

      let pixelWidth = width;
      let pixelHeight = height * 2;
      if (renderMode === 'braille') {
        pixelWidth = width * 2;
        pixelHeight = height * 4;
      } else if (renderMode === 'quadrant') {
        pixelWidth = width * 2;
        pixelHeight = height * 2;
      }

      if (renderMode === 'quadrant') modeIntRef.current = 1;
      else if (renderMode === 'braille') modeIntRef.current = 2;
      else modeIntRef.current = 0;

      wasmModule.setSize(pixelWidth, pixelHeight);

      if (!wasmModule.load(filePath)) {
        setAnsiFrame('Failed to load file');
        return;
      }

      const totalFrames = Math.max(1, wasmModule.getTotalFrames());
      const duration = wasmModule.getDuration();
      totalFramesRef.current = totalFrames;
      currentFrameRef.current = 0;
      setupDoneRef.current = true;

      const fps = 30;
      const frameDelayMs = 1000 / fps;

      if (onLoad) {
        onLoad(duration, totalFrames);
      }

      // FPS 카운터: 1초마다 렌더링된 프레임 수를 측정
      fpsTimerRef.current = setInterval(() => {
        fpsValueRef.current = fpsCountRef.current;
        fpsCountRef.current = 0;
      }, 1000);

      const renderNextFrame = () => {
        renderFrame(currentFrameRef.current);

        if (duration > 0) {
          currentFrameRef.current += totalFrames / (duration * fps);
          if (currentFrameRef.current >= totalFrames) {
            if (loop) {
              currentFrameRef.current = 0;
            } else {
              if (timerRef.current) clearInterval(timerRef.current);
              if (onComplete) onComplete();
            }
          }
        }
      };

      animTimer = setInterval(renderNextFrame, frameDelayMs);
      timerRef.current = animTimer;
    };

    setup();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
      timerRef.current = null;
      fpsTimerRef.current = null;
      prevFrameRef.current = '';
      setupDoneRef.current = false;
    };
  }, [wasmModule, filePath, width, height]);

  // 일시정지/재생 제어
  useEffect(() => {
    if (!setupDoneRef.current) return;

    if (paused) {
      // 타이머 정지
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } else {
      // 타이머 재개 (이미 돌고 있으면 무시)
      if (!timerRef.current) {
        const totalFrames = totalFramesRef.current;
        const duration = wasmModule.getDuration();
        const fps = 30;
        const frameDelayMs = 1000 / fps;

        timerRef.current = setInterval(() => {
          renderFrame(currentFrameRef.current);

          if (duration > 0) {
            currentFrameRef.current += totalFrames / (duration * fps);
            if (currentFrameRef.current >= totalFrames) {
              if (loop) {
                currentFrameRef.current = 0;
              } else {
                if (timerRef.current) clearInterval(timerRef.current);
                if (onComplete) onComplete();
              }
            }
          }
        }, frameDelayMs);
      }
    }
  }, [paused]);

  // 프레임 시크 처리
  useEffect(() => {
    if (seekDelta === 0 || !setupDoneRef.current) return;

    const totalFrames = totalFramesRef.current;
    const step = totalFrames / 30; // 1/30초 단위 이동

    currentFrameRef.current += seekDelta * step;

    // 범위 클램핑
    if (currentFrameRef.current < 0) currentFrameRef.current = 0;
    if (currentFrameRef.current >= totalFrames) currentFrameRef.current = totalFrames - 1;

    renderFrame(currentFrameRef.current);

    if (onSeekConsumed) onSeekConsumed();
  }, [seekDelta]);

  return (
    <Box flexDirection="column">
      <Text wrap="truncate">{ansiFrame}</Text>
    </Box>
  );
};
