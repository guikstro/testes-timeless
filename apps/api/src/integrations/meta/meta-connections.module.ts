import { Module } from "@nestjs/common";
import { QueueModule } from "../../common/queue/queue.module";
import { MetaConnectionsController } from "./meta-connections.controller";
import { MetaConnectionsService } from "./meta-connections.service";

@Module({
  imports: [QueueModule],
  controllers: [MetaConnectionsController],
  providers: [MetaConnectionsService],
})
export class MetaConnectionsModule {}
