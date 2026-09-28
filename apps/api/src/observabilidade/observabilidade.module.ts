import { Global, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueModule } from "../common/queue/queue.module";
import { PlatformAdminGuard } from "../common/guards/platform-admin.guard";
import {
  EMAIL_QUEUE,
  MANUTENCAO_QUEUE,
  META_CONVERSIONS_QUEUE,
  META_SYNC_QUEUE,
  WHATSAPP_EVENTS_QUEUE,
  WHATSAPP_SEND_QUEUE,
} from "../common/queue/queue.constants";
import { MedeOsPedidos, MetricasDaApi } from "./metricas-da-api";
import { RegistroDeErros } from "./registro-de-erros.service";
import { SaudeDaPlataformaService } from "./saude-da-plataforma.service";
import { SaudeDaPlataformaController } from "./saude.controller";

/**
 * Erros, métricas e a tela de saúde. Global porque registrar um erro é coisa
 * que qualquer módulo pode precisar fazer.
 */
@Global()
@Module({
  imports: [
    QueueModule,
    // Todas as filas, para a tela contar e mostrar as falhas de cada uma.
    BullModule.registerQueue(
      { name: WHATSAPP_EVENTS_QUEUE },
      { name: WHATSAPP_SEND_QUEUE },
      { name: META_SYNC_QUEUE },
      { name: META_CONVERSIONS_QUEUE },
      { name: EMAIL_QUEUE },
      { name: MANUTENCAO_QUEUE },
    ),
  ],
  controllers: [SaudeDaPlataformaController],
  providers: [RegistroDeErros, MetricasDaApi, MedeOsPedidos, SaudeDaPlataformaService, PlatformAdminGuard],
  exports: [RegistroDeErros, MetricasDaApi],
})
export class ObservabilidadeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MedeOsPedidos).forRoutes("*");
  }
}
