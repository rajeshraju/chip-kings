import { NextResponse, type NextRequest } from "next/server";
import { readSessionFromToken, SESSION_COOKIE_NAME } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth =
    pathname.startsWith("/games") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/admin");
  if (!needsAuth) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await readSessionFromToken(token) : null;
  const homeUrl = new URL("/", request.url);

  if (!session) {
    return NextResponse.redirect(homeUrl);
  }

  // Admin-only routes
  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(homeUrl);
  }

  // Reports: editor + admin only (no viewers)
  if (pathname.startsWith("/reports") && session.role === "viewer") {
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/games/:path*", "/reports/:path*", "/admin/:path*"],
};
