import { Suspense } from "react";
import { FormularioDeNovaSenha } from "./formulario";

export default function RedefinirSenhaPage() {
  return (
    <Suspense>
      <FormularioDeNovaSenha />
    </Suspense>
  );
}
