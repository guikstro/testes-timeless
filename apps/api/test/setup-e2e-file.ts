import "./test-env";
import Redis from "ioredis";

/**
 * Cada arquivo de teste começa com a cota de requisições zerada.
 *
 * O limite de autenticação são dez tentativas em cinco minutos, e a suíte
 * inteira faz muito mais que isso: são dez arquivos, cada um cadastrando e
 * entrando várias vezes, todos dentro da mesma janela e do mesmo contador no
 * Redis. Sem isto, os primeiros arquivos passam e todos os seguintes tomam
 * 429 — que é exatamente o estado em que a suíte estava, e a razão de ninguém
 * a rodar.
 *
 * Zerar aqui, e não desligar o limite no código, mantém o caminho real sendo
 * exercitado: o teste continua passando pelo guarda, pelo Redis e pela mesma
 * contagem que vale em produção. O comportamento do próprio limite é coberto
 * à parte, em `redis-throttler.storage.spec.ts`.
 *
 * Só o banco de índice um, que é o isolado do desenvolvimento (ver
 * `test-env.ts`). Nunca o zero, onde vive o stack de quem está trabalhando.
 */
beforeAll(async () => {
  const cliente = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380/1");
  cliente.on("error", () => undefined);

  try {
    const chaves = await cliente.keys("throttle:*");
    if (chaves.length > 0) await cliente.del(...chaves);
  } finally {
    await cliente.quit().catch(() => undefined);
  }
});
