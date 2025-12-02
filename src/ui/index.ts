/**
 * Heap Analyzer UI Module
 * 
 * Provides user interface components for browser-based heap analysis
 */

export { 
  generateFloatingUIScript, 
  createFloatingUI,
  type WorkflowState,
  type FloatingUICallbacks,
  type FloatingUIConfig
} from './components/FloatingHeapUI.js';

// Re-export default for convenience
export { default as FloatingHeapUI } from './components/FloatingHeapUI.js';