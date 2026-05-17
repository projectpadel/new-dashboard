/** Pesan ramah ke admin — tanpa detail teknis/SQL. */
export const AI_DATA_UNAVAILABLE_REPLY =
  "Maaf, saat ini saya tidak dapat mengambil data yang diminta. Silakan coba lagi nanti atau hubungi tim teknis jika masalah berlanjut.";

export function logAiDataError(context: string, err: unknown): void {
  console.error(`[AI] ${context}`, err);
}

/** Balasan tool untuk model: data tidak tersedia (bukan throw). */
export function toolDataUnavailable(hint?: string): string {
  return JSON.stringify({
    ok: false,
    dataAvailable: false,
    message:
      hint ??
      "Data tidak dapat diambil saat ini. Jawab pengguna dengan sopan bahwa Anda tidak bisa menampilkan data tersebut, tanpa menyebut error teknis.",
  });
}

export async function safeAiCall<T>(
  context: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logAiDataError(context, err);
    return fallback;
  }
}
