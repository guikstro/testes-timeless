import { assinaturaDoErro, normalizaCaminho, normalizaMensagem, primeiroQuadroNosso } from "./assinatura";

describe("assinatura dos erros", () => {
  it("a mesma falha com outros ids agrupa", () => {
    const a = assinaturaDoErro({ origem: "api", tipo: "Error", mensagem: "Lead 3f2a1b9c-1111-4222-8333-944455556666 sem conversa" });
    const b = assinaturaDoErro({ origem: "api", tipo: "Error", mensagem: "Lead 9b1c2d3e-aaaa-4bbb-8ccc-dddddddddddd sem conversa" });
    expect(a).toBe(b);
  });

  it("números, hashes e endereços não separam", () => {
    expect(normalizaMensagem("timeout de 3000 ms em https://graph.facebook.com/v25.0/act_1 token abcdef0123456789abcdef")).toBe(
      "timeout de <n> ms em <url> token <hex>",
    );
  });

  it("falhas diferentes não agrupam", () => {
    const a = assinaturaDoErro({ origem: "api", tipo: "Error", mensagem: "falhou A" });
    const b = assinaturaDoErro({ origem: "api", tipo: "Error", mensagem: "falhou B" });
    expect(a).not.toBe(b);
  });

  it("o caminho perde os valores", () => {
    expect(normalizaCaminho("/api/leads/3f2a1b9c-1111-4222-8333-944455556666/messages?limit=20")).toBe("/api/leads/<id>/messages");
  });

  it("o lugar é o primeiro quadro nosso, sem linha nem coluna", () => {
    const pilha = [
      "TypeError: x is undefined",
      "    at Object.<anonymous> (/app/node_modules/lib/index.js:10:5)",
      "    at LeadsService.findOne (/app/dist/src/leads/leads.service.js:120:33)",
    ].join("\n");
    expect(primeiroQuadroNosso(pilha)).toBe("LeadsService.findOne (leads.service.js");
  });
});
