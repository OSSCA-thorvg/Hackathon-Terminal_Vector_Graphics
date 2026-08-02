#!/usr/bin/env node
import React, { useEffect } from 'react';
import { render, Box, Text, useApp } from 'ink';
import meow from 'meow';
import { InteractiveMenu } from './InteractiveMenu.js';
import { LottiePlayer } from './LottiePlayer.js';
import { realWasmModule } from './realWasmModule.js';

const cli = meow(`
  Usage
    $ termvg

  Options
    --help     Show help
    --version  Show version

  Examples
    $ termvg
    $ termvg play example.json
`, {
  importMeta: import.meta,
  flags: {
    help: { type: 'boolean' },
    version: { type: 'boolean' }
  }
});

const SinglePlayer = ({ filePath, exit }: { filePath: string, exit: () => void }) => {
  const [termSize, setTermSize] = React.useState({ 
    columns: process.stdout.columns || 100, 
    rows: process.stdout.rows || 40 
  });

  useEffect(() => {
    const onResize = () => setTermSize({ 
      columns: process.stdout.columns || 100, 
      rows: process.stdout.rows || 40 
    });
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  return (
    <Box flexDirection="column">
      <LottiePlayer 
        wasmModule={realWasmModule} 
        filePath={filePath} 
        width={termSize.columns} 
        height={Math.max(10, termSize.rows - 2)} 
        renderMode="braille"
        invertDark={false}
        loop={false}
        onComplete={exit}
      />
    </Box>
  );
};

const App = () => {
  const { exit } = useApp();
  const command = cli.input[0];
  const filePath = cli.input[1];

  // Global Signal Handling for Web Terminal (ttyd) disconnection or Ctrl+C
  useEffect(() => {
    const handleSignal = (signal: NodeJS.Signals) => {
      // Graceful Shutdown: free WASM memory before exiting
      realWasmModule.destroy();
      exit(); 
    };

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);
    process.on('SIGHUP', handleSignal); // Triggered when ttyd websocket disconnects

    return () => {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      process.off('SIGHUP', handleSignal);
    };
  }, [exit]);

  if (command === 'play' && filePath) {
    return <SinglePlayer filePath={filePath} exit={() => { realWasmModule.destroy(); exit(); }} />;
  }

  // Interactive Mode
  return <InteractiveMenu wasmModule={realWasmModule} />;
};

import { spawn } from 'child_process';
import open from 'open';

const command = cli.input[0];

if (command === 'web') {
  console.log('🚀 Starting web terminal on http://localhost:8080 ...');
  
  // In a real CLI, this would be 'ttyd -p 8080 termvg'
  // For the prototype, we invoke tsx directly.
  const ttyd = spawn('ttyd', ['-W', '-p', '8080', 'npx', 'tsx', 'index.tsx'], {
    stdio: 'inherit'
  });

  ttyd.on('error', (err) => {
    console.error('❌ Failed to start ttyd. Make sure it is installed (e.g., brew install ttyd).');
    process.exit(1);
  });

  setTimeout(() => {
    open('http://localhost:8080');
    console.log('🌐 Browser opened. Press Ctrl+C to stop the web terminal.');
  }, 1000);

  process.on('SIGINT', () => {
    console.log('\\nStopping web terminal...');
    ttyd.kill('SIGINT');
    process.exit(0);
  });
} else {
  render(<App />);
}
