"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { OBJETIVOS_DO_NEGOCIO, PerfilDoNegocio, textoDosCentavos } from "@/lib/perfil-do-negocio";
import { EstadoDoPerfil, salvarPerfilDoNegocio } from "./perfil-do-negocio-actions";

const inicial: EstadoDoPerfil = {};

/**
 * O perfil do negócio, em três blocos: o que é, o que quer e quanto vale.
 * Tudo opcional: um perfil pela metade já dá à análise mais contexto que
 * nenhum, e nada aqui é deduzido do nicho.
 */
export function PerfilDoNegocioForm({ perfil, podeEditar }: { perfil: PerfilDoNegocio | null; podeEditar: boolean }) {
  const [estado, acao, salvando] = useActionState(salvarPerfilDoNegocio, inicial);
  const [principal, setPrincipal] = useState(perfil?.objetivoPrincipal ?? "");

  return (
    <form action={acao} className="space-y-8">
      <fieldset disabled={!podeEditar} className="space-y-8 disabled:opacity-80">
        <Bloco titulo="O negócio">
          <Field label="Tipo de negócio" hint="Em poucas palavras, como você explicaria para alguém.">
            {(id, ligacao) => (
              <Input id={id} {...ligacao} name="tipoDeNegocio" maxLength={200} defaultValue={perfil?.tipoDeNegocio ?? ""} placeholder="Cafeteria com loja e venda online" />
            )}
          </Field>
          <Field label="O que vende" hint="Produtos ou serviços principais, e o que mais traz dinheiro.">
            {(id, ligacao) => <Textarea id={id} {...ligacao} name="oferta" rows={2} maxLength={1000} defaultValue={perfil?.oferta ?? ""} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Para quem vende">
              {(id, ligacao) => <Textarea id={id} {...ligacao} name="publico" rows={2} maxLength={1000} defaultValue={perfil?.publico ?? ""} />}
            </Field>
            <Field label="Região atendida" hint="Cidade, bairros ou raio em volta da loja.">
              {(id, ligacao) => <Input id={id} {...ligacao} name="regiao" maxLength={500} defaultValue={perfil?.regiao ?? ""} />}
            </Field>
          </div>
        </Bloco>

        <Bloco titulo="O que o negócio quer">
          <Field label="Objetivo principal" hint="O objetivo de cada campanha continua valendo para ela; este é o do negócio.">
            {(id, ligacao) => (
              <Select id={id} {...ligacao} name="objetivoPrincipal" value={principal} onChange={(e) => setPrincipal(e.target.value)}>
                <option value="">Não definido</option>
                {OBJETIVOS_DO_NEGOCIO.map((o) => (
                  <option key={o.chave} value={o.chave}>
                    {o.rotulo}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <fieldset>
            <legend className="text-corpo font-medium text-ink-soft">Outros objetivos</legend>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              {OBJETIVOS_DO_NEGOCIO.filter((o) => o.chave !== principal).map((o) => (
                <label key={o.chave} className="flex cursor-pointer items-center gap-2 text-corpo text-ink">
                  <input
                    type="checkbox"
                    name="objetivosSecundarios"
                    value={o.chave}
                    defaultChecked={perfil?.objetivosSecundarios.includes(o.chave)}
                    className="focus-ring h-4 w-4 rounded border-line accent-[rgb(var(--accent))]"
                  />
                  {o.rotulo}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="O que é sucesso para o negócio" hint="Ex.: dez reuniões por mês, a loja cheia no sábado, crescer o Instagram.">
            {(id, ligacao) => (
              <Textarea id={id} {...ligacao} name="definicaoDeSucesso" rows={2} maxLength={1000} defaultValue={perfil?.definicaoDeSucesso ?? ""} />
            )}
          </Field>
        </Bloco>

        <Bloco titulo="Metas e números" descricao="Só o que você souber. Sem a margem, o sistema fala de receita, nunca de lucro.">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Vendas por mês">
              {(id, ligacao) => (
                <Input id={id} {...ligacao} name="metaVendasPorMes" inputMode="numeric" defaultValue={perfil?.metaVendasPorMes ?? ""} />
              )}
            </Field>
            <Field label="Custo máximo por venda (R$)">
              {(id, ligacao) => (
                <Input id={id} {...ligacao} name="metaCustoPorVenda" inputMode="decimal" defaultValue={textoDosCentavos(perfil?.metaCustoPorVendaCentavos ?? null)} />
              )}
            </Field>
            <Field label="Receita por mês (R$)">
              {(id, ligacao) => (
                <Input id={id} {...ligacao} name="metaReceitaMensal" inputMode="decimal" defaultValue={textoDosCentavos(perfil?.metaReceitaMensalCentavos ?? null)} />
              )}
            </Field>
            <Field label="Ciclo de venda (dias)" hint="Do primeiro contato até fechar.">
              {(id, ligacao) => (
                <Input id={id} {...ligacao} name="cicloDeVendaDias" inputMode="numeric" defaultValue={perfil?.cicloDeVendaDias ?? ""} />
              )}
            </Field>
            <Field label="Margem (%)">
              {(id, ligacao) => (
                <Input id={id} {...ligacao} name="margemPercentual" inputMode="numeric" defaultValue={perfil?.margemPercentual ?? ""} />
              )}
            </Field>
            <Field label="Custo médio por venda (R$)" hint="O que custa entregar uma venda.">
              {(id, ligacao) => (
                <Input id={id} {...ligacao} name="custoMedio" inputMode="decimal" defaultValue={textoDosCentavos(perfil?.custoMedioCentavos ?? null)} />
              )}
            </Field>
          </div>
        </Bloco>
      </fieldset>

      {podeEditar ? (
        <div className="flex items-center gap-3">
          <Button type="submit" loading={salvando}>
            Salvar perfil
          </Button>
          {estado.erro ? (
            <span role="alert" className="text-apoio text-danger">
              {estado.erro}
            </span>
          ) : estado.salvoEm ? (
            <span role="status" className="text-apoio text-ink-mute">
              Perfil salvo.
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-apoio text-ink-mute">Só quem administra a conta altera o perfil.</p>
      )}
    </form>
  );
}

function Bloco({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-display text-destaque font-semibold text-ink">{titulo}</h2>
        {descricao ? <p className="mt-0.5 text-apoio text-ink-mute">{descricao}</p> : null}
      </div>
      {children}
    </section>
  );
}
