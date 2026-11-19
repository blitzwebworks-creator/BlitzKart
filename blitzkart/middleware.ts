import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Password recovery uses the www origin. Keep its PKCE verifier cookie on
  // the same host while the customer requests the email and opens its link.
  if (process.env.NODE_ENV === "production" && request.nextUrl.hostname.toLowerCase() === "blitzkart.store" && !request.nextUrl.pathname.startsWith("/api/")) {
    const canonical = request.nextUrl.clone();
    canonical.protocol = "https:";
    canonical.hostname = "www.blitzkart.store";
    canonical.port = "";
    return NextResponse.redirect(canonical, 308);
  }
  return refreshSession(request);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
