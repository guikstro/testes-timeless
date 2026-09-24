"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createTrackingLink, CreateLinkState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { destinoDoWhatsApp } from "./destino";
import { PLATAFORMAS } from "./plataformas";

const initialState: CreateLinkState = {};

type Destino = "whatsapp" | "pagina";

/**
 * Três perguntas, na ordem em que a pessoa pensa: onde o link vai ser
 * colado, para onde ele leva, e que nome ele tem.
 *
 * Origem, meio e campanha continuam aqui, mas recolhidos: são preenchidos
 * pela plataforma escolhida, e mostrá-los abertos fazia a tela parecer um
 * formulário técnico que só quem entende de UTM consegue preencher.
 */
export function CreateLinkForm() {
  const [state, formAction, pending] = useActionState(createTrackingLink, initialState);
  const [plataforma, setPlataforma] = useState(PLATAFORMAS[0]);
  const [destino, setDestino] = useState<Destino>("whatsapp");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [pagina, setPagina] = useState("");
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.criadoEm) {
      form.current?.reset();
      setPlataforma(PLATAFORMAS[0]);
      setTelefone("");
      setMensagem("");
      setPagina("");
    }
  }, [state.criadoEm]);

  const escreveAMao = plataforma.chave === "outro";
  const enderecoDoWhatsApp = destinoDoWhatsApp(telefone, mensagem || sugestaoDeMensagem(plataforma.rotulo));
  const endereco = destino === "whatsapp" ? enderecoDoWhatsApp : pagina.trim();
  const telefoneInvalido = destino === "whatsapp" && telefone.trim().length > 0 && !enderecoDoWhatsApp;

  return (
    <form ref={form} action={formAction} className="surface space-y-6 p-5 sm:p-6">
      <Passo numero={1} titulo="Onde você vai colar este link">
        {/*
          A plataforma vem primeiro porque ela preenche a origem e o meio. Sem
          isso a pessoa digita "Facebook" num link e "facebook-ads" no outro, e
          o relatório passa a mostrar duas origens para a mesma coisa.
        */}
        <div className="flex flex-wrap gap-1.5">
          {PLATAFORMAS.map((opcao) => {
            const ativa = opcao.chave === plataforma.chave;
            return (
              <button
                key={opcao.chave}
                type="button"
                onClick={() => setPlataforma(opcao)}
                aria-pressed={ativa}
                className={`focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-apoio font-medium transition-all duration-200 ease-soft active:scale-95 ${
                  ativa
                    ? "border-transparent bg-ink text-canvas shadow-subtle"
                    : "border-line text-ink-soft hover:border-ink/25 hover:text-ink"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: opcao.cor }} aria-hidden />
                {opcao.rotulo}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-apoio text-ink-mute">{plataforma.descricao}</p>
      </Passo>

      <Passo numero={2} titulo="Para onde ele leva">
        <GrupoDePilulas
          ativo={destino}
          opcoes={[
            { chave: "whatsapp", rotulo: "Para o WhatsApp", aoClicar: () => setDestino("whatsapp") },
            { chave: "pagina", rotulo: "Para uma página", aoClicar: () => setDestino("pagina") },
          ]}
        />

        {destino === "whatsapp" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Número do WhatsApp"
              hint="Com DDD, do jeito que você escreve no cartão."
              error={telefoneInvalido ? "Confira o número: faltou o DDD ou sobrou dígito." : undefined}
            >
              {(id) => (
                <Input
                  id={id}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(85) 99999-9999"
                  required
                />
              )}
            </Field>
            <Field label="Mensagem que já vem escrita" hint="A pessoa só precisa apertar enviar.">
              {(id) => (
                <Input
                  id={id}
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder={sugestaoDeMensagem(plataforma.rotulo)}
                  maxLength={300}
                />
              )}
            </Field>
          </div>
        ) : (
          <div className="mt-4">
            <Field label="Endereço da página" hint="O endereço completo, começando por https://">
              {(id) => (
                <Input
                  id={id}
                  type="url"
                  value={pagina}
                  onChange={(e) => setPagina(e.target.value)}
                  placeholder="https://seusite.com.br/contato"
                  required
                />
              )}
            </Field>
          </div>
        )}
        <input type="hidden" name="destinationUrl" value={endereco ?? ""} />
      </Passo>

      <Passo numero={3} titulo="Nome do link">
        <Field label="Nome" hint={`Opcional. Sem nome, ele se chama "${plataforma.rotulo}".`}>
          {(id) => <Input id={id} name="name" placeholder={`${plataforma.rotulo} | campanha de setembro`} />}
        </Field>
        <input type="hidden" name="nomePadrao" value={plataforma.rotulo} />
      </Passo>

      <details className="group rounded-xl border border-line/70 px-4 py-3">
        <summary className="focus-ring cursor-pointer list-none rounded-md text-apoio font-medium text-ink-soft marker:hidden">
          <span className="inline-flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-90"
              aria-hidden
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            Ajustes de rastreio (para quem usa UTM)
          </span>
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Origem" hint={escreveAMao ? "Ex.: parceiro, evento." : "Preenchida pela plataforma."}>
            {(id) => (
              <Input
                id={id}
                name="defaultSource"
                // `key` força o campo a assumir o valor novo ao trocar de
                // plataforma: sem isso, o padrão só valeria na primeira pintura.
                key={`source-${plataforma.chave}`}
                defaultValue={plataforma.source}
                readOnly={!escreveAMao}
                placeholder={escreveAMao ? "de onde vem" : undefined}
                className={escreveAMao ? undefined : "bg-panel-soft text-ink-mute"}
              />
            )}
          </Field>
          <Field label="Meio" hint={escreveAMao ? "Ex.: orgânico, impresso." : "Preenchido pela plataforma."}>
            {(id) => (
              <Input
                id={id}
                name="defaultMedium"
                key={`medium-${plataforma.chave}`}
                defaultValue={plataforma.medium}
                readOnly={!escreveAMao}
                placeholder={escreveAMao ? "como vem" : undefined}
                className={escreveAMao ? undefined : "bg-panel-soft text-ink-mute"}
              />
            )}
          </Field>
          <Field label="Campanha" hint="Opcional, para separar dentro da mesma origem.">
            {(id) => <Input id={id} name="defaultCampaign" placeholder="rescisao-setembro" />}
          </Field>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} disabled={!endereco}>
          {pending ? "Criando..." : "Criar link"}
        </Button>
        {state.error ? (
          <p className="text-apoio text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        ) : state.criadoEm ? (
          <p className="text-apoio text-emerald-700 dark:text-emerald-400" role="status">
            Link criado. Copie ele na lista abaixo.
          </p>
        ) : null}
      </div>
    </form>
  );
}

function sugestaoDeMensagem(plataforma: string): string {
  return `Olá! Vim pelo ${plataforma} e quero saber mais.`;
}

function Passo({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-corpo font-semibold text-ink">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/[0.08] text-rotulo tabular-nums text-ink-soft">
          {numero}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}
