import * as crypto from "crypto";
import { Queue } from "bullmq";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";
import { WhatsAppConnectionsService } from "../integrations/whatsapp/whatsapp-connections.service";

describe("WhatsAppWebhookService", () => {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;
  const originalToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  beforeAll(() => {
    process.env.WHATSAPP_APP_SECRET = "test-secret";
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
  });

  afterAll(() => {
    process.env.WHATSAPP_APP_SECRET = originalSecret;
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = originalToken;
  });

  function buildService() {
    const queue = { add: jest.fn() };
    const connections = { syncEvolutionState: jest.fn() };
    const service = new WhatsAppWebhookService(
      queue as unknown as Queue,
      connections as unknown as WhatsAppConnectionsService,
    );
    return { service, queue, connections };
  }

  describe("verifyHandshake", () => {
    it("accepts the correct mode + verify token", () => {
      const { service } = buildService();
      expect(service.verifyHandshake("subscribe", "test-verify-token")).toBe(true);
    });

    it("rejects a wrong verify token", () => {
      const { service } = buildService();
      expect(service.verifyHandshake("subscribe", "wrong-token")).toBe(false);
    });

    it("rejects a mode other than subscribe", () => {
      const { service } = buildService();
      expect(service.verifyHandshake("unsubscribe", "test-verify-token")).toBe(false);
    });
  });

  describe("verifySignature", () => {
    it("accepts a correctly signed body", () => {
      const { service } = buildService();
      const body = Buffer.from(JSON.stringify({ a: 1 }));
      const signature = `sha256=${crypto.createHmac("sha256", "test-secret").update(body).digest("hex")}`;
      expect(service.verifySignature(body, signature)).toBe(true);
    });

    it("rejects when WHATSAPP_APP_SECRET isn't configured, rather than skipping verification", () => {
      const { service } = buildService();
      delete process.env.WHATSAPP_APP_SECRET;
      const body = Buffer.from(JSON.stringify({ a: 1 }));

      expect(service.verifySignature(body, "sha256=whatever")).toBe(false);

      process.env.WHATSAPP_APP_SECRET = "test-secret";
    });
  });

  describe("enqueueEvents", () => {
    it("enqueues one job per message using the message id as the BullMQ job id", async () => {
      const { service, queue } = buildService();
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "phone-1" },
                  contacts: [{ profile: { name: "João" } }],
                  messages: [
                    { from: "5585999999999", id: "wamid.ABC", timestamp: "1700000000", type: "text", text: { body: "oi" } },
                  ],
                },
              },
            ],
          },
        ],
      };

      const count = await service.enqueueEvents(payload);

      expect(count).toBe(1);
      expect(queue.add).toHaveBeenCalledWith(
        "inbound-message",
        expect.objectContaining({ messageId: "wamid.ABC" }),
        expect.objectContaining({ jobId: "wamid.ABC" }),
      );
    });

    it("enqueues nothing for a payload with no messages (e.g. a status update)", async () => {
      const { service, queue } = buildService();
      await service.enqueueEvents({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "phone-1" } } }] }] });
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
