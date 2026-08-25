import { parseWebhookPayload } from "./parse-webhook-payload";

function buildPayload(overrides: {
  phoneNumberId?: string;
  profileName?: string;
  message?: Record<string, unknown>;
}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5585900000000", phone_number_id: overrides.phoneNumberId ?? "phone-1" },
              contacts: [{ profile: { name: overrides.profileName ?? "João" }, wa_id: "5585999999999" }],
              messages: overrides.message
                ? [overrides.message]
                : [
                    {
                      from: "5585999999999",
                      id: "wamid.ABC123",
                      timestamp: "1700000000",
                      type: "text",
                      text: { body: "Fui demitido e não recebi tudo" },
                    },
                  ],
            },
          },
        ],
      },
    ],
  };
}

describe("parseWebhookPayload", () => {
  it("extracts a text message into a job", () => {
    const jobs = parseWebhookPayload(buildPayload({}));

    expect(jobs).toEqual([
      {
        phoneNumberId: "phone-1",
        waId: "5585999999999",
        profileName: "João",
        messageId: "wamid.ABC123",
        type: "text",
        text: "Fui demitido e não recebi tudo",
        timestampSeconds: 1700000000,
      },
    ]);
  });

  it("maps a non-text message type to 'other' and drops the text field", () => {
    const jobs = parseWebhookPayload(
      buildPayload({
        message: { from: "5585999999999", id: "wamid.IMG1", timestamp: "1700000001", type: "image" },
      }),
    );

    expect(jobs).toEqual([
      expect.objectContaining({ type: "other", text: undefined, messageId: "wamid.IMG1" }),
    ]);
  });

  it("captures the referral block from a real Click-to-WhatsApp ad message", () => {
    const jobs = parseWebhookPayload(
      buildPayload({
        message: {
          from: "5585999999999",
          id: "wamid.CTWA1",
          timestamp: "1700000002",
          type: "text",
          text: { body: "Quero saber mais" },
          referral: { ctwa_clid: "ctwa.abc123", source_id: "ad-42", source_url: "https://fb.me/x", headline: "Rescisão Indireta" },
        },
      }),
    );

    expect(jobs[0].referral).toEqual({
      ctwaClid: "ctwa.abc123",
      sourceId: "ad-42",
      sourceUrl: "https://fb.me/x",
      headline: "Rescisão Indireta",
    });
  });

  it("leaves referral undefined for an ordinary message with no ad origin", () => {
    const jobs = parseWebhookPayload(buildPayload({}));
    expect(jobs[0].referral).toBeUndefined();
  });

  it("ignores status updates (delivery/read receipts) with no messages array", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone-1" },
                statuses: [{ id: "wamid.ABC123", status: "delivered" }],
              },
            },
          ],
        },
      ],
    };

    expect(parseWebhookPayload(payload)).toEqual([]);
  });

  it("skips a change with no phone_number_id instead of crashing", () => {
    const payload = { entry: [{ changes: [{ value: { messages: [{ from: "1", id: "2", timestamp: "3" }] } }] }] };
    expect(parseWebhookPayload(payload)).toEqual([]);
  });

  it("never throws on a completely empty or malformed payload", () => {
    expect(parseWebhookPayload({})).toEqual([]);
    expect(parseWebhookPayload(null)).toEqual([]);
    expect(parseWebhookPayload(undefined)).toEqual([]);
  });

  it("handles multiple messages across multiple entries/changes", () => {
    const payload = {
      entry: [
        buildPayload({ phoneNumberId: "phone-1" }).entry[0],
        buildPayload({
          phoneNumberId: "phone-2",
          message: { from: "5585988888888", id: "wamid.XYZ", timestamp: "1700000002", type: "text", text: { body: "oi" } },
        }).entry[0],
      ],
    };

    const jobs = parseWebhookPayload(payload);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.phoneNumberId)).toEqual(["phone-1", "phone-2"]);
  });
});
