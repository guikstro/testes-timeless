import { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { AvisoDeCobertura, Cobertura, comparavel, Parcial } from "@/components/aviso-de-cobertura";
import { ButtonLink } from "@/components/ui/button";
import { SePuderAbrir } from "@/components/acesso";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { formatCentsAsBRL } from "@/lib/currency";
import { tempoRelativo } from "@/lib/relative-time";
import { formataDia } from "@/lib/periodo";
import { StatCard } from "./stat-card";
import { LeadsAreaChart } from "./leads-area-chart";

type Par = { atual: number | null; anterior: number | null };

/** De onde vêm as ligações e rotas, e se estão chegando. */
export interface MedicaoLocal {
  situacao: "sem-google-ads" | "script-desatualizado" | "parcial" | "medido";
  partes: Record<string, string>;
  ultimoEnvioEm: string | null;
}

export interface PresencaLocal extends MedicaoLocal {
  periodo: { de: string; ate: string };
  /** O período anterior do mesmo tamanho, o das porcentagens. */
  periodoAnterior?: { de: string; ate: string };
  /** Desde quando o Google tem número aqui. Ausente na API anterior. */
  cobertura?: Cobertura;
  parcial?: Parcial;
  totais: Record<"LIGACOES_DOS_ANUNCIOS" | "LIGACOES_CONVERSAO" | "ROTAS" | "VISITAS_A_LOJA" | "EXIBICOES_DO_TELEFONE", Par>;
  investimento: Par;
  custo: { porLigacao: Par; porRota: Par };
  serie: { dia: string; ligacoes: number | null; rotas: number | null }[];
  /** O Perfil da Empresa no Google. Null sem perfil escolhido; ausente na API anterior. */
  perfil?: PerfilNoPainel | null;
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

/** O que o Google conta no perfil da empresa, cortado no último dia que ele já contou. */
export interface PerfilNoPainel {
  locais: { nome: string; numerosAte: string | null }[];
  numerosAte: string | null;
  /** O histórico ainda está chegando. */
  lendo: boolean;
  /** A leitura parou; o motivo está na tela da equipe. */
  comProblema: boolean;
  periodo: { de: string; ate: string } | null;
  /** Null quando o período anterior começa antes do primeiro dia lido. */
  periodoAnterior: { de: string; ate: string } | null;
  totais: Record<
    "LIGACOES" | "ROTAS" | "CLIQUES_NO_SITE" | "CONVERSAS" | "RESERVAS" | "VISUALIZACOES" | "VISUALIZACOES_MAPS" | "VISUALIZACOES_BUSCA",
    Par
  > | null;
  serie: { dia: string; ligacoes: number; rotas: number; visualizacoes: number }[];
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
  // O período anterior começando antes do primeiro dia com número: sem porcentagem.
  const comparar = comparavel(dados.parcial);

  return (
    <div className="space-y-6">
      <SituacaoDaMedicao medicao={dados} />

      <AvisoDeCobertura
        cobertura={dados.cobertura}
        parcial={dados.parcial}
        periodo={dados.periodo}
        comparacao={dados.periodoAnterior ?? null}
        rotuloDaComparacao="o período anterior"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Ligações pelos anúncios" par={totais.LIGACOES_DOS_ANUNCIOS} serie={serieDe("ligacoes")} comparar={comparar} />
        <Numero rotulo="Pedidos de rota" par={totais.ROTAS} serie={serieDe("rotas")} comparar={comparar} />
        <Numero rotulo="Investido no Google Ads" par={investimento} moeda nota="no período" comparar={comparar} />
        <Numero
          rotulo="Custo por ligação"
          par={custo.porLigacao}
          moeda
          invertido
          comparar={comparar}
          // Medido e sem ligação: o custo não existe, mas não é falta de medida.
          semValor={totais.LIGACOES_DOS_ANUNCIOS.atual === null ? undefined : "Sem ligação"}
          nota={custo.porRota.atual !== null ? `Por rota: ${formatCentsAsBRL(custo.porRota.atual)}` : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Numero
          rotulo="Ligações contadas como conversão"
          par={totais.LIGACOES_CONVERSAO}
          nota="Inclui cliques para ligar no site"
          comparar={comparar}
        />
        <Numero rotulo="Visitas à loja" par={totais.VISITAS_A_LOJA} nota="Estimadas pelo Google" comparar={comparar} />
        <Numero rotulo="Vezes que o telefone apareceu" par={totais.EXIBICOES_DO_TELEFONE} comparar={comparar} />
      </div>

      {/*
        Os números em cima e o dia a dia embaixo, como o painel de leads. Só
        com as duas medidas chegando: uma série sem medida desenhada como zero
        diria que ninguém ligou.
      */}
      {totais.LIGACOES_DOS_ANUNCIOS.atual !== null && totais.ROTAS.atual !== null ? (
        <section className="surface p-6">
          <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Ligações e rotas por dia</h2>
          <p className="mb-5 mt-0.5 text-apoio text-ink-mute">Passe o mouse para ver um dia específico</p>
          <LeadsAreaChart
            data={dados.serie.map((dia) => ({ date: dia.dia, leads: dia.ligacoes ?? 0, won: dia.rotas ?? 0 }))}
            rotulos={{ leads: "Ligações", won: "Pedidos de rota" }}
            descricao="Ligações e pedidos de rota por dia no período"
          />
        </section>
      ) : null}

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

      {dados.perfil ? (
        <SecaoDoPerfil perfil={dados.perfil} />
      ) : (
        <p className="text-apoio text-ink-mute">
          As ligações, rotas e visualizações do Perfil da Empresa no Google aparecem aqui quando a equipe Timeless
          ligar o perfil deste cliente.
        </p>
      )}
    </div>
  );
}

/**
 * O Perfil da Empresa no Google: o que acontece no perfil, na Busca e no
 * Maps, com ou sem anúncio.
 *
 * Seção própria, e não somada aos números dos anúncios: são duas contagens
 * diferentes do Google, e uma ligação pode aparecer nas duas.
 */
function SecaoDoPerfil({ perfil }: { perfil: PerfilNoPainel }) {
  const { totais } = perfil;
  // Sem o período anterior inteiro lido, a porcentagem compararia com menos dias.
  const comparar = perfil.periodoAnterior !== null;
  const serieDe = (campo: "ligacoes" | "rotas" | "visualizacoes") => perfil.serie.map((d) => d[campo]);

  return (
    <section className="space-y-4" aria-labelledby="titulo-do-perfil">
      <div>
        <h2 id="titulo-do-perfil" className="font-display text-destaque font-semibold tracking-tight text-ink">
          Perfil da Empresa no Google
        </h2>
        <p className="mt-0.5 text-apoio text-ink-mute">
          {perfil.locais.map((local) => local.nome).join(", ")}. O que o Google conta no perfil, na Busca e no Maps
          {perfil.numerosAte ? `, até ${formataDia(perfil.numerosAte)}: ele libera esses números com uns três dias de atraso` : ""}.
          {comparar ? " A comparação usa os mesmos dias do período anterior." : ""}
        </p>
      </div>

      {perfil.comProblema ? (
        <Alert tom="warning" titulo="A leitura do perfil está parada">
          Os números abaixo são os que já tinham chegado. Fale com a equipe Timeless.
        </Alert>
      ) : null}

      {!totais ? (
        <p className="text-corpo text-ink-soft">
          {perfil.lendo
            ? "Lendo o histórico do perfil. Os números aparecem em alguns minutos."
            : "O Google ainda não contou nenhum dia deste período."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Ligações pelo perfil" par={totais.LIGACOES} serie={serieDe("ligacoes")} comparar={comparar} />
          <Numero rotulo="Pedidos de rota pelo perfil" par={totais.ROTAS} serie={serieDe("rotas")} comparar={comparar} />
          <Numero rotulo="Cliques no site" par={totais.CLIQUES_NO_SITE} comparar={comparar} />
          <Numero
            rotulo="Visualizações do perfil"
            par={totais.VISUALIZACOES}
            serie={serieDe("visualizacoes")}
            comparar={comparar}
            nota={`${inteiro(totais.VISUALIZACOES_MAPS.atual)} no Maps, ${inteiro(totais.VISUALIZACOES_BUSCA.atual)} na Busca`}
          />
        </div>
      )}
    </section>
  );
}

const inteiro = (valor: number | null) => (valor ?? 0).toLocaleString("pt-BR");

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
  comparar,
}: {
  rotulo: string;
  par: Par;
  moeda?: boolean;
  invertido?: boolean;
  serie?: number[];
  nota?: string;
  /** Quando o valor não existe por falta de base, e não de medida. */
  semValor?: string;
  /** Falso quando o período anterior tem dias sem número: sem porcentagem. */
  comparar: boolean;
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
      delta={comparar ? variacao(par) : undefined}
      anterior={!comparar || par.anterior === null ? undefined : moeda ? par.anterior / 100 : par.anterior}
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
