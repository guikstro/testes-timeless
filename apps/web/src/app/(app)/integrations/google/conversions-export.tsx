"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { formatCentsAsBRL } from "@/lib/currency";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { contaExportaveis, LinhaDeConversao, montaCsv, NomesDasAcoes } from "@/lib/google/conversoes-csv";
import { EstadoDasAcoes, salvarAcoesDeConversao } from "./conversion-actions";
import { PERIODOS } from "./periodos";

const inicial: EstadoDasAcoes = {};

export function ConversionsExport({
  linhas,
  acoes,
  semGclid,
  moeda,
  dias,
}: {
  linhas: LinhaDeConversao[];
  acoes: NomesDasAcoes;
  semGclid: { qualificados: number; vendas: number };
  moeda: string;
  dias: number;
}) {
  const [estado, salvar, salvando] = useActionState(salvarAcoesDeConversao, inicial);

  const exportaveis = contaExportaveis(linhas, acoes);
  const recusadas = linhas.filter((linha) => linha.foraDaJanela).length;
  const faltamNomes = !acoes.qualificado && !acoes.venda;

  function baixar() {
    const conteudo = montaCsv(linhas, acoes, moeda);
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `conversoes-google-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="surface p-5">
      <div className="mb-4">
        <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">
          Devolver conversões para o Google
        </h2>
        <p className="mt-1 text-corpo leading-relaxed text-ink-soft">
          O Google só sabe quem clicou. Sem receber de volta quem virou cliente, ele continua comprando o tráfego que
          gera clique, e não o que gera venda. Este arquivo conta a ele o que aconteceu depois do clique.
        </p>
      </div>

      <form action={salvar} className="mb-5 space-y-4 rounded-xl border border-line/70 bg-panel-soft/40 p-4">
        <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">Nomes das ações</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ação de lead qualificado" hint="Igual ao nome no Google Ads, letra por letra.">
            {(id) => (
              <Input
                id={id}
                name="googleConversionQualified"
                defaultValue={acoes.qualificado ?? ""}
                placeholder="Lead qualificado"
              />
            )}
          </Field>
          <Field label="Ação de venda" hint="Deixe em branco para não exportar este tipo.">
            {(id) => (
              <Input id={id} name="googleConversionWon" defaultValue={acoes.venda ?? ""} placeholder="Venda" />
            )}
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" size="sm" loading={salvando}>
            {salvando ? "Salvando..." : "Salvar nomes"}
          </Button>
          {estado.erro ? (
            <p className="text-apoio text-red-600 dark:text-red-400">{estado.erro}</p>
          ) : estado.salvoEm ? (
            <p className="text-apoio text-emerald-700 dark:text-emerald-400">Nomes salvos.</p>
          ) : null}
        </div>
        {/*
          O Google casa a linha do arquivo pelo nome da ação. Um acento ou uma
          maiúscula fora do lugar faz a linha ser descartada sem erro visível,
          e a pessoa só descobre semanas depois pelo relatório vazio.
        */}
        <p className="text-rotulo leading-relaxed text-ink-mute">
          Crie as ações em Ferramentas, Conversões, Importar, e copie os nomes exatamente como ficaram lá.
        </p>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <GrupoDePilulas
          ativo={String(dias)}
          opcoes={PERIODOS.map((opcao) => ({
            chave: String(opcao),
            rotulo: `${opcao} dias`,
            href: `/integrations/google?dias=${opcao}`,
          }))}
        />
        <Button onClick={baixar} disabled={exportaveis === 0} size="sm">
          Baixar {exportaveis} {exportaveis === 1 ? "conversão" : "conversões"}
        </Button>
      </div>

      {faltamNomes ? (
        <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-apoio leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          Informe ao menos um nome de ação acima. Sem ele, a linha não teria como casar com nada no Google.
        </p>
      ) : null}

      {linhas.length === 0 ? (
        <p className="rounded-xl border border-line bg-panel-soft/60 px-3.5 py-3 text-apoio leading-relaxed text-ink-mute">
          Nenhuma conversão de lead vindo do Google neste período. Só entram aqui os leads que chegaram por um{" "}
          <Link href="/links" className="text-ink underline decoration-line underline-offset-4">
            link rastreável
          </Link>{" "}
          usado num anúncio do Google, porque é o clique dele que carrega o identificador.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line/70">
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[36rem] text-left">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-line text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
                  <th className="px-3.5 py-2.5 font-semibold">Lead</th>
                  <th className="px-3.5 py-2.5 font-semibold">Conversão</th>
                  <th className="px-3.5 py-2.5 font-semibold">Quando</th>
                  <th className="px-3.5 py-2.5 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr
                    key={`${linha.leadId}-${linha.tipo}`}
                    className={`border-b border-line/60 last:border-0 ${linha.foraDaJanela ? "opacity-55" : ""}`}
                  >
                    <td className="px-3.5 py-2.5 text-apoio text-ink">
                      <Link href={`/leads/${linha.leadId}`} className="hover:underline">
                        {linha.leadNome ?? "Sem nome"}
                      </Link>
                      {linha.foraDaJanela ? (
                        <span className="ml-2 inline-block align-middle">
                          <Badge tone="warning">Fora dos 90 dias</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3.5 py-2.5 text-apoio text-ink-soft">
                      {linha.tipo === "QUALIFIED" ? "Lead qualificado" : "Venda"}
                    </td>
                    <td className="px-3.5 py-2.5 text-apoio text-ink-mute" title={dataCompleta(linha.ocorridoEm)}>
                      {tempoRelativo(linha.ocorridoEm)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-apoio tabular-nums text-ink-soft">
                      {linha.valorCentavos === null ? "Sem valor" : formatCentsAsBRL(linha.valorCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/*
        As duas subtrações que a pessoa vai fazer de cabeça ao comparar este
        número com o painel de vendas. Respondidas antes de virarem dúvida.
      */}
      <div className="mt-3 space-y-1.5 text-rotulo leading-relaxed text-ink-mute">
        {recusadas > 0 ? (
          <p>
            {recusadas} {recusadas === 1 ? "conversão fica" : "conversões ficam"} de fora do arquivo porque o clique
            tem mais de noventa dias, que é o limite do Google. Elas continuam na lista acima só para você saber que
            existem.
          </p>
        ) : null}
        {semGclid.qualificados + semGclid.vendas > 0 ? (
          <p>
            Outros {semGclid.qualificados + semGclid.vendas} eventos do período não têm identificador de clique do
            Google, então não voltam. São leads que chegaram por outro caminho, ou por link sem rastreio.
          </p>
        ) : null}
      </div>

      <details className="mt-4 rounded-xl border border-line/70 bg-panel-soft/40 p-4">
        <summary className="cursor-pointer text-corpo font-medium text-ink">Como enviar ao Google</summary>
        <ol className="mt-3 space-y-1.5 text-apoio leading-relaxed text-ink-soft">
          <li>1. No Google Ads, abra Ferramentas, Conversões, Importações.</li>
          <li>2. Escolha enviar por upload de arquivo e envie o CSV baixado aqui.</li>
          <li>3. Confira o relatório de importação: ele diz quantas linhas entraram e quais foram recusadas.</li>
        </ol>
        <p className="mt-3 text-rotulo leading-relaxed text-ink-mute">
          Enviar o mesmo período duas vezes não duplica: o Google ignora a linha repetida quando o identificador, o
          nome da ação e o horário são os mesmos.
        </p>
      </details>
    </section>
  );
}
