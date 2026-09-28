import { AREAS, Area } from "../decorators/areas.decorator";
import { CAPACIDADES, Capacidade, capacidadesDe, exige, pode } from "./capacidades";

/*
  A regra de antes da central, rota por rota: quais áreas abriam a rota e se,
  além da área, o papel tinha de ser dono ou administrador. A central tem de
  dar exatamente a mesma resposta para toda combinação de papel e área.
*/
const ANTES: Record<Capacidade, { areas: Area[] | "todas"; soGestao: boolean }> = {
  "analytics.read": { areas: ["dashboard", "campanhas", "relatorio", "verba"], soGestao: false },
  "conversation.read": { areas: ["conversas"], soGestao: false },
  "conversation.reply": { areas: ["leads", "conversas"], soGestao: false },
  "lead.read": { areas: ["leads", "conversas"], soGestao: false },
  "lead.manage": { areas: ["leads", "conversas"], soGestao: false },
  "campaign.read": { areas: ["integracoes"], soGestao: false },
  "campaign.manage": { areas: ["integracoes"], soGestao: false },
  "spend.read": { areas: ["integracoes", "relatorio"], soGestao: false },
  "budget.read": { areas: ["verba"], soGestao: false },
  "budget.manage": { areas: ["verba"], soGestao: false },
  "ad.read": { areas: ["verba"], soGestao: false },
  "ad.manage": { areas: ["verba"], soGestao: true },
  "adaccount.read": { areas: ["integracoes", "verba"], soGestao: false },
  "link.read": { areas: ["links"], soGestao: false },
  "link.manage": { areas: ["links"], soGestao: false },
  "integration.read": { areas: ["integracoes"], soGestao: false },
  "integration.manage": { areas: ["integracoes"], soGestao: false },
  "apikey.manage": { areas: ["integracoes"], soGestao: true },
  "data.export": { areas: ["integracoes"], soGestao: false },
  "settings.read": { areas: ["configuracoes"], soGestao: false },
  "settings.manage": { areas: ["configuracoes"], soGestao: false },
  "member.read": { areas: ["configuracoes"], soGestao: false },
  "member.manage": { areas: ["configuracoes"], soGestao: true },
  "support_access.read": { areas: ["configuracoes"], soGestao: false },
  "audit.read": { areas: ["configuracoes"], soGestao: true },
  // Estas duas não existiam como rota; nascem só para o dono.
  "owner.manage": { areas: "todas", soGestao: true },
  "billing.manage": { areas: "todas", soGestao: true },
};

describe("capacidades", () => {
  it("toda capacidade tem a regra de antes escrita no teste", () => {
    expect(Object.keys(ANTES).sort()).toEqual(Object.keys(CAPACIDADES).sort());
  });

  it("o dono pode tudo", () => {
    expect(capacidadesDe({ role: "OWNER" }).size).toBe(Object.keys(CAPACIDADES).length);
  });

  it("o administrador pode tudo, menos mexer em donos e na cobrança", () => {
    const naoPode = Object.keys(CAPACIDADES).filter((c) => !pode({ role: "ADMIN" }, c as Capacidade));
    expect(naoPode.sort()).toEqual(["billing.manage", "owner.manage"]);
  });

  describe("quem trabalha por áreas tem, área por área, o mesmo acesso de antes", () => {
    for (const area of AREAS) {
      it(`só a área ${area}`, () => {
        for (const [capacidade, regra] of Object.entries(ANTES) as [Capacidade, (typeof ANTES)[Capacidade]][]) {
          const antes = !regra.soGestao && regra.areas !== "todas" && regra.areas.includes(area);
          expect(`${capacidade}: ${pode({ role: "MEMBER", areas: [area] }, capacidade)}`).toBe(`${capacidade}: ${antes}`);
        }
      });
    }

    it("sem área nenhuma, nada", () => {
      expect(capacidadesDe({ role: "MEMBER", areas: [] }).size).toBe(0);
    });
  });

  describe("a recusa diz o motivo", () => {
    it("falta de área, quando uma área resolveria", () => {
      expect(() => exige({ role: "MEMBER", areas: ["leads"] }, "budget.read")).toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code: "SEM_ACESSO_A_AREA" }) }),
      );
    });

    it("o código de antes, quando é o papel que não permite", () => {
      const codigo = (capacidade: Capacidade) => {
        try {
          exige({ role: "MEMBER", areas: [...AREAS] }, capacidade);
        } catch (erro) {
          return (erro as { response: { code: string } }).response.code;
        }
      };
      expect(codigo("audit.read")).toBe("AUDITORIA_RESTRITA");
      expect(codigo("ad.manage")).toBe("SEM_PERMISSAO");
      expect(codigo("member.manage")).toBe("FORBIDDEN");
      expect(() => exige({ role: "ADMIN" }, "owner.manage")).toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code: "OWNER_REQUIRED" }) }),
      );
    });
  });
});
