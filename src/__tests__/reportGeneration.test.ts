/**
 * Test for duplicate report generation bug
 */

import { describe, it, expect, jest } from '@jest/globals';

describe('Report Generation Bug Fix', () => {
  it('should verify that duplicate report generation code was removed', () => {
    // This is a simple test that ensures we don't have duplicate report generation
    // The real fix was removing the duplicate code block in monitor.ts
    
    // Read the monitor.ts file and verify there's only one report generation block
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../monitor.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Count occurrences of the specific report generation pattern
    const findLeaksMatches = content.match(/memlab.*find-leaks/g) || [];
    const reportGenerationBlocks = content.match(/🔍 Generating memlab analysis reports\.\.\./g) || [];
    
    // Should have references to memlab find-leaks (in comments and single implementation)
    expect(findLeaksMatches.length).toBeGreaterThan(0);
    
    // Should have only ONE report generation block
    expect(reportGenerationBlocks).toHaveLength(1);
    
    console.log(`✅ Found ${findLeaksMatches.length} memlab find-leaks references`);
    console.log(`✅ Found ${reportGenerationBlocks.length} report generation blocks (should be 1)`);
  });

  it('should verify clean snapshots command works', () => {
    // Test that the npm clean command is properly configured
    const packageJson = require('../../package.json');
    
    expect(packageJson.scripts.clean).toBe('rm -rf snapshots && mkdir snapshots');
    console.log('✅ Clean command properly configured:', packageJson.scripts.clean);
  });
});