/**
 * Copiar texto, com caminho reserva.
 *
 * A área de transferência moderna exige contexto seguro, e em
 * `http://localhost` alguns navegadores a recusam, que é exatamente onde este
 * produto roda em desenvolvimento. O `execCommand` é obsoleto e continua
 * funcionando justamente nesse caso.
 *
 * Devolve se conseguiu, em vez de lançar: quem chama precisa dizer à pessoa
 * para copiar à mão, não quebrar a tela.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const deuCerto = document.execCommand("copy");
    document.body.removeChild(area);
    return deuCerto;
  }
}
