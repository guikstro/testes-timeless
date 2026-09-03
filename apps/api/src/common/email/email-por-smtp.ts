import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createTransport, Transporter } from "nodemailer";
import { MensagemDeEmail, ProvedorDeEmail } from "./provedor-de-email";

/**
 * Entrega de verdade, por SMTP.
 *
 * SMTP e não a API de um serviço específico: quase todo provedor de envio
 * (SES, Resend, Postmark, Mailgun) oferece SMTP, então um transporte só
 * atende todos e trocar de fornecedor vira mudança de variável, não de
 * código.
 *
 * O transporte é criado uma vez e reaproveitado. Ele mantém a conexão viva
 * entre envios, e abrir uma conexão TLS por e-mail seria pagar o aperto de
 * mão toda vez.
 */
@Injectable()
export class EmailPorSmtp extends ProvedorDeEmail implements OnModuleDestroy {
  private readonly logger = new Logger("Email");
  private readonly transporte: Transporter;
  private readonly remetente: string;

  constructor() {
    super();
    const porta = Number(process.env.SMTP_PORT ?? 587);
    const usuario = process.env.SMTP_USER;
    const senha = process.env.SMTP_PASSWORD;

    this.remetente = process.env.EMAIL_REMETENTE ?? "nao-responda@localhost";
    this.transporte = createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      // 465 é TLS desde o primeiro byte; as outras portas começam em claro e
      // sobem para TLS com STARTTLS. Errar isto dá "conexão fechada" sem
      // explicação, então a porta decide sozinha.
      secure: porta === 465,
      ...(usuario && senha ? { auth: { user: usuario, pass: senha } } : {}),
    });
  }

  get nome(): string {
    return "smtp";
  }

  async enviar(mensagem: MensagemDeEmail): Promise<void> {
    await this.transporte.sendMail({
      from: this.remetente,
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
      ...(mensagem.html ? { html: mensagem.html } : {}),
    });

    // Sem assunto nem corpo: um log de entrega não precisa guardar o conteúdo
    // do que foi mandado, e guardar deixaria token de recuperação no disco.
    this.logger.log(JSON.stringify({ event: "email_enviado", para: mensagem.para }));
  }

  async onModuleDestroy(): Promise<void> {
    this.transporte.close();
  }
}
