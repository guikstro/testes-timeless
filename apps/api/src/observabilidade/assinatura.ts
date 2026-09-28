import { createHash } from "node:crypto";

/**
 * O que agrupa um erro: a mesma falha, com outros ids e números, tem de cair
 * na mesma linha. Sem isso, "lead 3f2a… não encontrado" e "lead 9b1c… não
 * encontrado" viram dois erros, e a lista de erros vira um log.
 */
export function normalizaMensagem(mensagem: string): string {
  return mensagem
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hex>")
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** O caminho sem os valores: `/api/leads/3f2a…/messages` vira `/api/leads/<id>/messages`. */
export function normalizaCaminho(caminho: string): string {
  const semBusca = caminho.split("?")[0];
  return semBusca
    .split("/")
    .map((parte) => (/^[0-9a-f-]{16,}$/i.test(parte) || /^\d+$/.test(parte) || parte.length > 40 ? "<id>" : parte))
    .join("/");
}

/**
 * O primeiro quadro da pilha que é código nosso, sem número de linha nem
 * coluna: um deploy que mexe noutra parte do arquivo não pode separar o mesmo
 * erro em dois.
 */
export function primeiroQuadroNosso(pilha: string | undefined): string | null {
  if (!pilha) return null;
  for (const linha of pilha.split("\n").slice(1)) {
    if (linha.includes("node_modules") || linha.includes("node:internal")) continue;
    const quadro = linha.trim().replace(/^at\s+/, "").replace(/:\d+:\d+\)?$/, "").replace(/\s*\(.*[/\\]/, " (");
    if (quadro) return quadro;
  }
  return null;
}

export function assinaturaDoErro(partes: { origem: string; tipo: string; mensagem: string; lugar?: string | null }): string {
  return createHash("sha1")
    .update([partes.origem, partes.tipo, normalizaMensagem(partes.mensagem), partes.lugar ?? ""].join("|"))
    .digest("hex");
}
