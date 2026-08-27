import { EvolutionClient } from "./evolution-client";
import { EvolutionApiError } from "./evolution-api-error";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe("EvolutionClient", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EVOLUTION_API_URL = "http://evolution-test:8080";
    process.env.EVOLUTION_API_KEY = "test-key";
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("registers the webhook url and only the events this product consumes when creating an instance", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const client = new EvolutionClient();

    await client.createInstance("org-1", "http://api:3001/whatsapp-webhook/evolution/secret");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://evolution-test:8080/instance/create");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.instanceName).toBe("org-1");
    expect(body.webhook.url).toBe("http://api:3001/whatsapp-webhook/evolution/secret");
    expect(body.webhook.events).toEqual(["MESSAGES_UPSERT", "CONNECTION_UPDATE"]);
  });

  it("sends the api key as a header on every request", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ instance: { state: "open" } }));
    const client = new EvolutionClient();

    await client.getConnectionState("org-1");

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.apikey).toBe("test-key");
  });

  it("treats any unknown connection state as closed rather than assuming it is up", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ instance: { state: "weird" } }));
    const client = new EvolutionClient();

    await expect(client.getConnectionState("org-1")).resolves.toBe("close");
  });

  it("extracts the connected number from the owner jid", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ ownerJid: "5585999999999@s.whatsapp.net" }]));
    const client = new EvolutionClient();

    await expect(client.getConnectedNumber("org-1")).resolves.toBe("5585999999999");
  });

  it("returns null for the number while the QR has not been scanned yet", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{}]));
    const client = new EvolutionClient();

    await expect(client.getConnectedNumber("org-1")).resolves.toBeNull();
  });

  it("returns the provider's message id after a successful send", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ key: { id: "3EB0SENT" } }));
    const client = new EvolutionClient();

    await expect(client.sendText("org-1", "5585999999999", "oi")).resolves.toEqual({ externalId: "3EB0SENT" });
  });

  it("fails a send that came back without an id — an untraceable message must not count as sent", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ key: {} }));
    const client = new EvolutionClient();

    await expect(client.sendText("org-1", "5585999999999", "oi")).rejects.toThrow(EvolutionApiError);
  });

  describe("error handling", () => {
    it("reads the error message from `message` as a plain string", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: "Instance not found" }, 404));
      const client = new EvolutionClient();

      await expect(client.getConnectionState("org-1")).rejects.toThrow("Instance not found");
    });

    it("reads the error message when the api returns it as an array", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: ["number is required", "text is required"] }, 400));
      const client = new EvolutionClient();

      await expect(client.sendText("org-1", "", "")).rejects.toThrow("number is required; text is required");
    });

    it("reads the error message from the nested `response.message` shape", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ response: { message: "Connection Closed" } }, 400));
      const client = new EvolutionClient();

      await expect(client.sendText("org-1", "5585999999999", "oi")).rejects.toThrow("Connection Closed");
    });

    it("falls back to the status code when the body carries no usable message", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 500));
      const client = new EvolutionClient();

      await expect(client.getConnectionState("org-1")).rejects.toThrow("status 500");
    });

    it("survives a non-JSON body (e.g. a proxy error page) instead of throwing a parse error", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve("<html>Bad Gateway</html>"),
      } as Response);
      const client = new EvolutionClient();

      await expect(client.getConnectionState("org-1")).rejects.toThrow("Bad Gateway");
    });

    /**
     * Regressão da Fase 8: sem timeout, uma instância sem sessão fazia a
     * Evolution segurar a conexão e o job de envio ficava preso em "active"
     * para sempre, ocupando um slot do worker que nunca era liberado.
     */
    it("converts a request timeout into an EvolutionApiError instead of hanging forever", async () => {
      const timeoutError = new Error("The operation was aborted due to timeout");
      timeoutError.name = "TimeoutError";
      fetchMock.mockRejectedValue(timeoutError);
      const client = new EvolutionClient();

      await expect(client.sendText("org-1", "5585999999999", "oi")).rejects.toThrow(EvolutionApiError);
      await expect(client.sendText("org-1", "5585999999999", "oi")).rejects.toThrow("não respondeu");
    });

    it("passes an abort signal on every request so no call can hang indefinitely", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ instance: { state: "open" } }));
      const client = new EvolutionClient();

      await client.getConnectionState("org-1");

      expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeDefined();
    });

    it("wraps a plain network failure as an EvolutionApiError too", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
      const client = new EvolutionClient();

      await expect(client.getConnectionState("org-1")).rejects.toThrow("Falha de rede");
    });
  });
});
