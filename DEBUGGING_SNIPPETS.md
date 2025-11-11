# 🔧 Browser Debugging Snippets for Memory Leak Detection

Collection of browser console scripts to help identify and debug memory leaks in real-time.

## 📋 Table of Contents

- [setInterval/setTimeout Monitoring](#setintervalsettimeout-monitoring)
- [Event Listener Tracking](#event-listener-tracking)
- [Observer Monitoring](#observer-monitoring)
- [DOM Node Leak Detection](#dom-node-leak-detection)
- [Memory Growth Tracker](#memory-growth-tracker)

---

## ⏰ setInterval/setTimeout Monitoring

### Enhanced Interval Monitor with ID Tracking

Intercepts and tracks all `setInterval` and `clearInterval` calls to identify leaks.

```javascript
// Enhanced setInterval/clearInterval monitor with ID tracking
const originalSetInterval = window.setInterval;
const originalClearInterval = window.clearInterval;
const activeIntervals = new Map(); // Use Map to store ID -> timestamp

window.setInterval = function(...args) {
  const id = originalSetInterval(...args);
  const timestamp = new Date().toLocaleTimeString();
  
  activeIntervals.set(id, {
    created: timestamp,
    delay: args[1] || 0,
    stackTrace: new Error().stack
  });
  
  console.log(`🔴 setInterval created - ID: ${id} | Delay: ${args[1]}ms | Active: ${activeIntervals.size}`);
  console.trace('Created at:');
  
  return id;
};

window.clearInterval = function(id) {
  if (activeIntervals.has(id)) {
    const info = activeIntervals.get(id);
    console.log(`✅ clearInterval called - ID: ${id} | Was created at: ${info.created} | Active: ${activeIntervals.size - 1}`);
    activeIntervals.delete(id);
  } else {
    console.log(`⚠️  clearInterval called for unknown ID: ${id}`);
  }
  
  return originalClearInterval(id);
};

// Helper function to list all active intervals
window.listActiveIntervals = function() {
  console.log(`\n📊 Active Intervals Summary (${activeIntervals.size} total):`);
  console.log('='.repeat(60));
  
  if (activeIntervals.size === 0) {
    console.log('✅ No active intervals - all cleaned up!');
  } else {
    activeIntervals.forEach((info, id) => {
      console.log(`ID: ${id} | Created: ${info.created} | Delay: ${info.delay}ms`);
    });
    
    console.log('\n🔴 LEAK WARNING: ' + activeIntervals.size + ' interval(s) still active!');
  }
};

// Auto-report every 10 seconds
const reportInterval = originalSetInterval(() => {
  if (activeIntervals.size > 0) {
    console.log(`\n⚠️  Interval Check: ${activeIntervals.size} active interval(s)`);
  }
}, 10000);

console.log('✅ Monitoring setInterval/clearInterval...');
console.log('💡 Type listActiveIntervals() to see all active intervals');
```

**Usage:**
1. Paste in browser console before leak occurs
2. Watch for `🔴 setInterval created` logs
3. Check if corresponding `✅ clearInterval` appears
4. Type `listActiveIntervals()` to see leaked intervals
5. Check stack traces to find source code location

---

### setTimeout Monitor

Track `setTimeout` calls to detect uncanceled timeouts:

```javascript
// setTimeout/clearTimeout monitor
const originalSetTimeout = window.setTimeout;
const originalClearTimeout = window.clearTimeout;
const activeTimeouts = new Map();

window.setTimeout = function(...args) {
  const id = originalSetTimeout(...args);
  const timestamp = new Date().toLocaleTimeString();
  
  activeTimeouts.set(id, {
    created: timestamp,
    delay: args[1] || 0,
    stackTrace: new Error().stack
  });
  
  console.log(`⏱️  setTimeout created - ID: ${id} | Delay: ${args[1]}ms | Active: ${activeTimeouts.size}`);
  
  return id;
};

window.clearTimeout = function(id) {
  if (activeTimeouts.has(id)) {
    const info = activeTimeouts.get(id);
    console.log(`✅ clearTimeout called - ID: ${id} | Active: ${activeTimeouts.size - 1}`);
    activeTimeouts.delete(id);
  }
  
  return originalClearTimeout(id);
};

window.listActiveTimeouts = function() {
  console.log(`\n📊 Active Timeouts (${activeTimeouts.size} total):`);
  if (activeTimeouts.size === 0) {
    console.log('✅ No active timeouts');
  } else {
    activeTimeouts.forEach((info, id) => {
      console.log(`ID: ${id} | Created: ${info.created} | Delay: ${info.delay}ms`);
    });
  }
};

console.log('✅ Monitoring setTimeout/clearTimeout...');
console.log('💡 Type listActiveTimeouts() to see all active timeouts');
```

---

## 🎯 Event Listener Tracking

Monitor event listeners to detect leaks:

```javascript
// Event listener monitor
const originalAddEventListener = EventTarget.prototype.addEventListener;
const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
const activeListeners = new Map();
let listenerId = 0;

EventTarget.prototype.addEventListener = function(type, listener, options) {
  const id = ++listenerId;
  const key = `${this.constructor.name}_${type}_${id}`;
  
  activeListeners.set(key, {
    target: this,
    type: type,
    listener: listener,
    created: new Date().toLocaleTimeString(),
    stackTrace: new Error().stack
  });
  
  console.log(`🎯 addEventListener - ${this.constructor.name}.${type} | ID: ${id} | Total: ${activeListeners.size}`);
  
  return originalAddEventListener.call(this, type, listener, options);
};

EventTarget.prototype.removeEventListener = function(type, listener, options) {
  // Find and remove from tracking
  for (const [key, info] of activeListeners.entries()) {
    if (info.target === this && info.type === type && info.listener === listener) {
      console.log(`✅ removeEventListener - ${this.constructor.name}.${type} | Total: ${activeListeners.size - 1}`);
      activeListeners.delete(key);
      break;
    }
  }
  
  return originalRemoveEventListener.call(this, type, listener, options);
};

window.listActiveListeners = function() {
  console.log(`\n📊 Active Event Listeners (${activeListeners.size} total):`);
  console.log('='.repeat(60));
  
  if (activeListeners.size === 0) {
    console.log('✅ No active listeners tracked');
  } else {
    const grouped = {};
    activeListeners.forEach((info, key) => {
      const groupKey = `${info.target.constructor.name}.${info.type}`;
      grouped[groupKey] = (grouped[groupKey] || 0) + 1;
    });
    
    Object.entries(grouped).forEach(([key, count]) => {
      console.log(`${key}: ${count} listener(s)`);
    });
    
    console.log('\n🔴 Check if these should have been removed!');
  }
};

console.log('✅ Monitoring addEventListener/removeEventListener...');
console.log('💡 Type listActiveListeners() to see all active listeners');
```

---

## 👁️ Observer Monitoring

Track Observer creation and disconnection:

```javascript
// Observer monitor - tracks all observer types
const observerTypes = [
  'MutationObserver',
  'IntersectionObserver', 
  'ResizeObserver',
  'PerformanceObserver'
];

const activeObservers = new Map();
let observerId = 0;

observerTypes.forEach(observerType => {
  if (!window[observerType]) return;
  
  const OriginalObserver = window[observerType];
  
  window[observerType] = class extends OriginalObserver {
    constructor(...args) {
      super(...args);
      
      const id = ++observerId;
      this._leakTrackerId = id;
      
      activeObservers.set(id, {
        type: observerType,
        created: new Date().toLocaleTimeString(),
        stackTrace: new Error().stack
      });
      
      console.log(`👁️  ${observerType} created - ID: ${id} | Active: ${activeObservers.size}`);
      console.trace('Created at:');
    }
    
    disconnect() {
      if (this._leakTrackerId && activeObservers.has(this._leakTrackerId)) {
        console.log(`✅ ${activeObservers.get(this._leakTrackerId).type} disconnected - ID: ${this._leakTrackerId} | Active: ${activeObservers.size - 1}`);
        activeObservers.delete(this._leakTrackerId);
      }
      
      return super.disconnect();
    }
  };
});

window.listActiveObservers = function() {
  console.log(`\n📊 Active Observers (${activeObservers.size} total):`);
  console.log('='.repeat(60));
  
  if (activeObservers.size === 0) {
    console.log('✅ No active observers - all disconnected!');
  } else {
    const grouped = {};
    activeObservers.forEach((info, id) => {
      grouped[info.type] = (grouped[info.type] || 0) + 1;
    });
    
    Object.entries(grouped).forEach(([type, count]) => {
      console.log(`${type}: ${count} active`);
    });
    
    console.log('\n🔴 LEAK WARNING: Observers not disconnected!');
  }
};

console.log('✅ Monitoring all Observer types...');
console.log('💡 Type listActiveObservers() to see all active observers');
```

---

## 🌳 DOM Node Leak Detection

Find detached DOM nodes that should be garbage collected:

```javascript
// Detached DOM node detector
window.findDetachedNodes = function() {
  console.log('🔍 Scanning for detached DOM nodes...');
  
  // This is a simplified check - real detection happens in heap snapshots
  const allElements = document.querySelectorAll('*');
  const detached = [];
  
  allElements.forEach(el => {
    if (!document.body.contains(el) && el !== document.documentElement) {
      detached.push(el);
    }
  });
  
  console.log(`Found ${detached.length} potentially detached elements`);
  
  if (detached.length > 0) {
    console.log('🔴 Detached elements (first 10):');
    detached.slice(0, 10).forEach(el => {
      console.log(`  ${el.tagName}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ')[0] : ''}`);
    });
  }
  
  return detached;
};

console.log('✅ Detached node detector ready');
console.log('💡 Type findDetachedNodes() to scan for detached DOM nodes');
```

---

## 📊 Memory Growth Tracker

Monitor memory usage over time:

```javascript
// Memory growth tracker
let memoryBaseline = null;
const memoryHistory = [];

window.trackMemory = function() {
  if (!performance.memory) {
    console.log('⚠️  performance.memory not available (use Chrome with --enable-precise-memory-info)');
    return;
  }
  
  const current = {
    timestamp: new Date().toLocaleTimeString(),
    usedJSHeapSize: performance.memory.usedJSHeapSize,
    totalJSHeapSize: performance.memory.totalJSHeapSize,
    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
  };
  
  memoryHistory.push(current);
  
  if (!memoryBaseline) {
    memoryBaseline = current;
    console.log('📊 Memory baseline set:', (current.usedJSHeapSize / 1048576).toFixed(2), 'MB');
  } else {
    const growth = current.usedJSHeapSize - memoryBaseline.usedJSHeapSize;
    const growthMB = (growth / 1048576).toFixed(2);
    const emoji = growth > 0 ? '📈' : '📉';
    
    console.log(`${emoji} Memory: ${(current.usedJSHeapSize / 1048576).toFixed(2)} MB | Growth: ${growthMB} MB`);
  }
};

window.startMemoryMonitoring = function(intervalMs = 5000) {
  console.log(`📊 Starting memory monitoring (every ${intervalMs}ms)...`);
  
  return setInterval(() => {
    window.trackMemory();
  }, intervalMs);
};

window.memoryReport = function() {
  if (memoryHistory.length === 0) {
    console.log('No memory data collected yet. Run startMemoryMonitoring() first.');
    return;
  }
  
  console.log('\n📊 MEMORY REPORT');
  console.log('='.repeat(60));
  console.log(`Samples: ${memoryHistory.length}`);
  console.log(`Baseline: ${(memoryBaseline.usedJSHeapSize / 1048576).toFixed(2)} MB at ${memoryBaseline.timestamp}`);
  
  const latest = memoryHistory[memoryHistory.length - 1];
  const growth = latest.usedJSHeapSize - memoryBaseline.usedJSHeapSize;
  
  console.log(`Current: ${(latest.usedJSHeapSize / 1048576).toFixed(2)} MB at ${latest.timestamp}`);
  console.log(`Growth: ${(growth / 1048576).toFixed(2)} MB (${((growth / memoryBaseline.usedJSHeapSize) * 100).toFixed(1)}%)`);
  
  if (growth > 10485760) { // 10MB
    console.log('🔴 WARNING: Memory grew by more than 10MB!');
  }
};

console.log('✅ Memory tracker ready');
console.log('💡 Commands:');
console.log('   trackMemory() - Take one measurement');
console.log('   startMemoryMonitoring() - Auto-track every 5 seconds');
console.log('   memoryReport() - Show full report');
```

---

## 🚀 Quick Start - All Monitors

Run everything at once:

```javascript
// ALL MONITORS - Paste this to enable everything
(function() {
  console.log('🚀 Initializing all leak detection monitors...\n');
  
  // setInterval monitor
  const originalSetInterval = window.setInterval;
  const originalClearInterval = window.clearInterval;
  const activeIntervals = new Map();
  
  window.setInterval = function(...args) {
    const id = originalSetInterval(...args);
    activeIntervals.set(id, { created: new Date().toLocaleTimeString(), delay: args[1] || 0 });
    console.log(`🔴 setInterval ID: ${id} | Active: ${activeIntervals.size}`);
    return id;
  };
  
  window.clearInterval = function(id) {
    if (activeIntervals.has(id)) {
      activeIntervals.delete(id);
      console.log(`✅ clearInterval ID: ${id} | Active: ${activeIntervals.size}`);
    }
    return originalClearInterval(id);
  };
  
  window.listActiveIntervals = () => {
    console.log(`📊 ${activeIntervals.size} active interval(s)`);
    if (activeIntervals.size > 0) activeIntervals.forEach((info, id) => console.log(`  ID ${id}: ${info.delay}ms`));
  };
  
  console.log('✅ setInterval monitor active');
  console.log('✅ All monitors initialized!\n');
  console.log('💡 Available commands:');
  console.log('   listActiveIntervals()');
  console.log('   listActiveTimeouts()');
  console.log('   listActiveListeners()');
  console.log('   listActiveObservers()');
})();
```

---

## 📝 Tips

1. **Run monitors BEFORE the leak occurs** - Paste scripts at page load
2. **Use Chrome DevTools Snippets** - Save these as snippets for reuse
3. **Check stack traces** - They show exactly where leaks are created
4. **Compare before/after** - Take heap snapshots before and after using the app
5. **Combine with heap-analyzer** - Use these for real-time debugging, heap-analyzer for analysis

## 🔗 Related Tools

- [heap-analyzer](../README.md) - Snapshot-based leak detection
- [Chrome DevTools Memory Profiler](https://developer.chrome.com/docs/devtools/memory-problems/)
- [Chrome DevTools Snippets](https://developer.chrome.com/docs/devtools/javascript/snippets/)
