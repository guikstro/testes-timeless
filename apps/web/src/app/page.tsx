import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE } from "@/lib/session";

export default async function RootPage() {
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get(ACCESS_TOKEN_COOKIE)?.value);
  redirect(hasSession ? "/dashboard" : "/login");
}
