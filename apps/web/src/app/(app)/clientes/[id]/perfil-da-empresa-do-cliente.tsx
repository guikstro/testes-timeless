"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { SearchInput } from "@/components/ui/input";
import { formataDia } from "@/lib/periodo";
import { tempoRelativo } from "@/lib/relative-time";
import {
  definePerfis,
  desconectaPerfil,
  iniciaPerfil,
  lePerfilAgora,
  LocalDoGoogle,
  locaisDoGoogle,
  PerfilDoCliente,
  SituacaoDoPerfil,
} from "../actions";

/** O que a volta do Google deixou no endereço. */
export interface ResultadoDaConexao {
  perfil?: string;
  motivo?: string;
}

/**
 * O Perfil da Empresa no Google deste cliente, do lado da equipe.
 *
 * A conta Google é uma só, da equipe, para todos os clientes; aqui se escolhe
 * qual perfil é deste. A lista de perfis da conta tem os de todos os
 * clientes, e por isso só existe nesta tela, que o cliente não abre.
 */
export function PerfilDaEmpresaDoCliente({
  organizationId,
  nome,
  situacao,
  perfil,
  resultado,
}: {
  organizationId: string;
  nome: string;
  situacao: SituacaoDoPerfil;
  perfil: PerfilDoCliente;
  resultado: ResultadoDaConexao;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();
  const [escolhendo, setEscolhendo] = useState<{ locais: LocalDoGoogle[]; contasRecusadas: number } | null>(null);

  const conecta = () =>
    comecar(async () => {
      setErro(null);
      const r = await iniciaPerfil(`/clientes/${organizationId}`);
      if ("error" in r) setErro(r.error);
      // Página inteira: o consentimento é no Google, e a volta é numa rota do site.
      else window.location.assign(r.url);
    });

  const desconecta = () => {
    if (
      !window.confirm(
        "Desconectar a conta Google da equipe? A leitura do Perfil da Empresa para em todos os clientes. Os números que já chegaram ficam.",
      )
    )
      return;
    comecar(async () => {
      setErro(null);
      const r = await desconectaPerfil(organizationId);
      if (r.error) setErro(r.error);
    });
  };

  const abreEscolha = () =>
    comecar(async () => {
      setErro(null);
      const r = await locaisDoGoogle();
      if ("error" in r) setErro(r.error);
      else setEscolhendo(r);
    });

  const leAgora = () =>
    comecar(async () => {
      setErro(null);
      const r = await lePerfilAgora(organizationId);
      if (r.error) setErro(r.error);
      else setAviso("Leitura pedida. Os números aparecem em alguns minutos.");
    });

  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-5">
      <h2 className="text-corpo font-medium uppercase tracking-wide text-ink-mute">Perfil da Empresa no Google</h2>
      <p className="mt-1 text-apoio text-ink-mute">
        Ligações, pedidos de rota, cliques no site e visualizações do perfil na Busca e no Maps, no painel de presença
        local do cliente.
      </p>

      <ResultadoDaVolta resultado={resultado} />

      {!situacao.configurado ? (
        <Alert tom="warning" className="mt-4" titulo="Falta configurar o app do Google">
          <p>
            Na API, no Render: GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET. No Google Cloud, o endereço de retorno
            autorizado é <span className="break-all font-mono">{situacao.enderecoDeRetorno}</span>.
          </p>
        </Alert>
      ) : !situacao.conta ? (
        <div className="mt-4 rounded-md border border-line bg-panel-soft p-3">
          <p className="text-corpo text-ink-soft">
            Nenhuma conta Google da equipe conectada. É uma só para todos os clientes: use a conta que gerencia os
            perfis na organização da agência.
          </p>
          <Button type="button" className="mt-3" onClick={conecta} loading={pendente}>
            Conectar conta Google
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-corpo text-ink">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${situacao.conta.erro ? "bg-amber-500" : "bg-emerald-500"}`} aria-hidden />
            Conta da equipe: {situacao.conta.email ?? "conectada"}
            <span className="text-ink-mute">· desde {formataDia(situacao.conta.conectadaEm.slice(0, 10))}</span>
            <button
              type="button"
              onClick={desconecta}
              disabled={pendente}
              className="focus-ring ml-1 text-apoio text-ink-mute underline underline-offset-2 hover:text-ink disabled:opacity-50"
            >
              Desconectar
            </button>
          </p>
          {situacao.conta.erro ? (
            <Alert
              tom="warning"
              className="mt-3"
              titulo="A leitura parou"
              acao={
                <Button type="button" size="sm" variant="secondary" onClick={conecta} disabled={pendente}>
                  Conectar de novo
                </Button>
              }
            >
              {situacao.conta.erro}
            </Alert>
          ) : null}
        </div>
      )}

      {situacao.conta ? (
        <div className="mt-5">
          {perfil.locais.length === 0 ? (
            <p className="text-corpo text-ink-soft">Nenhum perfil ligado a {nome}.</p>
          ) : (
            <ul className="space-y-2">
              {perfil.locais.map((local) => (
                <li key={local.localId} className="rounded-md border border-line bg-panel-soft p-3">
                  <p className="text-corpo font-medium text-ink">{local.nome}</p>
                  {local.endereco ? <p className="text-apoio text-ink-mute">{local.endereco}</p> : null}
                  <p className={`mt-1 text-apoio ${local.erro ? "text-danger" : "text-ink-mute"}`}>
                    {local.erro
                      ? local.erro
                      : !local.sincronizadoEm
                        ? "Lendo o histórico de um ano e meio. Leva alguns minutos."
                        : `${local.numerosAte ? `Números até ${formataDia(local.numerosAte)}` : "Sem números ainda"}, lido ${tempoRelativo(local.sincronizadoEm)}. O Google libera com uns três dias de atraso.`}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {escolhendo ? (
            <EscolhaDePerfis
              organizationId={organizationId}
              lista={escolhendo}
              atuais={perfil.locais.map((local) => local.localId)}
              aoTerminar={(salvou) => {
                setEscolhendo(null);
                if (salvou) {
                  setAviso("Perfis salvos. O histórico chega em alguns minutos.");
                  router.refresh();
                }
              }}
            />
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={abreEscolha} loading={pendente}>
                {perfil.locais.length ? "Trocar perfis" : "Escolher perfil"}
              </Button>
              {perfil.locais.length ? (
                <Button type="button" variant="ghost" onClick={leAgora} disabled={pendente}>
                  Ler agora
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {aviso ? (
        <p className="mt-3 text-apoio text-ink-soft" role="status">
          {aviso}
        </p>
      ) : null}
      {erro ? (
        <p className="mt-3 text-corpo text-danger" role="alert">
          {erro}
        </p>
      ) : null}
    </section>
  );
}

function ResultadoDaVolta({ resultado }: { resultado: ResultadoDaConexao }) {
  if (resultado.perfil === "conectado") {
    return (
      <Alert tom="success" className="mt-4">
        Conta Google da equipe conectada.
      </Alert>
    );
  }
  if (resultado.perfil === "recusado") {
    return (
      <Alert tom="info" className="mt-4">
        A conexão foi cancelada na tela do Google. Nada mudou.
      </Alert>
    );
  }
  if (resultado.perfil === "erro") {
    return (
      <Alert tom="danger" className="mt-4" titulo="A conexão com o Google não terminou">
        {resultado.motivo || "O Google não completou a autorização."}
      </Alert>
    );
  }
  return null;
}

/**
 * A lista de perfis da conta da equipe, com busca. O perfil que já é de
 * outro cliente aparece travado, com o nome dele: ligar o mesmo perfil em
 * dois clientes mostraria os números de um no painel do outro.
 */
function EscolhaDePerfis({
  organizationId,
  lista,
  atuais,
  aoTerminar,
}: {
  organizationId: string;
  lista: { locais: LocalDoGoogle[]; contasRecusadas: number };
  atuais: string[];
  aoTerminar: (salvou: boolean) => void;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set(atuais));
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, comecar] = useTransition();

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return lista.locais;
    return lista.locais.filter((local) => `${local.nome} ${local.endereco ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo));
  }, [busca, lista.locais]);

  const alterna = (id: string) =>
    setMarcados((anteriores) => {
      const proximos = new Set(anteriores);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });

  const salva = () => {
    const saindo = atuais.filter((id) => !marcados.has(id));
    if (saindo.length && !window.confirm("Os números dos perfis desmarcados saem deste cliente. Continuar?")) return;
    comecar(async () => {
      setErro(null);
      const r = await definePerfis(organizationId, [...marcados]);
      if (r.error) setErro(r.error);
      else aoTerminar(true);
    });
  };

  return (
    <div className="mt-4 rounded-md border border-line bg-panel-soft p-3">
      {lista.locais.length === 0 ? (
        <p className="text-corpo text-ink-soft">
          A conta da equipe não enxerga nenhum perfil. No Gerenciador de Perfis, peça acesso de gerente ao perfil do
          cliente pela organização da agência, e o dono do perfil aprova.
        </p>
      ) : (
        <>
          <SearchInput
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por nome ou endereço"
            aria-label="Buscar perfil"
          />
          <ul className="mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-1">
            {visiveis.map((local) => {
              const deOutro = local.cliente && local.cliente.id !== organizationId ? local.cliente : null;
              return (
                <li key={local.localId}>
                  <Checkbox
                    checked={marcados.has(local.localId)}
                    disabled={Boolean(deOutro) || salvando}
                    onChange={() => alterna(local.localId)}
                    descricao={deOutro ? `Já é do cliente ${deOutro.nome}` : (local.endereco ?? undefined)}
                  >
                    {local.nome}
                  </Checkbox>
                </li>
              );
            })}
            {visiveis.length === 0 ? <li className="text-apoio text-ink-mute">Nenhum perfil com esse nome.</li> : null}
          </ul>
        </>
      )}
      {lista.contasRecusadas > 0 ? (
        <p className="mt-3 text-apoio text-ink-mute">
          {lista.contasRecusadas === 1 ? "Uma conta do Google não deixou" : `${lista.contasRecusadas} contas do Google não deixaram`} listar
          os perfis: falta permissão de gerente nelas.
        </p>
      ) : null}
      {erro ? (
        <p className="mt-3 text-corpo text-danger" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={salva} loading={salvando} disabled={lista.locais.length === 0}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={() => aoTerminar(false)} disabled={salvando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
