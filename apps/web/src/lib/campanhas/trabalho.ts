/**
 * O trabalho de cada campanha, para ela ser julgada pelo que comprou.
 *
 * Uma campanha de vídeo não existe para trazer lead, e cobrar lead dela fazia
 * a tela chamar de "gastando sem retorno" um vídeo que cumpriu o que devia. O
 * trabalho sai do objetivo que a própria plataforma informa: a Meta manda o
 * objetivo da campanha, e o script do Google manda o tipo dela.
 */
export type Trabalho = "visto" | "whatsapp" | "cliente" | "loja";

export const ORDEM_DOS_TRABALHOS: Trabalho[] = ["visto", "whatsapp", "cliente", "loja"];

export const ROTULO_DO_TRABALHO: Record<Trabalho, string> = {
  visto: "Ser visto",
  whatsapp: "Levar ao WhatsApp",
  cliente: "Trazer cliente",
  loja: "Trazer à loja",
};

const POR_OBJETIVO: Record<string, Trabalho> = {
  // Meta, nomes de 2022 em diante e os antigos, que campanhas velhas mantêm.
  OUTCOME_AWARENESS: "visto",
  BRAND_AWARENESS: "visto",
  REACH: "visto",
  VIDEO_VIEWS: "visto",
  OUTCOME_TRAFFIC: "whatsapp",
  LINK_CLICKS: "whatsapp",
  OUTCOME_ENGAGEMENT: "whatsapp",
  POST_ENGAGEMENT: "whatsapp",
  PAGE_LIKES: "visto",
  EVENT_RESPONSES: "whatsapp",
  MESSAGES: "whatsapp",
  OUTCOME_LEADS: "cliente",
  LEAD_GENERATION: "cliente",
  OUTCOME_SALES: "cliente",
  CONVERSIONS: "cliente",
  PRODUCT_CATALOG_SALES: "cliente",
  STORE_VISITS: "loja",
  OUTCOME_APP_PROMOTION: "whatsapp",
  APP_INSTALLS: "whatsapp",
  // Google, pelo tipo da campanha.
  GOOGLE_SEARCH: "cliente",
  GOOGLE_PERFORMANCE_MAX: "cliente",
  GOOGLE_SHOPPING: "cliente",
  GOOGLE_HOTEL: "cliente",
  GOOGLE_VIDEO: "visto",
  GOOGLE_DISPLAY: "visto",
  GOOGLE_DEMAND_GEN: "visto",
  GOOGLE_DISCOVERY: "visto",
  GOOGLE_LOCAL: "loja",
  GOOGLE_SMART: "loja",
  GOOGLE_LOCAL_SERVICES: "loja",
};

export function trabalhoDaCampanha(campanha: {
  objetivo: string | null;
  plataforma: string;
  /** Ligações e rotas que a campanha trouxe, quando o cliente mede presença local. */
  acoesLocais?: number;
  /** Se o cliente mede presença local: sem isso, "trazer à loja" vira "trazer cliente". */
  comLoja: boolean;
}): Trabalho {
  const pelo = campanha.objetivo ? POR_OBJETIVO[campanha.objetivo] : undefined;
  const base: Trabalho = pelo ?? (campanha.plataforma === "GOOGLE" ? "cliente" : "whatsapp");

  if (!campanha.comLoja) return base === "loja" ? "cliente" : base;
  // Campanha do Google que trouxe ligação ou rota está fazendo trabalho de
  // loja, a não ser que exista só para ser vista.
  if (base !== "visto" && campanha.plataforma === "GOOGLE" && (campanha.acoesLocais ?? 0) > 0) return "loja";
  return base;
}
