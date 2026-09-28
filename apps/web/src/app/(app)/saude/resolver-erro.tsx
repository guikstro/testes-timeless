"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { marcarResolvido } from "./actions";

/** Não é destrutivo: se o erro voltar, ele reabre sozinho. Por isso um clique só. */
export function ResolverErro({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {erro ? <span className="text-apoio text-danger">{erro}</span> : null}
      <Button
        variant="ghost"
        size="sm"
        loading={pendente}
        onClick={() =>
          iniciar(async () => {
            const resultado = await marcarResolvido(id);
            setErro(resultado.erro ?? null);
          })
        }
      >
        Resolvido
      </Button>
    </span>
  );
}
