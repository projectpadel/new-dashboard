/**
 * Vite 7 membutuhkan Node 20.19+, 22.12+, atau ≥23.
 * Node 21.x (dan 20.0–20.18) gagal dengan "crypto.hash is not a function".
 */
const [major, minor] = process.versions.node.split(".").map(Number);

function isSupported() {
  if (major === 20 && minor >= 19) return true;
  if (major === 22 && minor >= 12) return true;
  if (major >= 23) return true;
  return false;
}

if (!isSupported()) {
  const current = process.version;
  console.error(`
[dashboard-padel] Versi Node tidak didukung: ${current}

Proyek ini memakai Vite 7, yang membutuhkan salah satu dari:
  • Node 20.19 atau lebih baru (cabang 20 LTS)
  • Node 22.12 atau lebih baru (cabang 22 LTS — disarankan, lihat .nvmrc)
  • Node 23+

Versi Anda (${current}) termasuk celah yang tidak didukung (mis. 21.x),
sehingga dev server gagal dengan error "crypto.hash is not a function".

Perbaikan:
  1. Unduh Node 22 LTS: https://nodejs.org/ (pilih 22.x Current/LTS)
  2. Install, tutup lalu buka ulang terminal PowerShell
  3. Pastikan: node -v  →  v22.12.0 atau lebih baru
  4. Jalankan lagi: npm run setup   (jika belum)
                  npm run dev

Opsional: nvm-windows — nvm install 22 && nvm use 22
`);
  process.exit(1);
}
