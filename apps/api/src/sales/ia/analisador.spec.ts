import { analisarConversa, ClienteDaIA, executaEmParalelo } from "./analisador";
import { MODELOS } from "./custo";

const conversa = "[10:00] Cliente: Pode fechar! Mando o PIX agora.\n[10:05] Equipe: Pagamento recebido.";

const analiseBoa = {
  situacao: "FECHADA",
  confianca: 0.95,
  valorEmCentavos: 85000,
  evidencias: ["Pode fechar", "Pagamento recebido"],
  motivoDaPerda: "NENHUM",
  qualidadeDoLead: "BOM",
  motivo: "Aceitou e o pagamento foi confirmado.",
};

function clienteFalso(resposta: Record<string, unknown> | Error) {
  const parse = jest.fn(async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  return { client: { messages: { parse } } as unknown as ClienteDaIA, parse };
}

describe("analisarConversa", () => {
  it("devolve a análise, os tokens e confere as citações", async () => {
    const { client } = clienteFalso({ parsed_output: { ...analiseBoa, evidencias: ["Pode fechar", "Fechamos por 850 reais"] }, stop_reason: "end_turn", usage: { input_tokens: 400, output_tokens: 120 } });
    const r = await analisarConversa({ client, modelo: MODELOS.sonnet, transcricao: conversa });
    expect(r.analise?.situacao).toBe("FECHADA");
    expect(r.tokensEntrada).toBe(400);
    expect(r.tokensSaida).toBe(120);
    expect(r.citacoes).toEqual({ validas: ["Pode fechar"], invalidas: ["Fechamos por 850 reais"] });
  });

  it("manda o roteiro, a conversa, as dicas da empresa e o formato fixo", async () => {
    const { client, parse } = clienteFalso({ parsed_output: analiseBoa, stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
    await analisarConversa({ client, modelo: MODELOS.sonnet, transcricao: conversa, dicas: ["contrato fechado"] });
    const pedido = parse.mock.calls[0] as unknown as [{ system: string; messages: { content: string }[]; output_config: { format: unknown; effort?: string }; model: string }];
    expect(pedido[0].model).toBe("claude-sonnet-5-5");
    expect(pedido[0].system).toContain("CLIENTE");
    expect(pedido[0].messages[0].content).toContain('"contrato fechado"');
    expect(pedido[0].messages[0].content).toContain("Cliente: Pode fechar");
    expect(pedido[0].output_config.format).toBeDefined();
  });

  it("esforço baixo só nos modelos que aceitam; o Haiku recusaria o parâmetro", async () => {
    const { client, parse } = clienteFalso({ parsed_output: analiseBoa, stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
    await analisarConversa({ client, modelo: MODELOS.haiku, transcricao: conversa });
    await analisarConversa({ client, modelo: MODELOS.opus, transcricao: conversa });
    const config = (n: number) => (parse.mock.calls[n] as unknown as [{ output_config: { effort?: string } }])[0].output_config;
    expect(config(0).effort).toBeUndefined();
    expect(config(1).effort).toBe("low");
  });

  it("recusa da IA vira erro legível, sem análise", async () => {
    const { client } = clienteFalso({ parsed_output: null, stop_reason: "refusal", usage: { input_tokens: 10, output_tokens: 0 } });
    const r = await analisarConversa({ client, modelo: MODELOS.sonnet, transcricao: conversa });
    expect(r.analise).toBeNull();
    expect(r.erro).toContain("recusou");
    expect(r.tokensEntrada).toBe(10);
  });

  it("resposta fora do formato vira erro, não exceção", async () => {
    const { client } = clienteFalso({ parsed_output: null, stop_reason: "max_tokens", usage: { input_tokens: 10, output_tokens: 4096 } });
    const r = await analisarConversa({ client, modelo: MODELOS.sonnet, transcricao: conversa });
    expect(r.analise).toBeNull();
    expect(r.erro).toContain("max_tokens");
  });

  it("erro da API vira erro no resultado e não derruba o teste", async () => {
    const { client } = clienteFalso(new Error("429 rate limit"));
    const r = await analisarConversa({ client, modelo: MODELOS.sonnet, transcricao: conversa });
    expect(r.analise).toBeNull();
    expect(r.erro).toContain("429");
  });

  it("sanitiza o que a IA devolve", async () => {
    const { client } = clienteFalso({ parsed_output: { ...analiseBoa, confianca: 3, valorEmCentavos: -5 }, stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
    const r = await analisarConversa({ client, modelo: MODELOS.sonnet, transcricao: conversa });
    expect(r.analise?.confianca).toBe(1);
    expect(r.analise?.valorEmCentavos).toBeNull();
  });
});

describe("executaEmParalelo", () => {
  it("mantém a ordem, respeita o limite e conta o progresso", async () => {
    let simultaneas = 0;
    let pico = 0;
    const progresso: number[] = [];
    const r = await executaEmParalelo(
      [1, 2, 3, 4, 5, 6],
      2,
      async (n) => {
        simultaneas += 1;
        pico = Math.max(pico, simultaneas);
        await new Promise((ok) => setTimeout(ok, 5));
        simultaneas -= 1;
        return n * 10;
      },
      (feitos) => progresso.push(feitos),
    );
    expect(r).toEqual([10, 20, 30, 40, 50, 60]);
    expect(pico).toBeLessThanOrEqual(2);
    expect(progresso.at(-1)).toBe(6);
  });

  it("lista vazia não trava", async () => {
    expect(await executaEmParalelo([], 4, async () => 1)).toEqual([]);
  });
});
