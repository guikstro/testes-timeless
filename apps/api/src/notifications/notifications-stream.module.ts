import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsModule } from "./notifications.module";

/** O cano de tempo real, que só faz sentido no processo que atende o navegador. */
@Module({
  imports: [NotificationsModule],
  controllers: [NotificationsController],
  providers: [NotificationsGateway],
})
export class NotificationsStreamModule {}
