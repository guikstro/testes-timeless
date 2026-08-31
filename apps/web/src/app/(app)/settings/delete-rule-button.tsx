"use client";

import { useTransition } from "react";
import { deleteClassificationRule } from "./actions";

export function DeleteRuleButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => deleteClassificationRule(id))}
      disabled={pending}
      className="text-sm text-ink-mute hover:text-red-600 disabled:opacity-50"
    >
      Remover
    </button>
  );
}
