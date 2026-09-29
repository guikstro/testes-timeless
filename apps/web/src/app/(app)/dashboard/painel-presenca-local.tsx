import { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { SePuderAbrir } from "@/components/acesso";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { formatCentsAsBRL } from "@/lib/currency";
import { tempoRelativo } from "@/lib/relative-time";
import { StatCard } from "./stat-card";

type Par = { atual: number | null; anterior: number | null };

/** De onde vêm as ligações e rotas, e se estão chegando. */
export interface MedicaoLocal {
  situacao: "sem-google-ads" | "script-desatualizado" | "parcial" | "medido";
  partes: Record<string, string>;
  ultimoEnvioEm: string | null;
}

export interface PresencaLocal extends MedicaoLocal {
  periodo: { de: string; ate: string };
  totais: Record<"LIGACOES_DOS_ANUNCIOS" | "LIGACOES_CONVERSAO" | "ROTAS" | "VISITAS_A_LOJA" | "EXIBICOES_DO_TELEFONE", Par>;
  investimento: Par;
  custo: { porLigacao: Par; porRota: Par };
  serie: { dia: string; ligacoes: number | null; rotas: number | null }[];
  /** Ligação e rota `null` quando a parte do script que as mede não está chegando. */
  campanhas: {
    externalId: string;
    nome: string;
    status: string;
    gastoCentavos: number;
    cliques: number;
    impressoes: number;
    ligacoes: number | null;
    rotas: number | null;
  }[];
}

const variacao = ({ atual, anterior }: Par): number | null =>
  atual === null || anterior === null || anterior === 0 ? null : (atual - anterior) / anterior;

const PARTE: Record<string, string> = { ligacoes: "as ligações dos anúncios", acoesLocais: "as ações locais (rotas e visitas)" };

/**
 * O painel de quem vive de presença local: ligações, pedidos de rota e visitas
 * que os anúncios do Google trouxeram, e quanto cada um custou.
 *
 * O que não está sendo medido aparece como "sem medida", e não como zero: um
 * zero diria que ninguém ligou, quando o certo é que o sistema não sabe.
 */
export function PainelPresencaLocal({ dados }: { dados: PresencaLocal }) {
  const { totais, investimento, custo } = dados;
  const serieDe = (campo: "ligacoes" | "rotas") => dados.serie.map((d) => d[campo] ?? 0);

  return (
    <div className="space-y-6">
      <SituacaoDaMedicao medicao={dados} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Ligações pelos anúncios" par={totais.LIGACOES_DOS_ANUNCIOS} serie={serieDe("ligacoes")} />
        <Numero rotulo="Pedidos de rota" par={totais.ROTAS} serie={serieDe("rotas")} />
        <Numero rotulo="Investido no Google Ads" par={investimento} moeda nota="no período" />
        <Numero
          rotulo="Custo por ligação"
          par={custo.porLigacao}
          moeda
          invertido
          // Medido e sem ligação: o custo não existe, mas não é falta de medida.
          semValor={totais.LIGACOES_DOS_ANUNCIOS.atual === null ? undefined : "Sem ligação"}
          nota={custo.porRota.atual !== null ? `Por rota: ${formatCentsAsBRL(custo.porRota.atual)}` : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Numero rotulo="Ligações contadas como conversão" par={totais.LIGACOES_CONVERSAO} nota="Inclui cliques para ligar no site" />
        <Numero rotulo="Visitas à loja" par={totais.VISITAS_A_LOJA} nota="Estimadas pelo Google" />
        <Numero rotulo="Vezes que o telefone apareceu" par={totais.EXIBICOES_DO_TELEFONE} />
      </div>

      <Card className="p-6">
        <CardHeader
          title="Por campanha"
          description="O que cada campanha do Google gastou e o que trouxe no período."
          className="mb-4"
        />
        <DataTable
          legenda="Campanhas do Google Ads"
          linhas={dados.campanhas}
          chaveDaLinha={(c) => c.externalId}
          vazio={<p className="text-corpo text-ink-mute">Nenhuma campanha do Google com gasto no período.</p>}
          colunas={[
            { chave: "nome", titulo: "Campanha", principal: true, celula: (c) => c.nome },
            { chave: "gasto", titulo: "Gasto", alinhar: "direita", celula: (c) => formatCentsAsBRL(c.gastoCentavos) },
            { chave: "lig", titulo: "Ligações", alinhar: "direita", celula: (c) => c.ligacoes ?? <SemMedidaNaCelula /> },
            { chave: "rot", titulo: "Rotas", alinhar: "direita", celula: (c) => c.rotas ?? <SemMedidaNaCelula /> },
            {
              chave: "cpl",
              titulo: "Custo por ligação",
              alinhar: "direita",
              // Escrito por extenso: um traço numa célula é lido como zero.
              celula: (c) =>
                c.ligacoes === null ? (
                  <SemMedidaNaCelula />
                ) : c.ligacoes > 0 ? (
                  formatCentsAsBRL(Math.round(c.gastoCentavos / c.ligacoes))
                ) : (
                  <span className="text-apoio text-ink-mute">Sem ligação</span>
                ),
            },
            { chave: "cli", titulo: "Cliques", alinhar: "direita", celula: (c) => c.cliques },
          ]}
        />
      </Card>

      <p className="text-apoio text-ink-mute">
        Ligações e rotas que não vieram de anúncio, as do Perfil da Empresa no Google, entram aqui quando a
        conexão com o Perfil da Empresa for liberada pelo Google.
      </p>
    </div>
  );
}

/** O aviso de quando ligação e rota não estão chegando, e o que fazer. */
export function SituacaoDaMedicao({ medicao: dados }: { medicao: MedicaoLocal }) {
  const irAoGoogle = (
    <SePuderAbrir href="/integrations/google">
      <ButtonLink href="/integrations/google" variant="secondary" size="sm">
        Abrir Google Ads
      </ButtonLink>
    </SePuderAbrir>
  );
  if (dados.situacao === "sem-google-ads") {
    return (
      <Alert tom="warning" titulo="Nenhuma conta do Google Ads ligada" acao={irAoGoogle}>
        As ligações, rotas e o investimento vêm do script do Google Ads desta conta.
      </Alert>
    );
  }
  if (dados.situacao === "script-desatualizado") {
    return (
      <Alert tom="warning" titulo="O script colado no Google Ads é o antigo" acao={irAoGoogle}>
        Ele manda o gasto, mas não as ligações e rotas. Gere o script de novo e cole no lugar do atual.
      </Alert>
    );
  }
  if (dados.situacao === "parcial") {
    const falhas = Object.entries(dados.partes)
      .filter(([, estado]) => estado !== "ok")
      .map(([parte]) => PARTE[parte] ?? parte);
    return (
      <Alert tom="info" titulo="Parte das medidas não está chegando">
        O Google não deixou ler {falhas.join(" e ")} nesta conta; o resto está em dia
        {dados.ultimoEnvioEm ? `, com o último envio ${tempoRelativo(dados.ultimoEnvioEm)}` : ""}.
      </Alert>
    );
  }
  return null;
}

function Numero({
  rotulo,
  par,
  moeda = false,
  invertido = false,
  serie,
  nota,
  semValor,
}: {
  rotulo: string;
  par: Par;
  moeda?: boolean;
  invertido?: boolean;
  serie?: number[];
  nota?: string;
  /** Quando o valor não existe por falta de base, e não de medida. */
  semValor?: string;
}) {
  if (par.atual === null) {
    return semValor ? (
      <SemMedida rotulo={rotulo} titulo={semValor} nota="Nada no período para dividir o gasto" />
    ) : (
      <SemMedida rotulo={rotulo} />
    );
  }
  return (
    <StatCard
      rotulo={rotulo}
      numero={moeda ? par.atual / 100 : par.atual}
      formato={moeda ? "moeda" : "inteiro"}
      delta={variacao(par)}
      anterior={par.anterior === null ? undefined : moeda ? par.anterior / 100 : par.anterior}
      serie={serie}
      nota={nota}
      invertido={invertido}
    />
  );
}

function SemMedida({
  rotulo,
  titulo = "Sem medida",
  nota = "Não está chegando do Google",
}: {
  rotulo: string;
  titulo?: string;
  nota?: string;
}): ReactNode {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-panel p-4 shadow-subtle">
      <p className="text-rotulo font-medium uppercase tracking-[0.1em] text-ink-mute">{rotulo}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none text-ink-mute">{titulo}</p>
      <p className="mt-1.5 text-rotulo text-ink-mute">{nota}</p>
    </div>
  );
}

function SemMedidaNaCelula() {
  return <span className="text-apoio text-ink-mute">Sem medida</span>;
}

/** A linha que conclui o painel, no lugar da pergunta. */
export function concluiPresencaLocal(dados: PresencaLocal): string {
  if (dados.situacao === "sem-google-ads") return "Ligue o Google Ads para medir ligações e rotas.";
  if (dados.situacao === "script-desatualizado") return "O script do Google Ads precisa ser colado de novo para medir ligações e rotas.";
  const ligacoes = dados.totais.LIGACOES_DOS_ANUNCIOS.atual;
  const rotas = dados.totais.ROTAS.atual;
  const partes = [
    ligacoes !== null ? `${ligacoes} ${ligacoes === 1 ? "ligação" : "ligações"}` : null,
    rotas !== null ? `${rotas} ${rotas === 1 ? "pedido de rota" : "pedidos de rota"}` : null,
  ].filter(Boolean);
  const gasto = dados.investimento.atual;
  return `${partes.join(" e ") || "Ações locais sem medida"} pelos anúncios${gasto !== null ? `, com ${formatCentsAsBRL(gasto)} investidos` : ""}.`;
}
