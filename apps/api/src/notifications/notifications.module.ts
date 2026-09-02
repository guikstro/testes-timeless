import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

/**
 * Só quem produz avisos.
 *
 * Fica separado do cano de tempo real porque os dois processos precisam de
 * metades diferentes: o worker produz e não tem conexão de navegador
 * nenhuma, a API faz as duas coisas. Importar o módulo inteiro no worker
 * abriria lá uma assinatura de Redis que ninguém leria.
 */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
