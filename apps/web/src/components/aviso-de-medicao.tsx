import Link from "next/link";
import { formataDia } from "@/lib/periodo";
import { Medicao } from "@/lib/medicao-de-leads";

/**
 * O aviso de que os números de lead desta tela não são medida.
 *
 * Fica no topo, antes dos números, porque é ele que muda a leitura deles: um
 * "sem medida" no meio da tabela sem explicação é só mais uma coisa estranha.
 * Não aparece quando o número é medida, que é o caso normal e não merece
 * faixa nenhuma.
 */
export function AvisoDeMedicao({
  medicao,
  desde,
  conversasNaPlataforma,
}: {
  medicao: Medicao;
  /** Dia em que o WhatsApp foi configurado, para o caso "antes do WhatsApp". */
  desde?: string | null;
  /** O que a Meta diz ter iniciado no período. Null ou ausente quando não se sabe. */
  conversasNaPlataforma?: number | null;
}) {
  if (medicao === "medido") return null;

  const texto = TEXTOS[medicao];
  const conversas = conversasNaPlataforma ?? 0;

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-300/60 bg-amber-50 p-5 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="min-w-0">
        <p className="text-corpo font-semibold">{texto.titulo}</p>
        <p className="mt-1 text-apoio leading-relaxed text-amber-800 dark:text-amber-200/90">
          {medicao === "antes-do-whatsapp" && desde
            ? `O WhatsApp foi configurado em ${formataDia(desde)}. O que aconteceu antes disso não passou pelo sistema, então leads, vendas e retorno deste período ficam sem medida.`
            : texto.corpo}
          {conversas > 0 ? (
            <>
              {" "}
              Neste período a Meta registrou{" "}
              <strong className="font-semibold">
                {conversas} {conversas === 1 ? "conversa iniciada" : "conversas iniciadas"}
              </strong>{" "}
              pelos seus anúncios, e {conversas === 1 ? "ela não chegou" : "nenhuma chegou"} aqui.
            </>
          ) : null}
        </p>
      </div>
      {texto.acao ? (
        <Link
          href="/integrations/whatsapp"
          className="focus-ring inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-amber-900 px-4 text-apoio font-semibold text-amber-50 transition-transform duration-200 ease-soft active:scale-95 dark:bg-amber-100 dark:text-amber-950"
        >
          {texto.acao}
        </Link>
      ) : null}
    </div>
  );
}

const TEXTOS: Record<Exclude<Medicao, "medido">, { titulo: string; corpo: string; acao: string | null }> = {
  "sem-whatsapp": {
    titulo: "Nenhum WhatsApp conectado, então nenhum lead é contado",
    corpo:
      "O lead entra quando a mensagem chega no WhatsApp conectado ao sistema. Sem ele, leads, vendas e retorno ficam sem medida, e não zerados: zero diria que ninguém escreveu.",
    acao: "Conectar WhatsApp",
  },
  "antes-do-whatsapp": {
    titulo: "Este período é anterior ao WhatsApp",
    corpo:
      "O que aconteceu antes da configuração do WhatsApp não passou pelo sistema, então leads, vendas e retorno deste período ficam sem medida.",
    acao: null,
  },
  "whatsapp-fora": {
    titulo: "O WhatsApp não está conectado agora",
    corpo:
      "Enquanto ele estiver fora, as mensagens não chegam ao sistema, e um zero aqui pode ser só isso. Leads, vendas e retorno ficam sem medida até a conexão voltar.",
    acao: "Reconectar WhatsApp",
  },
};
