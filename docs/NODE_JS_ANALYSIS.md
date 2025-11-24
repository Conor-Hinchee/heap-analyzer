# Node.js Heap Analysis Guide

## 🖥️ Node.js vs Browser Analysis

### Key Differences

| Aspect | Browser | Node.js |
|--------|---------|---------|
| **Snapshot Generation** | DevTools UI | Programmatic/CLI tools |
| **Memory Patterns** | DOM, Events, Closures | Modules, Streams, Global State |
| **Analysis Focus** | User interactions, SPA | Server requests, background jobs |
| **Common Leaks** | Event listeners, timers | Database connections, file handles |
| **Tooling** | DevTools, heap-analyzer | Inspector, heap-analyzer + Node tools |

## 🔧 Node.js Snapshot Generation

### Method 1: V8 Inspector (Recommended)
```js
// In your Node.js app
const inspector = require('inspector');
const fs = require('fs');

// Start inspector session
const session = new inspector.Session();
session.connect();

// Take heap snapshot
function takeHeapSnapshot(filename) {
  return new Promise((resolve) => {
    const fd = fs.openSync(filename, 'w');
    
    session.on('HeapProfiler.addHeapSnapshotChunk', (m) => {
      fs.writeSync(fd, m.params.chunk);
    });
    
    session.post('HeapProfiler.takeHeapSnapshot', null, () => {
      fs.closeSync(fd);
      console.log(`Heap snapshot written to ${filename}`);
      resolve();
    });
  });
}

// Usage in your app
await takeHeapSnapshot('heap-baseline.heapsnapshot');
// ... perform memory-intensive operations ...
await takeHeapSnapshot('heap-after.heapsnapshot');
```

### Method 2: Process Signals
```js
// Add to your Node.js app
process.on('SIGUSR2', () => {
  const filename = `heap-${Date.now()}.heapsnapshot`;
  require('v8').writeHeapSnapshot(filename);
  console.log(`Heap snapshot written to ${filename}`);
});
```

```bash
# In another terminal, trigger snapshot
kill -USR2 <node-process-pid>
```

### Method 3: HTTP Endpoint
```js
// Add debugging endpoint to your Express app
app.get('/debug/heap-snapshot', (req, res) => {
  const filename = `heap-${Date.now()}.heapsnapshot`;
  require('v8').writeHeapSnapshot(filename);
  res.json({ snapshot: filename, size: require('fs').statSync(filename).size });
});
```

## 🎯 Node.js Analysis Workflow

### 1. Generate Snapshots During Load Testing
```bash
# Terminal 1: Start your Node.js app with heap snapshot capability
node --inspect app.js

# Terminal 2: Take baseline snapshot
curl http://localhost:3000/debug/heap-snapshot

# Terminal 3: Run load tests
npx autocannon -c 10 -d 30s http://localhost:3000/api/heavy-endpoint

# Terminal 2: Take after-load snapshot
curl http://localhost:3000/debug/heap-snapshot
```

### 2. Analyze with heap-analyzer
```bash
# Standard analysis workflow
npx heap-analyzer compare heap-1634567890123.heapsnapshot heap-1634567920456.heapsnapshot

# Find leaks
npx heap-analyzer find-leaks --baseline heap-baseline.heapsnapshot --target heap-after-load.heapsnapshot --trace-all-objects

# Inspect specific objects
npx heap-analyzer inspect-object heap-after-load.heapsnapshot --object-id @123456
```

## 🔍 Common Node.js Memory Leak Patterns

### 1. Global Variable Accumulation
**Problem:**
```js
// Leaky pattern
const cache = {}; // Global cache that never clears

app.get('/api/data/:id', (req, res) => {
  const id = req.params.id;
  if (!cache[id]) {
    cache[id] = expensiveComputation(id); // Cache grows forever
  }
  res.json(cache[id]);
});
```

**Solution:**
```js
// Use LRU cache with size limits
const LRU = require('lru-cache');
const cache = new LRU({ max: 1000, ttl: 1000 * 60 * 10 }); // 1000 items, 10min TTL
```

### 2. Event Listener Accumulation
**Problem:**
```js
// Each request adds listeners that never get removed
app.get('/api/stream', (req, res) => {
  const stream = getDataStream();
  
  stream.on('data', (chunk) => res.write(chunk));
  stream.on('end', () => res.end());
  // Missing: stream.removeAllListeners() on request end
});
```

**Solution:**
```js
app.get('/api/stream', (req, res) => {
  const stream = getDataStream();
  
  const onData = (chunk) => res.write(chunk);
  const onEnd = () => {
    stream.removeListener('data', onData);
    stream.removeListener('end', onEnd);
    res.end();
  };
  
  stream.on('data', onData);
  stream.on('end', onEnd);
  
  // Cleanup on client disconnect
  req.on('close', () => {
    stream.removeListener('data', onData);
    stream.removeListener('end', onEnd);
  });
});
```

### 3. Database Connection Leaks
**Problem:**
```js
// Connections not properly returned to pool
app.get('/api/users', async (req, res) => {
  const connection = await pool.getConnection();
  const users = await connection.query('SELECT * FROM users');
  res.json(users);
  // Missing: connection.release()
});
```

**Solution:**
```js
app.get('/api/users', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const users = await connection.query('SELECT * FROM users');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
});
```

### 4. Timer/Interval Leaks
**Problem:**
```js
const userSessions = new Map();

app.post('/api/login', (req, res) => {
  const sessionId = generateSessionId();
  
  // Timer never gets cleared if user doesn't logout properly
  const timeout = setTimeout(() => {
    userSessions.delete(sessionId);
  }, 30 * 60 * 1000); // 30 minutes
  
  userSessions.set(sessionId, { user: req.body.user, timeout });
  res.json({ sessionId });
});
```

**Solution:**
```js
app.post('/api/logout', (req, res) => {
  const session = userSessions.get(req.body.sessionId);
  if (session) {
    clearTimeout(session.timeout); // Important: clear the timer
    userSessions.delete(req.body.sessionId);
  }
  res.json({ success: true });
});
```

## 📊 Node.js-Specific Analysis Commands

### Memory Profiling Integration
```bash
# Generate heap snapshots during profiling
node --inspect --heapsnapshot-signal=SIGUSR2 app.js

# In another terminal
kill -USR2 $(pgrep -f "node.*app.js")
```

### Load Testing with Memory Analysis
```bash
# Start app with heap snapshot endpoint
node app.js

# Baseline snapshot
npx heap-analyzer node-snapshot --endpoint http://localhost:3000/debug/heap-snapshot --output baseline.heapsnapshot

# Run load test
npx autocannon -c 50 -d 60s http://localhost:3000/api/heavy-endpoint

# After-load snapshot  
npx heap-analyzer node-snapshot --endpoint http://localhost:3000/debug/heap-snapshot --output after-load.heapsnapshot

# Analysis
npx heap-analyzer find-leaks --baseline baseline.heapsnapshot --target after-load.heapsnapshot --trace-all-objects
```

## 🎯 Node.js Monitoring Best Practices

### 1. Automated Snapshot Collection
```js
// Add to your app startup
const heapSnapshotScheduler = () => {
  setInterval(() => {
    const memoryUsage = process.memoryUsage();
    
    // Take snapshot if memory usage is high
    if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB threshold
      const filename = `heap-auto-${Date.now()}.heapsnapshot`;
      require('v8').writeHeapSnapshot(filename);
      console.log(`Auto heap snapshot: ${filename}, heapUsed: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
};
```

### 2. Memory Alerts
```js
// Monitor memory usage and alert on growth
let baselineMemory = process.memoryUsage().heapUsed;

setInterval(() => {
  const currentMemory = process.memoryUsage().heapUsed;
  const growth = ((currentMemory - baselineMemory) / baselineMemory) * 100;
  
  if (growth > 50) { // 50% growth threshold
    console.warn(`Memory growth detected: ${growth.toFixed(2)}% increase`);
    
    // Take snapshot for analysis
    const filename = `heap-alert-${Date.now()}.heapsnapshot`;
    require('v8').writeHeapSnapshot(filename);
    
    // Reset baseline
    baselineMemory = currentMemory;
  }
}, 2 * 60 * 1000); // Check every 2 minutes
```

### 3. Production Memory Monitoring
```js
// Safe production monitoring
const monitorMemory = () => {
  const usage = process.memoryUsage();
  const formatMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
  
  console.log(`Memory: RSS=${formatMB(usage.rss)}MB, Heap=${formatMB(usage.heapUsed)}/${formatMB(usage.heapTotal)}MB, External=${formatMB(usage.external)}MB`);
  
  // Log to monitoring system (DataDog, New Relic, etc.)
  metrics.gauge('nodejs.memory.rss', usage.rss);
  metrics.gauge('nodejs.memory.heap_used', usage.heapUsed);
  metrics.gauge('nodejs.memory.heap_total', usage.heapTotal);
};

setInterval(monitorMemory, 30000); // Every 30 seconds
```

## 🔧 Integration with Existing Node.js Tools

### PM2 Integration
```js
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'my-app',
    script: 'app.js',
    node_args: '--inspect --heapsnapshot-signal=SIGUSR2',
    env: {
      NODE_ENV: 'production',
      HEAP_SNAPSHOT_DIR: './heap-snapshots'
    }
  }]
};
```

### Docker Integration
```dockerfile
# Dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install

# Install heap-analyzer
RUN npm install -g heap-analyzer

# Create heap snapshot directory
RUN mkdir -p /app/heap-snapshots

# Start with heap snapshot capability
CMD ["node", "--inspect=0.0.0.0:9229", "--heapsnapshot-signal=SIGUSR2", "app.js"]
```

### Kubernetes Health Checks
```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        image: my-app
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          # Custom memory check
          exec:
            command:
            - sh
            - -c
            - |
              MEMORY=$(node -e "console.log(process.memoryUsage().heapUsed)")
              if [ $MEMORY -gt 536870912 ]; then # 512MB threshold
                exit 1
              fi
```