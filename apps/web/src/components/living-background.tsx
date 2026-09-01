/**
 * Fundo vivo do app.
 *
 * Duas manchas muito diluídas na cor da marca, à deriva lenta atrás do
 * conteúdo. A opacidade é baixa de propósito: isto é ferramenta de trabalho,
 * aberta por horas, e um fundo que se anuncia compete com o dado que a pessoa
 * precisa ler. O objetivo é a tela não parecer um retângulo branco morto, não
 * chamar atenção para si.
 *
 * Fica em `fixed` para não crescer com a página e não entrar no cálculo de
 * rolagem, e sem ponteiro para nunca interceptar um clique.
 */
export function LivingBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-[20vw] -top-[25vh] h-[70vh] w-[70vw] rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent)/0.10),transparent)] blur-[90px] motion-safe:animate-drift" />
      <div
        className="absolute -bottom-[30vh] -right-[15vw] h-[65vh] w-[60vw] rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent)/0.07),transparent)] blur-[100px] motion-safe:animate-drift"
        style={{ animationDelay: "-9s" }}
      />
    </div>
  );
}
