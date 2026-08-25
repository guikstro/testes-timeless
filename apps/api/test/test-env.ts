import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Isolate e2e runs in their own Postgres schema so they never touch dev data,
// and use a fixed test secret so tokens are reproducible across runs.
const baseUrl = process.env.DATABASE_URL ?? "postgresql://tintim:tintim@localhost:5433/tintim";
const testUrl = new URL(baseUrl);
testUrl.searchParams.set("schema", "test");

process.env.DATABASE_URL = testUrl.toString();
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-e2e-only";
process.env.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "test-app-secret-e2e-only";
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "test-verify-token-e2e-only";
process.env.NODE_ENV = "test";

// A separate Redis DB index than dev (db 0) so this run's BullMQ queue is
// never picked up by an unrelated worker (e.g. the docker-compose dev
// worker) that happens to be running against the same Redis instance.
const redisBase = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
redisBase.pathname = "/1";
process.env.REDIS_URL = redisBase.toString();

export const TEST_DATABASE_URL = process.env.DATABASE_URL;
