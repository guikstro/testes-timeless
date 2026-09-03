import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { EMAIL_QUEUE } from "../queue/queue.constants";
import { EmailJob } from "../queue/email.job";
import { MensagemDeEmail } from "./provedor-de-email";

/**
 * Enfileira, nunca envia daqui.
 *
 * Um servidor de SMTP lento ou fora do ar não pode segurar a resposta de uma
 * requisição: quem pediu para recuperar a senha ficaria olhando uma tela
 * travada por causa de uma coisa que não depende dele. Enfileirar devolve a
 * tela na hora e ainda ganha retentativa com recuo, que é o que faz a
 * diferença entre "o e-mail atrasou" e "o e-mail sumiu".
 *
 * Nunca lança. Quem chama isto está no meio de trocar uma senha ou responder
 * um pedido de recuperação, e falhar a operação inteira porque o aviso sobre
 * ela não pôde ser enfileirado seria trocar um problema pequeno por um
 * grande.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@InjectQueue(EMAIL_QUEUE) private readonly fila: Queue<EmailJob>) {}

  async enfileirar(mensagem: MensagemDeEmail): Promise<void> {
    try {
      await this.fila.add(
        "entregar",
        { para: mensagem.para, assunto: mensagem.assunto, texto: mensagem.texto, html: mensagem.html },
        {
          attempts: 5,
          backoff: { type: "exponential", delay: 10_000 },
          // Some assim que entregue: o corpo pode carregar um link de
          // recuperação, e não há motivo para ele sobreviver no Redis.
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
    } catch (erro) {
      this.logger.error(
        JSON.stringify({ event: "email_nao_enfileirado", assunto: mensagem.assunto, error: String(erro) }),
      );
    }
  }
}
