/**
 * Os Insights da Página do Facebook num período, como a tela lê.
 *
 * Conta pura sobre as linhas guardadas, um número por dia e por métrica: os
 * casos de borda (período sem leitura, métrica que a Meta deixou de mandar)
 * são testados sem banco.
 */

export interface Janela {
  /** Dia civil AAAA-MM-DD, inclusive nas duas pontas. */
  de: string;
  ate: string;
}

export interface LinhaGuardada {
  metrica: string;
  /** Dia civil AAAA-MM-DD. */
  dia: string;
  valor: number;
}

/** Null em cada número quando nenhum dia do período trouxe a métrica: "não sabemos", e não zero. */
export interface ResumoDaPagina {
  visualizacoes: number | null;
  visitas: number | null;
  interacoes: number | null;
  novosSeguidores: number | null;
  deixaramDeSeguir: number | null;
  /** Novos menos os que deixaram de seguir. */
  seguidoresLiquidos: number | null;
  /** Total de seguidores no último dia do período que trouxe o número. */
  seguidores: number | null;
  /** Vídeos assistidos por pelo menos 3 segundos. */
  videos: number | null;
  /** Tempo de vídeo assistido, em segundos. */
  tempoDeVideoSegundos: number | null;
}

export interface VisualizadoresUnicos {
  valor: number;
  /** O último dia da janela de 7 ou 28 dias a que o número se refere. */
  ate: string;
}

export interface DiaDaPagina {
  dia: string;
  visualizacoes: number | null;
  visitas: number | null;
  interacoes: number | null;
  novosSeguidores: number | null;
}

const dentro = (dia: string, janela: Janela) => dia >= janela.de && dia <= janela.ate;

function soma(linhas: LinhaGuardada[], metrica: string, janela: Janela): number | null {
  const doPeriodo = linhas.filter((linha) => linha.metrica === metrica && dentro(linha.dia, janela));
  return doPeriodo.length > 0 ? doPeriodo.reduce((total, linha) => total + linha.valor, 0) : null;
}

/** O valor do dia mais recente do período: para o que é um total, e não um movimento do dia. */
function ultimo(linhas: LinhaGuardada[], metrica: string, janela: Janela): LinhaGuardada | null {
  return (
    linhas
      .filter((linha) => linha.metrica === metrica && dentro(linha.dia, janela))
      .sort((a, b) => (a.dia < b.dia ? 1 : -1))[0] ?? null
  );
}

export function resumoDaPagina(linhas: LinhaGuardada[], janela: Janela): ResumoDaPagina {
  const novos = soma(linhas, "page_daily_follows_unique", janela);
  const deixaram = soma(linhas, "page_daily_unfollows_unique", janela);
  const tempo = soma(linhas, "page_video_view_time", janela);

  return {
    visualizacoes: soma(linhas, "page_media_view", janela),
    visitas: soma(linhas, "page_views_total", janela),
    interacoes: soma(linhas, "page_post_engagements", janela),
    novosSeguidores: novos,
    deixaramDeSeguir: deixaram,
    seguidoresLiquidos: novos !== null && deixaram !== null ? novos - deixaram : null,
    seguidores: ultimo(linhas, "page_follows", janela)?.valor ?? null,
    videos: soma(linhas, "page_video_views", janela),
    // A Meta conta em milissegundos; a tela fala em minutos e segundos.
    tempoDeVideoSegundos: tempo === null ? null : Math.round(tempo / 1000),
  };
}

/**
 * Visualizadores únicos em 7 e em 28 dias, do dia mais recente do período.
 *
 * A Meta não dá o total de pessoas de um período qualquer, e somar os
 * visualizadores de cada dia contaria a mesma pessoa várias vezes. O número
 * honesto é o da janela que ela mesma fecha, com a data dita na tela.
 */
export function visualizadoresUnicos(
  linhas: LinhaGuardada[],
  janela: Janela,
): { semana: VisualizadoresUnicos | null; mes: VisualizadoresUnicos | null } {
  const le = (metrica: string) => {
    const linha = ultimo(linhas, metrica, janela);
    return linha ? { valor: linha.valor, ate: linha.dia } : null;
  };
  return {
    semana: le("page_total_media_view_unique:week"),
    mes: le("page_total_media_view_unique:days_28"),
  };
}

/** Todos os dias do período, com o que se sabe de cada um: a série não pula dia sem leitura. */
export function porDiaDaPagina(linhas: LinhaGuardada[], dias: string[]): DiaDaPagina[] {
  const valor = (metrica: string, dia: string) =>
    linhas.find((linha) => linha.metrica === metrica && linha.dia === dia)?.valor ?? null;
  return dias.map((dia) => ({
    dia,
    visualizacoes: valor("page_media_view", dia),
    visitas: valor("page_views_total", dia),
    interacoes: valor("page_post_engagements", dia),
    novosSeguidores: valor("page_daily_follows_unique", dia),
  }));
}
