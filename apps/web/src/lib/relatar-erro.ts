/**
 * Conta ao servidor que algo quebrou na tela.
 *
 * Sem isto, uma falha ao renderizar morre no console de quem viu: o servidor
 * responde 200, nada aparece no log, e o defeito só chega até nós se a pessoa
 * se der ao trabalho de contar.
 *
 * Nunca lança. Já estamos numa tela de erro, e um relato que falha e derruba
 * a página de novo entraria em laço.
 */
export async function relatarErro(erro: Error & { digest?: string }): Promise<void> {
  try {
    await fetch("/api/telemetria/erro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensagem: erro.message?.slice(0, 500) || "Erro sem mensagem",
        caminho: typeof window !== "undefined" ? window.location.pathname : undefined,
        digest: erro.digest,
        pilha: erro.stack?.slice(0, 4000),
      }),
      // Continua mesmo se a pessoa fechar a aba logo depois, que é
      // exatamente o que se faz quando a tela quebra.
      keepalive: true,
    });
  } catch {
    // Silêncio de propósito.
  }
}
