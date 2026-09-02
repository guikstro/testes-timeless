/**
 * De onde o link vai ser publicado.
 *
 * Escolher a plataforma preenche `utm_source` e `utm_medium` com os valores
 * que o mercado usa. Isso não é conveniência: os relatórios agrupam por esses
 * campos, e um link escrito "Facebook" e outro "facebook-ads" viram duas
 * origens diferentes no mesmo gráfico. Digitado à mão, isso acontece sempre.
 *
 * O campo continua editável: a lista cobre o comum, não o universo.
 */
export interface Plataforma {
  chave: string;
  rotulo: string;
  /** O que vai no `utm_source`. Vazio em "Outro", onde a pessoa escreve. */
  source: string;
  medium: string;
  /** Cor da marca, só para o pontinho da lista. */
  cor: string;
  descricao: string;
}

export const PLATAFORMAS: Plataforma[] = [
  {
    chave: "google-ads",
    rotulo: "Google Ads",
    source: "google",
    medium: "cpc",
    cor: "#4285F4",
    descricao: "Anúncio de busca ou display pago.",
  },
  {
    chave: "meta-ads",
    rotulo: "Meta Ads",
    source: "facebook",
    medium: "paid_social",
    cor: "#0866FF",
    descricao: "Campanha no Facebook ou no Instagram pelo Gerenciador.",
  },
  {
    chave: "instagram-bio",
    rotulo: "Instagram (bio)",
    source: "instagram",
    medium: "bio",
    cor: "#E1306C",
    descricao: "O link do perfil, sem investimento.",
  },
  {
    chave: "instagram-stories",
    rotulo: "Instagram (stories)",
    source: "instagram",
    medium: "stories",
    cor: "#E1306C",
    descricao: "Sticker de link em publicação orgânica.",
  },
  {
    chave: "whatsapp-status",
    rotulo: "WhatsApp (status)",
    source: "whatsapp",
    medium: "status",
    cor: "#25D366",
    descricao: "Divulgação para a própria base.",
  },
  {
    chave: "email",
    rotulo: "E-mail",
    source: "email",
    medium: "email",
    cor: "#8B7355",
    descricao: "Disparo ou assinatura de e-mail.",
  },
  {
    chave: "site",
    rotulo: "Site",
    source: "site",
    medium: "referral",
    cor: "#6B7280",
    descricao: "Botão ou banner no próprio site.",
  },
  {
    chave: "outro",
    rotulo: "Outro",
    source: "",
    medium: "",
    cor: "#9CA3AF",
    descricao: "Escreva a origem à mão.",
  },
];

/** Reconhece a plataforma de um link já criado, para a lista mostrar de onde ele é. */
export function plataformaDe(source: string | null, medium: string | null): Plataforma | null {
  if (!source) return null;
  const achada = PLATAFORMAS.find(
    (p) => p.source && p.source === source.toLowerCase() && (!medium || p.medium === medium.toLowerCase()),
  );
  // Sem casar o meio, ainda dá para reconhecer a origem: um link antigo pode
  // ter `utm_source=google` sem meio nenhum.
  return achada ?? PLATAFORMAS.find((p) => p.source && p.source === source.toLowerCase()) ?? null;
}
