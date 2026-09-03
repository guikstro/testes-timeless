/**
 * O que cada papel significa, em texto.
 *
 * Fora do módulo de cliente de propósito. Isto morava em `team-list.tsx`, que
 * é componente de cliente, e a aba de equipe, que é de servidor, lia daqui:
 * atravessando essa fronteira o Next troca todo export por uma referência de
 * cliente, e `Object.keys(PAPEL)` devolvia as chaves erradas ou estourava.
 */
export type Papel = "OWNER" | "ADMIN" | "MEMBER";

export const PAPEL: Record<Papel, { rotulo: string; tom: "success" | "info" | "neutral"; explica: string }> = {
  OWNER: {
    rotulo: "Dono",
    tom: "success",
    explica: "Faz tudo, inclusive promover e remover outros donos.",
  },
  ADMIN: {
    rotulo: "Administrador",
    tom: "info",
    explica: "Gerencia a equipe e as integrações, mas não mexe em quem é dono.",
  },
  MEMBER: {
    rotulo: "Membro",
    tom: "neutral",
    explica: "Trabalha os leads e vê os relatórios, sem gerenciar a conta.",
  },
};
