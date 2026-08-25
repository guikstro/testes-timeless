import { Job } from "bullmq";
import { MetaConversionSendProcessor } from "./meta-conversion-send.processor";
import { MetaConversionSendService } from "./meta-conversion-send.service";
import { MetaConversionSendJob } from "../../common/queue/meta-conversion-send.job";

/**
 * `job.attemptsMade` counts only attempts completed *before* the current
 * call (0 on the very first invocation) — verified directly against
 * BullMQ's own source (job.js `shouldRetryJob`) during this phase's Docker
 * validation, after an earlier off-by-one here left events stuck in
 * RETRYING forever instead of ever reaching FAILED. See docs/META_CAPI.md.
 */
describe("MetaConversionSendProcessor", () => {
  function buildProcessor() {
    const metaConversionSendService = { send: jest.fn().mockResolvedValue(undefined) };
    const processor = new MetaConversionSendProcessor(metaConversionSendService as unknown as MetaConversionSendService);
    return { processor, metaConversionSendService };
  }

  function buildJob(attemptsMade: number, attempts: number): Job<MetaConversionSendJob> {
    return {
      id: "job-1",
      data: { conversionEventId: "event-1" },
      attemptsMade,
      opts: { attempts },
    } as unknown as Job<MetaConversionSendJob>;
  }

  it("passes isLastAttempt=false on the very first call (attemptsMade=0), even with a low attempts cap", async () => {
    const { processor, metaConversionSendService } = buildProcessor();

    await processor.process(buildJob(0, 5));

    expect(metaConversionSendService.send).toHaveBeenCalledWith("event-1", false);
  });

  it("passes isLastAttempt=false for every attempt before the last one", async () => {
    const { processor, metaConversionSendService } = buildProcessor();

    await processor.process(buildJob(3, 5)); // 4th call out of 5

    expect(metaConversionSendService.send).toHaveBeenCalledWith("event-1", false);
  });

  it("passes isLastAttempt=true exactly on the final configured attempt", async () => {
    const { processor, metaConversionSendService } = buildProcessor();

    await processor.process(buildJob(4, 5)); // 5th call out of 5 — the last one

    expect(metaConversionSendService.send).toHaveBeenCalledWith("event-1", true);
  });

  it("treats a missing attempts option as a single-attempt job", async () => {
    const { processor, metaConversionSendService } = buildProcessor();

    await processor.process(buildJob(0, undefined as unknown as number));

    expect(metaConversionSendService.send).toHaveBeenCalledWith("event-1", true);
  });

  it("re-throws so BullMQ still records and retries the failure", async () => {
    const { processor, metaConversionSendService } = buildProcessor();
    metaConversionSendService.send.mockRejectedValue(new Error("boom"));

    await expect(processor.process(buildJob(0, 5))).rejects.toThrow("boom");
  });
});
