import { realWasmModule } from './realWasmModule.js';
(async () => {
  await realWasmModule.init();
  realWasmModule.setSize(100, 100);
  const res1 = realWasmModule.load('example1.json');
  console.log("Load result for example1.json:", res1);
  const res2 = realWasmModule.load('2961.svg');
  console.log("Load result for 2961.svg:", res2);
})();
