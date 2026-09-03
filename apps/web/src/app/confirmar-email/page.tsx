import { Suspense } from "react";
import { ConfirmacaoDeEmail } from "./confirmacao";

export default function ConfirmarEmailPage() {
  return (
    <Suspense>
      <ConfirmacaoDeEmail />
    </Suspense>
  );
}
