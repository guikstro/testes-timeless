import { apiFetch } from "@/lib/api-client";
import { AvisoDeMedicao } from "@/components/aviso-de-medicao";
import { conexaoDoWhatsApp } from "@/lib/conexao-do-whatsapp";
import { inicioDaMedicao, medicaoDeLeads } from "@/lib/medicao-de-leads";
import { montaBlocoDeDados } from "@/lib/relatorio/dados";
import { montaPrompt } from "@/lib/relatorio/prompt";
import { RelatorioView } from "./relatorio-view";
import { periodoValido } from "./periodos";
import { DadosDoRelatorio, RelatorioImpresso } from "./relatorio-impresso";
import { RelatorioLocalImpresso } from "./relatorio-local-impresso";
import { montaBlocoDePresencaLocal, DadosDePresencaLocal } from "@/lib/relatorio/dados";
import { sessaoAtual } from "@/lib/sessao";
import type { PresencaLocal } from "../dashboard/painel-presenca-local";

interface Overview {
  period: { days: number; from: string; to: string };
  totals: {
    leads: number;
    disqualified: number;
    qualified: number;
    meetings: number;
    won: number;
    revenueCents: number;
  };
  comparacao: {
    leads: { anterior: number };
    qualified: { anterior: number };
    meetings: { anterior: number };
    won: { anterior: number };
    revenueCents: { anterior: number };
  };
  atendimento: {
    medianaPrimeiraRespostaSegundos: number | null;
    aguardando: number;
    semResposta: number;
    respondidos: number;
  };
  byOrigin: { label: string; leads: number; meetings: number; won: number; revenueCents: number }[];
  daily: { date: string; leads: number; won: number }[];
}

interface Investimento {
  id: string;
  name: string;
  platform: "META" | "GOOGLE";
  diasComGasto: number;
  totalCents: number;
}

interface Organizacao {
  name: string;
}

export default async function RelatorioPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = periodoValido(params.days);

  // Quem é só presença local recebe o relatório de ligações e rotas.
  const { organization } = await sessaoAtual();
  if (organization.foco === "PRESENCA_LOCAL") return <RelatorioDePresencaLocal days={days} cliente={organization.name} />;

  const [overview, investimentos, organizacao, conexao] = await Promise.all([
    apiFetch<Overview>(`/analytics/overview?days=${days}`),
    apiFetch<Investimento[]>(`/campaigns/investimento?days=${days}`),
    apiFetch<Organizacao>("/organizations/current"),
    conexaoDoWhatsApp(),
  ]);

  const inicio = overview.period.from.slice(0, 10);
  const fim = overview.period.to.slice(0, 10);
  const medicao = medicaoDeLeads({ conexao, ate: fim, leads: overview.totals.leads });

  const bloco = montaBlocoDeDados({
    cliente: organizacao.name,
    periodo: { de: inicio, ate: fim, dias: days },
    totais: {
      leads: overview.totals.leads,
      qualificados: overview.totals.qualified,
      reunioes: overview.totals.meetings,
      vendas: overview.totals.won,
      receitaCentavos: overview.totals.revenueCents,
      descartados: overview.totals.disqualified,
    },
    anterior: {
      leads: overview.comparacao.leads.anterior,
      qualificados: overview.comparacao.qualified.anterior,
      reunioes: overview.comparacao.meetings.anterior,
      vendas: overview.comparacao.won.anterior,
      receitaCentavos: overview.comparacao.revenueCents.anterior,
    },
    atendimento: overview.atendimento,
    origens: overview.byOrigin.map((o) => ({
      nome: o.label,
      leads: o.leads,
      reunioes: o.meetings,
      vendas: o.won,
      receitaCentavos: o.revenueCents,
    })),
    diario: overview.daily.map((d) => ({ data: d.date, leads: d.leads, vendas: d.won })),
    // Campanha sem nenhum gasto na janela fica de fora: listá-la com zero faria
    // o relatório afirmar que ela rodou sem custo, quando o caso é que ela não
    // rodou.
    investimento: investimentos
      .filter((campanha) => campanha.totalCents > 0)
      .map((campanha) => ({
        campanha: campanha.name,
        plataforma: campanha.platform === "GOOGLE" ? "Google Ads" : "Meta Ads",
        totalCentavos: campanha.totalCents,
        dias: campanha.diasComGasto,
      })),
  });

  const prompt = montaPrompt(bloco);
  const nomeArquivo = `relatorio-${organizacao.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${inicio}.txt`;

  const dados: DadosDoRelatorio = {
    cliente: organizacao.name,
    medido: medicao === "medido",
    periodo: { de: inicio, ate: fim, dias: days },
    totais: {
      leads: overview.totals.leads,
      aproveitaveis: overview.totals.leads - overview.totals.disqualified,
      qualificados: overview.totals.qualified,
      reunioes: overview.totals.meetings,
      vendas: overview.totals.won,
      receitaCentavos: overview.totals.revenueCents,
      descartados: overview.totals.disqualified,
    },
    anterior: {
      leads: overview.comparacao.leads.anterior,
      vendas: overview.comparacao.won.anterior,
      receitaCentavos: overview.comparacao.revenueCents.anterior,
    },
    atendimento: {
      medianaSegundos: overview.atendimento.medianaPrimeiraRespostaSegundos,
      semResposta: overview.atendimento.semResposta,
      respondidos: overview.atendimento.respondidos,
    },
    origens: overview.byOrigin.map((o) => ({
      nome: o.label,
      leads: o.leads,
      vendas: o.won,
      receitaCentavos: o.revenueCents,
    })),
    investimento: investimentos
      .filter((campanha) => campanha.totalCents > 0)
      .map((campanha) => ({
        id: campanha.id,
        campanha: campanha.name,
        plataforma: campanha.platform === "GOOGLE" ? "Google Ads" : "Meta Ads",
        totalCentavos: campanha.totalCents,
        dias: campanha.diasComGasto,
      })),
  };

  return (
    <RelatorioView
      impresso={<RelatorioImpresso dados={dados} />}
      bloco={bloco}
      prompt={prompt}
      nomeArquivo={nomeArquivo}
      days={days}
      aviso={
        // Um relatório para o cliente com "nenhum lead" num período em que o
        // WhatsApp nem recebia seria a afirmação falsa mais cara do produto:
        // é o documento que o cliente leva para decidir se continua.
        <AvisoDeMedicao
          medicao={medicao}
          desde={conexao ? inicioDaMedicao(conexao) : null}
          dispensavel={false}
        />
      }
    />
  );
}

async function RelatorioDePresencaLocal({ days, cliente }: { days: number; cliente: string }) {
  const local = await apiFetch<PresencaLocal>(`/presenca-local?days=${days}`);
  const dados: DadosDePresencaLocal = {
    cliente,
    periodo: { de: local.periodo.de, ate: local.periodo.ate, dias: days },
    ligacoes: local.totais.LIGACOES_DOS_ANUNCIOS,
    rotas: local.totais.ROTAS,
    visitas: local.totais.VISITAS_A_LOJA,
    ligacoesConversao: local.totais.LIGACOES_CONVERSAO,
    investimento: local.investimento,
    campanhas: local.campanhas,
  };
  const bloco = montaBlocoDePresencaLocal(dados);
  return (
    <RelatorioView
      impresso={<RelatorioLocalImpresso dados={dados} />}
      presencaLocal
      bloco={bloco}
      prompt={montaPrompt(bloco)}
      nomeArquivo={`relatorio-${cliente.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${local.periodo.de}.txt`}
      days={days}
    />
  );
}
