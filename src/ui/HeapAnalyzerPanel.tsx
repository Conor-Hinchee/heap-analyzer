import React, { useState, useEffect } from 'react';

interface HeapAnalyzerPanelProps {
  onTakeSnapshot: (type: 'before' | 'after' | 'final') => Promise<void>;
}

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export const HeapAnalyzerPanel: React.FC<HeapAnalyzerPanelProps> = ({ onTakeSnapshot }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [memoryInfo, setMemoryInfo] = useState<MemoryInfo | null>(null);
  const [snapshots, setSnapshots] = useState<{
    before?: string;
    after?: string;
    final?: string;
  }>({});
  const [isLoading, setIsLoading] = useState<string | null>(null);

  // Update memory info every 2 seconds
  useEffect(() => {
    const updateMemory = () => {
      if ((performance as any).memory) {
        setMemoryInfo((performance as any).memory);
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleTakeSnapshot = async (type: 'before' | 'after' | 'final') => {
    setIsLoading(type);
    try {
      await onTakeSnapshot(type);
      setSnapshots(prev => ({ ...prev, [type]: new Date().toLocaleTimeString() }));
    } catch (error) {
      console.error(`Failed to take ${type} snapshot:`, error);
    } finally {
      setIsLoading(null);
    }
  };

  const formatBytes = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getUsagePercentage = (): number => {
    if (!memoryInfo) return 0;
    return (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100;
  };

  if (isMinimized) {
    return (
      <div className="heap-analyzer-panel minimized">
        <button 
          onClick={() => setIsMinimized(false)}
          className="expand-btn"
          title="Expand Heap Analyzer"
        >
          🔍 Heap
        </button>
      </div>
    );
  }

  return (
    <div className="heap-analyzer-panel">
      <div className="panel-header">
        <h3>🚀 Heap Analyzer</h3>
        <div className="header-controls">
          <button 
            onClick={() => setIsMinimized(true)}
            className="minimize-btn"
            title="Minimize"
          >
            −
          </button>
        </div>
      </div>

      <div className="panel-content">
        {/* Memory Stats */}
        {memoryInfo && (
          <div className="memory-stats">
            <div className="memory-bar">
              <div 
                className="memory-usage" 
                style={{ width: `${getUsagePercentage()}%` }}
              />
            </div>
            <div className="memory-text">
              <span className="used">{formatBytes(memoryInfo.usedJSHeapSize)}</span>
              <span className="separator">/</span>
              <span className="limit">{formatBytes(memoryInfo.jsHeapSizeLimit)}</span>
            </div>
          </div>
        )}

        {/* Snapshot Buttons */}
        <div className="snapshot-controls">
          <button 
            onClick={() => handleTakeSnapshot('before')}
            disabled={isLoading === 'before'}
            className={`snapshot-btn before ${snapshots.before ? 'taken' : ''}`}
          >
            {isLoading === 'before' ? '📸...' : '📷'}
            <span>Before</span>
            {snapshots.before && <small>{snapshots.before}</small>}
          </button>

          <button 
            onClick={() => handleTakeSnapshot('after')}
            disabled={isLoading === 'after'}
            className={`snapshot-btn after ${snapshots.after ? 'taken' : ''}`}
          >
            {isLoading === 'after' ? '📸...' : '📊'}
            <span>After</span>
            {snapshots.after && <small>{snapshots.after}</small>}
          </button>

          <button 
            onClick={() => handleTakeSnapshot('final')}
            disabled={isLoading === 'final'}
            className={`snapshot-btn final ${snapshots.final ? 'taken' : ''}`}
          >
            {isLoading === 'final' ? '📸...' : '🎯'}
            <span>Final</span>
            {snapshots.final && <small>{snapshots.final}</small>}
          </button>
        </div>

        {/* Quick Actions */}
        <div className="quick-actions">
          <button 
            onClick={() => (window as any).heapAnalyzer?.forceGC()}
            className="action-btn gc"
            title="Force Garbage Collection"
          >
            🗑️ GC
          </button>
          
          <button 
            onClick={() => (window as any).heapAnalyzer?.getDOMInfo()}
            className="action-btn dom"
            title="Get DOM Info"
          >
            🏗️ DOM
          </button>
        </div>
      </div>
    </div>
  );
};