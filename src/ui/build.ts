import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

async function buildInjectableUI() {
  console.log('🏗️ Building Heap Analyzer UI...');

  try {
    // Build the React UI into a single bundle
    const result = await esbuild.build({
      entryPoints: ['src/ui/injectUI.ts'],
      bundle: true,
      minify: true,
      format: 'iife',
      globalName: 'HeapAnalyzerUI',
      target: 'es2020',
      outfile: 'dist/ui/heap-analyzer-ui.js',
      external: [], // Bundle everything
      define: {
        'process.env.NODE_ENV': '"production"'
      },
      jsx: 'automatic',
      jsxImportSource: 'react',
      loader: {
        '.tsx': 'tsx',
        '.ts': 'ts'
      },
      write: false // We'll handle writing ourselves
    });

    // Get the built code
    const builtCode = result.outputFiles[0].text;

    // Create a self-executing function that can be injected
    const injectableScript = `
(function() {
  'use strict';
  
  // Check if React is available, if not, load it
  if (typeof React === 'undefined') {
    console.log('🔄 Loading React for Heap Analyzer UI...');
    
    // Load React and ReactDOM from CDN
    const reactScript = document.createElement('script');
    reactScript.src = 'https://unpkg.com/react@18/umd/react.production.min.js';
    
    const reactDOMScript = document.createElement('script');
    reactDOMScript.src = 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js';
    
    document.head.appendChild(reactScript);
    document.head.appendChild(reactDOMScript);
    
    // Wait for React to load
    reactScript.onload = function() {
      reactDOMScript.onload = function() {
        initializeUI();
      };
    };
  } else {
    initializeUI();
  }
  
  function initializeUI() {
    ${builtCode}
    
    // Initialize the UI
    if (typeof HeapAnalyzerUI !== 'undefined' && HeapAnalyzerUI.injectHeapAnalyzerUI) {
      HeapAnalyzerUI.injectHeapAnalyzerUI();
    }
  }
})();
`;

    // Ensure output directory exists
    const outputDir = path.dirname('dist/ui/heap-analyzer-ui.js');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write the injectable script
    fs.writeFileSync('dist/ui/heap-analyzer-ui.js', injectableScript);

    // Also create a minified version for production
    const minifiedResult = await esbuild.transform(injectableScript, {
      minify: true,
      target: 'es2020'
    });

    fs.writeFileSync('dist/ui/heap-analyzer-ui.min.js', minifiedResult.code);

    console.log('✅ Heap Analyzer UI built successfully!');
    console.log('📁 Output files:');
    console.log('  - dist/ui/heap-analyzer-ui.js (development)');
    console.log('  - dist/ui/heap-analyzer-ui.min.js (production)');

    // Create an export for use in monitor.ts
    const exportScript = `
// Generated UI script for injection
export const heapAnalyzerUIScript = \`${injectableScript.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;

export const heapAnalyzerUIScriptMinified = \`${minifiedResult.code.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
`;

    fs.writeFileSync('src/ui/built-ui.ts', exportScript);
    console.log('  - src/ui/built-ui.ts (for TypeScript import)');

  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  buildInjectableUI();
}

export { buildInjectableUI };