import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { podeVer, telaInicial } from "@/lib/areas";
import { sessaoAtual } from "@/lib/sessao";

/**
 * Leva para uma tela que a pessoa pode abrir quando ela chega a uma área que
 * não é dela, por link salvo, endereço digitado ou atalho de outra tela. Sem
 * isto a API recusa, a tela cai no erro e cada tentativa vira um alerta falso
 * para a equipe.
 *
 * Mora no layout de cada área, e não no do aplicativo: o layout de cima não
 * roda de novo quando se navega entre telas, o de cada área roda ao entrar nela.
 */
export async function ExigeArea({ caminho, children }: { caminho: string; children: ReactNode }) {
  const { areas } = await sessaoAtual();
  if (!podeVer(areas, caminho)) redirect(telaInicial(areas));
  return children;
}
