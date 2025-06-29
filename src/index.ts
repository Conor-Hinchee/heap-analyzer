import { render } from 'ink';
import React from 'react';
import { App } from './App.js';

const args = process.argv.slice(2);
const start = args.includes('-start');

if (start) {
  render(React.createElement(App));
} else {
  console.log('Heap Analyzer CLI - Use -start to begin');
}
