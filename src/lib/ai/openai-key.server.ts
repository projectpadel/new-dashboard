import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SECRET_KEY = "openai_api_key";

/** Prioritas: env lokal / Wrangler secret → Supabase platform_secrets (service role). */
export async function getOpenAIApiKey(): Promise<string> {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  // Tabel dari migrasi platform_secrets; belum ada di codegen types.
  const { data, error } = await (
    supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { value?: string } | null; error: { message: string; code?: string } | null }>;
          };
        };
      };
    }
  )
    .from("platform_secrets")
    .select("value")
    .eq("key", SECRET_KEY)
    .maybeSingle();

  if (error) {
    const missing =
      error.message.includes("platform_secrets") || error.code === "PGRST205";
    if (!missing) throw new Error(error.message);
  }

  const fromDb = data?.value?.trim();
  if (fromDb) return fromDb;

  throw new Error(
    "OpenAI API key belum dikonfigurasi. Set OPENAI_API_KEY di .env (server-only) atau jalankan migrasi platform_secrets lalu isi key openai_api_key.",
  );
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}
