"use client";

import { InlineConfirm } from "@/components/ui/inline-confirm";
import { removerVerba } from "./verba-actions";

/**
 * Apagar uma verba pede confirmação no próprio botão, e não numa janela.
 *
 * Apagar a verba errada desfaz o saldo e a projeção da tela inteira, e não há
 * como desfazer. A confirmação em dois toques custa um clique e evita isso.
 * Uma janela de confirmação custaria o mesmo e interromperia mais.
 */
export function BotaoRemoverVerba({ id, valor }: { id: string; valor: string }) {
  return (
    <InlineConfirm aoConfirmar={() => removerVerba(id)} rotuloPendente="Apagando" aria-label={`Apagar a verba de ${valor}`}>
      Apagar
    </InlineConfirm>
  );
}
