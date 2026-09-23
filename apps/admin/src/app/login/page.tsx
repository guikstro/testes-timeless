import { Suspense } from "react";
import { LoginDaAdministracao } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginDaAdministracao />
    </Suspense>
  );
}
