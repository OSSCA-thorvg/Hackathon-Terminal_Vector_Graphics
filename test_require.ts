import { createRequire } from 'module'; const require = createRequire(import.meta.url); const createTermVG = require('./termvg.js'); console.log(typeof createTermVG);
