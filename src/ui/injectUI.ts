import React from 'react';
import { createRoot } from 'react-dom/client';
import { HeapAnalyzerPanel } from './HeapAnalyzerPanel';
import { heapAnalyzerStyles } from './HeapAnalyzerStyles';

// Global interface for heap analyzer functions
declare global {
  interface Window {
    heapAnalyzer: {
      takeSnapshot: () => Promise<any>;
      getDOMInfo: () => any;
      forceGC: () => Promise<void>;
      startMemoryWatcher: (intervalMs?: number) => number;
      ui: {
        show: () => void;
        hide: () => void;
        toggle: () => void;
      };
    };
  }
}

export function injectHeapAnalyzerUI(): void {
  // Only inject once
  if (document.getElementById('heap-analyzer-ui-root')) {
    console.log('🎨 Heap Analyzer UI already injected');
    return;
  }

  console.log('🎨 Injecting Heap Analyzer UI...');

  // Inject styles
  const styleElement = document.createElement('style');
  styleElement.id = 'heap-analyzer-styles';
  styleElement.textContent = heapAnalyzerStyles;
  document.head.appendChild(styleElement);

  // Create root container
  const rootContainer = document.createElement('div');
  rootContainer.id = 'heap-analyzer-ui-root';
  document.body.appendChild(rootContainer);

  // Create React root
  const root = createRoot(rootContainer);

  // Snapshot handler that communicates with the browser extension
  const handleTakeSnapshot = async (type: 'before' | 'after' | 'final'): Promise<void> => {
    console.log(`📸 Taking ${type} snapshot...`);
    
    try {
      // Use CDP to take heap snapshot
      const memInfo = (performance as any).memory;
      
      // Trigger snapshot via global heap analyzer
      if (window.heapAnalyzer?.takeSnapshot) {
        const result = await window.heapAnalyzer.takeSnapshot();
        console.log(`✅ ${type} snapshot completed:`, result);
        
        // Dispatch custom event for the monitor to catch
        window.dispatchEvent(new CustomEvent('heap-snapshot-requested', {
          detail: { type, timestamp: Date.now(), memInfo }
        }));
        
        return result;
      } else {
        throw new Error('Heap analyzer not available');
      }
    } catch (error) {
      console.error(`❌ Failed to take ${type} snapshot:`, error);
      throw error;
    }
  };

  // Render the React component
  root.render(
    React.createElement(HeapAnalyzerPanel, {
      onTakeSnapshot: handleTakeSnapshot
    })
  );

  // Add UI controls to global heapAnalyzer object
  if (window.heapAnalyzer) {
    window.heapAnalyzer.ui = {
      show: () => {
        rootContainer.style.display = 'block';
        console.log('👁️ Heap Analyzer UI shown');
      },
      hide: () => {
        rootContainer.style.display = 'none';
        console.log('🙈 Heap Analyzer UI hidden');
      },
      toggle: () => {
        const isVisible = rootContainer.style.display !== 'none';
        rootContainer.style.display = isVisible ? 'none' : 'block';
        console.log(`🔄 Heap Analyzer UI ${isVisible ? 'hidden' : 'shown'}`);
      }
    };
  }

  console.log('✅ Heap Analyzer UI injected successfully!');
  console.log('🎮 UI Controls:');
  console.log('  heapAnalyzer.ui.show() - Show UI');
  console.log('  heapAnalyzer.ui.hide() - Hide UI');
  console.log('  heapAnalyzer.ui.toggle() - Toggle UI');
}

// Auto-inject when script loads
if (typeof window !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectHeapAnalyzerUI);
} else if (typeof window !== 'undefined') {
  injectHeapAnalyzerUI();
}