import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AiAssistantChat } from "@/components/admin/AiAssistantChat";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/ai-assistant")({
  component: AiAssistantPage,
});

function AiAssistantPage() {
  const [chatKey, setChatKey] = React.useState(0);

  const startNewChat = () => {
    setChatKey((k) => k + 1);
  };

  return (
    <div className="flex h-full flex-col p-4 lg:p-6 max-w-[960px] mx-auto w-full">
      <header className="mb-4 shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="text-sm font-bold tracking-tight">AI</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl truncate">
            AI Assistant
          </h1>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={startNewChat}>
          <Plus className="size-4" aria-hidden />
          New Chat
        </Button>
      </header>
      <AiAssistantChat key={chatKey} />
    </div>
  );
}
