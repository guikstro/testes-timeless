"use client";

import { createContext, useContext, type ReactNode } from "react";
import { podeVer } from "@/lib/areas";

/**
 * As áreas de quem está usando, para as telas esconderem o que a pessoa não
 * pode abrir. É só aparência: quem de fato recusa é a API.
 */
const AreasContext = createContext<string[] | null>(null);

export function AcessoProvider({ areas, children }: { areas: string[] | null; children: ReactNode }) {
  return <AreasContext.Provider value={areas}>{children}</AreasContext.Provider>;
}

/** Mostra o conteúdo só para quem pode abrir `href`; aos outros, `senao`. */
export function SePuderAbrir({ href, children, senao = null }: { href: string; children: ReactNode; senao?: ReactNode }) {
  return <>{podeVer(useContext(AreasContext), href) ? children : senao}</>;
}
