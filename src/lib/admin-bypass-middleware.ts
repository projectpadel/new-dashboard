import { createMiddleware } from "@tanstack/react-start";

/** Dummy context agar server function admin jalan tanpa login / Bearer token. */
export const bypassServerAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  return next({
    context: {
      userId: "00000000-0000-4000-8000-000000000001",
    },
  });
});
