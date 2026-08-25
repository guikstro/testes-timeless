import { buildMetaEventId } from "./build-meta-event-id";

describe("buildMetaEventId", () => {
  it("combines the lead id and event type deterministically", () => {
    expect(buildMetaEventId("lead-1", "LEAD")).toBe("lead-1:LEAD");
    expect(buildMetaEventId("lead-1", "QUALIFIED_LEAD")).toBe("lead-1:QUALIFIED_LEAD");
    expect(buildMetaEventId("lead-1", "PURCHASE")).toBe("lead-1:PURCHASE");
  });

  it("produces the same id for the same inputs every time (retry-safe)", () => {
    expect(buildMetaEventId("lead-42", "PURCHASE")).toBe(buildMetaEventId("lead-42", "PURCHASE"));
  });

  it("never collides across different leads or types", () => {
    expect(buildMetaEventId("lead-1", "LEAD")).not.toBe(buildMetaEventId("lead-2", "LEAD"));
    expect(buildMetaEventId("lead-1", "LEAD")).not.toBe(buildMetaEventId("lead-1", "QUALIFIED_LEAD"));
  });
});
