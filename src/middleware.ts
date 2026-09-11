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
     * - /icon.svg, /icon, /apple-icon (значок приложения: его запрашивают и
     *   страница входа, и закладки без сессии — редирект на /login сломал бы значок)
     */
    "/((?!login|api/auth|api/health|_next/static|_next/image|icon|apple-icon).*)",
  ],
};
