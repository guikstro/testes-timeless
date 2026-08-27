import { parseEvolutionPayload } from "./parse-evolution-payload";

function buildMessagePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: "messages.upsert",
    instance: "org-123",
    data: {
      key: { remoteJid: "5585999999999@s.whatsapp.net", fromMe: false, id: "3EB0ABC" },
      pushName: "João",
      messageTimestamp: 1700000000,
      message: { conversation: "Fui demitido e não recebi tudo" },
      ...overrides,
    },
  };
}

describe("parseEvolutionPayload", () => {
  it("normalizes an inbound text message into exactly the shape the Cloud API parser produces", () => {
    const parsed = parseEvolutionPayload(buildMessagePayload());

    expect(parsed).toEqual({
      kind: "message",
      job: {
        provider: "EVOLUTION",
        routingKey: "org-123",
        waId: "5585999999999",
        profileName: "João",
        messageId: "3EB0ABC",
        type: "text",
        text: "Fui demitido e não recebi tudo",
        timestampSeconds: 1700000000,
        referral: undefined,
      },
    });
  });

  it("reads the text of an extendedTextMessage (reply/quote), not only a plain conversation", () => {
    const parsed = parseEvolutionPayload(
      buildMessagePayload({ message: { extendedTextMessage: { text: "respondendo aqui" } } }),
    );

    expect(parsed).toMatchObject({ job: { type: "text", text: "respondendo aqui" } });
  });

  it("marks a media message as type OTHER with no text, instead of dropping it", () => {
    const parsed = parseEvolutionPayload(buildMessagePayload({ message: { imageMessage: { url: "x" } } }));

    expect(parsed).toMatchObject({ job: { type: "other", text: undefined } });
  });

  it("ignores our own outgoing messages (fromMe), so a reply never creates or re-qualifies a lead", () => {
    const parsed = parseEvolutionPayload(
      buildMessagePayload({ key: { remoteJid: "5585999999999@s.whatsapp.net", fromMe: true, id: "3EB0MINE" } }),
    );

    expect(parsed).toBeNull();
  });

  it("ignores group messages — this product tracks 1:1 conversations with a lead", () => {
    const parsed = parseEvolutionPayload(
      buildMessagePayload({ key: { remoteJid: "123456@g.us", fromMe: false, id: "3EB0GROUP" } }),
    );

    expect(parsed).toBeNull();
  });

  it("carries the ctwa_clid through when the conversation started from a Click-to-WhatsApp ad", () => {
    const parsed = parseEvolutionPayload(
      buildMessagePayload({
        contextInfo: {
          ctwaClid: "ctwa.abc123",
          externalAdReply: { sourceId: "ad-1", sourceUrl: "https://fb.me/x", title: "Rescisão indireta" },
        },
      }),
    );

    expect(parsed).toMatchObject({
      job: {
        referral: {
          ctwaClid: "ctwa.abc123",
          sourceId: "ad-1",
          sourceUrl: "https://fb.me/x",
          headline: "Rescisão indireta",
        },
      },
    });
  });

  it("maps a connection.update event to the connection state, not to a message job", () => {
    const parsed = parseEvolutionPayload({
      event: "connection.update",
      instance: "org-123",
      data: { state: "open" },
    });

    expect(parsed).toEqual({ kind: "connection", instanceName: "org-123", state: "open" });
  });

  it("treats any unrecognized connection state as closed rather than guessing it is up", () => {
    const parsed = parseEvolutionPayload({
      event: "CONNECTION_UPDATE",
      instance: "org-123",
      data: { state: "refused" },
    });

    expect(parsed).toEqual({ kind: "connection", instanceName: "org-123", state: "close" });
  });

  it("ignores events this product does not consume", () => {
    expect(parseEvolutionPayload({ event: "presence.update", instance: "org-123", data: {} })).toBeNull();
  });

  it("ignores a payload with no instance — there would be no tenant to route it to", () => {
    expect(parseEvolutionPayload({ event: "messages.upsert", data: {} })).toBeNull();
    expect(parseEvolutionPayload(null)).toBeNull();
  });

  it("ignores a message with a missing or nonsensical timestamp instead of inventing one", () => {
    expect(parseEvolutionPayload(buildMessagePayload({ messageTimestamp: undefined }))).toBeNull();
    expect(parseEvolutionPayload(buildMessagePayload({ messageTimestamp: 0 }))).toBeNull();
  });
});
