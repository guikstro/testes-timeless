"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { CopyPrompt } from "./copy-prompt";
import { DadosDoRelatorio, RelatorioImpresso } from "./relatorio-impresso";
import { PERIODOS } from "./periodos";

/**
 * Separado da página para que a montagem dos dados e a apresentação possam
 * ser verificadas em separado: a página busca no servidor, esta vista só
 * desenha.
 *
 * O relatório pronto vem primeiro e o prompt fica atrás de uma aba. Antes era
 * o contrário, e o produto tinha todos os números mas ainda mandava a pessoa
 * a outro lugar montar o documento.
 */
export function RelatorioView({
  dados,
  bloco,
  prompt,
  nomeArquivo,
  days,
}: {
  dados: DadosDoRelatorio;
  /** O bloco de texto que vai dentro do prompt, mostrado na aba da IA. */
  bloco: string;
  prompt: string;
  nomeArquivo: string;
  days: number;
}) {
  const [aba, setAba] = useState<"pronto" | "ia">("pronto");

  return (
    <div className="mx-auto max-w-4xl">
      {/* Some na impressão: cabeçalho, abas e botões não pertencem ao PDF. */}
      <div className="print:hidden">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Relatório para o cliente</h1>
        <p className="mb-5 mt-1 text-corpo text-ink-mute">
          Pronto para enviar, com os números reais do período.
        </p>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <GrupoDePilulas
              ativo={String(days)}
              opcoes={PERIODOS.map((opcao) => ({
                chave: String(opcao),
                rotulo: `${opcao} dias`,
                href: `/relatorio?days=${opcao}`,
              }))}
            />
            <GrupoDePilulas
              ativo={aba}
              opcoes={[
                { chave: "pronto", rotulo: "Relatório", aoClicar: () => setAba("pronto") },
                { chave: "ia", rotulo: "Gerar com IA", aoClicar: () => setAba("ia") },
              ]}
            />
          </div>

          {aba === "pronto" ? (
            /* Impressão do navegador em vez de gerar PDF no servidor: sem
               biblioteca nova, e sai com as fontes e a cor da marca já
               aplicadas. */
            <Button onClick={() => window.print()} size="sm">
              Imprimir ou salvar em PDF
            </Button>
          ) : (
            <CopyPrompt prompt={prompt} nomeArquivo={nomeArquivo} />
          )}
        </div>
      </div>

      {aba === "pronto" ? (
        <div className="surface p-6 sm:p-8 print:border-0 print:p-0 print:shadow-none">
          <RelatorioImpresso dados={dados} />
        </div>
      ) : (
        <div className="print:hidden">
          <div className="surface mb-5 p-5">
            <h2 className="mb-3 text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">
              Dados desta execução
            </h2>
            <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap rounded-xl bg-panel-soft/60 p-4 font-mono text-[12px] leading-relaxed text-ink-soft">
              {bloco}
            </pre>
          </div>

          <div className="rounded-2xl border border-line bg-panel-soft/50 p-5">
            <h2 className="text-corpo font-semibold text-ink">Como usar</h2>
            <ol className="mt-2 space-y-1.5 text-corpo leading-relaxed text-ink-soft">
              <li>1. Copie o prompt e cole numa conversa nova do ChatGPT.</li>
              <li>2. Anexe a logo do cliente, os criativos e as imagens que quiser usar.</li>
              <li>
                3. Peça o arquivo <code className="rounded bg-panel px-1 py-0.5 text-rotulo">index.html</code> pronto.
              </li>
            </ol>
            <p className="mt-3 text-apoio leading-relaxed text-ink-mute">
              Serve para quando você quer um documento desenhado, com imagens e identidade visual do cliente. Para o
              envio do dia a dia, o relatório da outra aba já está pronto.{" "}
              <Link href="/campanhas" className="text-ink underline decoration-line underline-offset-4">
                Lance o investimento
              </Link>{" "}
              para os dois incluírem custo por lead e retorno.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
