import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConversionEventsModule } from "../integrations/meta/conversion-events.module";
import { WHATSAPP_SEND_QUEUE } from "../common/queue/queue.constants";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [ConversionEventsModule, BullModule.registerQueue({ name: WHATSAPP_SEND_QUEUE })],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
