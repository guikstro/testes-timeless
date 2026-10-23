"use client";

import { useState } from "react";
import { COR_DA_MARCA, LogoGoogleAds, LogoMeta } from "../integrations/logos";

const NOME: Record<string, string> = { META: "Meta Ads", GOOGLE: "Google Ads", TIKTOK: "TikTok" };

export function NomeDoCanal({ plataforma }: { plataforma: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-corpo text-ink-soft">
      <span className="[&_svg]:h-[18px] [&_svg]:w-[18px]" style={plataforma === "META" ? { color: COR_DA_MARCA.meta } : undefined}>
        {plataforma === "META" ? <LogoMeta /> : plataforma === "GOOGLE" ? <LogoGoogleAds /> : null}
      </span>
      {NOME[plataforma] ?? plataforma}
    </span>
  );
}

/**
 * A prévia do anúncio, em 4:3.
 *
 * Meta tem a capa do criativo. Sem imagem (Google Pesquisa, por exemplo),
 * o quadro mostra o canal e o formato, e nunca um anúncio inventado: o
 * texto do anúncio de pesquisa não chega aqui, e fingir um seria pior do
 * que admitir que ele não existe na tela.
 */
export function Previa({
  linha,
  className = "",
}: {
  linha: { imagemUrl: string | null; plataforma: string; formato: string; nome: string };
  className?: string;
}) {
  const [quebrou, setQuebrou] = useState(false);
  const formato = linha.formato.split(",")[0];

  if (linha.imagemUrl && !quebrou) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- endereço assinado da Meta, que muda a cada sincronia
      <img
        src={linha.imagemUrl}
        alt={`Anúncio da campanha ${linha.nome}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setQuebrou(true)}
        className={`aspect-[4/3] rounded-lg border border-line object-cover ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex aspect-[4/3] flex-col justify-between rounded-lg border border-line bg-panel-soft p-2 ${className}`}
      aria-hidden
    >
      <span className="[&_svg]:h-4 [&_svg]:w-4" style={linha.plataforma === "META" ? { color: COR_DA_MARCA.meta } : undefined}>
        {linha.plataforma === "META" ? <LogoMeta /> : linha.plataforma === "GOOGLE" ? <LogoGoogleAds /> : null}
      </span>
      <span className="line-clamp-2 text-rotulo leading-tight text-ink-mute">{formato}</span>
    </span>
  );
}
