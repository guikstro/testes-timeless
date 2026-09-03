import { Injectable, Logger } from "@nestjs/common";
import { MensagemDeEmail, ProvedorDeEmail } from "./provedor-de-email";

/**
 * Escreve o e-mail no log em vez de mandar.
 *
 * É o provedor de desenvolvimento, e substitui um remendo pior: a rota de
 * recuperação de senha devolvia o token dentro da própria resposta HTTP, o
 * que funcionava na máquina de quem desenvolve e virava tomada de conta em
 * produção, porque a condição que ligava isso respondia sim quando `NODE_ENV`
 * não estava definida.
 *
 * Aqui o token continua acessível para quem desenvolve, mas no log do
 * servidor, que é um lugar onde só quem já tem acesso à máquina chega.
 */
@Injectable()
export class EmailDeRegistro extends ProvedorDeEmail {
  private readonly logger = new Logger("Email");

  get nome(): string {
    return "registro";
  }

  async enviar(mensagem: MensagemDeEmail): Promise<void> {
    this.logger.log(
      JSON.stringify({
        event: "email_nao_enviado_apenas_registrado",
        para: mensagem.para,
        assunto: mensagem.assunto,
        texto: mensagem.texto,
      }),
    );
  }
}
