let QuickLRU;
let responseCache;
let processedCasts;

// Initialize the LRU caches in an async context
async function initializeCaches() {
  try {
    QuickLRU = (await import('quick-lru')).default;
    
    // Initialize caches after QuickLRU is loaded
    responseCache = new QuickLRU({ maxSize: 500, maxAge: 5 * 60 * 1000 });
    processedCasts = new QuickLRU({ maxSize: 1000, maxAge: 10 * 60 * 1000 });
    
    return { responseCache, processedCasts };
  } catch (error) {
    console.error('Failed to initialize LRU caches:', error);
    throw error;
  }
}

// Export the initialization function and cache instances
export { initializeCaches, responseCache, processedCasts }; 