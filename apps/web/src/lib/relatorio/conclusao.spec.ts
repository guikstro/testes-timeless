import { concluiRelatorioDeLeads, concluiRelatorioLocal, FraseDeConclusao } from "./conclusao";

// O formato de moeda separa "R$" do valor com espaço rígido; aqui ele vira espaço comum.
const texto = (f: FraseDeConclusao | null) =>
  f ? `${f.antes}[${f.destaque ?? ""}]${f.depois}`.replace(/\u00a0/g, " ") : null;

describe("frase que abre o relatório", () => {
  const base = { medido: true, leads: 42, vendas: 6, receitaCentavos: 420_000, investidoCentavos: 210_400 };

  it("leads: destaca as vendas, sem dizer que vieram dos leads do período", () => {
    expect(texto(concluiRelatorioDeLeads(base))).toBe("[6 clientes novos] e 42 leads no período, com R$ 4.200,00 em vendas.");
    expect(texto(concluiRelatorioDeLeads({ ...base, vendas: 1, leads: 1, receitaCentavos: 0 }))).toBe(
      "[1 cliente novo] e 1 lead no período.",
    );
  });

  it("leads: sem venda, destaca os leads e o investimento", () => {
    expect(texto(concluiRelatorioDeLeads({ ...base, vendas: 0 }))).toBe("[42 leads] no período, com R$ 2.104,00 investidos.");
    expect(texto(concluiRelatorioDeLeads({ ...base, vendas: 0, leads: 1234, investidoCentavos: 0 }))).toBe(
      "[1.234 leads] no período.",
    );
  });

  it("leads: zero medido é dito; sem medida, não há frase", () => {
    expect(texto(concluiRelatorioDeLeads({ ...base, vendas: 0, leads: 0 }))).toBe("Nenhum lead no período.[]");
    expect(concluiRelatorioDeLeads({ ...base, medido: false })).toBeNull();
  });

  it("presença local: destaca ligações e rotas, só as que tiveram alguma", () => {
    expect(texto(concluiRelatorioLocal({ ligacoes: 214, rotas: 360, investidoCentavos: 210_400 }))).toBe(
      "[214 ligações e 360 pedidos de rota] pelos anúncios do Google, com R$ 2.104,00 investidos.",
    );
    expect(texto(concluiRelatorioLocal({ ligacoes: 0, rotas: 1, investidoCentavos: null }))).toBe(
      "[1 pedido de rota] pelos anúncios do Google.",
    );
  });

  it("presença local: nada medido, nada dito; zero medido, dito", () => {
    expect(concluiRelatorioLocal({ ligacoes: null, rotas: null, investidoCentavos: 100 })).toBeNull();
    expect(texto(concluiRelatorioLocal({ ligacoes: 0, rotas: 0, investidoCentavos: 100 }))).toBe(
      "Nenhuma ligação nem pedido de rota pelos anúncios no período.[]",
    );
    expect(texto(concluiRelatorioLocal({ ligacoes: 0, rotas: null, investidoCentavos: 100 }))).toBe(
      "Nenhuma ligação pelos anúncios no período.[]",
    );
  });
});
