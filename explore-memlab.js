import pkg from '@memlab/core';

console.log('Available exports:', Object.keys(pkg));
console.log('\nUtils:', Object.keys(pkg.utils || {}));

// Look for the leak detection APIs
if (pkg.findLeaks) {
  console.log('\n✅ findLeaks found!');
}
if (pkg.findLeaksBySnapshotFilePaths) {
  console.log('✅ findLeaksBySnapshotFilePaths found!');
}

// Look in other namespaces
console.log('\nExploring other namespaces...');
for (const [key, value] of Object.entries(pkg)) {
  if (typeof value === 'object' && value !== null) {
    console.log(`${key}:`, Object.keys(value));
  }
}