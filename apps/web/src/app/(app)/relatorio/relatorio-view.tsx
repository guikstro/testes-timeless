import Link from "next/link";
import { CopyPrompt } from "./copy-prompt";

export const PERIODOS = [7, 30, 90];

/**
 * Separado da página para que a montagem dos dados e a apresentação possam ser
 * verificadas em separado: a página busca no servidor, esta vista só desenha.
 */
export function RelatorioView({
  bloco,
  prompt,
  nomeArquivo,
  days,
}: {
  bloco: string;
  prompt: string;
  nomeArquivo: string;
  days: number;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Relatório para o cliente</h1>
      <p className="mb-6 mt-1 text-sm text-ink-mute">
        O sistema monta o prompt com os números reais do período. Cole no ChatGPT para gerar o relatório em HTML.
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-line bg-panel p-1">
          {PERIODOS.map((opcao) => (
            <Link
              key={opcao}
              href={`/relatorio?days=${opcao}`}
              aria-current={opcao === days ? "page" : undefined}
              className={`focus-ring rounded-full px-3.5 py-1.5 text-[13px] transition-all duration-200 ${
                opcao === days ? "bg-ink text-canvas" : "text-ink-soft hover:text-ink"
              }`}
            >
              {opcao} dias
            </Link>
          ))}
        </div>

        <CopyPrompt prompt={prompt} nomeArquivo={nomeArquivo} />
      </div>

      {/*
        Mostrar só o bloco de dados, e não o prompt inteiro: as trinta e duas
        seções de instrução são sempre iguais, e exibi-las esconderia o que
        realmente muda a cada execução, que são os números.
      */}
      <div className="surface mb-5 p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-ink-mute">
            Dados desta execução
          </h2>
          <span className="text-[11.5px] text-ink-mute">confira antes de enviar</span>
        </div>
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl bg-panel-soft/60 p-4 font-mono text-[12px] leading-relaxed text-ink-soft">
          {bloco}
        </pre>
      </div>

      <div className="rounded-2xl border border-line bg-panel-soft/50 p-5">
        <h2 className="text-[13px] font-semibold text-ink">Como usar</h2>
        <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-soft">
          <li>1. Copie o prompt e cole numa conversa nova do ChatGPT.</li>
          <li>2. Anexe na mesma mensagem a logo do cliente, os criativos e as imagens que quiser usar.</li>
          <li>3. Peça o arquivo <code className="rounded bg-panel px-1 py-0.5 text-[11.5px]">index.html</code> pronto e publique onde preferir.</li>
        </ol>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-mute">
          O prompt instrui a nunca inventar métrica ausente, e o bloco acima diz explicitamente quais dados não
          existem nesta execução. Impressões, alcance, cliques e CTR não são medidos por esta plataforma; se você
          quiser essas seções no relatório, cole os números do Gerenciador de Anúncios junto.
        </p>
      </div>
    </div>
  );
}
