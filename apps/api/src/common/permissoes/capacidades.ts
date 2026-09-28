import { HttpStatus } from "@nestjs/common";
import { MembershipRole } from "@prisma/client";
import { AppException } from "../exceptions/app-exception";
import { Area } from "../decorators/areas.decorator";

/**
 * O que se pode fazer numa conta, uma capacidade por coisa.
 *
 * É aqui, e só aqui, que se decide quem pode o quê. As rotas declaram a
 * capacidade que exigem (`@Requer`), os serviços perguntam por ela (`exige`),
 * e o site recebe a lista pronta na sessão. Ninguém compara papel com texto
 * ("role === ADMIN") fora deste arquivo.
 *
 * Para criar um papel novo (gestor, mídia, vendas, leitura): acrescentá-lo ao
 * enum `MembershipRole` por migration e dizer em `PAPEIS` o que ele pode.
 * Nenhuma rota muda.
 */
export const CAPACIDADES = {
  "analytics.read": "Ver os números do dashboard, das campanhas e do relatório",
  "conversation.read": "Ler as conversas",
  "conversation.reply": "Responder pelo sistema",
  "lead.read": "Ver os leads",
  "lead.manage": "Mudar estágio, venda e desqualificação dos leads",
  "campaign.read": "Ver as campanhas e o gasto lançado",
  "campaign.manage": "Criar campanha à mão, lançar e importar gasto",
  "spend.read": "Ver o investimento por dia",
  "budget.read": "Ver a verba",
  "budget.manage": "Criar e mudar a verba",
  "ad.read": "Ver o histórico de mudanças nos anúncios",
  "ad.manage": "Pausar, ativar e mudar orçamento na Meta",
  "adaccount.read": "Ver a situação da conta de anúncios",
  "link.read": "Ver os links rastreáveis",
  "link.manage": "Criar e mudar links rastreáveis",
  "integration.read": "Ver as integrações",
  "integration.manage": "Conectar e desconectar integrações",
  "apikey.manage": "Gerar e revogar chaves que escrevem dados na conta",
  "data.export": "Baixar planilhas com dados da conta",
  "settings.read": "Ver as configurações da conta",
  "settings.manage": "Mudar as configurações da conta",
  "member.read": "Ver a equipe",
  "member.manage": "Mudar papel e remover pessoas da equipe",
  "owner.manage": "Promover, rebaixar e remover donos",
  "support_access.read": "Ver quando o suporte entrou na conta",
  "audit.read": "Ler a auditoria",
  "billing.manage": "Cuidar do plano e da cobrança",
} as const;

export type Capacidade = keyof typeof CAPACIDADES;

const TODAS = Object.keys(CAPACIDADES) as Capacidade[];

/**
 * O que cada área do menu libera para quem trabalha por áreas. A área é a
 * unidade que se escolhe ao convidar; a capacidade é o que a API confere.
 */
export const AREAS_CONCEDEM: Record<Area, readonly Capacidade[]> = {
  dashboard: ["analytics.read"],
  conversas: ["conversation.read", "conversation.reply", "lead.read", "lead.manage"],
  leads: ["lead.read", "lead.manage", "conversation.reply"],
  campanhas: ["analytics.read"],
  verba: ["analytics.read", "budget.read", "budget.manage", "ad.read", "adaccount.read"],
  links: ["link.read", "link.manage"],
  integracoes: [
    "integration.read",
    "integration.manage",
    "campaign.read",
    "campaign.manage",
    "spend.read",
    "adaccount.read",
    "data.export",
  ],
  relatorio: ["analytics.read", "spend.read"],
  configuracoes: ["settings.read", "settings.manage", "member.read", "support_access.read"],
};

interface DefinicaoDoPapel {
  /** O que o papel pode sempre. */
  fixas: readonly Capacidade[];
  /** Soma o que as áreas escolhidas para a pessoa liberam. */
  pelasAreas: boolean;
}

/** O que cada papel pode. Papel novo entra aqui. */
export const PAPEIS: Record<MembershipRole, DefinicaoDoPapel> = {
  OWNER: { fixas: TODAS, pelasAreas: false },
  // Gerencia a conta inteira, menos os donos e a cobrança.
  ADMIN: { fixas: TODAS.filter((c) => c !== "owner.manage" && c !== "billing.manage"), pelasAreas: false },
  // Só o que as áreas dele liberam. Fora delas: mexer na equipe, pausar
  // anúncio, gerar chave, ler a auditoria. Isso é de quem responde pela conta.
  MEMBER: { fixas: [], pelasAreas: true },
};

/** Quem pergunta: o papel na conta e, para quem trabalha por áreas, as áreas. */
export interface Quem {
  role: MembershipRole;
  areas?: readonly string[] | null;
}

export function capacidadesDe(quem: Quem): Set<Capacidade> {
  const papel = PAPEIS[quem.role];
  const todas = new Set<Capacidade>(papel.fixas);
  if (papel.pelasAreas) {
    for (const area of quem.areas ?? []) {
      for (const capacidade of AREAS_CONCEDEM[area as Area] ?? []) todas.add(capacidade);
    }
  }
  return todas;
}

export function pode(quem: Quem, capacidade: Capacidade): boolean {
  return capacidadesDe(quem).has(capacidade);
}

/**
 * A recusa de cada capacidade, quando o papel não permite. Os códigos são os
 * que a API já respondia antes da central, para quem os lê não quebrar.
 */
const RECUSAS: Partial<Record<Capacidade, { code: string; message: string }>> = {
  "ad.manage": { code: "SEM_PERMISSAO", message: "Só quem administra a organização pode pausar anúncios ou mudar orçamento." },
  "apikey.manage": { code: "FORBIDDEN", message: "Só o dono e os administradores ligam o Google Ads." },
  "member.manage": { code: "FORBIDDEN", message: "Apenas donos e administradores gerenciam a equipe." },
  "owner.manage": { code: "OWNER_REQUIRED", message: "Só um dono pode promover, rebaixar ou remover outro dono." },
  "audit.read": { code: "AUDITORIA_RESTRITA", message: "Só o dono e os administradores leem a auditoria da conta." },
};

/** Recusa com o motivo certo: faltou a área, que dá para pedir, ou o papel não permite. */
export function exige(quem: Quem, capacidade: Capacidade): void {
  if (pode(quem, capacidade)) return;

  const papel = PAPEIS[quem.role];
  const umaAreaLiberaria =
    papel.pelasAreas && Object.values(AREAS_CONCEDEM).some((liberadas) => liberadas.includes(capacidade));
  if (umaAreaLiberaria) {
    throw new AppException("SEM_ACESSO_A_AREA", "Você não tem acesso a esta parte do sistema.", HttpStatus.FORBIDDEN);
  }

  const recusa = RECUSAS[capacidade] ?? { code: "SEM_PERMISSAO", message: "Seu papel nesta conta não permite isso." };
  throw new AppException(recusa.code, recusa.message, HttpStatus.FORBIDDEN);
}
