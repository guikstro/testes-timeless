import { cookies } from "next/headers";
import { Alert } from "@/components/ui/alert";
import { AvisoDispensavel } from "@/components/aviso-dispensavel";
import { chaveDoAviso, COOKIE_DOS_AVISOS, leDispensados } from "@/lib/avisos-dispensados";
import { sessaoAtual } from "@/lib/sessao";
import { ButtonLink } from "@/components/ui/button";
import { formataDia } from "@/lib/periodo";
import { Medicao } from "@/lib/medicao-de-leads";
import { SePuderAbrir } from "@/components/acesso";

/**
 * O aviso de que os números de lead desta tela não são medida.
 *
 * Fica no topo, antes dos números, porque é ele que muda a leitura deles: um
 * "sem medida" no meio da tabela sem explicação é só mais uma coisa estranha.
 * Não aparece quando o número é medida, que é o caso normal e não merece
 * faixa nenhuma.
 */
export async function AvisoDeMedicao({
  medicao,
  desde,
  conversasNaPlataforma,
  dispensavel = true,
}: {
  medicao: Medicao;
  /** Dia em que o WhatsApp foi configurado, para o caso "antes do WhatsApp". */
  desde?: string | null;
  /** O que a Meta diz ter iniciado no período. Null ou ausente quando não se sabe. */
  conversasNaPlataforma?: number | null;
  /**
   * Com X para fechar. Falso no relatório: ele vai para o cliente, e lá o
   * aviso é o que impede "nenhum lead" de ser lido como fato.
   */
  dispensavel?: boolean;
}) {
  if (medicao === "medido") return null;

  // Fechado nesta conta e nesta situação: nem desenha, para não piscar.
  let chave: string | null = null;
  if (dispensavel) {
    const { organization } = await sessaoAtual();
    chave = chaveDoAviso(organization.id, medicao);
    const dispensados = leDispensados((await cookies()).get(COOKIE_DOS_AVISOS)?.value);
    if (dispensados.includes(chave)) return null;
  }

  const texto = TEXTOS[medicao];
  const conversas = conversasNaPlataforma ?? 0;

  const aviso = (
    <Alert
      tom="warning"
      titulo={texto.titulo}
      // Espaço à direita para o X não cobrir o título nem o botão.
      className={chave ? "mb-6 pr-12" : "mb-6"}
      acao={
        texto.acao ? (
          <SePuderAbrir
            href="/integrations/whatsapp"
            senao={<p className="text-apoio">Quem administra a conta resolve isso em Integrações.</p>}
          >
            <ButtonLink href="/integrations/whatsapp" variant="secondary" size="sm">
              {texto.acao}
            </ButtonLink>
          </SePuderAbrir>
        ) : undefined
      }
    >
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
    </Alert>
  );

  return chave ? <AvisoDispensavel chave={chave}>{aviso}</AvisoDispensavel> : aviso;
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
