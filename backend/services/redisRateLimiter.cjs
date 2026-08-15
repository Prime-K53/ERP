/**
 * Distributed Rate Limiter for Prime ERP API
 * Uses Redis when available, falls back to in-memory store.
 */
let Redis;
try {
  Redis = require('ioredis');
} catch {
  // Redis not available, will use in-memory fallback
}

const isRedisAvailable = () => {
  if (!Redis) return false;
  try {
    return !!(global.__redisClient && global.__redisClient.status === 'ready');
  } catch {
    return false;
  }
};

const getRedisClient = () => {
  if (!Redis) return null;
  if (!global.__redisClient) {
    const redisUrl = process.env.REDIS_URL || '';
    if (!redisUrl) return null;
    try {
      global.__redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        lazyConnect: true,
      });
      global.__redisClient.connect().catch(() => {});
      global.__redisClient.on('error', (err) => {
        console.warn('[Redis] Connection error, falling back to in-memory:', err.message);
      });
    } catch {
      return null;
    }
  }
  return global.__redisClient;
};

// In-memory fallback store
const memoryStore = new Map();

const cleanupMemoryStore = () => {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (value.resetTime < now) {
      memoryStore.delete(key);
    }
  }
};
setInterval(cleanupMemoryStore, 5 * 60 * 1000);

/**
 * Generic sliding-window rate limiter.
 * Backed by Redis when available, falls back to in-memory Map.
 */
const createLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    maxRequests = 100,
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => req.ip || req.connection?.remoteAddress || 'unknown',
    skipSuccessfulRequests = false,
  } = options;

  return async (req, res, next) => {
    // Skip rate limiting for preflight requests
    if (req.method === 'OPTIONS') return next();

    const key = keyGenerator(req);

    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        const now = Date.now();
        const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`;

        const count = await client.incr(windowKey);
        if (count === 1) {
          await client.pexpire(windowKey, windowMs);
        }

        res.set({
          'X-RateLimit-Limit': maxRequests,
          'X-RateLimit-Remaining': Math.max(0, maxRequests - count),
          'X-RateLimit-Reset': new Date(now + windowMs).toISOString(),
        });

        if (count > maxRequests) {
          const ttl = await client.pttl(windowKey);
          const retryAfter = Math.ceil(ttl / 1000);
          res.set('Retry-After', retryAfter);
          return res.status(429).json({
            error: 'Rate limit exceeded',
            message,
            retryAfter,
          });
        }

        return next();
      } catch (err) {
        console.warn('[Redis] Rate limit error, falling back to in-memory:', err.message);
      }
    }

    // In-memory fallback
    const now = Date.now();
    let record = memoryStore.get(key);

    if (!record || record.resetTime < now) {
      record = { count: 0, resetTime: now + windowMs };
      memoryStore.set(key, record);
    }

    record.count++;

    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - record.count),
      'X-RateLimit-Reset': new Date(record.resetTime).toISOString(),
    });

    if (record.count > maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message,
        retryAfter,
      });
    }

    if (skipSuccessfulRequests && res.statusCode < 400) {
      record.count--;
    }

    next();
  };
};

/**
 * Strict rate limiter for authentication endpoints.
 */
const authLimiter = (options = {}) => createLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many login attempts, please try again later',
  keyGenerator: (req) => `auth:${req.ip || req.connection?.remoteAddress || 'unknown'}:${req.body?.username || 'unknown'}`,
  ...options,
});

/**
 * Rate limiter for sensitive operations.
 */
const sensitiveLimiter = (options = {}) => createLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 50,
  message: 'Too many sensitive operations, please try again later',
  ...options,
});

/**
 * Rate limiter for file uploads.
 */
const uploadLimiter = (options = {}) => createLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 20,
  message: 'Upload limit reached, please try again later',
  ...options,
});

const resetRateLimit = async (key) => {
  if (isRedisAvailable()) {
    try {
      const client = getRedisClient();
      const pattern = `ratelimit:${key}:*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(keys);
    } catch {
      // fall through to memory
    }
  }
  memoryStore.delete(key);
};

const getRateLimitStatus = (key) => {
  const record = memoryStore.get(key);
  if (!record) return { remaining: null, reset: null };
  return { remaining: record.count, reset: new Date(record.resetTime) };
};

module.exports = {
  createLimiter,
  authLimiter,
  sensitiveLimiter,
  uploadLimiter,
  resetRateLimit,
  getRateLimitStatus,
};
