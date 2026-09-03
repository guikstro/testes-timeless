import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { IdDaRequisicaoMiddleware } from "./common/observabilidade/id-da-requisicao.middleware";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { RedisThrottlerStorage } from "./common/throttling/redis-throttler.storage";
import { ThrottlingModule } from "./common/throttling/throttling.module";
import { UsuarioOuIpThrottlerGuard } from "./common/throttling/throttler.guard";
import { PADRAO } from "./common/throttling/limites";
import { PrismaModule } from "./common/prisma/prisma.module";
import { EncryptionModule } from "./common/encryption/encryption.module";
import { EmailModule } from "./common/email/email.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { HealthModule } from "./health/health.module";
import { TrackingLinksModule } from "./tracking-links/tracking-links.module";
import { TrackingModule } from "./tracking/tracking.module";
import { WhatsAppWebhookModule } from "./whatsapp-webhook/whatsapp-webhook.module";
import { WhatsAppConnectionsModule } from "./integrations/whatsapp/whatsapp-connections.module";
import { LeadsModule } from "./leads/leads.module";
import { ClassificationModule } from "./classification/classification.module";
import { MetaConnectionsModule } from "./integrations/meta/meta-connections.module";
import { CampaignsModule } from "./campaigns/campaigns.module";
import { AdminModule } from "./admin/admin.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { NotificationsStreamModule } from "./notifications/notifications-stream.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { TelemetriaModule } from "./telemetria/telemetria.module";
import { GoogleConversionsModule } from "./integrations/google/google-conversions.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    /*
      Um teto só, definido aqui, e apertado rota a rota com `@Throttle`.
      Declarar vários tetos nomeados no módulo faria todos valerem para toda
      requisição, e o teto de login passaria a valer para o dashboard.
    */
    ThrottlingModule,
    ThrottlerModule.forRootAsync({
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({ throttlers: [PADRAO], storage }),
    }),
    PrismaModule,
    EncryptionModule,
    EmailModule,
    AuthModule,
    OrganizationsModule,
    HealthModule,
    TrackingLinksModule,
    TrackingModule,
    WhatsAppWebhookModule,
    WhatsAppConnectionsModule,
    LeadsModule,
    ClassificationModule,
    MetaConnectionsModule,
    CampaignsModule,
    AdminModule,
    AnalyticsModule,
    NotificationsStreamModule,
    ConversationsModule,
    GoogleConversionsModule,
    TelemetriaModule,
  ],
  providers: [
    // Global: uma rota nova nasce protegida, e abrir exceção exige escrever
    // `@SkipThrottle` de propósito, que é visível na revisão.
    { provide: APP_GUARD, useClass: UsuarioOuIpThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Em tudo: o identificador precisa existir antes de qualquer erro, e um
    // erro pode acontecer em qualquer rota.
    consumer.apply(IdDaRequisicaoMiddleware).forRoutes("*");
  }
}
