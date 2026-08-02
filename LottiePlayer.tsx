import React, { useEffect, useState } from 'react';
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
        
        setAnsiFrame(ansiString);

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
