import { realWasmModule } from './realWasmModule.js';
import fs from 'fs';

(async () => {
  await realWasmModule.init();
  const width = 60;
  const height = 30;
  
  // Test half-block
  realWasmModule.setSize(width, height * 2);
  let res = realWasmModule.load('example1.json');
  if (!res) throw new Error("Load failed");
  const str1 = realWasmModule.renderToString(10, 0, false);
  console.log("Half-block string length:", str1.length);
  
  // Test braille
  realWasmModule.setSize(width * 2, height * 4);
  res = realWasmModule.load('example1.json');
  if (!res) throw new Error("Load failed");
  const str2 = realWasmModule.renderToString(10, 2, false);
  console.log("Braille string length:", str2.length);
})();
