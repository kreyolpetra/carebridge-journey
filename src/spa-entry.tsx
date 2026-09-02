// Client-only entry for the single-file HTML build (see vite.spa.config.ts).
//
// The app normally boots through TanStack Start, which renders the document
// shell on the server. This entry skips that entirely: it mounts the same route
// tree into a plain #root div so the whole prototype can ship as one static
// file with no server behind it.
//
// Hash history is deliberate — it is what lets the file work when opened from
// file:// or served from a path that isn't the domain root. Without it, any
// navigation away from the entry route would request a path nothing serves.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  // Loud on purpose: as a classic (non-module) script this file runs wherever
  // it sits in the document, so if it is ever moved back into <head> the mount
  // point will not exist yet and the page would otherwise fail silently.
  throw new Error("CariCare Grid: #root not found — the bundle must load after it in the document.");
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
