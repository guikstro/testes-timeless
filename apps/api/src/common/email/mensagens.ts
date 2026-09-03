/**
 * O texto dos e-mails, num lugar só.
 *
 * Separado de quem envia porque é conteúdo, não transporte: mudar uma
 * palavra aqui não deve exigir entender fila nem SMTP. E ficando junto, dá
 * para ler os três e perceber que falam a mesma língua.
 *
 * Só texto, sem HTML. Um e-mail de segurança precisa chegar e ser lido, e
 * texto puro atravessa qualquer leitor e qualquer filtro sem virar uma caixa
 * vazia com "veja este e-mail no navegador".
 */
import { MensagemDeEmail } from "./provedor-de-email";

export function recuperacaoDeSenha(para: string, nome: string, endereco: string): MensagemDeEmail {
  return {
    para,
    assunto: "Redefinir sua senha",
    texto: [
      `Olá, ${nome}.`,
      "",
      "Alguém pediu para redefinir a senha desta conta. Se foi você, abra o endereço abaixo:",
      "",
      endereco,
      "",
      "O link vale por uma hora e só pode ser usado uma vez.",
      "",
      "Se não foi você, ignore este e-mail. Nada muda enquanto o link não for aberto.",
    ].join("\n"),
  };
}

/**
 * Aviso de que a senha mudou.
 *
 * Vai para o endereço da conta depois da troca, e não pede nenhuma ação de
 * quem trocou. Existe para quem NÃO trocou: é assim que a pessoa descobre no
 * mesmo dia que perdeu a conta, em vez de na próxima vez que tentar entrar.
 */
export function senhaAlterada(para: string, nome: string): MensagemDeEmail {
  return {
    para,
    assunto: "Sua senha foi alterada",
    texto: [
      `Olá, ${nome}.`,
      "",
      "A senha desta conta acabou de ser alterada, e as outras sessões foram encerradas.",
      "",
      "Se foi você, não precisa fazer nada.",
      "",
      "Se não foi você, use a recuperação de senha na tela de entrada agora para retomar a conta.",
    ].join("\n"),
  };
}

/**
 * Aviso de troca de e-mail, mandado para o endereço ANTIGO.
 *
 * Para o antigo de propósito. Mandar para o novo avisaria justamente quem fez
 * a troca, que já sabe. O endereço antigo é o único canal que ainda alcança o
 * dono legítimo depois de uma tomada de conta, e sem este aviso a troca é
 * completamente silenciosa para ele.
 */
export function emailAlterado(para: string, nome: string, novoEmail: string): MensagemDeEmail {
  return {
    para,
    assunto: "O e-mail de acesso da sua conta foi alterado",
    texto: [
      `Olá, ${nome}.`,
      "",
      `O e-mail de acesso desta conta foi alterado para ${novoEmail}.`,
      "",
      "Se foi você, não precisa fazer nada. Este endereço deixa de servir para entrar.",
      "",
      "Se não foi você, procure o suporte imediatamente: quem fez a troca passou a",
      "controlar o acesso e a recuperação de senha desta conta.",
    ].join("\n"),
  };
}
