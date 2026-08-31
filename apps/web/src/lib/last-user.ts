/**
 * Guarda o primeiro nome de quem entrou por último, só para cumprimentar.
 *
 * Fica no navegador de propósito. A alternativa seria um endpoint que recebe
 * um e-mail e devolve o nome, e isso diria a qualquer um quais e-mails têm
 * conta na plataforma. O login atual evita justamente isso: compara a senha
 * contra um hash falso quando o usuário não existe, para o tempo de resposta
 * não denunciar nada, e devolve sempre a mesma mensagem de erro.
 *
 * Só é gravado depois de uma entrada bem-sucedida, então o nome nunca é um
 * palpite: é de alguém que provou ser quem diz ser naquele navegador.
 */
const CHAVE = "timeless-ultimo-nome";

export function lerUltimoNome(): string | null {
  try {
    const valor = window.localStorage.getItem(CHAVE);
    return valor && valor.trim() ? valor : null;
  } catch {
    // Navegação privada e bloqueio de dados de site fazem o acesso lançar.
    return null;
  }
}

export function gravarUltimoNome(nome: string | null): void {
  try {
    if (nome && nome.trim()) window.localStorage.setItem(CHAVE, nome.trim());
    else window.localStorage.removeItem(CHAVE);
  } catch {
    // Não conseguir lembrar não pode impedir ninguém de entrar.
  }
}

export function esquecerUltimoNome(): void {
  gravarUltimoNome(null);
}
