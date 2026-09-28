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

/**
 * Cabeçalho com o caminho pedido, posto pelo middleware: o layout não recebe
 * a rota e precisa dela para mandar quem não pode abrir a tela para uma que
 * pode, em vez de deixá-la cair na tela de erro.
 */
export const CABECALHO_DO_CAMINHO = "x-caminho";

/**
 * Se a pessoa pode abrir o caminho, incluindo o que fica dentro de uma área
 * (`/leads/123`, `/integrations/whatsapp`). `null` é sem limite (dono,
 * administrador, equipe Timeless). Caminho fora das áreas, como as
 * notificações, abre para todos.
 */
export function podeVer(areas: string[] | null | undefined, caminho: string): boolean {
  if (!areas) return true;
  const area = AREAS.find((item) => caminho === item.href || caminho.startsWith(`${item.href}/`));
  // Configurações sempre abre: é lá que a pessoa troca a própria senha.
  if (!area || area.chave === "configuracoes") return true;
  return areas.includes(area.chave);
}

/** A primeira tela que a pessoa pode abrir, para onde ela vai ao entrar. */
export function telaInicial(areas: string[] | null | undefined): string {
  return AREAS.find((item) => podeVer(areas, item.href))?.href ?? "/settings";
}

export const rotuloDaArea = (chave: string) => AREAS.find((item) => item.chave === chave)?.rotulo ?? chave;
