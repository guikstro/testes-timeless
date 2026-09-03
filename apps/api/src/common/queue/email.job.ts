/**
 * Um e-mail já pronto, esperando entrega.
 *
 * A mensagem vai montada no job, e não os ingredientes dela: assim o worker
 * não precisa saber o que é um token de recuperação nem como se monta o
 * endereço da aplicação. Ele só entrega o que recebeu.
 */
export interface EmailJob {
  para: string;
  assunto: string;
  texto: string;
  html?: string;
}
