/**
 * Wrapper `npm run dev` — log langsung (Windows terasa "macet" ~30–60s tanpa output),
 * cek Node, lalu jalankan Vite di port 5174.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("[dashboard-padel] Memulai dev server (port 5174)…");
console.log("[dashboard-padel] Tunggu pesan \"ready\" dari Vite di bawah.\n");

await import("./check-node.mjs");

const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const child = spawn(process.execPath, [viteBin, "dev"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT || "5174" },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
