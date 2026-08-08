import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let engine: any = null;

export const realWasmModule = {
  init: async () => {
    if (!engine) {
      const createTermVG = require('./termvg.cjs');
      const module = await createTermVG();
      engine = new module.TermVGEngine();
      engine.init();
    }
  },
  load: (path: string): boolean => {
    if (!engine) return false;
    try {
      const data = fs.readFileSync(path, 'utf8');
      const res = engine.load(data);
      if (res !== 0) {
        console.error(`Failed to load file, C++ error code: ${res}`);
        return false;
      }
      return true;
    } catch (e) {
      console.error("Failed to load file:", e);
      return false;
    }
  },
  setSize: (width: number, height: number): void => {
    if (engine) {
      engine.setSize(width, height);
    }
  },
  getDuration: (): number => {
    return engine ? engine.getDuration() : 0;
  },
  getTotalFrames: (): number => {
    return engine ? engine.getTotalFrames() : 0;
  },
  renderToString: (frame: number, renderMode: number, invertDark: boolean): string => {
    if (!engine) return "";
    const val = engine.renderToString(frame, renderMode, invertDark);
    if (!val) return "";
    return val;
  },
  destroy: () => {
    if (engine) {
      try {
        engine.delete(); // Invokes C++ destructor to free memory
        engine = null;
      } catch (e) {
        console.error("Failed to free WASM memory", e);
      }
    }
  }
};
