import { Module } from "@nestjs/common";
import { QueueModule } from "../../common/queue/queue.module";
import { BudgetsModule } from "../../budgets/budgets.module";
import { ControleDeAnunciosController } from "./controle-de-anuncios.controller";
import { ControleDeAnunciosService } from "./controle-de-anuncios.service";
import { MetaGraphClient } from "./meta-graph-client";

@Module({
  imports: [QueueModule, BudgetsModule],
  controllers: [ControleDeAnunciosController],
  providers: [ControleDeAnunciosService, MetaGraphClient],
})
export class ControleDeAnunciosModule {}
