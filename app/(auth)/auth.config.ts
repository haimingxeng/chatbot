import type { NextAuthConfig } from "next-auth";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const authConfig = {
  basePath: "/api/auth",
  trustHost: true,
  pages: {
    signIn: `${base}/login`,
    newUser: `${base}/`,
  },
  providers: [],
  callbacks: {
    authorized({ auth: session, request: { nextUrl } }) {
      const isLoggedIn = !!session?.user;
      const isAuthPage =
        nextUrl.pathname === `${base}/login` ||
        nextUrl.pathname === `${base}/register`;

      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL(`${base}/`, nextUrl));
        }
        return true;
      }

      if (isLoggedIn) return true;

      return false;
    },
  },
} satisfies NextAuthConfig;
