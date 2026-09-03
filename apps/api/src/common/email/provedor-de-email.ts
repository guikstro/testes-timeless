/**
 * O contrato de envio, separado de quem envia.
 *
 * Existe como porta e não como classe única porque quem entrega e-mail muda:
 * hoje é SMTP, amanhã pode ser a API de um serviço, e em desenvolvimento
 * ninguém quer mandar e-mail de verdade. O resto do sistema fala com esta
 * interface e não descobre qual é o caso.
 */
export interface MensagemDeEmail {
  para: string;
  assunto: string;
  /** Corpo em texto. Sempre presente: é o que sobrevive a qualquer leitor. */
  texto: string;
  /** Versão em HTML, quando vale a pena. Opcional de propósito. */
  html?: string;
}

export abstract class ProvedorDeEmail {
  abstract enviar(mensagem: MensagemDeEmail): Promise<void>;
  /** Como este provedor se identifica no log. */
  abstract get nome(): string;
}
