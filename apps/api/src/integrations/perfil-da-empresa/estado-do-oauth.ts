import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Tempo para a pessoa passar pela tela de consentimento do Google. */
const VALIDADE_MS = 15 * 60_000;

/** Só volta para dentro da área de clientes: o estado não pode virar redirecionamento aberto. */
const VOLTA_PERMITIDA = /^\/clientes(\/[A-Za-z0-9-]*)?$/;

interface Estado {
  /** Quem começou: só a mesma pessoa conclui. */
  u: string;
  /** Para onde voltar no site. */
  v: string;
  /** Validade, em ms desde 1970. */
  e: number;
  n: string;
}

function chave(): string {
  const segredo = process.env.JWT_SECRET;
  if (!segredo) throw new Error("JWT_SECRET ausente: o estado do OAuth não tem como ser assinado.");
  // Derivada, e não o segredo cru: a assinatura do estado não pode valer como a de uma sessão.
  return createHmac("sha256", segredo).update("estado-do-oauth-do-google").digest("hex");
}

const assina = (dados: string) => createHmac("sha256", chave()).update(dados).digest("base64url");

export function voltaValida(volta: string | undefined): string {
  return volta && VOLTA_PERMITIDA.test(volta) ? volta : "/clientes";
}

/**
 * O `state` do OAuth: assinado, com prazo e preso a quem começou.
 *
 * É o que impede alguém de mandar a um operador um link de retorno com o
 * código da conta Google *dele*: sem um estado assinado para este operador,
 * a troca é recusada, e a conta da equipe não vira a de um estranho.
 */
export function criaEstado(userId: string, volta: string | undefined, agora = Date.now()): string {
  const estado: Estado = { u: userId, v: voltaValida(volta), e: agora + VALIDADE_MS, n: randomBytes(12).toString("base64url") };
  const dados = Buffer.from(JSON.stringify(estado)).toString("base64url");
  return `${dados}.${assina(dados)}`;
}

/** Devolve para onde voltar, ou null quando o estado é inválido, venceu ou é de outra pessoa. */
export function confereEstado(estado: string, userId: string, agora = Date.now()): { volta: string } | null {
  const [dados, assinatura, sobra] = estado.split(".");
  if (!dados || !assinatura || sobra !== undefined) return null;

  const esperada = Buffer.from(assina(dados));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;

  let conteudo: Estado;
  try {
    conteudo = JSON.parse(Buffer.from(dados, "base64url").toString("utf8")) as Estado;
  } catch {
    return null;
  }
  if (conteudo.u !== userId || typeof conteudo.e !== "number" || conteudo.e < agora) return null;
  return { volta: voltaValida(conteudo.v) };
}
