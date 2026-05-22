import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SYSTEM_PROMPT } from "./system-prompt.ts";
import { OPENAI_TOOLS } from "./tools-schema.ts";
import { runTool, type PdfOut } from "./tools.ts";

const AI_DATA_UNAVAILABLE_REPLY =
  "Maaf, saat ini saya tidak dapat mengambil data yang diminta. Silakan coba lagi nanti atau hubungi tim teknis jika masalah berlanjut.";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function assertSuperadmin(req: Request): Promise<{ userId: string; admin: ReturnType<typeof createClient> }> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const admin = createClient(url, service);
  const { data: isSuper, error: rpcErr } = await admin.rpc("is_superadmin", { p_uid: user.id });
  if (rpcErr) {
    const { data: profile } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (profile?.role !== "superadmin") {
      throw new Response(JSON.stringify({ error: "Forbidden: superadmin only" }), { status: 403, headers: corsHeaders });
    }
  } else if (isSuper !== true) {
    throw new Response(JSON.stringify({ error: "Forbidden: superadmin only" }), { status: 403, headers: corsHeaders });
  }

  return { userId: user.id, admin };
}

function safeParseArgs(argsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function openaiChat(body: Record<string, unknown>) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, ...body }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 400)}`);
  }

  const json = await res.json();
  const message = json.choices?.[0]?.message;
  if (!message) throw new Error("Empty OpenAI response");
  return message as { content?: string | null; tool_calls?: OpenAIToolCall[] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { admin } = await assertSuperadmin(req);

    const body = await req.json() as { messages?: ChatMessage[] };
    const messages = body.messages ?? [];
    if (!messages.length) return jsonResponse({ error: "messages required" }, 400);

    const apiMessages: Array<Record<string, unknown>> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const attachments: PdfOut[] = [];
    const maxRounds = 8;
    const lastUserContent =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const financeKeywords =
      /mutasi|transaksi|pendapatan|keuangan|pembayaran|refund|revenue|omzet|finance/i.test(lastUserContent);

    for (let round = 0; round < maxRounds; round++) {
      const toolChoice =
        round === 0 && financeKeywords
          ? { type: "function" as const, function: { name: "query_transactions" } }
          : "auto";

      const message = await openaiChat({
        messages: apiMessages,
        tools: OPENAI_TOOLS,
        tool_choice: toolChoice,
        temperature: 0.2,
      });

      const toolCalls = message.tool_calls;
      if (toolCalls?.length) {
        apiMessages.push({
          role: "assistant",
          content: message.content ?? null,
          tool_calls: toolCalls,
        });

        for (const tc of toolCalls) {
          const { content, pdf } = await runTool(
            admin,
            tc.function.name,
            safeParseArgs(tc.function.arguments),
            lastUserContent,
          );
          if (pdf) attachments.push(pdf);
          apiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content,
          });
        }
        continue;
      }

      const reply = (message.content ?? "").trim();
      return jsonResponse({
        reply: reply || AI_DATA_UNAVAILABLE_REPLY,
        attachments,
      });
    }

    return jsonResponse({
      reply: "Maaf, pertanyaan ini membutuhkan terlalu banyak langkah. Coba pecah menjadi pertanyaan yang lebih singkat.",
      attachments,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[ai-assistant]", err);
    return jsonResponse({ reply: AI_DATA_UNAVAILABLE_REPLY, attachments: [] });
  }
});
