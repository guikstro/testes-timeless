/** O job da fila `perfil-da-empresa`: os perfis de um cliente. */
export interface LeituraDoPerfilJob {
  organizationId: string;
  /** Quantos dias para trás. Ao escolher o perfil, o histórico inteiro; na rodada, os últimos. */
  dias?: number;
}
