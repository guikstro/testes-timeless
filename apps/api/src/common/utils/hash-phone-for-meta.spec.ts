import * as crypto from "crypto";
import { hashPhoneForMeta } from "./hash-phone-for-meta";

describe("hashPhoneForMeta", () => {
  it("hashes the digits-only phone (leading + stripped) with SHA-256", () => {
    const expected = crypto.createHash("sha256").update("5585999999999").digest("hex");
    expect(hashPhoneForMeta("+5585999999999")).toBe(expected);
  });

  it("is deterministic for the same input", () => {
    expect(hashPhoneForMeta("+5585999999999")).toBe(hashPhoneForMeta("+5585999999999"));
  });

  it("never leaks the raw phone number in the output", () => {
    expect(hashPhoneForMeta("+5585999999999")).not.toContain("5585999999999");
  });
});
