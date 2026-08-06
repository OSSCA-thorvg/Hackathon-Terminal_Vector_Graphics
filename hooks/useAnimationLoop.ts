import { useRef, useEffect, useCallback } from 'react';
import { enableSyncOutput, disableSyncOutput } from '../utils/syncOutput.js';

interface AnimationConfig {
  wasmModule: any;
  filePath: string;
  pixelWidth: number;
  pixelHeight: number;
  modeInt: number;
  invertDark: boolean;
  loop: boolean;
  onLoad?: (duration: number, totalFrames: number) => void;
  onComplete?: () => void;
  onFrame: (ansiString: string, frame: number, totalFrames: number, fps: number) => void;
}

interface AnimationControls {
  pause: () => void;
  resume: () => void;
  seek: (delta: number) => void;
}

/**
 * 애니메이션 루프 + FPS 측정 + 재생 제어를 통합하는 커스텀 훅.
 * 
 * - 중복된 renderNextFrame 로직을 단일 `advanceAndRender` 함수로 통합 (DRY)
 * - FPS 측정: 1초 간격으로 렌더링된 프레임 수를 카운트
 * - 더블 버퍼링: Synchronized Output Mode로 프레임 교체 시 깜빡임 방지
 */
export function useAnimationLoop(config: AnimationConfig): AnimationControls {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fpsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentFrameRef = useRef(0);
  const totalFramesRef = useRef(1);
  const durationRef = useRef(0);
  const prevFrameRef = useRef('');
  const fpsCountRef = useRef(0);
  const fpsValueRef = useRef(0);
  const setupDoneRef = useRef(false);

  const TARGET_FPS = 30;
  const FRAME_DELAY_MS = 1000 / TARGET_FPS;

  // 프레임 렌더링 (재생/시크 공용)
  const renderCurrentFrame = useCallback(() => {
    const frame = currentFrameRef.current;
    const ansiString = config.wasmModule.renderToString(frame, config.modeInt, config.invertDark);

    if (ansiString !== prevFrameRef.current) {
      prevFrameRef.current = ansiString;
      enableSyncOutput();
      config.onFrame(ansiString, frame, totalFramesRef.current, fpsValueRef.current);
      queueMicrotask(() => disableSyncOutput());
    } else {
      config.onFrame(ansiString, frame, totalFramesRef.current, fpsValueRef.current);
    }

    fpsCountRef.current++;
  }, [config.wasmModule, config.modeInt, config.invertDark, config.onFrame]);

  // 프레임 진행 + 루프/완료 처리
  const advanceFrame = useCallback(() => {
    const totalFrames = totalFramesRef.current;
    const duration = durationRef.current;

    if (duration > 0) {
      currentFrameRef.current += totalFrames / (duration * TARGET_FPS);
      if (currentFrameRef.current >= totalFrames) {
        if (config.loop) {
          currentFrameRef.current = 0;
        } else {
          stopTimer();
          config.onComplete?.();
        }
      }
    }
  }, [config.loop, config.onComplete]);

  const startTimer = useCallback(() => {
    if (timerRef.current) return; // 이미 실행 중
    timerRef.current = setInterval(() => {
      renderCurrentFrame();
      advanceFrame();
    }, FRAME_DELAY_MS);
  }, [renderCurrentFrame, advanceFrame]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 초기 설정
  useEffect(() => {
    const setup = async () => {
      await config.wasmModule.init();
      config.wasmModule.setSize(config.pixelWidth, config.pixelHeight);

      if (!config.wasmModule.load(config.filePath)) {
        config.onFrame('Failed to load file', 0, 1, 0);
        return;
      }

      const totalFrames = Math.max(1, config.wasmModule.getTotalFrames());
      const duration = config.wasmModule.getDuration();
      totalFramesRef.current = totalFrames;
      durationRef.current = duration;
      currentFrameRef.current = 0;
      setupDoneRef.current = true;

      config.onLoad?.(duration, totalFrames);

      // FPS 카운터
      fpsTimerRef.current = setInterval(() => {
        fpsValueRef.current = fpsCountRef.current;
        fpsCountRef.current = 0;
      }, 1000);

      startTimer();
    };

    setup();

    return () => {
      stopTimer();
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
      fpsTimerRef.current = null;
      prevFrameRef.current = '';
      setupDoneRef.current = false;
    };
  }, [config.wasmModule, config.filePath, config.pixelWidth, config.pixelHeight]);

  // 외부 제어 API
  const controls: AnimationControls = {
    pause: () => stopTimer(),
    resume: () => {
      if (setupDoneRef.current) startTimer();
    },
    seek: (delta: number) => {
      if (!setupDoneRef.current) return;
      const totalFrames = totalFramesRef.current;
      const step = totalFrames / TARGET_FPS;

      currentFrameRef.current += delta * step;
      // 범위 클램핑
      if (currentFrameRef.current < 0) currentFrameRef.current = 0;
      if (currentFrameRef.current >= totalFrames) currentFrameRef.current = totalFrames - 1;

      renderCurrentFrame();
    }
  };

  return controls;
}
