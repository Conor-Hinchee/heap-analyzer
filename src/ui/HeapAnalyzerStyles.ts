export const heapAnalyzerStyles = `
.heap-analyzer-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 280px;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  z-index: 999999;
  color: white;
  font-size: 14px;
}

.heap-analyzer-panel.minimized {
  width: auto;
  background: rgba(30, 60, 114, 0.9);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.header-controls {
  display: flex;
  gap: 8px;
}

.minimize-btn, .expand-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: background 0.2s;
}

.minimize-btn:hover, .expand-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.expand-btn {
  padding: 8px 12px;
  width: auto;
  font-size: 14px;
  border-radius: 8px;
}

.panel-content {
  padding: 16px;
}

.memory-stats {
  margin-bottom: 16px;
}

.memory-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.memory-usage {
  height: 100%;
  background: linear-gradient(90deg, #4ade80 0%, #f59e0b 70%, #ef4444 100%);
  transition: width 0.3s ease;
}

.memory-text {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  opacity: 0.8;
}

.separator {
  margin: 0 4px;
}

.snapshot-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.snapshot-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  min-height: 44px;
}

.snapshot-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

.snapshot-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.snapshot-btn.taken {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.4);
}

.snapshot-btn.before {
  border-left: 4px solid #3b82f6;
}

.snapshot-btn.after {
  border-left: 4px solid #f59e0b;
}

.snapshot-btn.final {
  border-left: 4px solid #ef4444;
}

.snapshot-btn span {
  font-weight: 500;
}

.snapshot-btn small {
  opacity: 0.7;
  font-size: 11px;
  margin-left: auto;
}

.quick-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

.action-btn.gc {
  border-left: 3px solid #ef4444;
}

.action-btn.dom {
  border-left: 3px solid #8b5cf6;
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  .heap-analyzer-panel {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    border-color: rgba(255, 255, 255, 0.1);
  }
}

/* Mobile responsiveness */
@media (max-width: 640px) {
  .heap-analyzer-panel {
    width: calc(100vw - 40px);
    max-width: 280px;
  }
  
  .heap-analyzer-panel.minimized {
    right: 10px;
    top: 10px;
  }
}
`;