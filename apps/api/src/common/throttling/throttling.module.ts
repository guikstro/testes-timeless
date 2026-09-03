import { Global, Module } from "@nestjs/common";
import { RedisThrottlerStorage } from "./redis-throttler.storage";

/**
 * O armazenamento do limite, disponível por injeção.
 *
 * Global porque duas partes distintas precisam dele: o guarda que recusa
 * requisições e o redirecionamento público, que não recusa nada e só usa a
 * contagem para decidir se ainda grava o clique.
 */
@Global()
@Module({
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class ThrottlingModule {}
