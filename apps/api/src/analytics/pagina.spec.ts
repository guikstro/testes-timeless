import { LinhaGuardada, porDiaDaPagina, resumoDaPagina, visualizadoresUnicos } from "./pagina";

const linha = (metrica: string, dia: string, valor: number): LinhaGuardada => ({ metrica, dia, valor });
const setembro = { de: "2026-09-01", ate: "2026-09-30" };

describe("resumoDaPagina", () => {
  const linhas = [
    linha("page_media_view", "2026-09-01", 1_000),
    linha("page_media_view", "2026-09-02", 500),
    linha("page_media_view", "2026-08-31", 9_999),
    linha("page_views_total", "2026-09-01", 30),
    linha("page_post_engagements", "2026-09-02", 12),
    linha("page_daily_follows_unique", "2026-09-01", 5),
    linha("page_daily_follows_unique", "2026-09-02", 4),
    linha("page_daily_unfollows_unique", "2026-09-02", 2),
    linha("page_follows", "2026-09-01", 1_200),
    linha("page_follows", "2026-09-02", 1_207),
    linha("page_video_views", "2026-09-01", 58),
    linha("page_video_view_time", "2026-09-01", 803_000),
  ];

  it("soma o movimento do período e fica fora dele o que é de outro mês", () => {
    expect(resumoDaPagina(linhas, setembro)).toEqual({
      visualizacoes: 1_500,
      visitas: 30,
      interacoes: 12,
      novosSeguidores: 9,
      deixaramDeSeguir: 2,
      seguidoresLiquidos: 7,
      // O total é o do dia mais recente, e não a soma dos dias.
      seguidores: 1_207,
      videos: 58,
      // 803 mil milissegundos são 13 minutos e 23 segundos.
      tempoDeVideoSegundos: 803,
    });
  });

  it("período sem leitura não vira zero", () => {
    expect(resumoDaPagina(linhas, { de: "2026-07-01", ate: "2026-07-31" })).toEqual({
      visualizacoes: null,
      visitas: null,
      interacoes: null,
      novosSeguidores: null,
      deixaramDeSeguir: null,
      seguidoresLiquidos: null,
      seguidores: null,
      videos: null,
      tempoDeVideoSegundos: null,
    });
  });
});

describe("visualizadoresUnicos", () => {
  /*
    Somar os visualizadores de cada dia contaria a mesma pessoa várias vezes.
    O número honesto é o da janela que a Meta fecha, com a data dita.
  */
  it("usa o total de 7 e de 28 dias do dia mais recente do período", () => {
    const resultado = visualizadoresUnicos(
      [
        linha("page_total_media_view_unique:days_28", "2026-09-28", 200_000),
        linha("page_total_media_view_unique:days_28", "2026-09-29", 209_765),
        linha("page_total_media_view_unique:week", "2026-09-29", 61_000),
      ],
      setembro,
    );
    expect(resultado).toEqual({
      semana: { valor: 61_000, ate: "2026-09-29" },
      mes: { valor: 209_765, ate: "2026-09-29" },
    });
  });

  it("sem leitura, não inventa", () => {
    expect(visualizadoresUnicos([], setembro)).toEqual({ semana: null, mes: null });
  });
});

describe("porDiaDaPagina", () => {
  it("dá todos os dias, com null no dia sem leitura", () => {
    expect(
      porDiaDaPagina([linha("page_media_view", "2026-09-01", 10)], ["2026-09-01", "2026-09-02"]).map((dia) => dia.visualizacoes),
    ).toEqual([10, null]);
  });
});
