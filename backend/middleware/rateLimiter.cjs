/**
 * Rate Limiting Middleware for Prime ERP API
 * Protects against brute force attacks and API abuse
 */

// In-memory store for rate limiting (use Redis in production for distributed systems)
const rateLimitStore = new Map();

/**
 * Clean up expired entries from the store
 */
const cleanupStore = () => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupStore, 5 * 60 * 1000);

/**
 * General API rate limiter
 * Limits requests based on IP address
 */
const apiLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100,
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => req.ip || req.connection.remoteAddress,
    skipSuccessfulRequests = false
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    
    let record = rateLimitStore.get(key);
    
    if (!record || record.resetTime < now) {
      record = {
        count: 0,
        resetTime: now + windowMs
      };
      rateLimitStore.set(key, record);
    }
    
    record.count++;
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - record.count),
      'X-RateLimit-Reset': new Date(record.resetTime).toISOString()
    });
    
    if (record.count > maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message,
        retryAfter
      });
    }
    
    // Don't count successful requests if configured
    if (skipSuccessfulRequests && res.statusCode < 400) {
      record.count--;
    }
    
    next();
  };
};

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force login attempts
 */
const authLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxAttempts = 5,
    message = 'Too many login attempts, please try again later'
  } = options;

  return apiLimiter({
    windowMs,
    maxRequests: maxAttempts,
    message,
    keyGenerator: (req) => `auth:${req.ip || req.connection.remoteAddress}:${req.body?.username || 'unknown'}`
  });
};

/**
 * Rate limiter for sensitive operations
 * Stricter limits for financial transactions, user management, etc.
 */
const sensitiveLimiter = (options = {}) => {
  const {
    windowMs = 60 * 60 * 1000, // 1 hour
    maxRequests = 50,
    message = 'Too many sensitive operations, please try again later'
  } = options;

  return apiLimiter({
    windowMs,
    maxRequests,
    message
  });
};

/**
 * Rate limiter for file uploads
 * Prevents storage abuse
 */
const uploadLimiter = (options = {}) => {
  const {
    windowMs = 60 * 60 * 1000, // 1 hour
    maxRequests = 20,
    message = 'Upload limit reached, please try again later'
  } = options;

  return apiLimiter({
    windowMs,
    maxRequests,
    message
  });
};

/**
 * Reset rate limit for a specific key (e.g., after successful login)
 */
const resetRateLimit = (key) => {
  rateLimitStore.delete(key);
};

/**
 * Get current rate limit status for a key
 */
const getRateLimitStatus = (key) => {
  const record = rateLimitStore.get(key);
  if (!record) {
    return { remaining: null, reset: null };
  }
  return {
    remaining: record.count,
    reset: new Date(record.resetTime)
  };
};

const createLimiter = apiLimiter;

module.exports = {
  apiLimiter,
  authLimiter,
  sensitiveLimiter,
  uploadLimiter,
  resetRateLimit,
  getRateLimitStatus,
  createLimiter
};
