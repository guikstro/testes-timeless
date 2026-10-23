"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { centavosDe, inteiroDe, ObjetivoDoNegocio, OBJETIVOS_DO_NEGOCIO } from "@/lib/perfil-do-negocio";

export interface EstadoDoPerfil {
  erro?: string;
  salvoEm?: number;
}

const OBJETIVOS = OBJETIVOS_DO_NEGOCIO.map((o) => o.chave);

export async function salvarPerfilDoNegocio(_anterior: EstadoDoPerfil, formData: FormData): Promise<EstadoDoPerfil> {
  const texto = (campo: string) => String(formData.get(campo) ?? "");
  const principal = texto("objetivoPrincipal");

  const numeros = {
    metaVendasPorMes: inteiroDe(texto("metaVendasPorMes"), 1_000_000),
    metaCustoPorVendaCentavos: centavosDe(texto("metaCustoPorVenda")),
    metaReceitaMensalCentavos: centavosDe(texto("metaReceitaMensal")),
    cicloDeVendaDias: inteiroDe(texto("cicloDeVendaDias"), 3650),
    margemPercentual: inteiroDe(texto("margemPercentual"), 100),
    custoMedioCentavos: centavosDe(texto("custoMedio")),
  };
  const errado = Object.entries(numeros).find(([, valor]) => valor === "invalido");
  if (errado) return { erro: `Confira o campo ${ROTULO[errado[0]]}: use só números.` };

  try {
    await apiFetch("/organizations/current/perfil", {
      method: "PUT",
      body: JSON.stringify({
        tipoDeNegocio: texto("tipoDeNegocio"),
        oferta: texto("oferta"),
        objetivoPrincipal: OBJETIVOS.includes(principal as ObjetivoDoNegocio) ? principal : null,
        objetivosSecundarios: formData
          .getAll("objetivosSecundarios")
          .map(String)
          .filter((o) => OBJETIVOS.includes(o as ObjetivoDoNegocio) && o !== principal),
        publico: texto("publico"),
        regiao: texto("regiao"),
        definicaoDeSucesso: texto("definicaoDeSucesso"),
        ...numeros,
      }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      const mensagem = error.body.message;
      return { erro: Array.isArray(mensagem) ? mensagem.join(". ") : mensagem };
    }
    return { erro: "Não foi possível salvar." };
  }
  revalidatePath("/settings");
  revalidatePath("/campanhas");
  return { salvoEm: Date.now() };
}

const ROTULO: Record<string, string> = {
  metaVendasPorMes: "vendas por mês",
  metaCustoPorVendaCentavos: "custo máximo por venda",
  metaReceitaMensalCentavos: "receita por mês",
  cicloDeVendaDias: "ciclo de venda",
  margemPercentual: "margem (de 0 a 100)",
  custoMedioCentavos: "custo médio por venda",
};
