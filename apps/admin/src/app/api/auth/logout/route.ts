import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ACCESS_COOKIE, ADMIN_MFA_COOKIE, ADMIN_REFRESH_COOKIE } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export async function POST(request: NextRequest) {
  const refresh = request.cookies.get(ADMIN_REFRESH_COOKIE)?.value;

  if (refresh) {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      });
    } catch {
      // A revogação no servidor é o ideal; apagar os cookies é o mínimo, e
      // falhar no primeiro não pode impedir o segundo.
    }
  }

  const resposta = NextResponse.json({ ok: true });
  for (const cookie of [ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, ADMIN_MFA_COOKIE]) {
    resposta.cookies.delete(cookie);
  }
  return resposta;
}
