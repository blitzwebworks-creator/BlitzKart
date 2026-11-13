import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function refreshSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values: Parameters<SetAllCookies>[0]) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  if (user && (pathname.startsWith("/account") || pathname.startsWith("/checkout") || pathname.startsWith("/admin"))) {
    const { data: profile } = await supabase.from("profiles").select("account_status").eq("id",user.id).maybeSingle();
    if (!profile || profile.account_status !== "active") return NextResponse.redirect(new URL("/login?error=Account+is+disabled",request.url));
  }
  return response;
}
