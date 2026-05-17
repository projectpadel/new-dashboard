import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, mergeConfig, type UserConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Konfigurasi setara dengan @lovable.dev/vite-tanstack-config (index.js),
// tanpa paket itu — entry "main"-nya adalah .cjs yang require() ke lovable-tagger (ESM) dan gagal di Node lokal.

const tanstackStartDefaults = {
  importProtection: {
    behavior: "error" as const,
    client: {
      files: ["**/server/**"],
      specifiers: ["server-only"],
    },
  },
};

/** Map VITE_* Supabase vars from .env into process.env.* for SSR (auth middleware, server client). */
export default defineConfig(async ({ command, mode }): Promise<UserConfig> => {
  const plugins: NonNullable<UserConfig["plugins"]> = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(
      mergeConfig(tanstackStartDefaults, {
        server: { entry: "server" },
      }),
    ),
    viteReact(),
  ];

  if (command === "build") {
    try {
      const { cloudflare } = await import("@cloudflare/vite-plugin");
      plugins.push(
        cloudflare({
          viteEnvironment: { name: "ssr" },
        }),
      );
    } catch {
      /* opsional seperti di wrapper Lovable */
    }
  }

  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadedEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const loaded = loadEnv(mode, process.cwd(), "");
  const supabaseDefine = {
    "process.env.SUPABASE_URL": JSON.stringify(
      loaded.SUPABASE_URL || loaded.VITE_SUPABASE_URL || "",
    ),
    "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      loaded.SUPABASE_PUBLISHABLE_KEY || loaded.VITE_SUPABASE_PUBLISHABLE_KEY || "",
    ),
    "process.env.SUPABASE_SERVICE_ROLE_KEY": JSON.stringify(loaded.SUPABASE_SERVICE_ROLE_KEY || ""),
    "process.env.OPENAI_API_KEY": JSON.stringify(loaded.OPENAI_API_KEY || ""),
    "process.env.OPENAI_MODEL": JSON.stringify(loaded.OPENAI_MODEL || "gpt-4o-mini"),
  };

  let config: UserConfig = {
    define: { ...envDefine, ...supabaseDefine },
    resolve: {
      alias: {
        "@": `${process.cwd()}/src`,
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins,
    server: {
      // `true` = dengarkan semua interface, lebih kompatibel di Windows daripada "::" (IPv6-only / HMR).
      host: true,
      // 5173 default Vite; hindari bentrok umum di 8080. Jika sibuk, Vite naik ke port berikutnya.
      port: Number(process.env.PORT) || 5173,
      strictPort: false,
    },
  };

  config = mergeConfig(config, {
    server: {
      watch: {
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 100,
        },
      },
    },
  });

  return config;
});
