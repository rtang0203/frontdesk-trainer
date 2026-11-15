import { NextResponse, type NextRequest } from "next/server";

/** Shared-password gate (HTTP basic auth, any username) on everything but the Retell webhook. */
export function proxy(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return new NextResponse("DEMO_PASSWORD is not set", { status: 500 });

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Front Desk Trainer", charset="UTF-8"' },
  });
}

export const config = {
  // The webhook is protected by its signature check instead.
  matcher: ["/((?!api/webhooks/retell|_next/static|_next/image|favicon.ico).*)"],
};
