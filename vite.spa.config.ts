// Client-only build of the whole prototype, with no server behind it.
// Vite emits index.spa.html + app.js + app.css here; scripts/inline-spa.mjs
// then folds those into one self-contained .html file.
//
//   npm run build:spa
//
// Separate from vite.config.ts, which builds the real TanStack Start app
// (SSR + Nitro) and is what `npm run dev` uses.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [tsConfigPaths(), tailwindcss(), react()],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  build: {
    outDir: "dist-spa",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // fold fonts/images into the JS and CSS
    chunkSizeWarningLimit: 100_000,
    // Browsers refuse to load <script type="module"> over file:// (module
    // fetches are CORS-checked, and file:// is an opaque origin), which would
    // leave anyone who just double-clicks the file staring at a blank page.
    // An IIFE bundle is a classic script, so it runs from file:// and HTTP alike.
    modulePreload: false,
    rollupOptions: {
      input: resolve(__dirname, "index.spa.html"),
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "app.js",
        assetFileNames: "app[extname]",
      },
    },
  },
});
