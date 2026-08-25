import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./common/prisma/prisma.module";
import { EncryptionModule } from "./common/encryption/encryption.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { HealthModule } from "./health/health.module";
import { TrackingLinksModule } from "./tracking-links/tracking-links.module";
import { TrackingModule } from "./tracking/tracking.module";
import { WhatsAppWebhookModule } from "./whatsapp-webhook/whatsapp-webhook.module";
import { WhatsAppConnectionsModule } from "./integrations/whatsapp/whatsapp-connections.module";
import { LeadsModule } from "./leads/leads.module";
import { ClassificationModule } from "./classification/classification.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EncryptionModule,
    AuthModule,
    OrganizationsModule,
    HealthModule,
    TrackingLinksModule,
    TrackingModule,
    WhatsAppWebhookModule,
    WhatsAppConnectionsModule,
    LeadsModule,
    ClassificationModule,
  ],
})
export class AppModule {}
