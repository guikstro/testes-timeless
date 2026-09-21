import { conferenciaDoWebhook } from "./conferencia-do-webhook";
import { EvolutionWebhookRegistrado } from "./evolution-client";

const URL = "https://api.exemplo.com/whatsapp-webhook/evolution/segredo";

function registrado(over: Partial<EvolutionWebhookRegistrado> = {}): EvolutionWebhookRegistrado {
  return {
    url: URL,
    habilitado: true,
    base64: false,
    porEvento: false,
    eventos: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
    ...over,
  };
}

describe("conferenciaDoWebhook", () => {
  it("não acha defeito onde não há", () => {
    expect(conferenciaDoWebhook(registrado(), URL)).toEqual([]);
  });

  it("não se importa com a ordem dos eventos", () => {
    // A Evolution devolve na ordem que quiser, e ordem não é configuração.
    const invertido = registrado({ eventos: ["CONNECTION_UPDATE", "MESSAGES_UPSERT"] });
    expect(conferenciaDoWebhook(invertido, URL)).toEqual([]);
  });

  /*
    O defeito que motivou tudo isto: a instância criada antes de `base64:
    false` seguiu embutindo a mídia inteira no payload, estourando o limite do
    body parser e derrubando a mensagem inteira, não só o anexo.
  */
  it("aponta mídia embutida", () => {
    expect(conferenciaDoWebhook(registrado({ base64: true }), URL)).toContain("mídia embutida em base64");
  });

  it("aponta instância sem webhook nenhum", () => {
    expect(conferenciaDoWebhook(null, URL)).toEqual(["sem webhook registrado"]);
  });

  it("aponta webhook desligado", () => {
    expect(conferenciaDoWebhook(registrado({ habilitado: false }), URL)).toContain("desabilitado");
  });

  it("aponta url antiga", () => {
    // Acontece ao trocar o domínio público ou girar o segredo do path: a
    // Evolution continua entregando, só que para um endereço que não existe.
    const antiga = registrado({ url: "https://antigo.exemplo.com/whatsapp-webhook/evolution/outro" });
    expect(conferenciaDoWebhook(antiga, URL)).toContain("url diferente da atual");
  });

  it("aponta evento faltando e evento sobrando", () => {
    const faltando = registrado({ eventos: ["MESSAGES_UPSERT"] });
    const sobrando = registrado({ eventos: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "PRESENCE_UPDATE"] });

    // Faltando, a mensagem não chega. Sobrando, chega tráfego que o pipeline
    // joga fora logo depois de receber.
    expect(conferenciaDoWebhook(faltando, URL)).toContain("lista de eventos diferente");
    expect(conferenciaDoWebhook(sobrando, URL)).toContain("lista de eventos diferente");
  });

  it("junta todos os motivos em vez de parar no primeiro", () => {
    const tudoErrado = registrado({ habilitado: false, base64: true, porEvento: true, url: "https://outro" });
    expect(conferenciaDoWebhook(tudoErrado, URL)).toHaveLength(4);
  });
});
