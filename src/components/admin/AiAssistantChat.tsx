"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Download, Loader2, Send } from "lucide-react";
import { chatWithAiAssistant } from "@/lib/admin-ai.functions";
import { AI_DATA_UNAVAILABLE_REPLY } from "@/lib/ai/ai-safe";
import type { AiPdfAttachment } from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: AiPdfAttachment[];
};

function downloadPdf(att: AiPdfAttachment) {
  const bin = atob(att.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: att.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AiAssistantChat() {
  const [messages, setMessages] = React.useState<UiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Halo! Saya AI Assistant dashboard. Saya bisa menganalisis data keuangan & pengguna, menyarankan strategi promosi, dan membuat laporan PDF keuangan mingguan/bulanan. Apa yang ingin Anda ketahui?",
    },
  ]);
  const [input, setInput] = React.useState("");
  const scrollEndRef = React.useRef<HTMLDivElement>(null);

  const sendChat = useServerFn(chatWithAiAssistant);
  const mutation = useMutation({
    mutationFn: async (nextMessages: UiMessage[]) => {
      const payload = nextMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));
      return sendChat({ data: { messages: payload } });
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: AI_DATA_UNAVAILABLE_REPLY,
        },
      ]);
    },
  });

  React.useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, mutation.isPending]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || mutation.isPending) return;

    const userMsg: UiMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");

    mutation.mutate(next, {
      onSuccess: (data) => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.reply,
            attachments: data.attachments,
          },
        ]);
      },
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[520px] flex-col gap-4 lg:h-[calc(100vh-2rem)]">
      <ScrollArea className="flex-1 rounded-xl border bg-card">
        <div className="space-y-4 p-4 md:p-6">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {m.role === "user" ? (
                  <span className="text-xs font-semibold">Anda</span>
                ) : (
                  <span className="text-xs font-bold">AI</span>
                )}
              </div>
              <div
                className={cn(
                  "max-w-[min(100%,42rem)] space-y-2 rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/80 text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.attachments?.length ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {m.attachments.map((att) => (
                      <Button
                        key={att.filename}
                        type="button"
                        size="sm"
                        variant={m.role === "user" ? "secondary" : "outline"}
                        className="gap-1.5"
                        onClick={() => downloadPdf(att)}
                      >
                        <Download className="size-3.5" />
                        {att.filename}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {mutation.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              AI sedang memproses…
            </div>
          ) : null}
          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tanya tentang keuangan, minta PDF, atau saran promosi…"
          rows={2}
          className="min-h-[52px] resize-none"
          disabled={mutation.isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          className="h-[52px] w-[52px] shrink-0"
          disabled={mutation.isPending || !input.trim()}
          onClick={() => submit(input)}
          aria-label="Kirim pesan"
        >
          {mutation.isPending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        </Button>
      </div>
    </div>
  );
}