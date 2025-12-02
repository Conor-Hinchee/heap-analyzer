/**
 * Floating Heap Analyzer UI Component
 * 
 * A draggable floating panel that provides step-by-step workflow for heap analysis:
 * 1. Take before snapshot
 * 2. Perform actions
 * 3. Take final snapshot with GC
 * 4. Close browser for analysis
 */

export interface WorkflowState {
  step: number;
  snapshots: {
    before?: { timestamp: number; completed: boolean };
    after?: { timestamp: number; completed: boolean };
    final?: { timestamp: number; completed: boolean };
  };
}

export interface FloatingUICallbacks {
  onSnapshotRequested?: (type: 'before' | 'after' | 'final') => Promise<void>;
  onCloseRequested?: () => void;
  onGarbageCollection?: () => Promise<void>;
  onDOMAnalysis?: () => void;
}

/**
 * Generates the client-side JavaScript code for the floating UI
 * This code will be injected into the browser page
 */
export function generateFloatingUIScript(callbacks: FloatingUICallbacks = {}): string {
  return `
    // Floating Heap Analyzer UI - Client-side Implementation
    function createFloatingUI() {
      // Only create once
      if (document.getElementById('heap-analyzer-ui')) return;

      // Create the floating panel
      const panel = document.createElement('div');
      panel.id = 'heap-analyzer-ui';
      panel.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        width: 280px;
        background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999;
        color: white;
        font-size: 14px;
        padding: 16px;
      \`;

      // Create the UI content
      panel.innerHTML = \`
        <div id="drag-header" style="margin-bottom: 16px; text-align: center; cursor: move; padding: 4px; border-radius: 8px; transition: background-color 0.2s; position: relative;">
          <div style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); opacity: 0.5; font-size: 12px;">⋮⋮</div>
          <h3 style="margin: 0; font-size: 16px;">🚀 Heap Analyzer</h3>
          <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); opacity: 0.5; font-size: 12px;">⋮⋮</div>
        </div>
        
        <div style="margin-bottom: 16px;">
          <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin-bottom: 8px;">
            <div id="memory-bar" style="height: 100%; background: linear-gradient(90deg, #4ade80 0%, #f59e0b 70%, #ef4444 100%); width: 0%; transition: width 0.3s ease; border-radius: 3px;"></div>
          </div>
          <div id="memory-text" style="font-size: 12px; opacity: 0.8; text-align: center;">
            Memory: 0 MB / 0 MB
          </div>
        </div>

        <div id="workflow-status" style="margin-bottom: 12px; padding: 8px 12px; background: rgba(255,255,255,0.05); border-radius: 6px; font-size: 12px; text-align: center;">
          <div id="workflow-text">Ready to start heap analysis</div>
          <div id="workflow-progress" style="height: 2px; background: rgba(255,255,255,0.1); margin-top: 6px; border-radius: 1px;">
            <div id="progress-bar" style="height: 100%; background: #4ade80; width: 0%; transition: width 0.3s ease; border-radius: 1px;"></div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
          <button id="snapshot-before" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(59,130,246,0.2); border: 1px solid rgba(59,130,246,0.4); border-left: 4px solid #3b82f6; border-radius: 8px; color: white; cursor: pointer; font-size: 14px; min-height: 44px;">
            <span>📷</span>
            <div style="flex: 1; text-align: left;">
              <div style="font-weight: 500;">1. Take Before Snapshot</div>
              <div id="before-time" style="opacity: 0.7; font-size: 11px;">Click to start</div>
            </div>
          </button>
          
          <button id="snapshot-after" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-left: 4px solid #6b7280; border-radius: 8px; color: #9ca3af; cursor: not-allowed; font-size: 14px; min-height: 44px;" disabled>
            <span>📊</span>
            <div style="flex: 1; text-align: left;">
              <div style="font-weight: 500;">2. Perform Actions</div>
              <div id="after-time" style="opacity: 0.7; font-size: 11px;">Take before snapshot first</div>
            </div>
          </button>
          
          <button id="snapshot-final" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-left: 4px solid #6b7280; border-radius: 8px; color: #9ca3af; cursor: not-allowed; font-size: 14px; min-height: 44px;" disabled>
            <span>🎯</span>
            <div style="flex: 1; text-align: left;">
              <div style="font-weight: 500;">3. Final + Analysis</div>
              <div id="final-time" style="opacity: 0.7; font-size: 11px;">Complete previous steps</div>
            </div>
          </button>

          <button id="close-browser" style="display: none; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); border-left: 4px solid #ef4444; border-radius: 8px; color: white; cursor: pointer; font-size: 14px; min-height: 44px;">
            <span>🚪</span>
            <div style="flex: 1; text-align: left;">
              <div style="font-weight: 500;">4. Close & Analyze</div>
              <div style="opacity: 0.7; font-size: 11px;">Analysis complete!</div>
            </div>
          </button>
        </div>

        <div style="display: flex; gap: 8px;">
          <button id="gc-btn" style="flex: 1; padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-left: 3px solid #ef4444; border-radius: 6px; color: white; cursor: pointer; font-size: 12px;">
            🗑️ GC
          </button>
          <button id="dom-btn" style="flex: 1; padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-left: 3px solid #8b5cf6; border-radius: 6px; color: white; cursor: pointer; font-size: 12px;">
            🏗️ DOM
          </button>
        </div>
      \`;

      document.body.appendChild(panel);

      // Add drag functionality
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let panelStartX = 0;
      let panelStartY = 0;

      const dragHeader = document.getElementById('drag-header');
      
      if (dragHeader) {
        dragHeader.addEventListener('mousedown', (e) => {
          isDragging = true;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          
          // Get current panel position
          const rect = panel.getBoundingClientRect();
          panelStartX = rect.left;
          panelStartY = rect.top;
          
          // Change cursor and header appearance
          document.body.style.cursor = 'grabbing';
          dragHeader.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
          
          // Prevent text selection
          e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          
          const deltaX = e.clientX - dragStartX;
          const deltaY = e.clientY - dragStartY;
          
          const newX = panelStartX + deltaX;
          const newY = panelStartY + deltaY;
          
          // Keep panel within viewport bounds
          const maxX = window.innerWidth - panel.offsetWidth;
          const maxY = window.innerHeight - panel.offsetHeight;
          
          const constrainedX = Math.max(0, Math.min(newX, maxX));
          const constrainedY = Math.max(0, Math.min(newY, maxY));
          
          panel.style.left = constrainedX + 'px';
          panel.style.top = constrainedY + 'px';
          panel.style.right = 'auto'; // Remove right positioning when dragging
        });

        document.addEventListener('mouseup', () => {
          if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            dragHeader.style.backgroundColor = '';
          }
        });

        // Handle touch events for mobile support
        dragHeader.addEventListener('touchstart', (e) => {
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            isDragging = true;
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            
            const rect = panel.getBoundingClientRect();
            panelStartX = rect.left;
            panelStartY = rect.top;
            
            dragHeader.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.preventDefault();
          }
        });

        document.addEventListener('touchmove', (e) => {
          if (!isDragging || e.touches.length !== 1) return;
          
          const touch = e.touches[0];
          const deltaX = touch.clientX - dragStartX;
          const deltaY = touch.clientY - dragStartY;
          
          const newX = panelStartX + deltaX;
          const newY = panelStartY + deltaY;
          
          const maxX = window.innerWidth - panel.offsetWidth;
          const maxY = window.innerHeight - panel.offsetHeight;
          
          const constrainedX = Math.max(0, Math.min(newX, maxX));
          const constrainedY = Math.max(0, Math.min(newY, maxY));
          
          panel.style.left = constrainedX + 'px';
          panel.style.top = constrainedY + 'px';
          panel.style.right = 'auto';
          
          e.preventDefault();
        });

        document.addEventListener('touchend', () => {
          if (isDragging) {
            isDragging = false;
            dragHeader.style.backgroundColor = '';
          }
        });
      }

      // Workflow state management
      let workflowStep = 0;
      const steps = ['before', 'after', 'final', 'complete'];

      function updateWorkflowUI() {
        const workflowText = document.getElementById('workflow-text');
        const progressBar = document.getElementById('progress-bar');
        const beforeBtn = document.getElementById('snapshot-before');
        const afterBtn = document.getElementById('snapshot-after');
        const finalBtn = document.getElementById('snapshot-final');
        const closeBtn = document.getElementById('close-browser');

        const messages = [
          'Ready to start heap analysis',
          'Perform your actions, then click "After Snapshot"',
          'Ready for final snapshot with garbage collection',
          'Analysis complete! Review results and close browser'
        ];

        if (workflowText && progressBar) {
          workflowText.textContent = messages[workflowStep] || messages[0];
          progressBar.style.width = ((workflowStep / 3) * 100) + '%';
        }

        // Update button states
        if (beforeBtn && afterBtn && finalBtn && closeBtn) {
          // Reset all buttons first
          [beforeBtn, afterBtn, finalBtn].forEach(btn => {
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.borderColor = 'rgba(255,255,255,0.1)';
            btn.style.borderLeftColor = '#6b7280';
            btn.style.color = '#9ca3af';
            btn.style.cursor = 'not-allowed';
            btn.disabled = true;
          });

          // Enable current step
          if (workflowStep === 0) {
            beforeBtn.style.background = 'rgba(59,130,246,0.2)';
            beforeBtn.style.borderColor = 'rgba(59,130,246,0.4)';
            beforeBtn.style.borderLeftColor = '#3b82f6';
            beforeBtn.style.color = 'white';
            beforeBtn.style.cursor = 'pointer';
            beforeBtn.disabled = false;
          } else if (workflowStep === 1) {
            afterBtn.style.background = 'rgba(245,158,11,0.2)';
            afterBtn.style.borderColor = 'rgba(245,158,11,0.4)';
            afterBtn.style.borderLeftColor = '#f59e0b';
            afterBtn.style.color = 'white';
            afterBtn.style.cursor = 'pointer';
            afterBtn.disabled = false;
          } else if (workflowStep === 2) {
            finalBtn.style.background = 'rgba(239,68,68,0.2)';
            finalBtn.style.borderColor = 'rgba(239,68,68,0.4)';
            finalBtn.style.borderLeftColor = '#ef4444';
            finalBtn.style.color = 'white';
            finalBtn.style.cursor = 'pointer';
            finalBtn.disabled = false;
          } else if (workflowStep === 3) {
            closeBtn.style.display = 'flex';
          }
        }
      }

      // Memory monitoring
      function updateMemory() {
        if (performance.memory) {
          const memory = performance.memory;
          const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
          const usedMB = (memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
          const limitMB = (memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
          
          const memoryBar = document.getElementById('memory-bar');
          const memoryText = document.getElementById('memory-text');
          if (memoryBar && memoryText) {
            memoryBar.style.width = usagePercent + '%';
            memoryText.textContent = \`Memory: \${usedMB} MB / \${limitMB} MB\`;
          }
        }
      }

      // Snapshot functionality
      async function takeSnapshot(type) {
        const btn = document.getElementById(\`snapshot-\${type}\`);
        const timeDiv = document.getElementById(\`\${type}-time\`);
        
        if (btn && timeDiv) {
          btn.disabled = true;
          btn.style.opacity = '0.6';
          
          try {
            // Special handling for final snapshot - run garbage collection first
            if (type === 'final') {
              console.log('🗑️ Running garbage collection before final snapshot...');
              timeDiv.textContent = 'Running GC...';
              
              // Force garbage collection
              if (window.heapAnalyzer && window.heapAnalyzer.forceGC) {
                await window.heapAnalyzer.forceGC();
              } else {
                // Fallback GC pressure
                if ('gc' in window) {
                  window.gc();
                }
                // Create memory pressure to encourage GC
                for (let i = 0; i < 10; i++) {
                  const temp = new Array(100000).fill(0);
                  temp.length = 0;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              
              console.log('✅ Garbage collection completed');
            }
            
            console.log(\`📸 Taking \${type} snapshot...\`);
            timeDiv.textContent = 'Taking snapshot...';
            
            // Dispatch event for monitor to handle
            window.dispatchEvent(new CustomEvent('heap-snapshot-requested', {
              detail: { type, timestamp: Date.now(), memInfo: performance.memory }
            }));
            
            // Call heap analyzer if available
            if (window.heapAnalyzer && window.heapAnalyzer.takeSnapshot) {
              await window.heapAnalyzer.takeSnapshot();
            }
            
            // Update UI with completion
            timeDiv.textContent = new Date().toLocaleTimeString();
            btn.style.background = 'rgba(34, 197, 94, 0.2)';
            btn.style.borderColor = 'rgba(34, 197, 94, 0.4)';
            btn.style.borderLeftColor = '#22c55e';
            
            console.log(\`✅ \${type} snapshot completed\`);
            
            // Progress workflow
            if (type === 'before') {
              workflowStep = 1;
              timeDiv.textContent = 'Completed - ' + timeDiv.textContent;
            } else if (type === 'after') {
              workflowStep = 2;
              timeDiv.textContent = 'Completed - ' + timeDiv.textContent;
            } else if (type === 'final') {
              workflowStep = 3;
              timeDiv.textContent = 'Completed - ' + timeDiv.textContent;
            }
            
            updateWorkflowUI();
            
          } catch (error) {
            console.error(\`❌ Failed to take \${type} snapshot:\`, error);
            timeDiv.textContent = 'Error - try again';
          } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
          }
        }
      }

      // Event listeners
      const beforeBtn = document.getElementById('snapshot-before');
      const afterBtn = document.getElementById('snapshot-after');
      const finalBtn = document.getElementById('snapshot-final');
      const closeBtn = document.getElementById('close-browser');
      const gcBtn = document.getElementById('gc-btn');
      const domBtn = document.getElementById('dom-btn');
      
      if (beforeBtn) beforeBtn.onclick = () => {
        if (workflowStep === 0) takeSnapshot('before');
      };
      if (afterBtn) afterBtn.onclick = () => {
        if (workflowStep === 1) takeSnapshot('after');
      };
      if (finalBtn) finalBtn.onclick = () => {
        if (workflowStep === 2) takeSnapshot('final');
      };
      
      if (closeBtn) closeBtn.onclick = () => {
        console.log('🚪 Closing browser and running analysis...');
        
        // Set global flag for monitor to detect
        window.heapAnalyzerCloseRequested = true;
        
        // Dispatch close event for monitor to handle
        window.dispatchEvent(new CustomEvent('browser-close-requested', {
          detail: { timestamp: Date.now(), reason: 'workflow-complete' }
        }));
        
        // Show confirmation
        const workflowText = document.getElementById('workflow-text');
        if (workflowText) {
          workflowText.textContent = 'Closing browser and analyzing results...';
        }
        
        console.log('🚪 BROWSER_CLOSE_REQUESTED: Workflow complete, requesting shutdown');
      };
      
      if (gcBtn) gcBtn.onclick = () => {
        if (window.heapAnalyzer && window.heapAnalyzer.forceGC) {
          window.heapAnalyzer.forceGC();
        }
      };
      
      if (domBtn) domBtn.onclick = () => {
        if (window.heapAnalyzer && window.heapAnalyzer.getDOMInfo) {
          window.heapAnalyzer.getDOMInfo();
        }
      };

      // Initialize workflow UI
      updateWorkflowUI();

      // Start memory monitoring with regular updates
      updateMemory();
      
      // Update memory every 2 seconds for real-time monitoring
      const memoryUpdateInterval = setInterval(() => {
        updateMemory();
      }, 2000);
      
      // Store interval ID for cleanup if needed
      if (window.heapAnalyzer) {
        window.heapAnalyzer.memoryUpdateInterval = memoryUpdateInterval;
      }

      // Add to global heapAnalyzer
      if (window.heapAnalyzer) {
        window.heapAnalyzer.ui = {
          show: () => panel.style.display = 'block',
          hide: () => panel.style.display = 'none',
          toggle: () => panel.style.display = panel.style.display === 'none' ? 'block' : 'none',
          nextStep: () => {
            if (workflowStep < 3) {
              workflowStep++;
              updateWorkflowUI();
            }
          },
          resetWorkflow: () => {
            workflowStep = 0;
            updateWorkflowUI();
          }
        };
      }

      console.log('✅ Heap Analyzer UI injected!');
      console.log('🎮 Step-by-step workflow: Before → After → Final → Close');
      console.log('📋 Follow the guided workflow for proper heap analysis!');
    }

    // Initialize UI
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createFloatingUI);
    } else {
      createFloatingUI();
    }
  `;
}

/**
 * Configuration for the floating UI
 */
export interface FloatingUIConfig {
  position?: { top?: number; right?: number; bottom?: number; left?: number };
  theme?: 'dark' | 'light' | 'blue';
  showMemoryMonitor?: boolean;
  autoHideOnComplete?: boolean;
  enableDragDrop?: boolean;
}

/**
 * Creates a configured floating UI script with custom settings
 */
export function createFloatingUI(config: FloatingUIConfig = {}, callbacks: FloatingUICallbacks = {}): string {
  const script = generateFloatingUIScript(callbacks);
  
  // Apply configuration overrides if needed
  // For now, return the base script, but this could be extended
  // to customize colors, position, etc. based on config
  
  return script;
}

/**
 * Default export for easy importing
 */
export default {
  generateFloatingUIScript,
  createFloatingUI
};