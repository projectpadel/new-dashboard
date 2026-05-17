import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { runAiAssistantChat, type AiChatMessage } from "@/lib/ai/openai-chat.server";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(12000),
});

const chatInputSchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
});

export const chatWithAiAssistant = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => chatInputSchema.parse(input))
  .handler(async ({ data }) => {
    const messages = data.messages as AiChatMessage[];
    const last = messages[messages.length - 1];
    if (last.role !== "user") {
      throw new Error("Pesan terakhir harus dari pengguna.");
    }
    return runAiAssistantChat(messages);
  });
