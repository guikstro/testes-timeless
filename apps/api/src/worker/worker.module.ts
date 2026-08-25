import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../common/prisma/prisma.module";

/**
 * Empty in Phase 1 — queue processors (WhatsApp ingestion, attribution,
 * classification, CAPI delivery) are added here starting Phase 3.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
})
export class WorkerModule {}
