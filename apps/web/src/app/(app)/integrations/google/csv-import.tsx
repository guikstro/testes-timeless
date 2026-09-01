"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { importarCsv, preverCsv } from "./actions";

interface Previa {
  cabecalho: string[];
  sugestaoData: number | null;
  sugestaoValor: number | null;
  totalLinhas: number;
  amostra: string[][];
}

interface Resultado {
  importados: number;
  ignoradas: { linha: number; motivo: string }[];
  totalIgnoradas: number;
  periodo: { de: string; ate: string };
  totalCentavos: number;
}

/**
 * Importação em duas etapas.
 *
 * Nenhum relatório de anúncio é padronizado, e escrever direto significaria
 * descobrir a coluna errada depois de o dado já estar no banco. A prévia
 * mostra o que foi encontrado e deixa corrigir a leitura antes de gravar.
 */
export function ImportarCsv({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [colunaData, setColunaData] = useState(0);
  const [colunaValor, setColunaValor] = useState(1);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function aoEscolherArquivo(arquivo: File) {
    setErro(null);
    setResultado(null);
    setNomeArquivo(arquivo.name);
    setOcupado(true);

    try {
      const texto = await arquivo.text();
      setConteudo(texto);

      const resposta = await preverCsv(texto);
      if ("error" in resposta) {
        setErro(resposta.error);
        setPrevia(null);
        return;
      }

      setPrevia(resposta);
      // As sugestões vêm do servidor pelo nome da coluna; quando ele não
      // reconhece, cai nas duas primeiras, que a pessoa corrige.
      setColunaData(resposta.sugestaoData ?? 0);
      setColunaValor(resposta.sugestaoValor ?? 1);
    } catch {
      setErro("Não consegui ler o arquivo.");
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (!conteudo) return;
    setErro(null);
    setOcupado(true);

    const resposta = await importarCsv(campaignId, conteudo, colunaData, colunaValor);
    setOcupado(false);

    if ("error" in resposta) {
      setErro(resposta.error);
      return;
    }

    setResultado(resposta);
    setPrevia(null);
    setConteudo(null);
    router.refresh();
  }

  if (resultado) {
    return (
      <div className="animate-rise-in rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
        <p className="text-[13px] font-medium text-ink">
          {resultado.importados} dia(s) importado(s), de {resultado.periodo.de.split("-").reverse().join("/")} a{" "}
          {resultado.periodo.ate.split("-").reverse().join("/")}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-soft">
          Total de {(resultado.totalCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </p>

        {resultado.totalIgnoradas > 0 ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] text-amber-700 dark:text-amber-400">
              {resultado.totalIgnoradas} linha(s) não foram lidas
            </summary>
            <ul className="mt-2 space-y-0.5">
              {resultado.ignoradas.map((item) => (
                <li key={item.linha} className="text-[11.5px] text-ink-mute">
                  Linha {item.linha}: {item.motivo}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <button
          type="button"
          onClick={() => setResultado(null)}
          className="focus-ring mt-3 rounded text-[12px] text-ink-mute underline decoration-line underline-offset-4 hover:text-ink"
        >
          Importar outro arquivo
        </button>
      </div>
    );
  }

  return (
    <div>
      {!previa ? (
        <label className="focus-within:ring-accent/15 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-panel-soft/40 px-4 py-6 text-center transition-colors hover:border-accent/40 focus-within:ring-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="mb-2 h-6 w-6 text-ink-mute" aria-hidden>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
          </svg>
          <span className="text-[13px] font-medium text-ink">Escolher relatório</span>
          <span className="mt-0.5 text-[11.5px] text-ink-mute">
            CSV exportado do Google Ads, ou de qualquer plataforma
          </span>
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="sr-only"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) void aoEscolherArquivo(arquivo);
            }}
          />
        </label>
      ) : (
        <div className="animate-rise-in rounded-xl border border-line bg-panel-soft/40 p-4">
          <p className="text-[12.5px] text-ink-soft">
            <span className="font-medium text-ink">{nomeArquivo}</span> · {previa.totalLinhas} linha(s)
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11.5px] text-ink-mute">Coluna da data</span>
              <select
                value={colunaData}
                onChange={(e) => setColunaData(Number(e.target.value))}
                className="h-9 w-full rounded-lg border border-line bg-panel px-2 text-[12.5px] text-ink focus:border-accent focus:outline-none"
              >
                {previa.cabecalho.map((titulo, indice) => (
                  <option key={indice} value={indice}>
                    {titulo || `Coluna ${indice + 1}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11.5px] text-ink-mute">Coluna do gasto</span>
              <select
                value={colunaValor}
                onChange={(e) => setColunaValor(Number(e.target.value))}
                className="h-9 w-full rounded-lg border border-line bg-panel px-2 text-[12.5px] text-ink focus:border-accent focus:outline-none"
              >
                {previa.cabecalho.map((titulo, indice) => (
                  <option key={indice} value={indice}>
                    {titulo || `Coluna ${indice + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Amostra do que será lido com as colunas escolhidas: é o que
              permite perceber a troca antes de gravar, e não depois. */}
          <div className="mt-3 overflow-x-auto rounded-lg border border-line/60 bg-panel">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-line/60">
                  <th className="px-2.5 py-1.5 text-[10.5px] uppercase tracking-wide text-ink-mute">Data lida</th>
                  <th className="px-2.5 py-1.5 text-[10.5px] uppercase tracking-wide text-ink-mute">Gasto lido</th>
                </tr>
              </thead>
              <tbody>
                {previa.amostra.map((linha, indice) => (
                  <tr key={indice} className="border-b border-line/40 last:border-0">
                    <td className="px-2.5 py-1.5 text-ink-soft">{linha[colunaData] ?? ""}</td>
                    <td className="px-2.5 py-1.5 tabular-nums text-ink-soft">{linha[colunaValor] ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button onClick={confirmar} loading={ocupado} size="sm">
              {ocupado ? "Importando" : `Importar ${previa.totalLinhas} linha(s)`}
            </Button>
            <button
              type="button"
              onClick={() => {
                setPrevia(null);
                setConteudo(null);
              }}
              className="focus-ring rounded-lg px-2.5 py-1.5 text-[12px] text-ink-mute transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro ? <p className="mt-2 text-[12.5px] text-red-600 dark:text-red-400">{erro}</p> : null}
    </div>
  );
}
