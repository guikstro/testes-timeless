import { Global, Module } from "@nestjs/common";
import { AuditoriaService } from "./auditoria.service";
import { AuditoriaController } from "./auditoria.controller";

/**
 * Global porque quase todo módulo grava auditoria: importar em cada um seria
 * uma linha repetida vinte vezes, e esquecer uma delas só apareceria como erro
 * na hora de subir.
 */
@Global()
@Module({
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
