/**
 * The build, owned by this project.
 *
 * This was one line importing a vendor's bundled config, which pulled in the
 * React, TanStack Start, Tailwind and tsconfig-paths plugins along with editor
 * tooling this project has no use for outside that editor. Everything it did
 * that we actually need is written out here, so the build can be read, and so
 * the repository does not carry a dependency on a platform it no longer runs
 * on.
 */
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // 8080 rather than Vite's default, because the launch config and every
  // capture script in this repository expect it.
  server: { port: 8080, host: true },
  preview: { port: 8080 },
  plugins: [
    // Resolves the "@/*" alias from tsconfig.json, so it does not have to be
    // declared twice and drift.
    tsConfigPaths(),
    tailwindcss(),
    // src/server.ts is our SSR error wrapper; nitro builds from it.
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
  ],
});
