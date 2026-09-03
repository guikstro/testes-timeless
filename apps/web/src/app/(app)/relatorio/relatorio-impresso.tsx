import { FunilSimples } from "../dashboard/funil-simples";
import { formatCentsAsBRL } from "@/lib/currency";
import { formatDuration } from "@/lib/duration";
import { formataDia } from "@/lib/periodo";
import { Marca } from "@/components/marca";

/**
 * O relatório em si, pronto para ser lido e impresso.
 *
 * Antes esta tela só montava um prompt para colar no ChatGPT: o produto tinha
 * todos os números e ainda assim mandava o cliente para outro lugar montar o
 * documento. Agora ele existe aqui, e o prompt continua disponível para quem
 * quiser uma versão desenhada por IA.
 *
 * Feito para virar PDF pela impressão do navegador, em vez de gerar arquivo no
 * servidor: sem biblioteca nova, e o resultado sai com as fontes e as cores da
 * marca já aplicadas.
 */
export interface DadosDoRelatorio {
  cliente: string;
  periodo: { de: string; ate: string; dias: number };
  totais: {
    leads: number;
    aproveitaveis: number;
    qualificados: number;
    reunioes: number;
    vendas: number;
    receitaCentavos: number;
    descartados: number;
  };
  anterior: { leads: number; vendas: number; receitaCentavos: number };
  atendimento: { medianaSegundos: number | null; semResposta: number; respondidos: number };
  origens: { nome: string; leads: number; vendas: number; receitaCentavos: number }[];
  investimento: { campanha: string; plataforma: string; totalCentavos: number; dias: number }[];
}

function variacao(atual: number, anterior: number): string | null {
  // Sem base anterior não há proporção: sair de zero para dez é começar, não
  // crescer infinitamente.
  if (anterior === 0) return null;
  const delta = Math.round(((atual - anterior) / anterior) * 100);
  return `${delta >= 0 ? "+" : ""}${delta}%`;
}

export function RelatorioImpresso({ dados }: { dados: DadosDoRelatorio }) {
  const { totais, anterior, atendimento } = dados;
  const investido = dados.investimento.reduce((soma, linha) => soma + linha.totalCentavos, 0);

  const custoPorLead = investido > 0 && totais.leads > 0 ? Math.round(investido / totais.leads) : null;
  const custoPorVenda = investido > 0 && totais.vendas > 0 ? Math.round(investido / totais.vendas) : null;
  const retorno = investido > 0 ? totais.receitaCentavos / investido : null;
  const ticket = totais.vendas > 0 ? Math.round(totais.receitaCentavos / totais.vendas) : null;

  return (
    <article className="space-y-8 print:space-y-6">
      <header className="border-b border-line pb-6">
        {/*
          A marca assina o documento, discreta, junto do que ele é. O nome do
          cliente continua sendo o título: quem recebe o relatório é ele, e a
          ferramenta que produziu a medição entra como assinatura, não como
          cabeçalho. O verde sobrevive à impressão porque o bloco de `@media
          print` redefine os neutros e não toca no acento.
        */}
        <p className="flex items-center gap-2 text-rotulo font-semibold uppercase tracking-[0.14em] text-ink-mute">
          <Marca tamanho={14} className="shrink-0 text-accent" />
          Relatório de performance
        </p>
        <h2 className="mt-1 font-display text-[clamp(1.7rem,4vw,2.4rem)] font-semibold tracking-tight text-ink">
          {dados.cliente}
        </h2>
        <p className="mt-1 text-corpo text-ink-soft">
          {formataDia(dados.periodo.de)} a {formataDia(dados.periodo.ate)} · {dados.periodo.dias} dias
        </p>
      </header>

      <Secao titulo="O período em números">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Numero rotulo="Leads" valor={String(totais.leads)} nota={variacao(totais.leads, anterior.leads)} />
          <Numero rotulo="Clientes novos" valor={String(totais.vendas)} nota={variacao(totais.vendas, anterior.vendas)} />
          <Numero
            rotulo="Receita"
            valor={formatCentsAsBRL(totais.receitaCentavos)}
            nota={variacao(totais.receitaCentavos, anterior.receitaCentavos)}
          />
          <Numero
            rotulo="Ticket médio"
            valor={ticket === null ? "Sem base" : formatCentsAsBRL(ticket)}
          />
        </div>
      </Secao>

      {investido > 0 ? (
        <Secao titulo="O que foi investido, e o que voltou">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Numero rotulo="Investido" valor={formatCentsAsBRL(investido)} />
            <Numero rotulo="Custo por lead" valor={custoPorLead === null ? "Sem base" : formatCentsAsBRL(custoPorLead)} />
            <Numero rotulo="Custo por cliente" valor={custoPorVenda === null ? "Sem base" : formatCentsAsBRL(custoPorVenda)} />
            <Numero
              rotulo="Retorno"
              valor={retorno === null ? "Sem base" : `${retorno.toFixed(2).replace(".", ",")}x`}
              destaque
            />
          </div>

          <table className="mt-6 w-full text-left">
            <thead>
              <tr className="border-b border-line text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
                <th className="py-2 font-semibold">Campanha</th>
                <th className="py-2 font-semibold">Plataforma</th>
                <th className="py-2 text-right font-semibold">Dias ativos</th>
                <th className="py-2 text-right font-semibold">Investido</th>
              </tr>
            </thead>
            <tbody>
              {dados.investimento.map((linha) => (
                <tr key={linha.campanha} className="border-b border-line/60 last:border-0">
                  <td className="py-2 text-corpo text-ink">{linha.campanha}</td>
                  <td className="py-2 text-apoio text-ink-mute">{linha.plataforma}</td>
                  <td className="py-2 text-right text-apoio tabular-nums text-ink-soft">{linha.dias}</td>
                  <td className="py-2 text-right text-corpo tabular-nums text-ink">
                    {formatCentsAsBRL(linha.totalCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>
      ) : (
        <Secao titulo="O que foi investido">
          <p className="text-corpo leading-relaxed text-ink-soft">
            Nenhum investimento foi lançado neste período, então o relatório fala de volume e receita, e não de
            eficiência. Custo por lead, custo por cliente e retorno aparecem assim que o gasto das campanhas for
            registrado.
          </p>
        </Secao>
      )}

      <Secao titulo="Onde as pessoas param">
        <FunilSimples
          etapas={[
            { chave: "leads", rotulo: "Chegaram", valor: totais.leads, saida: "foram descartados ou não responderam" },
            { chave: "qualificados", rotulo: "Qualificados", valor: totais.qualificados, saida: "não avançaram" },
            { chave: "reunioes", rotulo: "Reuniões", valor: totais.reunioes, saida: "não fecharam" },
            { chave: "vendas", rotulo: "Clientes", valor: totais.vendas },
          ]}
        />
      </Secao>

      {dados.origens.length > 0 ? (
        <Secao titulo="De onde vieram">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
                <th className="py-2 font-semibold">Origem</th>
                <th className="py-2 text-right font-semibold">Leads</th>
                <th className="py-2 text-right font-semibold">Clientes</th>
                <th className="py-2 text-right font-semibold">Fecha</th>
                <th className="py-2 text-right font-semibold">Receita</th>
              </tr>
            </thead>
            <tbody>
              {dados.origens.map((origem) => (
                <tr key={origem.nome} className="border-b border-line/60 last:border-0">
                  <td className="py-2 text-corpo text-ink">{origem.nome}</td>
                  <td className="py-2 text-right text-corpo tabular-nums text-ink-soft">{origem.leads}</td>
                  <td className="py-2 text-right text-corpo tabular-nums text-ink-soft">{origem.vendas}</td>
                  <td className="py-2 text-right text-corpo tabular-nums text-ink-soft">
                    {origem.leads > 0 ? `${Math.round((origem.vendas / origem.leads) * 100)}%` : "Sem base"}
                  </td>
                  <td className="py-2 text-right text-corpo tabular-nums text-ink">
                    {formatCentsAsBRL(origem.receitaCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>
      ) : null}

      <Secao titulo="Atendimento">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Numero rotulo="Resposta típica" valor={formatDuration(atendimento.medianaSegundos)} destaque />
          <Numero rotulo="Respondidos" valor={String(atendimento.respondidos)} />
          <Numero rotulo="Sem resposta" valor={String(atendimento.semResposta)} />
        </div>
        {/* Mediana e não média: um lead respondido dias depois puxaria a média
            e faria uma operação boa parecer ruim. */}
        <p className="mt-4 text-apoio leading-relaxed text-ink-mute">
          O tempo de resposta é a mediana, não a média, e considera o horário de atendimento configurado.
        </p>
      </Secao>

      {/*
        O que o relatório não sabe, dito por ele mesmo. Sem esta nota, quem lê
        supõe que a ausência de impressões e cliques é omissão, e não limite do
        que a plataforma mede.
      */}
      <Secao titulo="O que este relatório não cobre">
        <p className="text-corpo leading-relaxed text-ink-soft">
          Impressões, alcance, cliques, CTR, CPC, CPM e frequência não são medidos por esta plataforma. Ela acompanha
          o que acontece a partir do momento em que a pessoa manda a primeira mensagem, e o investimento que foi
          lançado aqui. Para incluir os números de mídia, pegue-os no gerenciador de anúncios da plataforma.
        </p>
      </Secao>
    </article>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    // `break-inside` evita a seção ser cortada ao meio na virada da página
    // impressa, que é o defeito mais comum de relatório feito para tela.
    <section className="break-inside-avoid">
      <h3 className="mb-4 text-rotulo font-semibold uppercase tracking-[0.12em] text-ink-mute">{titulo}</h3>
      {children}
    </section>
  );
}

function Numero({
  rotulo,
  valor,
  nota,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  nota?: string | null;
  destaque?: boolean;
}) {
  return (
    <div>
      <p className="text-rotulo font-semibold uppercase tracking-[0.1em] text-ink-mute">{rotulo}</p>
      <p
        className={`mt-1 font-display font-semibold tabular-nums ${
          destaque ? "text-[clamp(1.5rem,3vw,1.9rem)] text-accent" : "text-[clamp(1.3rem,2.6vw,1.6rem)] text-ink"
        }`}
      >
        {valor}
      </p>
      {nota ? <p className="mt-0.5 text-rotulo text-ink-mute">{nota} vs. período anterior</p> : null}
    </div>
  );
}
