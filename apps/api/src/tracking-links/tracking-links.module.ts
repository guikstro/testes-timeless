import { Module } from "@nestjs/common";
import { TrackingLinksController } from "./tracking-links.controller";
import { TrackingLinksService } from "./tracking-links.service";

@Module({
  controllers: [TrackingLinksController],
  providers: [TrackingLinksService],
  exports: [TrackingLinksService],
})
export class TrackingLinksModule {}
