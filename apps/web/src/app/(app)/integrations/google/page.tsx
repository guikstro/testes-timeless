import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/skeleton";
import { CartaoCampanha, NovaCampanha } from "./campaign-forms";
import { ConversionsExport } from "./conversions-export";
import { ConexaoGoogleAds, SituacaoDoGoogleAds } from "./conexao-google-ads";
import { periodoValido } from "./periodos";
import { LinhaDeConversao } from "@/lib/google/conversoes-csv";
import { diaCivil } from "@/lib/periodo";
import { temLeads } from "@/lib/foco";
import { sessaoAtual } from "@/lib/sessao";

interface Campanha {
  id: string;
  name: string;
  externalId: string;
  manual: boolean;
  spend: { date: string; spendCents: number }[];
}

interface Exportacao {
  acoes: { qualificado: string | null; venda: string | null };
  linhas: LinhaDeConversao[];
  semGclid: { qualificados: number; vendas: number };
}

export default async function GoogleAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const { dias: diasCru } = await searchParams;
  const dias = periodoValido(diasCru);

  // A janela é montada em dias civis daqui, como o resto do produto: contar a
  // partir do instante atual faria o período mudar de tamanho conforme a hora.
  const hoje = new Date();
  const ate = diaCivil(hoje);
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - (dias - 1));
  const de = diaCivil(inicio);

  const { organization } = await sessaoAtual();
  // Presença local não tem lead nem venda para devolver ao Google.
  const comLeads = temLeads(organization.foco);

  const [situacao, campanhas, exportacao, organizacao] = await Promise.all([
    apiFetch<SituacaoDoGoogleAds>("/integrations/google/script"),
    apiFetch<Campanha[]>("/campaigns?platform=GOOGLE"),
    comLeads ? apiFetch<Exportacao>(`/integrations/google/conversions?de=${de}&ate=${ate}`) : Promise.resolve(null),
    apiFetch<{ currency: string }>("/organizations/current"),
  ]);

  const gastoTotal = campanhas.reduce(
    (soma, campanha) => soma + campanha.spend.reduce((s, dia) => s + dia.spendCents, 0),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Google Ads</h1>
      <p className="mb-6 mt-1 text-corpo text-ink-mute">
        {comLeads
          ? "Quanto cada campanha gasta e o que ela traz, e as vendas devolvidas ao Google."
          : "Quanto cada campanha gasta, e as ligações e os pedidos de rota que ela traz."}
      </p>

      <ConexaoGoogleAds
        situacao={situacao}
        rotuloDoPeriodo="este mês"
        foco={organization.foco}
      />

      {/*
        A API do Google Ads exige um token de desenvolvedor aprovado por eles,
        que leva semanas e não depende de nós. Dizer isso na tela evita que o
        lançamento manual pareça uma limitação do produto, quando é uma escolha
        para o cliente não ficar esperando.
      */}
      <div className="mb-6 rounded-2xl border border-line bg-panel-soft/60 p-5">
        <h2 className="text-corpo font-semibold text-ink">Sem o script, à mão</h2>
        <p className="mt-1.5 text-corpo leading-relaxed text-ink-soft">
          Para uma conta onde o script não pode rodar, dá para lançar o gasto à mão ou por planilha, abaixo. Uma
          campanha lançada à mão com o id real passa a ser atualizada pelo script quando ele for ligado, sem virar
          outra linha.
        </p>
        {comLeads ? (
          <p className="mt-2.5 text-corpo leading-relaxed text-ink-soft">
            A atribuição dos leads do Google já funciona hoje, por{" "}
            <Link href="/links" className="text-ink underline decoration-line underline-offset-4 hover:decoration-accent">
              link rastreável
            </Link>
            . Informar o ID da campanha aqui é o que liga esses leads ao gasto correspondente.
          </p>
        ) : null}
      </div>

      {exportacao ? (
        <div className="mb-6">
          <ConversionsExport
            linhas={exportacao.linhas}
            acoes={exportacao.acoes}
            semGclid={exportacao.semGclid}
            moeda={organizacao.currency}
            dias={dias}
          />
        </div>
      ) : null}

      <div className="surface mb-6 p-5">
        <h2 className="mb-4 text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">Nova campanha</h2>
        <NovaCampanha />
      </div>

      {campanhas.length === 0 ? (
        <div className="surface">
          <EmptyState
            title="Nenhuma campanha do Google ainda"
            description="Adicione a primeira acima e comece a lançar o gasto diário."
          />
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">
              Campanhas ({campanhas.length})
            </h2>
            <span className="text-corpo text-ink-mute">
              Gasto total lançado:{" "}
              <span className="font-semibold tabular-nums text-ink">
                {(gastoTotal / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {campanhas.map((campanha) => (
              <CartaoCampanha
                key={campanha.id}
                id={campanha.id}
                nome={campanha.name}
                externalId={campanha.externalId}
                manual={campanha.manual}
                gastoTotal={campanha.spend.reduce((s, dia) => s + dia.spendCents, 0)}
                diasLancados={campanha.spend.length}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
