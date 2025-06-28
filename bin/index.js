#!/usr/bin/env node

import { render, Text, Box, Newline } from 'ink';
import React from 'react';

const asciiArt = `
    ██╗  ██╗███████╗ █████╗ ██████╗ 
    ██║  ██║██╔════╝██╔══██╗██╔══██╗
    ███████║█████╗  ███████║██████╔╝
    ██╔══██║██╔══╝  ██╔══██║██╔═══╝ 
    ██║  ██║███████╗██║  ██║██║     
    ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     
                                    
     █████╗ ███╗   ██╗ █████╗ ██╗   ██╗   ██╗███████╗███████╗██████╗ 
    ██╔══██╗████╗  ██║██╔══██╗██║   ╚██╗ ██╔╝╚══███╔╝██╔════╝██╔══██╗
    ███████║██╔██╗ ██║███████║██║    ╚████╔╝   ███╔╝ █████╗  ██████╔╝
    ██╔══██║██║╚██╗██║██╔══██║██║     ╚██╔╝   ███╔╝  ██╔══╝  ██╔══██╗
    ██║  ██║██║ ╚████║██║  ██║███████╗ ██║   ███████╗███████╗██║  ██║
    ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝ ╚═╝   ╚══════╝╚══════╝╚═╝  ╚═╝
`;

function WelcomeScreen() {
  return React.createElement(Box, {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingX: 2,
    paddingY: 1
  },
    React.createElement(Text, { color: 'cyan', bold: true }, asciiArt),
    React.createElement(Newline),
    React.createElement(Text, { color: 'green', bold: true }, '🚀 Welcome to Heap Analyzer'),
    React.createElement(Newline),
    React.createElement(Box, { flexDirection: 'column', alignItems: 'center', width: 80 },
      React.createElement(Text, { color: 'yellow' }, 'A CLI tool for analyzing JavaScript heap snapshots from Google DevTools.'),
      React.createElement(Text, { color: 'yellow' }, 'Helps developers trace memory issues, browser crashes, and provides'),
      React.createElement(Text, { color: 'yellow' }, 'actionable insights for fixing leaks in JavaScript applications.'),
    ),
    React.createElement(Newline),
    React.createElement(Text, { color: 'magenta', italic: true }, '� Cut through the clutter and get down to actionable memory fixes'),
    React.createElement(Newline),
    React.createElement(Text, { color: 'gray' }, 'Press Ctrl+C to exit')
  );
}

function App({ start }) {
  if (start) {
    return React.createElement(WelcomeScreen);
  }
  return React.createElement(Text, null, 'Heap Analyzer CLI - Use -start to begin');
}

const args = process.argv.slice(2);
const start = args.includes('-start');

render(React.createElement(App, { start }));
