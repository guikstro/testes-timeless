import { RedisThrottlerStorage } from "./redis-throttler.storage";

/**
 * Usa o Redis de verdade, o mesmo que o Docker Compose já sobe.
 *
 * O comportamento que importa aqui é o do bloqueio ao longo do tempo, e um
 * dublê de Redis provaria só que a minha simulação concorda comigo.
 */
describe("RedisThrottlerStorage", () => {
  let storage: RedisThrottlerStorage;

  beforeAll(() => {
    storage = new RedisThrottlerStorage();
  });

  afterAll(async () => {
    await storage.onModuleDestroy();
  });

  const chave = () => `teste:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  it("conta cada requisição dentro da janela", async () => {
    const k = chave();

    const primeira = await storage.increment(k, 10_000, 3, 10_000, "t");
    const segunda = await storage.increment(k, 10_000, 3, 10_000, "t");

    expect(primeira.totalHits).toBe(1);
    expect(segunda.totalHits).toBe(2);
    expect(segunda.isBlocked).toBe(false);
    // A janela recebeu prazo já na primeira contagem: sem isso a chave viveria
    // para sempre e o limite viraria permanente.
    expect(primeira.timeToExpire).toBeGreaterThan(0);
  });

  it("bloqueia ao passar do limite", async () => {
    const k = chave();
    for (let i = 0; i < 2; i += 1) await storage.increment(k, 10_000, 2, 10_000, "t");

    const estourou = await storage.increment(k, 10_000, 2, 10_000, "t");

    expect(estourou.isBlocked).toBe(true);
    expect(estourou.timeToBlockExpire).toBeGreaterThan(0);
  });

  it("não renova o bloqueio a cada nova tentativa", async () => {
    const k = chave();
    // Castigo longo com espera curta: a diferença precisa aparecer sem que a
    // máquina sob carga chegue perto do fim do bloqueio e mude a resposta.
    await storage.increment(k, 30_000, 1, 8_000, "t");
    const primeiroBloqueio = await storage.increment(k, 30_000, 1, 8_000, "t");

    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const depois = await storage.increment(k, 30_000, 1, 8_000, "t");

    // Contar durante o castigo faria o bloqueio se renovar sozinho, e um
    // cliente com retentativa automática nunca sairia dele.
    expect(primeiroBloqueio.isBlocked).toBe(true);
    expect(depois.isBlocked).toBe(true);
    expect(depois.timeToBlockExpire).toBeLessThan(primeiroBloqueio.timeToBlockExpire);
  });

  it("libera quando o castigo termina", async () => {
    const k = chave();
    // Dois segundos de castigo e três de espera. Margem folgada dos dois
    // lados: com oitocentos milissegundos, uma ida ao Redis mais lenta que o
    // normal já derrubava o teste sem haver defeito nenhum.
    await storage.increment(k, 30_000, 1, 2_000, "t");
    expect((await storage.increment(k, 30_000, 1, 2_000, "t")).isBlocked).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 3_000));

    expect((await storage.increment(k, 30_000, 1, 2_000, "t")).isBlocked).toBe(false);
  });

  it("separa contadores por nome, para um teto não gastar a cota do outro", async () => {
    const k = chave();
    await storage.increment(k, 10_000, 1, 10_000, "login");

    const outro = await storage.increment(k, 10_000, 1, 10_000, "clique");

    expect(outro.totalHits).toBe(1);
    expect(outro.isBlocked).toBe(false);
  });
});
