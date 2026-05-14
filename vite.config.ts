import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";
import { fileURLToPath } from "url";

/**
 * solidBrowserFix
 *
 * Fixes silent tree-shaking of solid-js in Vite 6 production builds.
 *
 * Root cause chain:
 *   1. vite-plugin-solid@2.x sets conditions: undefined for Vite 6, so
 *      Rollup may resolve solid-js/web to the SSR bundle in some paths.
 *   2. solid-js package.json has "sideEffects": false, so Rollup
 *      tree-shakes solid-js imports if it can't statically prove usage.
 *   3. babel-plugin-solid adds @__PURE__ annotations to template() calls,
 *      which Rollup treats as side-effect-free and eliminates.
 *   4. Result: Solid runtime absent from bundle → webview blank/crash.
 *
 * Fix: resolveId hook forces browser builds + marks them as having
 * side effects. moduleSideEffects: true prevents tree-shaking.
 */
function solidBrowserFix(): Plugin {
  const base = fileURLToPath(new URL("node_modules/solid-js/", import.meta.url));
  const map: Record<string, string> = {
    "solid-js":         base + "dist/solid.js",
    "solid-js/web":     base + "web/dist/web.js",
    "solid-js/store":   base + "store/dist/store.js",
    "solid-js/html":    base + "html/dist/html.js",
    "solid-js/h":       base + "h/dist/h.js",
  };

  return {
    name: "solid-browser-fix",
    enforce: "pre",
    resolveId(id) {
      if (map[id]) {
        return {
          id: map[id],
          // Critical: prevents Rollup from tree-shaking solid-js
          // despite package.json "sideEffects": false
          moduleSideEffects: true,
        };
      }
      return null;
    },
    // Also mark the physical files when loaded directly
    load(id) {
      const normalised = id.split("?")[0];
      if (normalised.includes("solid-js") && normalised.endsWith(".js")) {
        // Return null to use default load, but the resolveId above
        // already marked it; this is belt-and-suspenders
        return null;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    solidBrowserFix(),
    solid(),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "esnext",
    rollupOptions: {
      // Prevent Rollup from treating solid-js as side-effect-free
      // (overrides the package.json "sideEffects": false)
      treeshake: {
        moduleSideEffects: (id) => {
          return id.includes("solid-js");
        },
      },
    },
  },
});
