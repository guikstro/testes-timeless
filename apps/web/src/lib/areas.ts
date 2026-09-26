/**
 * As áreas do painel do cliente, uma por item do menu. As chaves são as mesmas
 * da API (`areas.decorator.ts`), que é quem de fato confere o acesso.
 */
export const AREAS = [
  { chave: "dashboard", rotulo: "Dashboard", href: "/dashboard" },
  { chave: "conversas", rotulo: "Conversas", href: "/conversas" },
  { chave: "leads", rotulo: "Leads", href: "/leads" },
  { chave: "campanhas", rotulo: "Campanhas", href: "/campanhas" },
  { chave: "verba", rotulo: "Verba", href: "/verba" },
  { chave: "links", rotulo: "Links", href: "/links" },
  { chave: "integracoes", rotulo: "Integrações", href: "/integrations" },
  { chave: "relatorio", rotulo: "Relatório", href: "/relatorio" },
  { chave: "configuracoes", rotulo: "Configurações", href: "/settings" },
] as const;

export type Area = (typeof AREAS)[number]["chave"];

/** `null` é sem limite (dono, administrador, equipe Timeless). */
export function podeVer(areas: string[] | null | undefined, href: string): boolean {
  if (!areas) return true;
  // Configurações sempre abre: é lá que a pessoa troca a própria senha.
  if (href === "/settings") return true;
  const area = AREAS.find((item) => item.href === href);
  return !area || areas.includes(area.chave);
}

/** A primeira tela que a pessoa pode abrir, para onde ela vai ao entrar. */
export function telaInicial(areas: string[] | null | undefined): string {
  return AREAS.find((item) => podeVer(areas, item.href))?.href ?? "/settings";
}

export const rotuloDaArea = (chave: string) => AREAS.find((item) => item.chave === chave)?.rotulo ?? chave;
