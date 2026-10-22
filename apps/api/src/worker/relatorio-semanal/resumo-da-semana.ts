/**
 * O texto do resumo da semana, a partir dos números já somados.
 *
 * Separado de quem busca e de quem envia para ser testado sem banco: é aqui
 * que mora o que o dono lê na segunda de manhã, e cada frase precisa estar
 * certa no singular, no plural e no zero.
 */

export interface NumerosDaSemana {
  contatos: number;
  clientes: number;
  /** Null quando nenhuma conta de anúncios informou gasto. */
  gastoCentavos: number | null;
  anterior: { contatos: number; clientes: number };
  /** A campanha que mais trouxe clientes (ou contatos, sem cliente nenhum). */
  melhorCampanha: { nome: string; clientes: number; contatos: number } | null;
}

export interface ResumoDaSemana {
  titulo: string;
  /** Uma frase, para o sino e o aviso do celular. */
  corpo: string;
  /** O e-mail, em texto puro. */
  texto: string;
}

export function resumoDaSemana(numeros: NumerosDaSemana, empresa: string, endereco: string): ResumoDaSemana {
  const { contatos, clientes, gastoCentavos, anterior, melhorCampanha } = numeros;

  const titulo = `Sua semana: ${contagem(contatos, "contato", "contatos")} e ${contagem(clientes, "cliente novo", "clientes novos")}`;

  const frases: string[] = [];
  if (gastoCentavos !== null && gastoCentavos > 0) {
    frases.push(
      clientes > 0
        ? `${reais(gastoCentavos)} investidos, ${reais(Math.round(gastoCentavos / clientes))} por cliente.`
        : `${reais(gastoCentavos)} investidos em anúncios.`,
    );
  }
  frases.push(comparacao(clientes, anterior.clientes, contatos, anterior.contatos));
  if (melhorCampanha && (melhorCampanha.clientes > 0 || melhorCampanha.contatos > 0)) {
    frases.push(
      `A campanha que mais trouxe foi ${melhorCampanha.nome}, com ${
        melhorCampanha.clientes > 0
          ? contagem(melhorCampanha.clientes, "cliente", "clientes")
          : contagem(melhorCampanha.contatos, "contato", "contatos")
      }.`,
    );
  }
  const corpo = frases.join(" ");

  const texto = [
    `Resumo dos últimos 7 dias de ${empresa}.`,
    "",
    titulo + ".",
    ...frases,
    "",
    "Para ver por campanha e por dia, abra o resumo:",
    endereco,
    "",
    "Este resumo chega toda segunda. Para parar de receber, desligue em Configurações, na aba Operação.",
  ].join("\n");

  return { titulo, corpo, texto };
}

function comparacao(clientes: number, clientesAntes: number, contatos: number, contatosAntes: number): string {
  if (clientes === clientesAntes && contatos === contatosAntes) return "Igual à semana anterior.";
  return `Na semana anterior foram ${contagem(contatosAntes, "contato", "contatos")} e ${contagem(
    clientesAntes,
    "cliente",
    "clientes",
  )}.`;
}

function contagem(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function reais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    centavos / 100,
  );
}
