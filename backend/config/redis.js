const isRedisEnabled = process.env.REDIS_ENABLED === 'true';

let redis = null;
let redisReady = false;

if (isRedisEnabled && process.env.REDIS_HOST && process.env.REDIS_HOST !== '127.0.0.1') {
  try {
    const { Redis } = require("ioredis");
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) {
          console.warn("⚠️ Redis unavailable, running without cache");
          redisReady = false;
          return null;
        }
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
    });

    redis.on("connect", () => {
      redisReady = true;
      console.log("✅ Redis connected");
    });

    redis.on("error", () => {
      redisReady = false;
    });

    redis.on("close", () => {
      redisReady = false;
    });

    redis.connect().catch(() => {
      redisReady = false;
      console.warn("⚠️ Redis not available, app will run without cache");
    });
  } catch (err) {
    console.warn("⚠️ Redis init failed, running without cache");
  }
} else {
  console.log("ℹ️ Redis is disabled, running without cache");
}

const noopAsync = async () => null;
const NOOP_METHODS = ['get', 'set', 'setex', 'del', 'keys', 'flushall', 'expire', 'ttl', 'exists', 'mget', 'mset', 'hget', 'hset', 'hdel', 'hgetall'];

const redisProxy = new Proxy({}, {
  get(_target, prop) {
    if (!redis || !redisReady) {
      if (NOOP_METHODS.includes(String(prop))) {
        return noopAsync;
      }
      if (prop === 'status') return 'end';
      return undefined;
    }
    return redis[prop];
  }
});

module.exports = redisProxy;
