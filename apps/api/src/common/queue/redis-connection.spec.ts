const ouvintes = new Map<string, (...args: unknown[]) => void>();
const on = jest.fn((evento: string, tratador: (...args: unknown[]) => void) => {
  ouvintes.set(evento, tratador);
});

jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ on })),
}));

import { criaConexaoRedis, getRedisConnectionOptions } from "./redis-connection";

describe("getRedisConnectionOptions", () => {
  const original = process.env.REDIS_URL;
  afterEach(() => {
    process.env.REDIS_URL = original;
  });

  it("lê o índice do banco do endereço", () => {
    process.env.REDIS_URL = "redis://redis:6379/2";

    expect(getRedisConnectionOptions()).toMatchObject({ host: "redis", port: 6379, db: 2 });
  });

  it("não limita as tentativas por comando", () => {
    // Exigência do BullMQ: comandos bloqueantes não podem esbarrar no teto de
    // repetição do ioredis, ou a espera longa estoura sob carga.
    expect(getRedisConnectionOptions().maxRetriesPerRequest).toBeNull();
  });
});

describe("criaConexaoRedis", () => {
  beforeEach(() => {
    ouvintes.clear();
    on.mockClear();
  });

  /*
    A regressão que motivou a fábrica.

    Três das quatro conexões de vida longa do sistema não tinham ouvinte de
    erro. Em Node, um emissor que dispara `error` sem ninguém escutando lança,
    e a exceção não capturada derruba o processo: uma oscilação do Redis
    levava junto a API que estava atendendo.
  */
  it("sempre registra ouvinte de erro", () => {
    criaConexaoRedis("Alguem");

    expect(on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("engole o erro em vez de deixá-lo derrubar o processo", () => {
    criaConexaoRedis("Alguem");
    const tratador = ouvintes.get("error")!;

    // O ioredis reconecta sozinho, e a alternativa a engolir é não ter
    // processo nenhum para reconectar.
    expect(() => tratador(new Error("ECONNRESET"))).not.toThrow();
  });
});
