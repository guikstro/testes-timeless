import { Module } from "@nestjs/common";
import { AssistenteController } from "./assistente.controller";
import { BuscaService } from "./busca.service";
import { PainelService } from "./painel.service";

/** "Meu painel" (arrastar e soltar) e a barra de perguntas com RAG. */
@Module({
  controllers: [AssistenteController],
  providers: [PainelService, BuscaService],
})
export class AssistenteModule {}
