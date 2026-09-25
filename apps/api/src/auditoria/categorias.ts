import { AuditAction } from "@prisma/client";

/**
 * Os grupos do filtro da tela. Quem procura na auditoria procura por assunto
 * ("quem mexeu nas integrações?"), e não por um dos trinta tipos de ação.
 */
export const CATEGORIAS = {
  acesso: {
    rotulo: "Acesso e segurança",
    acoes: [
      "LOGIN_SUCCEEDED",
      "LOGIN_FAILED",
      "LOGOUT",
      "PASSWORD_CHANGED",
      "PASSWORD_RESET",
      "EMAIL_CHANGED",
      "MFA_ENABLED",
      "MFA_DISABLED",
      "MFA_CODES_REGENERATED",
      "SESSIONS_ENDED",
    ],
  },
  equipe: { rotulo: "Equipe e permissões", acoes: ["MEMBER_ROLE_CHANGED", "MEMBER_REMOVED"] },
  suporte: { rotulo: "Acesso do suporte", acoes: ["IMPERSONATION_STARTED", "IMPERSONATION_ENDED"] },
  conta: { rotulo: "Configurações e integrações", acoes: ["ORGANIZATION_UPDATED", "INTEGRATION_CONNECTED", "INTEGRATION_DISCONNECTED", "INTEGRATION_UPDATED", "CONNECTION_CHANGED"] },
  anuncios: {
    rotulo: "Anúncios e verba",
    acoes: ["AD_STATUS_CHANGED", "AD_BUDGET_CHANGED", "BUDGET_CREATED", "BUDGET_UPDATED", "BUDGET_DELETED"],
  },
  vendas: {
    rotulo: "Leads e vendas",
    acoes: [
      "SALE_CREATED",
      "SALE_UPDATED",
      "SALE_DELETED",
      "ATTRIBUTION_CHANGED",
      "LEAD_STATUS_CHANGED",
      "LEAD_DISQUALIFIED",
      "LEAD_REACTIVATED",
    ],
  },
  dados: {
    rotulo: "Campanhas, links e regras",
    acoes: [
      "CAMPAIGN_CREATED",
      "CAMPAIGN_DELETED",
      "SPEND_IMPORTED",
      "TRACKING_LINK_CREATED",
      "TRACKING_LINK_UPDATED",
      "TRACKING_LINK_DELETED",
      "CLASSIFICATION_RULE_CREATED",
      "CLASSIFICATION_RULE_DELETED",
    ],
  },
  exportacoes: { rotulo: "Exportações", acoes: ["DATA_EXPORTED"] },
} satisfies Record<string, { rotulo: string; acoes: AuditAction[] }>;

export type CategoriaDeAuditoria = keyof typeof CATEGORIAS;
