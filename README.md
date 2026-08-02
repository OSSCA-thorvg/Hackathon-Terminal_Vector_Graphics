# TermVG - Terminal Vector Graphics

A blazing fast, native-like terminal application that renders vector graphics (Lottie, SVG) directly into your terminal using ThorVG, WebAssembly, and React Ink.

## Features
- **Dynamic File Exploring:** Browse your local directories directly within the terminal UI.
- **Hardware-level Performance:** Renders SVGs and Lottie files using ThorVG's highly optimized WebAssembly (C++) engine.
- **Terminal Adapting Rendering:** Uses half-block, 2x2 quadrants, or braille dots to output pixel-perfect terminal characters.
- **Auto Dark-Mode & Chroma Keying:** Intelligently adapts graphic colors for black backgrounds.

## Build and Run
```bash
npm install
npm run build
npm start
```

## How to Use
- `Up/Down` : Navigate files
- `Left/Right` : Next/Prev Page
- `Enter` : Play Lottie / View SVG
- `M` : Change Rendering Mode (Quadrant -> Braille -> Half-block)
- `O` : Open specific directory path (e.g. `../my_folder`)
- `D` : Toggle Auto Dark-mode
- `S` : Increase Recursive Scan Depth
