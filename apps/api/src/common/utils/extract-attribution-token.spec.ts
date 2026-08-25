import { extractAttributionToken } from "./extract-attribution-token";

describe("extractAttributionToken", () => {
  it("extracts the token from the default greeting format", () => {
    expect(extractAttributionToken("Olá! [ref:AB12CD]")).toBe("AB12CD");
  });

  it("extracts the token even when the user edited the surrounding text", () => {
    expect(extractAttributionToken("oi tudo bem [ref:XYZ999] queria saber sobre o processo")).toBe("XYZ999");
  });

  it("returns null when there is no token", () => {
    expect(extractAttributionToken("Fui demitido e não recebi tudo")).toBeNull();
  });

  it("returns null for empty/undefined/null input instead of throwing", () => {
    expect(extractAttributionToken("")).toBeNull();
    expect(extractAttributionToken(undefined)).toBeNull();
    expect(extractAttributionToken(null)).toBeNull();
  });

  it("does not match a malformed marker", () => {
    expect(extractAttributionToken("[ref:]")).toBeNull();
    expect(extractAttributionToken("ref:AB12CD")).toBeNull();
  });
});
