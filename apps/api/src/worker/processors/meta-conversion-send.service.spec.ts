import * as crypto from "crypto";
import { MetaConversionSendService } from "./meta-conversion-send.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { MetaGraphClient } from "../../integrations/meta/meta-graph-client";

describe("MetaConversionSendService", () => {
  function buildService() {
    const prisma = {
      conversionEvent: { findUnique: jest.fn(), update: jest.fn() },
      metaConnection: { findUnique: jest.fn() },
    };
    const encryption = { decrypt: jest.fn((value: string) => value.replace("encrypted(", "").replace(")", "")) };
    const metaGraphClient = { sendConversionEvent: jest.fn().mockResolvedValue({ events_received: 1, fbtrace_id: "trace-1" }) };
    const service = new MetaConversionSendService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
      metaGraphClient as unknown as MetaGraphClient,
    );
    return { service, prisma, encryption, metaGraphClient };
  }

  function eventRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "event-1",
      organizationId: "org-1",
      leadId: "lead-1",
      type: "LEAD",
      status: "PENDING",
      valueCents: null,
      currency: null,
      occurredAt: new Date("2026-01-01T00:00:00Z"),
      lead: { normalizedPhone: "+5585999999999", attribution: null },
      ...overrides,
    };
  }

  function connectionRow(overrides: Record<string, unknown> = {}) {
    return {
      organizationId: "org-1",
      status: "CONNECTED",
      pixelId: "1234567890",
      capiAccessTokenEncrypted: "encrypted(capi-token)",
      ...overrides,
    };
  }

  it("does nothing when the event was deleted", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(null);

    await service.send("event-1", false);

    expect(metaGraphClient.sendConversionEvent).not.toHaveBeenCalled();
  });

  it("never sends the same event twice — a SENT row is left untouched", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(eventRow({ status: "SENT" }));

    await service.send("event-1", false);

    expect(metaGraphClient.sendConversionEvent).not.toHaveBeenCalled();
    expect(prisma.conversionEvent.update).not.toHaveBeenCalled();
  });

  it("fails terminally, without throwing, when the Meta connection is disconnected", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(eventRow());
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow({ status: "DISCONNECTED" }));

    await expect(service.send("event-1", false)).resolves.not.toThrow();

    expect(metaGraphClient.sendConversionEvent).not.toHaveBeenCalled();
    expect(prisma.conversionEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
  });

  it("fails terminally when there is no Meta connection at all (deleted between enqueue and send)", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(eventRow());
    prisma.metaConnection.findUnique.mockResolvedValue(null);

    await service.send("event-1", false);

    expect(metaGraphClient.sendConversionEvent).not.toHaveBeenCalled();
    expect(prisma.conversionEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
  });

  it("fails terminally when Conversions API was never configured (no pixel id / capi token)", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(eventRow());
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow({ pixelId: null, capiAccessTokenEncrypted: null }));

    await service.send("event-1", false);

    expect(metaGraphClient.sendConversionEvent).not.toHaveBeenCalled();
  });

  it("refuses to send a PURCHASE with no value, instead of sending a malformed event", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(eventRow({ type: "PURCHASE", valueCents: null, currency: null }));
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());

    await service.send("event-1", false);

    expect(metaGraphClient.sendConversionEvent).not.toHaveBeenCalled();
    expect(prisma.conversionEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
  });

  it("sends a Lead event with the phone hashed (never in the clear) and marks it SENT", async () => {
    const { service, prisma, metaGraphClient, encryption } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(eventRow());
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());

    await service.send("event-1", false);

    expect(encryption.decrypt).toHaveBeenCalledWith("encrypted(capi-token)");
    const [pixelId, accessToken, payload] = metaGraphClient.sendConversionEvent.mock.calls[0];
    expect(pixelId).toBe("1234567890");
    expect(accessToken).toBe("capi-token");
    expect(payload.event_name).toBe("Lead");
    expect(payload.event_id).toBe("lead-1:LEAD");
    expect(payload.event_time).toBe(Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000));
    expect(payload.action_source).toBe("business_messaging");
    expect(payload.messaging_channel).toBe("whatsapp");
    expect(payload.user_data.ph).toEqual([crypto.createHash("sha256").update("5585999999999").digest("hex")]);
    expect(payload.user_data.ctwa_clid).toBeUndefined();
    expect(payload.custom_data).toBeUndefined();

    expect(prisma.conversionEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { status: "SENT", sentAt: expect.any(Date), attempts: { increment: 1 }, lastError: null },
    });
  });

  it("includes ctwa_clid only when the lead's attribution method is CTWA_REFERRAL", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(
      eventRow({
        lead: {
          normalizedPhone: "+5585999999999",
          attribution: { method: "CTWA_REFERRAL", evidence: { ctwaClid: "ctwa.abc123" } },
        },
      }),
    );
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());

    await service.send("event-1", false);

    const payload = metaGraphClient.sendConversionEvent.mock.calls[0][2];
    expect(payload.user_data.ctwa_clid).toBe("ctwa.abc123");
  });

  it("never includes ctwa_clid for a TRACKING_LINK or UNKNOWN attribution", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(
      eventRow({ lead: { normalizedPhone: "+5585999999999", attribution: { method: "TRACKING_LINK", evidence: {} } } }),
    );
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());

    await service.send("event-1", false);

    const payload = metaGraphClient.sendConversionEvent.mock.calls[0][2];
    expect(payload.user_data.ctwa_clid).toBeUndefined();
  });

  it("sends a Purchase event with value converted from cents to a decimal, and the organization's currency", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(
      eventRow({ type: "PURCHASE", valueCents: 200000, currency: "BRL" }),
    );
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());

    await service.send("event-1", false);

    const payload = metaGraphClient.sendConversionEvent.mock.calls[0][2];
    expect(payload.event_name).toBe("Purchase");
    expect(payload.custom_data).toEqual({ value: 2000, currency: "BRL" });
  });

  it("maps QUALIFIED_LEAD to the custom event name 'QualifiedLead'", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(eventRow({ type: "QUALIFIED_LEAD" }));
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());

    await service.send("event-1", false);

    expect(metaGraphClient.sendConversionEvent.mock.calls[0][2].event_name).toBe("QualifiedLead");
  });

  it("marks RETRYING (not FAILED) and re-throws when a send fails but attempts remain", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(eventRow());
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
    metaGraphClient.sendConversionEvent.mockRejectedValue(new Error("network timeout"));

    await expect(service.send("event-1", false)).rejects.toThrow("network timeout");

    expect(prisma.conversionEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { status: "RETRYING", attempts: { increment: 1 }, lastError: "network timeout" },
    });
  });

  it("marks FAILED (terminal) and still re-throws when this was the last configured attempt", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.conversionEvent.findUnique.mockResolvedValue(eventRow());
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
    metaGraphClient.sendConversionEvent.mockRejectedValue(new Error("Invalid OAuth access token"));

    await expect(service.send("event-1", true)).rejects.toThrow("Invalid OAuth access token");

    expect(prisma.conversionEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { status: "FAILED", attempts: { increment: 1 }, lastError: "Invalid OAuth access token" },
    });
  });
});
