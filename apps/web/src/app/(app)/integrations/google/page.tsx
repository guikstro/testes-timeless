import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/skeleton";
import { CartaoCampanha, NovaCampanha } from "./campaign-forms";

interface Campanha {
  id: string;
  name: string;
  externalId: string;
  manual: boolean;
  spend: { date: string; spendCents: number }[];
}

export default async function GoogleAdsPage() {
  const campanhas = await apiFetch<Campanha[]>("/campaigns?platform=GOOGLE");

  const gastoTotal = campanhas.reduce(
    (soma, campanha) => soma + campanha.spend.reduce((s, dia) => s + dia.spendCents, 0),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Google Ads</h1>
      <p className="mb-6 mt-1 text-sm text-ink-mute">
        Registre suas campanhas e o gasto de cada dia para medir custo por lead e retorno.
      </p>

      {/*
        A API do Google Ads exige um token de desenvolvedor aprovado por eles,
        que leva semanas e não depende de nós. Dizer isso na tela evita que o
        lançamento manual pareça uma limitação do produto, quando é uma escolha
        para o cliente não ficar esperando.
      */}
      <div className="mb-6 rounded-2xl border border-line bg-panel-soft/60 p-5">
        <h2 className="text-corpo font-semibold text-ink">Por que o lançamento é manual</h2>
        <p className="mt-1.5 text-corpo leading-relaxed text-ink-soft">
          A sincronização automática com o Google Ads depende de um token de desenvolvedor que o próprio Google
          aprova, e essa aprovação leva semanas. Lançar o gasto à mão permite medir retorno desde já. Quando a
          integração automática entrar, ela vai atualizar estas mesmas campanhas, sem refazer nada.
        </p>
        <p className="mt-2.5 text-corpo leading-relaxed text-ink-soft">
          A atribuição dos leads do Google já funciona hoje, por{" "}
          <Link href="/links" className="text-ink underline decoration-line underline-offset-4 hover:decoration-accent">
            link rastreável
          </Link>
          . Informar o ID da campanha aqui é o que liga esses leads ao gasto correspondente.
        </p>
      </div>

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
