import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - /login
     * - /api/auth (next-auth endpoints)
     * - /api/health (проба готовности для healthcheck и мониторинга)
     * - /_next (Next.js internals)
     * - /favicon.ico, /icons, etc.
     */
    "/((?!login|api/auth|api/health|_next/static|_next/image|favicon.ico).*)",
  ],
};
