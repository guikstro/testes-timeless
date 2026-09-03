/**
 * Os tetos de requisição, num lugar só.
 *
 * Cada número aqui é um julgamento sobre o que é uso normal e o que é abuso,
 * e ficam juntos para poderem ser comparados entre si em vez de espalhados
 * pelos controladores.
 */

const MINUTO = 60_000;

/** Uso comum de quem está logado. Uma tela do produto faz poucas dezenas por minuto. */
export const PADRAO = { ttl: MINUTO, limit: 300 };

/**
 * Entrar, criar conta e recuperar senha.
 *
 * Dez tentativas em cinco minutos, e quinze minutos de espera depois disso.
 * Aperta o suficiente para tornar a força bruta inviável e é folgado para
 * quem errou a senha duas ou três vezes.
 */
export const AUTENTICACAO = { ttl: 5 * MINUTO, limit: 10, blockDuration: 15 * MINUTO };

/**
 * Trocar a própria senha ou e-mail.
 *
 * Menos apertado que entrar, porque já exige sessão, e ainda assim limitado:
 * a senha atual é conferida aqui, então sem teto isto seria outro caminho
 * para adivinhá-la.
 */
export const CREDENCIAL = { ttl: 5 * MINUTO, limit: 10, blockDuration: 5 * MINUTO };

/**
 * Cliques que ainda são contados, por IP e por minuto.
 *
 * Acima disso o visitante continua sendo redirecionado, só deixa de entrar na
 * conta. Cento e vinte por minuto do mesmo endereço já é anormal para um
 * anúncio; um escritório inteiro atrás do mesmo roteador não chega perto.
 */
export const CLIQUES_CONTADOS = { ttl: MINUTO, limit: 120, blockDuration: MINUTO };

/**
 * Teto duro do redirecionamento, este sim com recusa.
 *
 * Existe para a busca do link no banco não virar vetor de sobrecarga. É cinco
 * vezes o teto de contagem: quem passa daqui não está clicando em anúncio.
 */
export const REDIRECIONAMENTO = { ttl: MINUTO, limit: 600 };
