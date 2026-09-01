/**
 * Monta o bloco de dados que vai para dentro do prompt do relatório.
 *
 * A regra que atravessa tudo aqui: **só entra o que existe**. O prompt manda,
 * com razão, nunca inventar métrica ausente, e a forma de garantir isso é a
 * origem dos dados nunca oferecer um número que não foi medido. Métrica sem
 * valor simplesmente não aparece na lista, em vez de aparecer zerada, porque
 * zero e "não medimos" significam coisas diferentes para quem lê.
 */

export interface DadosDoRelatorio {
  cliente: string;
  periodo: { de: string; ate: string; dias: number };
  totais: {
    leads: number;
    qualificados: number;
    reunioes: number;
    vendas: number;
    receitaCentavos: number;
    descartados: number;
  };
  anterior: {
    leads: number;
    qualificados: number;
    reunioes: number;
    vendas: number;
    receitaCentavos: number;
  };
  atendimento: {
    medianaPrimeiraRespostaSegundos: number | null;
    aguardando: number;
    semResposta: number;
  };
  origens: { nome: string; leads: number; reunioes: number; vendas: number; receitaCentavos: number }[];
  diario: { data: string; leads: number; vendas: number }[];
  investimento: { campanha: string; plataforma: string; totalCentavos: number; dias: number }[];
}

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

function duracao(segundos: number | null): string | null {
  if (segundos === null) return null;
  if (segundos < 60) return `${segundos} segundos`;
  if (segundos < 3600) return `${Math.round(segundos / 60)} minutos`;
  return `${(segundos / 3600).toFixed(1).replace(".", ",")} horas`;
}

/**
 * Variação percentual, na fórmula que o próprio prompt define.
 *
 * Devolve null quando a base é zero: dividir por zero produziria infinito, e
 * escrever "crescimento de ∞%" num relatório entregue a cliente seria pior que
 * omitir a comparação.
 */
function variacao(atual: number, anterior: number): string | null {
  if (anterior === 0) return null;
  const pct = ((atual - anterior) / anterior) * 100;
  const sinal = pct >= 0 ? "+" : "";
  return `${sinal}${pct.toFixed(1).replace(".", ",")}%`;
}

function linhaComparada(
  rotulo: string,
  atual: number,
  anterior: number,
  formatar: (n: number) => string = (n) => String(n),
): string {
  const delta = variacao(atual, anterior);
  const base = `- ${rotulo}: ${formatar(atual)}`;
  if (delta === null) {
    return anterior === 0 && atual > 0
      ? `${base} (período anterior: nenhum, sem base de comparação)`
      : base;
  }
  return `${base} (anterior: ${formatar(anterior)}, variação ${delta})`;
}

export function montaBlocoDeDados(d: DadosDoRelatorio): string {
  const linhas: string[] = [];

  linhas.push(`CLIENTE:\n${d.cliente}`);
  linhas.push(
    `\nPERÍODO:\n${dataBr(d.periodo.de)} a ${dataBr(d.periodo.ate)} (${d.periodo.dias} dias)`,
  );

  linhas.push(
    `\nOBJETIVO DAS CAMPANHAS:\nGeração de conversas no WhatsApp e conversão em venda. A métrica principal do período é o volume de leads e a receita atribuída.`,
  );

  linhas.push("\nRESULTADOS DO PERÍODO (medidos na plataforma de tracking):");
  linhas.push(linhaComparada("Leads", d.totais.leads, d.anterior.leads));
  linhas.push(linhaComparada("Leads qualificados", d.totais.qualificados, d.anterior.qualificados));
  linhas.push(linhaComparada("Reuniões marcadas", d.totais.reunioes, d.anterior.reunioes));
  linhas.push(linhaComparada("Vendas", d.totais.vendas, d.anterior.vendas));
  linhas.push(linhaComparada("Receita", d.totais.receitaCentavos, d.anterior.receitaCentavos, reais));

  if (d.totais.descartados > 0) {
    linhas.push(
      `- Leads descartados como fora de perfil: ${d.totais.descartados} (excluídos das taxas de conversão)`,
    );
  }

  // Taxas derivadas: o prompt autoriza calcular o que sai com segurança dos
  // números fornecidos, e estas saem.
  const aproveitaveis = d.totais.leads - d.totais.descartados;
  if (aproveitaveis > 0) {
    linhas.push(
      `- Taxa de qualificação: ${((d.totais.qualificados / aproveitaveis) * 100).toFixed(1).replace(".", ",")}% (${d.totais.qualificados} de ${aproveitaveis} leads aproveitáveis)`,
    );
  }
  if (d.totais.qualificados > 0) {
    linhas.push(
      `- Taxa de fechamento: ${((d.totais.vendas / d.totais.qualificados) * 100).toFixed(1).replace(".", ",")}% (${d.totais.vendas} de ${d.totais.qualificados} qualificados)`,
    );
  }
  if (d.totais.vendas > 0) {
    linhas.push(`- Ticket médio: ${reais(Math.round(d.totais.receitaCentavos / d.totais.vendas))}`);
  }

  const tempo = duracao(d.atendimento.medianaPrimeiraRespostaSegundos);
  if (tempo || d.atendimento.aguardando > 0) {
    linhas.push("\nATENDIMENTO:");
    if (tempo) linhas.push(`- Tempo mediano até a primeira resposta: ${tempo}`);
    if (d.atendimento.semResposta > 0) linhas.push(`- Leads sem nenhuma resposta: ${d.atendimento.semResposta}`);
    if (d.atendimento.aguardando > 0)
      linhas.push(`- Leads aguardando resposta ao fim do período: ${d.atendimento.aguardando}`);
  }

  const investimento = d.investimento.filter((c) => c.totalCentavos > 0);
  if (investimento.length > 0) {
    const total = investimento.reduce((s, c) => s + c.totalCentavos, 0);
    linhas.push("\nINVESTIMENTO LANÇADO:");
    linhas.push(`- Total: ${reais(total)}`);
    for (const campanha of investimento) {
      linhas.push(`- ${campanha.campanha} (${campanha.plataforma}): ${reais(campanha.totalCentavos)}`);
    }
    if (d.totais.leads > 0) {
      linhas.push(`- Custo por lead: ${reais(Math.round(total / d.totais.leads))}`);
    }
    if (d.totais.vendas > 0) {
      linhas.push(`- Custo por venda: ${reais(Math.round(total / d.totais.vendas))}`);
    }
    if (total > 0 && d.totais.receitaCentavos > 0) {
      linhas.push(`- ROAS: ${(d.totais.receitaCentavos / total).toFixed(2).replace(".", ",")}x`);
    }
  } else {
    // Dizer o que falta é melhor que o modelo tentar adivinhar por que não há
    // custo por lead no relatório.
    linhas.push(
      "\nINVESTIMENTO LANÇADO:\n- Nenhum investimento registrado no período. Não calcular custo por lead, custo por venda nem ROAS, e não mencionar a ausência como resultado negativo.",
    );
  }

  const origens = d.origens.filter((o) => o.leads > 0);
  if (origens.length > 0) {
    linhas.push("\nRESULTADOS POR ORIGEM:");
    for (const origem of origens) {
      const partes = [`${origem.leads} leads`];
      if (origem.reunioes > 0) partes.push(`${origem.reunioes} reuniões`);
      if (origem.vendas > 0) partes.push(`${origem.vendas} vendas`);
      if (origem.receitaCentavos > 0) partes.push(reais(origem.receitaCentavos));
      linhas.push(`- ${origem.nome}: ${partes.join(", ")}`);
    }
  }

  const comMovimento = d.diario.filter((dia) => dia.leads > 0 || dia.vendas > 0);
  if (comMovimento.length > 0) {
    linhas.push("\nEVOLUÇÃO DIÁRIA (data, leads, vendas):");
    for (const dia of comMovimento) {
      linhas.push(`${dataBr(dia.data)}, ${dia.leads}, ${dia.vendas}`);
    }
  }

  linhas.push(
    "\nOBSERVAÇÕES:\n- Todos os números acima foram medidos na plataforma de tracking, com origem provada por clique rastreado ou referral do anúncio. Leads sem evidência de origem aparecem como origem desconhecida e não devem ser atribuídos a nenhuma campanha.\n- Não existem dados de impressões, alcance, cliques, CTR, CPC, CPM ou frequência nesta execução. Não criar seções que dependam dessas métricas.",
  );

  return linhas.join("\n");
}
