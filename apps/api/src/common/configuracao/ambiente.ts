import { Logger } from "@nestjs/common";

/**
 * Confere o ambiente antes de o processo aceitar qualquer trabalho.
 *
 * A maioria das variáveis daqui tinha um padrão silencioso, e um padrão
 * silencioso em produção não é conveniência, é um defeito com fusível
 * comprido: ele não falha na hora de subir, falha semanas depois, na tela de
 * outra pessoa, e sem nada apontando para a causa.
 *
 * Dois casos concretos que existiam:
 *
 * - `WEB_APP_URL` ausente fazia o CORS liberar qualquer origem, com
 *   credenciais. Esquecer uma variável não pode ser a diferença entre fechado
 *   e aberto para todo mundo.
 * - `PUBLIC_TRACKING_BASE_URL` ausente gravava `http://localhost:3001` dentro
 *   do endereço da logo, no banco. O erro fica gravado e continua errado
 *   depois de a variável ser corrigida.
 *
 * Tudo é conferido de uma vez e relatado junto: descobrir que faltam cinco
 * variáveis uma a cada reinício é a pior forma possível de descobrir isso.
 */

/**
 * Se este processo está numa máquina de desenvolvimento.
 *
 * A pergunta é feita ao contrário de propósito. O código todo perguntava
 * `NODE_ENV !== "production"`, e isso falha para o lado errado: a variável não
 * definida, que é exatamente o caso de uma imagem de produção mal configurada,
 * respondia "é desenvolvimento" e ligava os atalhos de desenvolvimento em
 * produção. Um deles devolvia o token de recuperação de senha dentro da
 * resposta da rota pública, o que é tomada de conta para qualquer e-mail
 * conhecido.
 *
 * Agora só é desenvolvimento quem diz que é. Ausente, vazio ou escrito errado
 * conta como produção, que é o lado seguro de errar.
 */
export function ehDesenvolvimento(): boolean {
  const ambiente = process.env.NODE_ENV?.trim();
  return ambiente === "development" || ambiente === "test";
}

export type Processo = "api" | "worker";

interface Exigencia {
  nome: string;
  /** O que quebra sem ela, para a mensagem dizer o que fazer e não só o que falta. */
  porque: string;
  /** Em desenvolvimento vira aviso; em produção impede a subida. */
  soEmProducao?: boolean;
  /** Só cobrada nestes processos. Ausente significa todos. */
  processos?: Processo[];
  /** Devolve o problema encontrado, ou null quando o valor serve. */
  confere?: (valor: string) => string | null;
}

const HEX_DE_32_BYTES = /^[0-9a-fA-F]{64}$/;

const EXIGENCIAS: Exigencia[] = [
  {
    nome: "DATABASE_URL",
    porque: "sem ela não há banco, e o erro do Prisma não diz qual variável faltou",
  },
  {
    nome: "JWT_SECRET",
    porque: "é o que assina as sessões",
    confere: (valor) => {
      if (valor.length < 32) return "curto demais (mínimo 32 caracteres). Gere com: openssl rand -base64 48";
      if (valor.includes("replace-with")) return "ainda é o valor de exemplo do .env.example";
      return null;
    },
  },
  {
    nome: "TOKEN_ENCRYPTION_KEY",
    porque: "cifra os tokens de terceiros guardados no banco",
    confere: (valor) =>
      HEX_DE_32_BYTES.test(valor)
        ? null
        : "precisa ser 64 caracteres hexadecimais (32 bytes). Gere com: openssl rand -hex 32",
  },
  {
    nome: "REDIS_URL",
    porque: "é a fila e o canal de tempo real",
    soEmProducao: true,
  },
  {
    nome: "WEB_APP_URL",
    porque: "define quais origens o navegador pode usar. Sem ela o CORS liberaria qualquer uma",
    soEmProducao: true,
    processos: ["api"],
  },
  {
    nome: "EMAIL_TRANSPORTE",
    porque:
      "sem um transporte real, quem esquecer a senha fica trancado fora da conta para sempre",
    soEmProducao: true,
    confere: (valor) =>
      valor.toLowerCase() === "smtp"
        ? null
        : "em produção só vale `smtp`; `registro` apenas escreve o e-mail no log e não entrega nada",
  },
  {
    nome: "SMTP_HOST",
    porque: "é para onde o e-mail é entregue",
    soEmProducao: true,
  },
  {
    nome: "EMAIL_REMETENTE",
    porque: "é o endereço que aparece como remetente, e um domínio errado cai em spam",
    soEmProducao: true,
  },
  {
    nome: "PUBLIC_TRACKING_BASE_URL",
    porque: "entra no endereço público dos links e das imagens, e fica gravado no banco",
    soEmProducao: true,
    processos: ["api"],
    confere: (valor) =>
      valor.includes("localhost") ? "aponta para localhost, que ninguém de fora alcança" : null,
  },
];

export function confereAmbiente(processo: Processo, logger = new Logger("Ambiente")): void {
  const producao = !ehDesenvolvimento();
  const impedimentos: string[] = [];
  const avisos: string[] = [];

  for (const exigencia of EXIGENCIAS) {
    if (exigencia.processos && !exigencia.processos.includes(processo)) continue;

    const valor = process.env[exigencia.nome]?.trim();
    const problema = !valor ? "não está definida" : (exigencia.confere?.(valor) ?? null);
    if (!problema) continue;

    const linha = `${exigencia.nome}: ${problema} — ${exigencia.porque}.`;
    // Fora de produção nada disso impede de trabalhar: o docker-compose já
    // preenche o que importa, e travar a subida da máquina de quem
    // desenvolve por causa de um endereço público não ajudaria ninguém.
    if (exigencia.soEmProducao && !producao) avisos.push(linha);
    else impedimentos.push(linha);
  }

  for (const aviso of avisos) {
    logger.warn(JSON.stringify({ event: "ambiente_incompleto", detalhe: aviso }));
  }

  if (impedimentos.length > 0) {
    throw new Error(
      `Ambiente incompleto, o processo não vai subir:\n${impedimentos.map((i) => `  - ${i}`).join("\n")}`,
    );
  }
}

/**
 * As origens que o navegador pode usar.
 *
 * `true` libera qualquer origem, e junto de `credentials: true` isso é o
 * oposto do que se quer. Fora de produção continua liberado, porque a máquina
 * de quem desenvolve muda de porta o tempo todo; em produção a conferência
 * acima garante que a variável existe, então nunca se cai no liberado.
 */
export function origensPermitidas(): string[] | boolean {
  const configurado = process.env.WEB_APP_URL?.split(",").map((origem) => origem.trim()).filter(Boolean);
  if (configurado && configurado.length > 0) return configurado;
  return ehDesenvolvimento();
}

/**
 * O endereço público deste sistema, como quem está de fora o enxerga.
 *
 * Usado em link de rastreio e no endereço da imagem enviada. Em produção a
 * conferência acima já barrou a ausência e o localhost, então este padrão só
 * vale em desenvolvimento.
 */
export function enderecoPublico(): string {
  return process.env.PUBLIC_TRACKING_BASE_URL?.trim() || "http://localhost:3001";
}

/**
 * Onde a aplicação web vive, como quem recebe um e-mail a alcança.
 *
 * Sai da primeira origem de `WEB_APP_URL`, que já é a lista de origens
 * confiáveis: um link de recuperação de senha precisa apontar para o mesmo
 * lugar de onde a sessão é servida, e manter isso em duas variáveis diferentes
 * seria criar a chance de elas discordarem.
 */
export function enderecoDaAplicacao(): string {
  const origens = process.env.WEB_APP_URL?.split(",").map((o) => o.trim()).filter(Boolean);
  return origens?.[0] ?? "http://localhost:3000";
}
