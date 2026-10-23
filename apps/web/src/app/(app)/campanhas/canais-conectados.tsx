import { ReactNode } from "react";
import type { Frescor, FrescorDaFonte } from "@/components/ui/frescor";
import { tempoRelativo } from "@/lib/relative-time";
import { reais } from "@/lib/campanhas/resultado";
import { COR_DA_MARCA, LogoGoogleAds, LogoMeta } from "../integrations/logos";

interface Canal {
  chave: "META" | "GOOGLE";
  nome: string;
  logo: ReactNode;
  frescor: FrescorDaFonte | null;
}

/**
 * Os canais de anúncio conectados, lado a lado e com o mesmo peso.
 *
 * Um canal conectado sem gasto no período continua aqui, com uma linha que
 * diz isso: sumir com ele faria parecer que o Google não está ligado, e
 * mostrar zero diria que ele rodou sem resultado. Canal não conectado não
 * aparece: o convite para conectar mora em Integrações.
 */
export function CanaisConectados({
  frescor,
  porPlataforma,
}: {
  frescor: Frescor | null;
  /** Gasto e quantidade de campanhas de cada canal no período. */
  porPlataforma: Map<string, { gastoCentavos: number; campanhas: number }>;
}) {
  const canais: Canal[] = [
    { chave: "META" as const, nome: "Meta Ads", logo: <LogoMeta />, frescor: frescor?.meta ?? null },
    { chave: "GOOGLE" as const, nome: "Google Ads", logo: <LogoGoogleAds />, frescor: frescor?.google ?? null },
  ].filter((canal) => canal.frescor !== null || porPlataforma.has(canal.chave));

  if (canais.length === 0) return null;

  return (
    <ul className={`grid gap-3 ${canais.length > 1 ? "sm:grid-cols-2" : "sm:max-w-sm"}`} aria-label="Canais de anúncio">
      {canais.map((canal) => {
        const numeros = porPlataforma.get(canal.chave);
        return (
          <li key={canal.chave} className="flex items-center gap-3.5 rounded-xl border border-line bg-panel px-4 py-3.5">
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-panel-soft [&_svg]:h-6 [&_svg]:w-6"
              style={canal.chave === "META" ? { color: COR_DA_MARCA.meta } : undefined}
            >
              {canal.logo}
            </span>
            <div className="min-w-0">
              <p className="text-corpo font-semibold text-ink">{canal.nome}</p>
              <p className="truncate text-apoio text-ink-soft">
                {numeros && numeros.campanhas > 0
                  ? `${reais(numeros.gastoCentavos)} em ${numeros.campanhas} ${numeros.campanhas === 1 ? "campanha" : "campanhas"}`
                  : "Sem gasto neste período"}
              </p>
              <EstadoDoCanal frescor={canal.frescor} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EstadoDoCanal({ frescor }: { frescor: FrescorDaFonte | null }) {
  // Lançado à mão ou por planilha: não há sincronia para dizer de quando é.
  if (!frescor) return <p className="text-apoio text-ink-mute">Lançado à mão</p>;
  const quando = frescor.atualizadoEm ? `Atualizado ${tempoRelativo(frescor.atualizadoEm)}` : "Ainda sem envio";
  if (frescor.estado === "em-dia") return <p className="text-apoio text-ink-mute">{quando}</p>;
  return (
    <p className="flex items-center gap-1.5 text-apoio text-ink-mute" title={frescor.motivo ?? undefined}>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${frescor.estado === "falha" ? "bg-red-500" : "bg-amber-500"}`}
        aria-hidden
      />
      {frescor.estado === "falha" ? "A atualização falhou" : "Atualização atrasada"}
      {frescor.atualizadoEm ? `, último dado ${tempoRelativo(frescor.atualizadoEm)}` : ""}
    </p>
  );
}
