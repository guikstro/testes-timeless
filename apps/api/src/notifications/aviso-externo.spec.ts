import { avisoExterno, NotificationsService } from "./notifications.service";

describe("avisos fora do painel", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });

  it("não faz nada sem AVISO_EXTERNO_URL", async () => {
    delete process.env.AVISO_EXTERNO_URL;
    const f = jest.spyOn(global, "fetch").mockResolvedValue(new Response("ok"));
    await avisoExterno({ type: "lead.created", title: "Novo lead", body: "oi" });
    expect(f).not.toHaveBeenCalled();
  });

  it("manda lead novo e queda, e ignora mensagem comum", async () => {
    process.env.AVISO_EXTERNO_URL = "https://ntfy.sh/teste";
    const f = jest.spyOn(global, "fetch").mockResolvedValue(new Response("ok"));
    await avisoExterno({ type: "lead.created", title: "Novo lead (Google · Rescisão): Ana", body: "oi" });
    await avisoExterno({ type: "sistema.erro", title: "WhatsApp desconectado", body: "" });
    await avisoExterno({ type: "message.received", title: "Ana respondeu", body: "x" });
    expect(f).toHaveBeenCalledTimes(2);
    expect((f.mock.calls[0][1] as RequestInit).body).toBe("Novo lead (Google · Rescisão): Ana\noi");
  });

  it("e-mail: só para os endereços configurados e sem derrubar se falhar", async () => {
    process.env.AVISO_EMAIL_PARA = "a@x.com, b@x.com";
    process.env.WEB_APP_URL = "https://painel.exemplo";
    const enviar = jest.fn().mockRejectedValueOnce(new Error("smtp fora")).mockResolvedValue(undefined);
    const svc = new NotificationsService({} as never, undefined, { enviar } as never);
    await (svc as unknown as { avisoPorEmail(e: unknown): Promise<void> }).avisoPorEmail({
      type: "lead.created", title: "Novo lead: Ana", body: "oi", leadId: "L1", organizationId: "o", timestamp: "",
    });
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar.mock.calls[1][0]).toMatchObject({ para: "b@x.com", assunto: "Novo lead: Ana" });
    expect(enviar.mock.calls[1][0].texto).toContain("https://painel.exemplo/conversas?lead=L1");
    await svc.onModuleDestroy();
  });
});
