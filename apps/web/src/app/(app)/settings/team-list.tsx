"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { tempoRelativo } from "@/lib/relative-time";
import { mudarPapel, removerMembro } from "./team-actions";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { PAPEL, Papel } from "./papeis";


export interface Membro {
  userId: string;
  name: string;
  email: string;
  role: Papel;
  joinedAt: string;
  /** Da equipe Timeless. É para quem a posse da conta da equipe pode ir. */
  daEquipe: boolean;
}


export function TeamList({
  membros,
  euId,
  possoGerir,
  possoMexerEmDono,
  contaDaEquipe = false,
}: {
  membros: Membro[];
  euId: string;
  possoGerir: boolean;
  possoMexerEmDono: boolean;
  /** Na conta da equipe, dono só se vira pela transferência, com o autenticador. */
  contaDaEquipe?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div>
      <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/70">
        {membros.map((membro) => (
          <Linha
            key={membro.userId}
            membro={membro}
            souEu={membro.userId === euId}
            posso={possoGerir}
            possoMexerEmDono={possoMexerEmDono}
            semVirarDono={contaDaEquipe}
            aoFalhar={setErro}
          />
        ))}
      </ul>

      {erro ? (
        <p className="mt-3 text-apoio text-danger" role="alert">
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
  possoMexerEmDono,
  semVirarDono,
  aoFalhar,
}: {
  membro: Membro;
  souEu: boolean;
  posso: boolean;
  possoMexerEmDono: boolean;
  semVirarDono: boolean;
  aoFalhar: (erro: string | null) => void;
}) {
  const [pendente, iniciar] = useTransition();

  /*
    O que a tela desabilita é só a primeira camada. Todas estas regras são
    verificadas de novo no servidor: esconder um botão não impede ninguém de
    chamar a rota, e é lá que a conta fica protegida de ficar sem dono.
  */
  const donoForaDoMeuAlcance = membro.role === "OWNER" && !possoMexerEmDono;
  const bloqueado = !posso || souEu || donoForaDoMeuAlcance;

  function executar(acao: () => Promise<{ erro?: string }>) {
    aoFalhar(null);
    iniciar(async () => {
      const resultado = await acao();
      if (resultado.erro) aoFalhar(resultado.erro);
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
          className="h-8 w-auto pr-8 text-apoio"
          envolucro="inline-block"
        >
          {(Object.keys(PAPEL) as Papel[])
            .filter((papel) => !(semVirarDono && papel === "OWNER" && membro.role !== "OWNER"))
            .map((papel) => (
            <option key={papel} value={papel}>
              {PAPEL[papel].rotulo}
            </option>
          ))}
        </Select>
      )}

      {bloqueado ? (
        <span className="w-[5.5rem] shrink-0" />
      ) : (
        // Dois passos, e não um alerta do navegador: remover alguém da conta
        // não se desfaz com um clique de volta, e a confirmação fica no lugar
        // do próprio botão em vez de num diálogo que se fecha no reflexo.
        <InlineConfirm
          aparencia="contorno"
          aoConfirmar={() => removerMembro(membro.userId)}
          rotuloPendente="Removendo"
          aria-label={`Remover ${membro.name} da conta`}
          className="shrink-0"
        >
          Remover
        </InlineConfirm>
      )}
    </li>
  );
}
