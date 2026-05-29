import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Supabase unreachable — fail closed: treat as unauthenticated
  }

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === "/login";
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/recapt") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/integrations/");

  if (!user && !isLoginPage && !isPublic) {
    const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
    supabaseResponse.cookies.getAll().forEach((c) =>
      redirectResponse.cookies.set(c.name, c.value)
    );
    return redirectResponse;
  }

  if (user && isLoginPage) {
    const redirectResponse = NextResponse.redirect(new URL("/dashboard", request.url));
    supabaseResponse.cookies.getAll().forEach((c) =>
      redirectResponse.cookies.set(c.name, c.value)
    );
    return redirectResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
