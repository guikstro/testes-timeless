const { execSync } = require("child_process");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

/** Applies migrations to the isolated `test` schema before the e2e suite runs. */
module.exports = async function globalSetup() {
  const baseUrl = process.env.DATABASE_URL ?? "postgresql://tintim:tintim@localhost:5433/tintim";
  const testUrl = new URL(baseUrl);
  testUrl.searchParams.set("schema", "test");

  execSync("pnpm exec prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    stdio: "inherit",
  });
};
