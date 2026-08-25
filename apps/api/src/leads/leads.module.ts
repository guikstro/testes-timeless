import { Module } from "@nestjs/common";
import { ConversionEventsModule } from "../integrations/meta/conversion-events.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [ConversionEventsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
