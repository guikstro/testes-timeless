import { formatCentsAsBRL } from "@/lib/currency";

/**
 * Uma linha da auditoria, escrita em português.
 *
 * O registro guarda o tipo da ação e o estado antes e depois; quem lê quer uma
 * frase ("Pausou o anúncio Vídeo 01"), e não um código e um objeto. A frase é
 * montada aqui, e não gravada no banco, para um texto melhor valer também para
 * o que já foi registrado.
 */

export interface RegistroDeAuditoria {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  aparelho: string | null;
  viaSuporte: boolean;
  autorNome: string | null;
  autorEmail: string | null;
  userId: string | null;
  createdAt: string;
}

type Estado = Record<string, unknown>;

const PAPEIS: Record<string, string> = { OWNER: "Dono", ADMIN: "Administrador", MEMBER: "Membro" };

const ESTAGIOS: Record<string, string> = {
  NEW: "Novo",
  QUALIFIED: "Qualificado",
  MEETING_SCHEDULED: "Reunião marcada",
  WON: "Venda",
};

const QUEM_VIRA_LEAD: Record<string, string> = {
  TRAFEGO_PAGO: "só quem vem dos anúncios",
  RASTREADO: "anúncios e links rastreáveis",
  TODOS: "todo mundo que escrever",
};

/** Os campos das configurações, como a tela os chama. */
const CAMPOS_DA_CONTA: Record<string, string> = {
  name: "nome",
  timezone: "fuso horário",
  logoUrl: "logo",
  brandColor: "cor",
  googleConversionQualified: "ação de lead qualificado no Google",
  googleConversionWon: "ação de venda no Google",
  expedienteAtivo: "horário de atendimento",
  expedienteDias: "dias de atendimento",
  expedienteInicio: "abertura do atendimento",
  expedienteFim: "fechamento do atendimento",
};

function estado(valor: unknown): Estado {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Estado) : {};
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor : null;
}

function numero(valor: unknown): number | null {
  const n = typeof valor === "string" ? Number(valor) : valor;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function entre(nome: string | null): string {
  return nome ? `“${nome}”` : "";
}

function dinheiro(valor: unknown): string {
  const n = numero(valor);
  return n === null ? "valor não informado" : formatCentsAsBRL(n);
}

function dia(valor: unknown): string | null {
  const t = texto(valor);
  if (!t || !/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const [a, m, d] = t.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function periodo(e: Estado): string {
  const de = dia(e.de);
  const ate = dia(e.ate);
  if (de && ate) return ` de ${de} a ${ate}`;
  if (de) return ` a partir de ${de}`;
  return "";
}

export function descreveRegistro(r: Pick<RegistroDeAuditoria, "action" | "entity" | "before" | "after">): string {
  const antes = estado(r.before);
  const depois = estado(r.after);

  switch (r.action) {
    case "LOGIN_SUCCEEDED":
      return depois.segundoFator ? "Entrou, com verificação em duas etapas" : "Entrou";
    case "LOGIN_FAILED":
      return `Tentativa de entrada recusada: ${texto(depois.motivo) ?? "credenciais incorretas"}`;
    case "LOGOUT":
      return "Saiu";
    case "PASSWORD_CHANGED":
      return "Trocou a senha";
    case "PASSWORD_RESET":
      return "Redefiniu a senha pelo link de recuperação";
    case "EMAIL_CHANGED":
      return `Trocou o e-mail de acesso de ${texto(antes.email) ?? "?"} para ${texto(depois.email) ?? "?"}`;
    case "MFA_ENABLED":
      return "Ativou a verificação em duas etapas";
    case "MFA_DISABLED":
      return "Desativou a verificação em duas etapas";
    case "MFA_CODES_REGENERATED":
      return "Gerou novos códigos de recuperação";
    case "SESSIONS_ENDED": {
      const n = numero(depois.encerradas) ?? 1;
      if (depois.todasAsOutras) return n === 1 ? "Encerrou a sessão de outro aparelho" : `Encerrou as sessões de ${n} outros aparelhos`;
      return "Encerrou a sessão de um aparelho";
    }

    case "MEMBER_ROLE_CHANGED": {
      const quem = texto(antes.nome) ?? "uma pessoa";
      return `Mudou o papel de ${quem} de ${PAPEIS[String(antes.role)] ?? antes.role} para ${PAPEIS[String(depois.role)] ?? depois.role}`;
    }
    case "MEMBER_REMOVED":
      return `Removeu ${texto(antes.nome) ?? "uma pessoa"} da equipe`;

    case "IMPERSONATION_STARTED":
      return "Entrou na conta pelo suporte da plataforma";
    case "IMPERSONATION_ENDED":
      return "Saiu da conta, encerrando a visita de suporte";

    case "ORGANIZATION_UPDATED": {
      const campos = Object.keys(depois).length > 0 ? Object.keys(depois) : Object.keys(antes);
      if (campos.length === 1 && campos[0] === "logoUrl") return depois.logoUrl ? "Trocou a logo" : "Removeu a logo";
      const nomes = campos.map((c) => CAMPOS_DA_CONTA[c] ?? c);
      return nomes.length > 0 ? `Alterou as configurações: ${nomes.join(", ")}` : "Alterou as configurações";
    }
    case "INTEGRATION_CONNECTED": {
      const nome = texto(depois.integracao) ?? "uma integração";
      const detalhe = texto(depois.contaDeAnuncios) ?? texto(depois.numero) ?? (depois.forma === "QR Code" ? "por QR Code" : null);
      return `Conectou ${nome}${detalhe ? ` (${detalhe})` : ""}`;
    }
    case "INTEGRATION_DISCONNECTED":
      return `Desconectou ${texto(antes.integracao) ?? "uma integração"}`;
    case "INTEGRATION_UPDATED": {
      if (depois.quemViraLead) {
        return `Mudou quem vira lead no WhatsApp: de ${QUEM_VIRA_LEAD[String(antes.quemViraLead)] ?? antes.quemViraLead} para ${QUEM_VIRA_LEAD[String(depois.quemViraLead)] ?? depois.quemViraLead}`;
      }
      if ("pixel" in depois) return `Configurou a API de Conversões da Meta (pixel ${texto(depois.pixel) ?? "?"})`;
      return `Alterou ${texto(depois.integracao) ?? "uma integração"}`;
    }
    case "CONNECTION_CHANGED":
      return "Alterou uma conexão";

    case "AD_STATUS_CHANGED": {
      const verbo = depois.valor === "PAUSED" ? "Pausou" : depois.valor === "ACTIVE" ? "Ativou" : "Mudou o status de";
      return `${verbo} ${artigo(r.entity)} ${entre(texto(depois.nome))}`.trim();
    }
    case "AD_BUDGET_CHANGED":
      return `Mudou o orçamento diário de ${entre(texto(depois.nome))} de ${dinheiro(antes.valor)} para ${dinheiro(depois.valor)}`;

    case "BUDGET_CREATED":
      return `Criou a verba de ${dinheiro(depois.valorCentavos)}${periodo(depois)}`;
    case "BUDGET_UPDATED":
      return `Alterou a verba de ${dinheiro(antes.valorCentavos)} para ${dinheiro(depois.valorCentavos)}${periodo(depois)}`;
    case "BUDGET_DELETED":
      return `Excluiu a verba de ${dinheiro(antes.valorCentavos)}${periodo(antes)}`;

    case "CAMPAIGN_CREATED":
      return `Criou a campanha ${entre(texto(depois.nome))} à mão`;
    case "CAMPAIGN_DELETED":
      return `Excluiu a campanha ${entre(texto(antes.nome))}`;
    case "SPEND_IMPORTED": {
      const campanha = entre(texto(depois.campanha));
      if (depois.por === "planilha CSV") {
        const dias = numero(depois.dias) ?? 0;
        return `Importou ${dias} ${dias === 1 ? "dia" : "dias"} de gasto de ${campanha} por planilha, somando ${dinheiro(depois.totalCentavos)}`;
      }
      const quando = dia(depois.dia);
      return antes.valorCentavos !== undefined
        ? `Corrigiu o gasto de ${campanha}${quando ? ` em ${quando}` : ""} de ${dinheiro(antes.valorCentavos)} para ${dinheiro(depois.valorCentavos)}`
        : `Lançou ${dinheiro(depois.valorCentavos)} de gasto em ${campanha}${quando ? ` em ${quando}` : ""}`;
    }

    case "TRACKING_LINK_CREATED":
      return `Criou o link ${entre(texto(depois.nome))}`;
    case "TRACKING_LINK_UPDATED":
      return `Alterou o link ${entre(texto(depois.nome) ?? texto(antes.nome))}`;
    case "TRACKING_LINK_DELETED":
      return `Excluiu o link ${entre(texto(antes.nome))}`;

    case "CLASSIFICATION_RULE_CREATED":
      return `Criou a frase-gatilho ${entre(texto(depois.frase))}, que marca ${ESTAGIOS[String(depois.marca)] ?? depois.marca}`;
    case "CLASSIFICATION_RULE_DELETED":
      return `Excluiu a frase-gatilho ${entre(texto(antes.frase))}`;

    case "SALE_CREATED":
      return `Registrou uma venda de ${dinheiro(depois.amountCents)}`;
    case "SALE_UPDATED":
      return `Corrigiu o valor de uma venda de ${dinheiro(antes.amountCents)} para ${dinheiro(depois.amountCents)}`;
    case "SALE_DELETED":
      return "Excluiu uma venda";
    case "LEAD_STATUS_CHANGED":
      return `Mudou um lead de ${ESTAGIOS[String(antes.status)] ?? antes.status} para ${ESTAGIOS[String(depois.status)] ?? depois.status}`;
    case "LEAD_DISQUALIFIED":
      return texto(depois.reason) ? `Desqualificou um lead: ${depois.reason}` : "Desqualificou um lead";
    case "LEAD_REACTIVATED":
      return "Reativou um lead desqualificado";
    case "ATTRIBUTION_CHANGED":
      return "Alterou a origem de um lead";

    case "DATA_EXPORTED": {
      const linhas = numero(depois.linhas);
      const arquivo = texto(depois.arquivo) ?? "dados";
      return `Baixou a planilha de ${arquivo}${linhas !== null ? `, com ${linhas} ${linhas === 1 ? "linha" : "linhas"}` : ""}`;
    }

    default:
      return r.action;
  }
}

function artigo(entidade: string): string {
  if (entidade === "Campanha") return "a campanha";
  if (entidade === "Conjunto de anúncios") return "o conjunto";
  if (entidade === "Anúncio") return "o anúncio";
  return entidade.toLowerCase();
}

/** Para onde a linha leva, quando há uma tela do que ela fala. */
export function destinoDoRegistro(r: Pick<RegistroDeAuditoria, "entity" | "entityId">): string | null {
  if (r.entity === "Lead") return `/leads/${r.entityId}`;
  return null;
}
