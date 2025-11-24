/**
 * Example Node.js server with heap snapshot debugging endpoints
 * This demonstrates how to integrate heap-analyzer with a Node.js application
 */

const express = require('express');
const app = express();
const port = 3000;

// Store some data that might leak
const globalCache = new Map();
const requestLog = [];
let userData = [];

// Middleware to log requests (potential memory leak if not cleaned)
app.use((req, res, next) => {
  requestLog.push({
    timestamp: new Date(),
    url: req.url,
    method: req.method,
    userAgent: req.get('User-Agent')
  });
  
  // This could leak if requestLog grows unbounded
  if (requestLog.length > 10000) {
    requestLog.splice(0, 5000); // Keep only last 5000 entries
  }
  
  next();
});

// Simulate some business logic that might leak memory
app.get('/api/data', (req, res) => {
  // Simulate loading user data (potential leak if not cleaned)
  const userId = req.query.userId || 'anonymous';
  
  if (!globalCache.has(userId)) {
    const expensiveData = {
      id: userId,
      largeArray: new Array(1000).fill(0).map((_, i) => ({
        index: i,
        data: `Large data string for item ${i}`,
        timestamp: new Date(),
        metadata: new Array(100).fill(`metadata-${i}`)
      }))
    };
    
    globalCache.set(userId, expensiveData);
  }
  
  res.json({
    message: 'Data loaded',
    userId,
    cacheSize: globalCache.size,
    requestCount: requestLog.length
  });
});

// Heavy computation endpoint that might cause memory pressure
app.get('/api/heavy', (req, res) => {
  const iterations = parseInt(req.query.iterations) || 1000;
  
  // Create temporary large objects
  const results = [];
  for (let i = 0; i < iterations; i++) {
    results.push({
      id: i,
      data: new Array(1000).fill(`heavy-computation-${i}`),
      timestamp: Date.now()
    });
  }
  
  // Add to global userData (potential leak)
  userData.push(...results.slice(0, 10)); // Keep some results
  
  res.json({
    message: 'Heavy computation completed',
    iterations,
    resultsSize: results.length,
    totalUserData: userData.length
  });
});

// Memory-intensive endpoint that allocates large buffers
app.get('/api/buffers', (req, res) => {
  const count = parseInt(req.query.count) || 10;
  const size = parseInt(req.query.size) || 1024 * 1024; // 1MB default
  
  const buffers = [];
  for (let i = 0; i < count; i++) {
    buffers.push(Buffer.alloc(size, `buffer-${i}`));
  }
  
  // Simulate processing delay
  setTimeout(() => {
    res.json({
      message: 'Buffers created',
      count,
      totalSize: count * size,
      cacheSizeKB: process.memoryUsage().heapUsed / 1024
    });
  }, 100);
});

// Clear cache endpoint (for testing cleanup)
app.post('/api/clear-cache', (req, res) => {
  const oldSize = globalCache.size;
  globalCache.clear();
  userData.length = 0;
  requestLog.length = 0;
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  res.json({
    message: 'Cache cleared',
    previousSize: oldSize,
    currentMemoryUsage: process.memoryUsage()
  });
});

// === HEAP ANALYSIS DEBUGGING ENDPOINTS ===

// Heap snapshot endpoint (for heap-analyzer integration)
app.get('/debug/heap-snapshot', (req, res) => {
  const filename = `heap-${Date.now()}.heapsnapshot`;
  
  try {
    require('v8').writeHeapSnapshot(filename);
    const stats = require('fs').statSync(filename);
    
    res.json({
      snapshot: filename,
      size: stats.size,
      timestamp: new Date().toISOString(),
      memoryUsage: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create heap snapshot',
      message: error.message
    });
  }
});

// Memory usage endpoint
app.get('/debug/memory', (req, res) => {
  const usage = process.memoryUsage();
  
  res.json({
    memory: {
      rss: Math.round(usage.rss / 1024 / 1024) + ' MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + ' MB',
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB',
      external: Math.round(usage.external / 1024 / 1024) + ' MB'
    },
    cache: {
      globalCacheSize: globalCache.size,
      userDataLength: userData.length,
      requestLogLength: requestLog.length
    },
    uptime: Math.round(process.uptime()) + ' seconds'
  });
});

// Force garbage collection endpoint (requires --expose-gc flag)
app.post('/debug/gc', (req, res) => {
  const beforeMemory = process.memoryUsage();
  
  if (global.gc) {
    global.gc();
    const afterMemory = process.memoryUsage();
    
    res.json({
      message: 'Garbage collection forced',
      before: {
        heapUsed: Math.round(beforeMemory.heapUsed / 1024 / 1024) + ' MB'
      },
      after: {
        heapUsed: Math.round(afterMemory.heapUsed / 1024 / 1024) + ' MB'
      },
      freed: Math.round((beforeMemory.heapUsed - afterMemory.heapUsed) / 1024 / 1024) + ' MB'
    });
  } else {
    res.status(400).json({
      error: 'Garbage collection not available',
      message: 'Start with --expose-gc flag to enable manual GC'
    });
  }
});

// Process info endpoint
app.get('/debug/process', (req, res) => {
  res.json({
    pid: process.pid,
    version: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    cwd: process.cwd(),
    argv: process.argv,
    memoryUsage: process.memoryUsage()
  });
});

// === SETUP AUTOMATIC HEAP MONITORING ===

// Enable heap snapshot on SIGUSR2 signal
process.on('SIGUSR2', () => {
  const filename = `heap-signal-${Date.now()}.heapsnapshot`;
  require('v8').writeHeapSnapshot(filename);
  console.log(`📸 Heap snapshot written to ${filename} (triggered by SIGUSR2)`);
});

// Monitor memory usage and warn on high usage
let lastMemoryCheck = Date.now();
setInterval(() => {
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
  
  // Log memory usage every 30 seconds
  if (Date.now() - lastMemoryCheck > 30000) {
    console.log(`📊 Memory: ${heapUsedMB}MB heap, ${globalCache.size} cached users, ${requestLog.length} logged requests`);
    lastMemoryCheck = Date.now();
  }
  
  // Warn on high memory usage
  if (heapUsedMB > 500) {
    console.warn(`⚠️ High memory usage: ${heapUsedMB}MB`);
    
    // Auto-snapshot on very high usage
    if (heapUsedMB > 1000) {
      const filename = `heap-auto-${Date.now()}.heapsnapshot`;
      require('v8').writeHeapSnapshot(filename);
      console.log(`🚨 Auto heap snapshot: ${filename} (memory: ${heapUsedMB}MB)`);
    }
  }
}, 5000); // Check every 5 seconds

// Start server
app.listen(port, () => {
  console.log(`🚀 Example Node.js server running at http://localhost:${port}`);
  console.log(`📊 Memory debugging endpoints:`);
  console.log(`   GET  /debug/memory - Current memory usage`);
  console.log(`   GET  /debug/heap-snapshot - Take heap snapshot`);
  console.log(`   POST /debug/gc - Force garbage collection`);
  console.log(`   GET  /debug/process - Process information`);
  console.log(`\n🎯 Test endpoints:`);
  console.log(`   GET  /api/data - Load user data into cache`);
  console.log(`   GET  /api/heavy - Heavy computation`);
  console.log(`   GET  /api/buffers - Allocate large buffers`);
  console.log(`   POST /api/clear-cache - Clear all caches`);
  console.log(`\n💡 heap-analyzer commands:`);
  console.log(`   npx heap-analyzer node-snapshot --endpoint http://localhost:${port}/debug/heap-snapshot`);
  console.log(`   npx heap-analyzer node-monitor --pid ${process.pid}`);
  console.log(`   npx heap-analyzer node-load-test http://localhost:${port}/api/heavy --endpoint http://localhost:${port}/debug/heap-snapshot`);
  console.log(`\n🔧 Process ID: ${process.pid}`);
  console.log(`💡 Send SIGUSR2 signal to take heap snapshot: kill -USR2 ${process.pid}`);
});

module.exports = app;