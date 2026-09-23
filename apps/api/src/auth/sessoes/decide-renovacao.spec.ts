import { CARENCIA_EM_MS, decideRenovacao } from "./decide-renovacao";

const AGORA = new Date("2026-09-23T12:00:00.000Z");
const antes = (ms: number) => new Date(AGORA.getTime() - ms);
const depois = (ms: number) => new Date(AGORA.getTime() + ms);

describe("decideRenovacao", () => {
  it("renova token vivo", () => {
    expect(decideRenovacao({ revokedAt: null, expiresAt: depois(60_000) }, AGORA)).toBe("valido");
  });

  it("recusa token desconhecido", () => {
    expect(decideRenovacao(null, AGORA)).toBe("invalido");
  });

  it("recusa token vencido, sem tratá-lo como roubo", () => {
    // Vencer é o fim natural de uma sessão esquecida, não um sinal de nada.
    expect(decideRenovacao({ revokedAt: null, expiresAt: antes(1) }, AGORA)).toBe("invalido");
  });

  /*
    A corrida que acontece de verdade: o documento e um prefetch saem juntos,
    com o mesmo refresh token. A primeira requisição rotaciona e a segunda
    chega logo depois com o token já revogado. Chamar isso de roubo expulsaria
    gente aleatoriamente ao navegar.
  */
  it("dentro da carência, só recusa, porque é corrida e não roubo", () => {
    const token = { revokedAt: antes(200), expiresAt: depois(60_000) };
    expect(decideRenovacao(token, AGORA)).toBe("invalido");
  });

  it("no limite exato da carência, ainda é corrida", () => {
    const token = { revokedAt: antes(CARENCIA_EM_MS), expiresAt: depois(60_000) };
    expect(decideRenovacao(token, AGORA)).toBe("invalido");
  });

  /*
    Depois de uma rotação o navegador sobrescreve o cookie e nunca mais manda
    o token antigo. Se ele reaparece minutos depois, alguém tem uma cópia.
  */
  it("depois da carência, é reuso: alguém tem uma cópia", () => {
    const token = { revokedAt: antes(CARENCIA_EM_MS + 1), expiresAt: depois(60_000) };
    expect(decideRenovacao(token, AGORA)).toBe("reuso");
  });

  it("reuso horas depois continua sendo reuso", () => {
    const token = { revokedAt: antes(3 * 60 * 60 * 1000), expiresAt: depois(60_000) };
    expect(decideRenovacao(token, AGORA)).toBe("reuso");
  });

  it("vencido tem precedência sobre reuso", () => {
    // Um token vencido não renova de jeito nenhum, e encerrar uma sessão por
    // causa dele puniria alguém por um cookie velho esquecido no navegador.
    const token = { revokedAt: antes(3 * 60 * 60 * 1000), expiresAt: antes(1) };
    expect(decideRenovacao(token, AGORA)).toBe("invalido");
  });
});
