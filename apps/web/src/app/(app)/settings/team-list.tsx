"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { tempoRelativo } from "@/lib/relative-time";
import { mudarPapel, removerMembro } from "./team-actions";
import { PAPEL, Papel } from "./papeis";


export interface Membro {
  userId: string;
  name: string;
  email: string;
  role: Papel;
  joinedAt: string;
}


export function TeamList({ membros, euId, meuPapel }: { membros: Membro[]; euId: string; meuPapel: Papel }) {
  const posso = meuPapel === "OWNER" || meuPapel === "ADMIN";
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div>
      <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/70">
        {membros.map((membro) => (
          <Linha
            key={membro.userId}
            membro={membro}
            souEu={membro.userId === euId}
            posso={posso}
            meuPapel={meuPapel}
            aoFalhar={setErro}
          />
        ))}
      </ul>

      {erro ? (
        <p className="mt-3 text-apoio text-red-600 dark:text-red-400" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

function Linha({
  membro,
  souEu,
  posso,
  meuPapel,
  aoFalhar,
}: {
  membro: Membro;
  souEu: boolean;
  posso: boolean;
  meuPapel: Papel;
  aoFalhar: (erro: string | null) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();

  /*
    O que a tela desabilita é só a primeira camada. Todas estas regras são
    verificadas de novo no servidor: esconder um botão não impede ninguém de
    chamar a rota, e é lá que a conta fica protegida de ficar sem dono.
  */
  const souAdminMexendoEmDono = meuPapel === "ADMIN" && membro.role === "OWNER";
  const bloqueado = !posso || souEu || souAdminMexendoEmDono;

  function executar(acao: () => Promise<{ erro?: string }>) {
    aoFalhar(null);
    iniciar(async () => {
      const resultado = await acao();
      if (resultado.erro) aoFalhar(resultado.erro);
      setConfirmando(false);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3.5 py-3 transition-colors hover:bg-panel-soft/50">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-corpo font-medium text-ink">{membro.name}</span>
          {souEu ? <Badge tone="neutral">Você</Badge> : null}
        </span>
        <span className="mt-0.5 block truncate text-rotulo text-ink-mute">
          {membro.email} · entrou {tempoRelativo(membro.joinedAt)}
        </span>
      </span>

      {bloqueado ? (
        <Badge tone={PAPEL[membro.role].tom}>{PAPEL[membro.role].rotulo}</Badge>
      ) : (
        <Select
          value={membro.role}
          disabled={pendente}
          onChange={(evento) => executar(() => mudarPapel(membro.userId, evento.target.value))}
          aria-label={`Papel de ${membro.name}`}
          className="h-8 w-auto text-apoio"
        >
          {(Object.keys(PAPEL) as Papel[]).map((papel) => (
            <option key={papel} value={papel}>
              {PAPEL[papel].rotulo}
            </option>
          ))}
        </Select>
      )}

      {bloqueado ? (
        <span className="w-[5.5rem] shrink-0" />
      ) : confirmando ? (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={pendente}
            onClick={() => executar(() => removerMembro(membro.userId))}
            className="focus-ring rounded-full bg-red-600 px-2.5 py-1 text-rotulo font-medium text-white transition-all duration-200 ease-soft hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            {pendente ? "Removendo" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="focus-ring rounded-full px-2 py-1 text-rotulo text-ink-mute transition-colors hover:text-ink"
          >
            Cancelar
          </button>
        </span>
      ) : (
        // Dois passos, e não um alerta do navegador: remover alguém da conta
        // não se desfaz com um clique de volta, e a confirmação fica no lugar
        // do próprio botão em vez de num diálogo que se fecha no reflexo.
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="focus-ring w-[5.5rem] shrink-0 rounded-full border border-line px-2.5 py-1 text-rotulo font-medium text-ink-soft transition-all duration-200 ease-soft hover:border-red-400 hover:text-red-600 active:scale-95 dark:hover:text-red-400"
        >
          Remover
        </button>
      )}
    </li>
  );
}
