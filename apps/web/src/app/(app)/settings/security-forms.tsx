"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EstadoDeSeguranca, trocarEmail, trocarSenha } from "./security-actions";

const inicial: EstadoDeSeguranca = {};

export function FormularioDeSenha() {
  const [estado, acao, enviando] = useActionState(trocarSenha, inicial);
  const form = useRef<HTMLFormElement>(null);

  // Limpa só no sucesso: no erro, quem digitou não pode perder o que escreveu.
  useEffect(() => {
    if (estado.okEm) form.current?.reset();
  }, [estado.okEm]);

  return (
    <form ref={form} action={acao} className="space-y-4">
      <Field label="Senha atual">
        {(id) => (
          <Input id={id} name="currentPassword" type="password" autoComplete="current-password" required />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nova senha" hint="Ao menos oito caracteres.">
          {(id) => (
            <Input id={id} name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
          )}
        </Field>
        <Field label="Repita a nova senha">
          {(id) => (
            <Input id={id} name="confirmacao" type="password" autoComplete="new-password" minLength={8} required />
          )}
        </Field>
      </div>

      <Aviso>
        Trocar a senha derruba as sessões abertas em outros aparelhos. Esta aba continua conectada.
      </Aviso>

      <Rodape enviando={enviando} estado={estado} rotulo="Trocar senha" sucesso="Senha trocada." />
    </form>
  );
}

export function FormularioDeEmail({ emailAtual }: { emailAtual: string }) {
  const [estado, acao, enviando] = useActionState(trocarEmail, inicial);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.okEm) form.current?.reset();
  }, [estado.okEm]);

  return (
    <form ref={form} action={acao} className="space-y-4">
      <p className="text-corpo text-ink-mute">
        E-mail de acesso hoje: <span className="font-medium text-ink">{emailAtual}</span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Novo e-mail">
          {(id) => <Input id={id} name="newEmail" type="email" autoComplete="email" required />}
        </Field>
        <Field label="Repita o novo e-mail">
          {(id) => <Input id={id} name="confirmacao" type="email" autoComplete="email" required />}
        </Field>
      </div>

      <Field label="Senha atual" hint="Confirma que é você quem está trocando.">
        {(id) => (
          <Input id={id} name="currentPassword" type="password" autoComplete="current-password" required />
        )}
      </Field>

      {/*
        Este aviso não é formalidade. O produto ainda não envia e-mail, então
        não há confirmação no endereço novo: um erro de digitação vira o login
        e a recuperação de senha iria para um endereço que não existe.
      */}
      <Aviso tom="atencao">
        O novo endereço passa a ser o seu login imediatamente, e ainda não enviamos um e-mail de confirmação para
        ele. Confira letra por letra: com o endereço errado, nem o login nem a recuperação de senha funcionam.
      </Aviso>

      <Rodape enviando={enviando} estado={estado} rotulo="Trocar e-mail" sucesso="E-mail trocado." />
    </form>
  );
}

function Aviso({ children, tom = "neutro" }: { children: React.ReactNode; tom?: "neutro" | "atencao" }) {
  return (
    <p
      className={`rounded-xl border px-3.5 py-2.5 text-apoio leading-relaxed ${
        tom === "atencao"
          ? "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
          : "border-line bg-panel-soft/60 text-ink-mute"
      }`}
    >
      {children}
    </p>
  );
}

function Rodape({
  enviando,
  estado,
  rotulo,
  sucesso,
}: {
  enviando: boolean;
  estado: EstadoDeSeguranca;
  rotulo: string;
  sucesso: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" loading={enviando}>
        {enviando ? "Salvando..." : rotulo}
      </Button>
      {estado.erro ? (
        <p className="text-apoio text-red-600 dark:text-red-400" role="alert">
          {estado.erro}
        </p>
      ) : estado.okEm ? (
        <p className="text-apoio text-emerald-700 dark:text-emerald-400" role="status">
          {sucesso}
        </p>
      ) : null}
    </div>
  );
}
