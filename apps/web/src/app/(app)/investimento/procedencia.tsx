import Link from "next/link";
import { formataDia } from "@/lib/periodo";
import { Anuncios } from "./tipos";

/**
 * De onde o número veio, de quando ele é, e o que não está nele.
 *
 * É a menor área da tela e a que mais protege quem apresenta. Um filtro ou
 * uma procedência não declarada é a causa mais comum de discussão numa
 * reunião com o cliente: quando está escrito, deixa de ser discussão e vira
 * consulta.
 */
export function Procedencia({ dados, periodo }: { dados: Anuncios; periodo: { de: string; ate: string } }) {
  const { procedencia, semAnuncio } = dados;
  const quebrada = procedencia.status === "TOKEN_EXPIRED" || procedencia.status === "SYNC_FAILED";

  return (
    <footer className="border-t border-line pt-5">
      {quebrada ? (
        <p className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-apoio leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          A sincronização com a Meta parou
          {procedencia.sincronizadoEm ? ` em ${formataDia(procedencia.sincronizadoEm.slice(0, 10))}` : ""}. Os
          números abaixo são os da última que funcionou.{" "}
          <Link href="/integrations/meta" className="font-medium underline underline-offset-2">
            Reconectar
          </Link>
        </p>
      ) : null}

      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-rotulo leading-relaxed text-ink-mute">
        <Linha rotulo="Fonte" valor={procedencia.fonte ?? "Nenhuma conta de anúncios conectada"} />
        <Linha rotulo="Período" valor={`${formataDia(periodo.de)} a ${formataDia(periodo.ate)}`} />
        <Linha
          rotulo="Atualizado"
          valor={
            procedencia.sincronizadoEm
              ? new Date(procedencia.sincronizadoEm).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Nunca sincronizado"
          }
        />
        <Linha
          rotulo="Fora da conta"
          // O que não está no número precisa estar escrito. Estes leads
          // existem e não pertencem a anúncio nenhum: empurrá-los para dentro
          // de alguma linha inflaria um criativo que não os trouxe.
          valor={
            semAnuncio > 0
              ? `${semAnuncio} ${semAnuncio === 1 ? "lead sem anúncio identificado" : "leads sem anúncio identificado"}`
              : "Nada"
          }
        />
      </dl>

      <p className="mt-3 max-w-prose text-rotulo leading-relaxed text-ink-mute/80">
        O gasto por anúncio é sincronizado de hora em hora e a Meta leva algum tempo para fechar os
        números do dia corrente. Venda sem valor confirmado entra na contagem de clientes e não na
        receita.
      </p>
    </footer>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <dt className="font-semibold uppercase tracking-[0.1em]">{rotulo}</dt>
      <dd className="text-ink-soft">{valor}</dd>
    </div>
  );
}
