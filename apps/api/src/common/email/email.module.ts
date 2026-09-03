import { BullModule } from "@nestjs/bullmq";
import { Global, Logger, Module } from "@nestjs/common";
import { EMAIL_QUEUE } from "../queue/queue.constants";
import { EmailDeRegistro } from "./email-de-registro";
import { EmailPorSmtp } from "./email-por-smtp";
import { EmailService } from "./email.service";
import { ProvedorDeEmail } from "./provedor-de-email";

/**
 * Escolhe quem entrega, uma vez, na subida.
 *
 * A escolha é explícita por variável e não deduzida do ambiente: deduzir
 * significaria que uma variável esquecida troca o comportamento em silêncio,
 * e o silêncio aqui é justamente não mandar o e-mail que alguém está
 * esperando para voltar a entrar na conta.
 *
 * Em produção, `confereAmbiente` recusa a subida com o provedor de registro,
 * então este caminho nunca fica ligado sem querer lá.
 */
function escolheProvedor(): ProvedorDeEmail {
  const transporte = process.env.EMAIL_TRANSPORTE?.trim().toLowerCase() || "registro";
  const provedor = transporte === "smtp" ? new EmailPorSmtp() : new EmailDeRegistro();

  new Logger("Email").log(JSON.stringify({ event: "provedor_de_email", provedor: provedor.nome }));
  return provedor;
}

// Global porque a API e o worker precisam, e importar em cada módulo que
// manda e-mail só espalharia repetição.
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: EMAIL_QUEUE })],
  providers: [{ provide: ProvedorDeEmail, useFactory: escolheProvedor }, EmailService],
  exports: [ProvedorDeEmail, EmailService],
})
export class EmailModule {}
