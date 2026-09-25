import { comOrigem, ipLegivel, origemDaRequisicao } from "./contexto-da-requisicao";

describe("ipLegivel", () => {
  it("escreve o IPv4 do jeito de sempre", () => {
    expect(ipLegivel("::ffff:200.1.2.3")).toBe("200.1.2.3");
  });

  it("deixa IPv6 de verdade como está", () => {
    expect(ipLegivel("2804:14c::1")).toBe("2804:14c::1");
    expect(ipLegivel(null)).toBeNull();
  });
});

describe("origemDaRequisicao", () => {
  it("devolve a origem de dentro da requisição, e nulos fora dela", async () => {
    expect(origemDaRequisicao()).toEqual({ ip: null, aparelho: null });
    await comOrigem({ ip: "200.1.2.3", aparelho: "Chrome no macOS" }, async () => {
      await Promise.resolve();
      expect(origemDaRequisicao()).toEqual({ ip: "200.1.2.3", aparelho: "Chrome no macOS" });
    });
  });
});
