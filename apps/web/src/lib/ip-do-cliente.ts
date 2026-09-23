import { NextRequest } from "next/server";

/**
 * O endereço de quem está do outro lado, para repassar à API.
 *
 * O Next fica na frente da API: sem isto, toda tentativa de login chega lá
 * com o IP do contêiner do site, e o limite de requisições passa a contar
 * todo mundo junto. O efeito seria o contrário do pretendido, porque uma
 * pessoa tentando adivinhar senha bloquearia o login de todos os clientes.
 *
 * Devolve null quando não dá para saber, e nesse caso é melhor não mandar
 * nada do que mandar um palpite: um cabeçalho com valor inventado é pior que
 * a ausência dele, porque a API confiaria nele.
 */
export function ipDoCliente(request: NextRequest): string | null {
  // Quem estiver na frente do Next em produção preenche um destes.
  const encaminhado = request.headers.get("x-forwarded-for");
  if (encaminhado) {
    // O primeiro da lista é o cliente; os demais são os proxies do caminho.
    const primeiro = encaminhado.split(",")[0]?.trim();
    if (primeiro) return primeiro;
  }

  const real = request.headers.get("x-real-ip")?.trim();
  return real || null;
}

/**
 * Cabeçalhos a acrescentar numa chamada à API, para ela ver quem está do
 * outro lado e não o site.
 *
 * O IP, para o limite de tentativas contar cada pessoa separada. E o
 * navegador, para a tela de sessões mostrar "Chrome no macOS": quem chama a
 * API é este servidor, e o `User-Agent` dele diria "Node" em toda sessão. Vai
 * num cabeçalho próprio para não se confundir com o do servidor, que é o que
 * o `User-Agent` de verdade desta chamada é.
 */
export function cabecalhosDoCliente(request: NextRequest): Record<string, string> {
  const cabecalhos: Record<string, string> = {};

  const ip = ipDoCliente(request);
  if (ip) cabecalhos["X-Forwarded-For"] = ip;

  const navegador = request.headers.get("user-agent");
  if (navegador) cabecalhos["X-Client-User-Agent"] = navegador.slice(0, 400);

  return cabecalhos;
}
