"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Conversation, Message } from "@/types";

// Simple markdown-like renderer for chat messages
function renderContent(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^#{1,3} (.+)$/gm, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "• $1")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

const SUGGESTED_QUESTIONS = [
  "Quels sont mes droits en cas de licenciement abusif ?",
  "Comment fonctionne la rupture conventionnelle ?",
  "Combien de jours de congés payés ai-je droit par an ?",
  "Que dit le Code du travail sur les heures supplémentaires ?",
];

export default function ChatInterface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // Conversations will just be empty
    }
  }

  async function loadConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch {
      setError("Impossible de charger les messages.");
    }
  }

  function startNewConversation() {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  async function sendMessage(text?: string) {
    const messageText = (text ?? input).trim();
    if (!messageText || isLoading) return;

    setInput("");
    setError(null);
    setIsLoading(true);

    // Optimistic UI: show user message immediately
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConversationId ?? "",
      role: "user",
      content: messageText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    // Build history from current messages (exclude the optimistic one)
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          conversationId: activeConversationId,
          history,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Erreur inconnue");
      }

      const { answer, conversationId: newConvId } = data;

      // Update conversation ID if newly created
      if (newConvId && !activeConversationId) {
        setActiveConversationId(newConvId);
        // Refresh sidebar conversations
        fetchConversations();
      }

      const assistantMessage: Message = {
        id: `temp-assistant-${Date.now()}`,
        conversation_id: newConvId ?? activeConversationId ?? "",
        role: "assistant",
        content: answer,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue. Veuillez réessayer."
      );
      // Remove the optimistic user message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const isEmptyChat = messages.length === 0;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f8f8f6" }}>
      {/* Sidebar */}
      <aside
        className={`flex flex-col transition-all duration-300 ${
          sidebarOpen ? "w-72" : "w-0 overflow-hidden"
        }`}
        style={{ background: "#1e2d3d", minWidth: sidebarOpen ? "18rem" : 0 }}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ background: "#e8842c" }}
            >
              D
            </div>
            <span className="text-white font-semibold text-base">DAIRIA</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-white/50 hover:text-white transition-colors p-1 rounded"
            aria-label="Fermer le menu"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          <button
            onClick={startNewConversation}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90"
            style={{ background: "#e8842c" }}
          >
            <span className="text-lg leading-none">+</span>
            Nouvelle conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {conversations.length === 0 ? (
            <p className="text-white/40 text-xs text-center py-4">
              Aucune conversation
            </p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all truncate ${
                    activeConversationId === conv.id
                      ? "text-white font-medium"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                  style={
                    activeConversationId === conv.id
                      ? { background: "rgba(232,132,44,0.2)" }
                      : {}
                  }
                  title={conv.title}
                >
                  <span className="mr-2 opacity-60">💬</span>
                  {conv.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10">
          <p className="text-white/30 text-xs text-center">
            Assistant juridique · Droit social
          </p>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header
          className="flex items-center gap-3 px-6 py-4 border-b"
          style={{ background: "#fff", borderColor: "#e5e7eb" }}
        >
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              style={{ color: "#1e2d3d" }}
              aria-label="Ouvrir le menu"
            >
              ☰
            </button>
          )}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
            style={{ background: "#1e2d3d" }}
          >
            D
          </div>
          <div>
            <h1 className="font-semibold text-base" style={{ color: "#1e2d3d" }}>
              DAIRIA — Droit Social
            </h1>
            <p className="text-xs" style={{ color: "#6b7280" }}>
              Assistant juridique spécialisé · Citations légales incluses
            </p>
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {isEmptyChat ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-3xl mb-4"
                  style={{ background: "#1e2d3d" }}
                >
                  ⚖️
                </div>
                <h2
                  className="text-2xl font-semibold mb-2"
                  style={{ color: "#1e2d3d" }}
                >
                  Votre assistant juridique
                </h2>
                <p className="max-w-md mb-8" style={{ color: "#6b7280" }}>
                  Posez vos questions en droit social. Je vous réponds avec les
                  articles de loi pertinents du Code du travail, de la sécurité
                  sociale et plus encore.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left px-4 py-3 rounded-card bg-white border transition-all hover:shadow-md hover:border-orange-300 text-sm"
                      style={{
                        borderColor: "#e5e7eb",
                        color: "#1e2d3d",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                      }}
                    >
                      <span className="mr-2" style={{ color: "#e8842c" }}>→</span>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold mr-3 flex-shrink-0 mt-1"
                      style={{ background: "#1e2d3d" }}
                    >
                      D
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] px-4 py-3 rounded-card message-content text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "text-white"
                        : "bg-white border"
                    }`}
                    style={
                      msg.role === "user"
                        ? {
                            background: "#1e2d3d",
                            borderRadius: "14px 14px 4px 14px",
                          }
                        : {
                            borderColor: "#e5e7eb",
                            color: "#1e2d3d",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                            borderRadius: "4px 14px 14px 14px",
                          }
                    }
                    dangerouslySetInnerHTML={{
                      __html:
                        msg.role === "assistant"
                          ? renderContent(msg.content)
                          : msg.content.replace(/\n/g, "<br/>"),
                    }}
                  />
                  {msg.role === "user" && (
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold ml-3 flex-shrink-0 mt-1"
                      style={{ background: "#e8842c" }}
                    >
                      U
                    </div>
                  )}
                </div>
              ))
            )}

            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold mr-3 flex-shrink-0 mt-1"
                  style={{ background: "#1e2d3d" }}
                >
                  D
                </div>
                <div
                  className="px-4 py-3 rounded-card bg-white border text-sm"
                  style={{
                    borderColor: "#e5e7eb",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                    borderRadius: "4px 14px 14px 14px",
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: "#e8842c", animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: "#e8842c", animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: "#e8842c", animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div
                className="mx-auto max-w-lg px-4 py-3 rounded-card text-sm text-center"
                style={{
                  background: "#fef2f2",
                  color: "#dc2626",
                  border: "1px solid #fecaca",
                }}
              >
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div
          className="border-t px-4 py-4"
          style={{ background: "#fff", borderColor: "#e5e7eb" }}
        >
          <div className="max-w-3xl mx-auto">
            <div
              className="flex items-end gap-3 p-3 rounded-card border transition-shadow focus-within:shadow-md"
              style={{ borderColor: "#e5e7eb", background: "#f8f8f6" }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Posez votre question en droit social..."
                rows={1}
                className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed"
                style={{
                  color: "#1e2d3d",
                  maxHeight: "150px",
                  overflowY: "auto",
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
                }}
                disabled={isLoading}
                aria-label="Votre question juridique"
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                style={{ background: "#e8842c" }}
                aria-label="Envoyer"
              >
                ↑
              </button>
            </div>
            <p className="text-center text-xs mt-2" style={{ color: "#9ca3af" }}>
              DAIRIA fournit des informations juridiques à titre indicatif.
              Consultez un avocat pour un conseil personnalisé.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
