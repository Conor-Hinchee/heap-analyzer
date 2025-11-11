/**
 * Memory analysis thresholds and configuration
 * Used for dynamic heap snapshot analysis without hardcoded assumptions
 */

export const MEMORY_THRESHOLDS = {
  // Object size thresholds (in bytes)
  LARGE_OBJECT: 1024 * 1024, // 1MB
  VERY_LARGE_OBJECT: 5 * 1024 * 1024, // 5MB
  SUSPICIOUS_OBJECT: 100 * 1024, // 100KB
  
  // Array size thresholds (number of elements)
  LARGE_ARRAY: 1000,
  VERY_LARGE_ARRAY: 10000,
  SUSPICIOUS_ARRAY: 100,
  
  // Growth analysis thresholds
  SUSPICIOUS_GROWTH_RATIO: 0.5, // 50% growth
  CRITICAL_GROWTH_RATIO: 2.0, // 200% growth
  MASSIVE_GROWTH_RATIO: 5.0, // 500% growth
  
  // Global scope analysis
  GLOBAL_SIZE_THRESHOLD: 100 * 1024, // 100KB
  MAX_REASONABLE_GLOBALS: 10,
  SUSPICIOUS_GLOBAL_COUNT: 20,
  
  // Event listener detection
  SUSPICIOUS_LISTENER_COUNT: 50,
  CRITICAL_LISTENER_COUNT: 200,
  
  // DOM analysis
  DETACHED_DOM_THRESHOLD: 10,
  SUSPICIOUS_DOM_SIZE: 50 * 1024, // 50KB
};

export const CONFIDENCE_LEVELS = {
  LOW: 30,
  MEDIUM: 50,
  HIGH: 70,
  VERY_HIGH: 85,
  CERTAIN: 95,
};

export const SEVERITY_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM', 
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type SeverityLevel = typeof SEVERITY_LEVELS[keyof typeof SEVERITY_LEVELS];

/**
 * Calculate memory leak confidence based on size and growth patterns
 */
export function calculateLeakConfidence(
  size: number,
  growthRatio: number = 0,
  objectCount: number = 1
): number {
  let confidence = 0;
  
  // Size-based confidence
  if (size > MEMORY_THRESHOLDS.VERY_LARGE_OBJECT) {
    confidence += 40;
  } else if (size > MEMORY_THRESHOLDS.LARGE_OBJECT) {
    confidence += 25;
  } else if (size > MEMORY_THRESHOLDS.SUSPICIOUS_OBJECT) {
    confidence += 15;
  }
  
  // Growth-based confidence
  if (growthRatio > MEMORY_THRESHOLDS.MASSIVE_GROWTH_RATIO) {
    confidence += 40;
  } else if (growthRatio > MEMORY_THRESHOLDS.CRITICAL_GROWTH_RATIO) {
    confidence += 25;
  } else if (growthRatio > MEMORY_THRESHOLDS.SUSPICIOUS_GROWTH_RATIO) {
    confidence += 15;
  }
  
  // Object count factor
  if (objectCount > 1000) {
    confidence += 15;
  } else if (objectCount > 100) {
    confidence += 10;
  }
  
  return Math.min(confidence, CONFIDENCE_LEVELS.CERTAIN);
}

/**
 * Determine severity level based on size, growth, and confidence
 */
export function calculateSeverity(
  size: number,
  confidence: number,
  growthRatio: number = 0
): SeverityLevel {
  if (confidence >= CONFIDENCE_LEVELS.VERY_HIGH && 
      (size > MEMORY_THRESHOLDS.VERY_LARGE_OBJECT || growthRatio > MEMORY_THRESHOLDS.CRITICAL_GROWTH_RATIO)) {
    return SEVERITY_LEVELS.CRITICAL;
  }
  
  if (confidence >= CONFIDENCE_LEVELS.HIGH && 
      (size > MEMORY_THRESHOLDS.LARGE_OBJECT || growthRatio > MEMORY_THRESHOLDS.SUSPICIOUS_GROWTH_RATIO)) {
    return SEVERITY_LEVELS.HIGH;
  }
  
  if (confidence >= CONFIDENCE_LEVELS.MEDIUM && size > MEMORY_THRESHOLDS.SUSPICIOUS_OBJECT) {
    return SEVERITY_LEVELS.MEDIUM;
  }
  
  return SEVERITY_LEVELS.LOW;
}
