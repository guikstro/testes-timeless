/** Shared by both the API (producer) and worker (consumer) BullMQ setups. */
export function getRedisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  const dbIndex = url.pathname.replace("/", "");

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    ...(dbIndex ? { db: Number(dbIndex) } : {}),
    // BullMQ requirement: blocking commands must not be limited by ioredis's
    // own retry cap, or long-polling connections error out under load.
    maxRetriesPerRequest: null,
  };
}
