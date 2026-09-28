"use client";

import { useTransition } from "react";
import { deleteClassificationRule } from "./actions";

export function DeleteRuleButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => deleteClassificationRule(id))}
      disabled={pending}
      className="text-corpo text-ink-mute hover:text-danger disabled:opacity-50"
    >
      Remover
    </button>
  );
}
