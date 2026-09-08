import { Logger } from "@nestjs/common";
import Redis from "ioredis";

/** Shared by both the API (producer) and worker (consumer) BullMQ setups. */
export function getRedisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  const dbIndex = url.pathname.replace("/", "");

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    ...(dbIndex ? { db: Number(dbIndex) } : {}),
    // BullMQ requirement: blocking commands must not be limited by ioredis's
    // own retry cap, or long-polling connections error out under load.
    maxRetriesPerRequest: null,
  };
}

/**
 * Uma conexão Redis de vida longa, com ouvinte de erro.
 *
 * O ouvinte não é zelo, é o que impede o processo de morrer. Em Node, um
 * emissor que dispara `error` sem ninguém escutando lança, e exceção não
 * capturada derruba o processo inteiro. O ioredis dispara `error` em queda de
 * conexão, falha de DNS, recusa de autenticação — coisas passageiras que ele
 * mesmo resolve reconectando.
 *
 * Três das quatro conexões do sistema não tinham esse ouvinte, então uma
 * oscilação do Redis levava junto a API que estava atendendo. Existe como
 * fábrica para a próxima conexão nascer protegida sem ninguém precisar
 * lembrar.
 */
export function criaConexaoRedis(dono: string): Redis {
  const cliente = new Redis(getRedisConnectionOptions());
  const logger = new Logger(dono);

  cliente.on("error", (erro: Error) => {
    // Registrado e engolido: o ioredis reconecta sozinho, e a alternativa é
    // não ter processo nenhum para reconectar.
    logger.error(JSON.stringify({ event: "conexao_redis_com_erro", dono, error: erro.message }));
  });

  return cliente;
}
