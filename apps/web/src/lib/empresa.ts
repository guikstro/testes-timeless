/**
 * Quem responde pelo produto, como aparece nos termos e na privacidade.
 *
 * Razão social, CNPJ e e-mail do encarregado ficam nulos até a Timeless
 * informar; enquanto isso as páginas omitem a linha em vez de mostrar um
 * marcador. Preencher aqui atualiza as duas páginas.
 */
export const EMPRESA = {
  nome: "Timeless",
  razaoSocial: null as string | null,
  cnpj: null as string | null,
  /** O canal do encarregado de dados (art. 41 da LGPD). */
  emailDePrivacidade: null as string | null,
};

/** A mesma data que a API grava no aceite (`apps/api/src/auth/versao-dos-termos.ts`). */
export const VERSAO_DOS_TERMOS = "2026-10-24";
