import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// Redis client used for session storage and caching (when not in demo mode)
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

export { redisClient };
export default redisClient;
