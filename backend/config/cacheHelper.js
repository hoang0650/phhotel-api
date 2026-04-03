const redis = require("./redis");

const DEFAULT_TTL = 3600;

async function getCache(key) {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`Cache get error for key ${key}:`, error);
    return null;
  }
}

async function setCache(key, value, ttl = DEFAULT_TTL) {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Cache set error for key ${key}:`, error);
    return false;
  }
}

async function deleteCachePattern(pattern) {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return true;
  } catch (error) {
    console.error(`Cache delete pattern error for ${pattern}:`, error);
    return false;
  }
}

async function invalidateHotelCache(hotelId) {
  try {
    await deleteCachePattern(`hotel:${hotelId}:*`);
    await deleteCachePattern(`rooms:${hotelId}:*`);
    await deleteCachePattern(`priceConfig:${hotelId}:*`);
    await deleteCachePattern(`guests:${hotelId}:*`);
    await deleteCachePattern(`bookings:${hotelId}:*`);
    await deleteCachePattern(`users:${hotelId}:*`);
    return true;
  } catch (error) {
    console.error(`Error invalidating hotel cache for ${hotelId}:`, error);
    return false;
  }
}

function generateCacheKey(prefix, ...parts) {
  return `${prefix}:${parts.join(":")}`;
}

module.exports = {
  getCache,
  setCache,
  deleteCachePattern,
  invalidateHotelCache,
  generateCacheKey,
  DEFAULT_TTL
};