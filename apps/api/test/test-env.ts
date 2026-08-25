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
process.env.NODE_ENV = "test";

export const TEST_DATABASE_URL = process.env.DATABASE_URL;
