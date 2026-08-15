import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "react-router-dom";

import nutrixAgent from "../../assets/nutrix-agent.png";
import {
  cancelChatAction,
  confirmChatAction,
  fetchChatConversations,
  fetchChatMessages,
  sendChatMessage,
} from "../../features/chat/chatApi";
import { useChatImport } from "../../features/chat/chatImportContext";
import { previewPDFImport } from "../../features/imports/pdfImportApi";
import { analyzeNutritionImage } from "../../features/upload/uploadApi";
import type {
  ChatConversation,
  ChatMessage,
  ChatProposal,
  ProposedChatEntry,
} from "../../types/chat";
import type { GoalInput } from "../../types/goal";
import { getApiErrorMessage } from "../../utils/apiError";
import "./NutrixChatWidget.css";

interface WidgetPosition {
  x: number;
  y: number;
}

interface DragState {
  pointerX: number;
  pointerY: number;
  originX: number;
  originY: number;
}

const POSITION_KEY = "nutrix_widget_position";
const quickPrompts = [
  "How am I doing today?",
  "Give me my weekly summary",
  "What are my current goals?",
];

function initialPosition(): WidgetPosition {
  const fallback = {
    x: Math.max(12, window.innerWidth - 104),
    y: Math.max(84, window.innerHeight - 112),
  };

  try {
    const stored = localStorage.getItem(POSITION_KEY);
    return clampPosition(
      stored ? { ...fallback, ...JSON.parse(stored) } : fallback,
    );
  } catch {
    return clampPosition(fallback);
  }
}

function clampPosition(position: WidgetPosition): WidgetPosition {
  const minimumX = window.innerWidth > 640
    ? Math.round(window.innerWidth * 0.55)
    : 12;
  return {
    x: Math.min(
      Math.max(minimumX, position.x),
      Math.max(minimumX, window.innerWidth - 92),
    ),
    y: Math.min(Math.max(76, position.y), Math.max(76, window.innerHeight - 92)),
  };
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function proposalFrom(message: ChatMessage): ChatProposal | null {
  const proposal = message.metadata.proposal;
  return proposal && typeof proposal === "object"
    ? (proposal as ChatProposal)
    : null;
}

function EntryProposal({ entry }: { entry: ProposedChatEntry }) {
  return (
    <div className="nutrix-proposal-entry">
      <div>
        <strong>{entry.food_name ?? "Meal entry"}</strong>
        <span>
          {entry.quantity_value ?? 1} {entry.quantity_unit ?? "serving"} · {entry.meal_type}
        </span>
      </div>
      <b>{Math.round(entry.calories ?? 0)} kcal</b>
      <small>
        P {Number(entry.protein_g ?? 0).toFixed(1)}g · C {Number(entry.carbs_g ?? 0).toFixed(1)}g · F{" "}
        {Number(entry.fat_g ?? 0).toFixed(1)}g
      </small>
    </div>
  );
}

export function NutrixChatWidget() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {
    pendingImport,
    events: importEvents,
    saving: importSaving,
    beginImport,
    confirmPending,
    cancelPending,
  } = useChatImport();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processedImportEvents = useRef(new Set<string>());
  const dragMoved = useRef(false);
  const [position, setPosition] = useState(initialPosition);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [greetingVisible, setGreetingVisible] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGreetingVisible(false);
      return;
    }

    let hideTimer: number;
    let showTimer: number;

    function cycleGreeting() {
      setGreetingVisible(true);
      hideTimer = window.setTimeout(() => {
        setGreetingVisible(false);
        showTimer = window.setTimeout(cycleGreeting, 5_000);
      }, 10_000);
    }

    cycleGreeting();
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(showTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    function keepInsideViewport() {
      setPosition((current) => clampPosition(current));
    }

    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, []);

  useEffect(() => {
    if (!dragState) return;
    const { originX, originY, pointerX, pointerY } = dragState;

    function move(event: PointerEvent) {
      if (Math.hypot(event.clientX - pointerX, event.clientY - pointerY) > 4) {
        dragMoved.current = true;
      }
      const next = clampPosition({
        x: originX + event.clientX - pointerX,
        y: originY + event.clientY - pointerY,
      });
      setPosition(next);
    }

    function finish() {
      setDragState(null);
      setPosition((current) => {
        localStorage.setItem(POSITION_KEY, JSON.stringify(current));
        return current;
      });
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [dragState]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  useEffect(() => {
    const unseenEvents = importEvents.filter(
      (event) => !processedImportEvents.current.has(event.id),
    );
    if (unseenEvents.length === 0) return;

    for (const event of unseenEvents) processedImportEvents.current.add(event.id);
    setMessages((current) => [
      ...current,
      ...unseenEvents.map<ChatMessage>((event) => ({
        id: event.id,
        user_id: "nutrix",
        conversation_id: conversationId ?? "attachment",
        role: "assistant",
        content: event.message,
        message_type: "action_result",
        action_id: event.importId,
        metadata: { client_import: true, status: event.status },
        created_at: new Date().toISOString(),
      })),
    ]);
  }, [importEvents, conversationId]);

  const resolvedActions = useMemo(
    () =>
      new Set(
        messages
          .filter((message) => message.message_type === "action_result")
          .map((message) => message.action_id)
          .filter((value): value is string => Boolean(value)),
      ),
    [messages],
  );

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    allowInteractive = false,
  ) {
    if (
      !allowInteractive &&
      (event.target as HTMLElement).closest("button, input, textarea")
    ) return;
    event.preventDefault();
    dragMoved.current = false;
    setDragState({
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: position.x,
      originY: position.y,
    });
  }

  async function loadConversation(id: string) {
    setLoadingHistory(true);
    setError(null);
    try {
      const result = await fetchChatMessages(id);
      setConversationId(id);
      setMessages(result.items);
      setHistoryOpen(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoadingHistory(false);
    }
  }

  async function openChat() {
    setIsOpen(true);
    setGreetingVisible(false);
    if (historyLoaded) return;

    setLoadingHistory(true);
    try {
      const result = await fetchChatConversations();
      setConversations(result.items);
      if (result.items[0]) await loadConversation(result.items[0].id);
      setHistoryLoaded(true);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoadingHistory(false);
    }
  }

  function newConversation() {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setHistoryOpen(false);
  }

  async function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const optimisticId = `local-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      user_id: "local",
      conversation_id: conversationId ?? "new",
      role: "user",
      content: trimmed,
      message_type: "text",
      action_id: null,
      metadata: {},
      created_at: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimistic]);
    setInput("");
    setError(null);

    const normalized = trimmed.toLowerCase().replace(/[.!]/g, "").trim();
    const confirmsImport = [
      "yes",
      "yes save it",
      "save it",
      "okay",
      "ok",
      "proceed",
      "confirm",
    ].includes(normalized);

    if (pendingImport && confirmsImport) {
      try {
        await confirmPending();
      } catch (requestError) {
        setError(getApiErrorMessage(requestError) === "An unexpected error occurred"
          ? requestError instanceof Error ? requestError.message : "Could not save the import."
          : getApiErrorMessage(requestError));
      }
      return;
    }

    setSending(true);

    try {
      const result = await sendChatMessage({
        conversation_id: conversationId ?? undefined,
        message: trimmed,
      });
      setConversationId(result.conversation_id);
      let assistantMessage = result.assistant_message;
      const metadata = assistantMessage.metadata;
      if (metadata.open_goal_form === true) {
        const goalActionId = crypto.randomUUID();
        const proposal = metadata.proposal as ChatProposal | undefined;
        beginImport({
          id: goalActionId,
          kind: "goal",
          values: (proposal?.goal_update ?? {}) as Partial<GoalInput>,
        });
        assistantMessage = {
          ...assistantMessage,
          message_type: "action_preview",
          action_id: goalActionId,
          metadata: { ...metadata, client_import: true },
        };
        navigate("/goals");
      } else if (metadata.open_goals_page === true) {
        await queryClient.invalidateQueries({ queryKey: ["goals"] });
        await queryClient.invalidateQueries({ queryKey: ["reports"] });
        navigate("/goals");
      }
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticId),
        result.user_message,
        assistantMessage,
      ]);

      const conversationsResult = await fetchChatConversations();
      setConversations(conversationsResult.items);
    } catch (requestError) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setError(getApiErrorMessage(requestError));
    } finally {
      setSending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await submitMessage(input);
  }

  async function resolveAction(actionId: string, confirm: boolean) {
    setActionBusy(actionId);
    setError(null);
    try {
      if (pendingImport?.id === actionId) {
        if (confirm) await confirmPending();
        else cancelPending();
        return;
      }

      const result = confirm
        ? await confirmChatAction(actionId)
        : await cancelChatAction(actionId);
      setMessages((current) => [...current, result.assistant_message]);
      if (confirm) await queryClient.invalidateQueries();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setActionBusy(null);
    }
  }

  async function analyzeAttachment(file: File) {
    const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);

    if (!isPDF && !isImage) {
      setError("Attach a PDF, JPEG, PNG, or WebP file.");
      return;
    }
    if ((isPDF && file.size > 10 * 1024 * 1024) || (isImage && file.size > 8 * 1024 * 1024)) {
      setError(isPDF ? "The PDF must not exceed 10 MB." : "The image must not exceed 8 MB.");
      return;
    }

    const importId = crypto.randomUUID();
    const attachedMessage: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: "local",
      conversation_id: conversationId ?? "attachment",
      role: "user",
      content: `Attached ${file.name}`,
      message_type: "text",
      action_id: null,
      metadata: { attachment_name: file.name, attachment_type: isPDF ? "pdf" : "image" },
      created_at: new Date().toISOString(),
    };

    setMessages((current) => [...current, attachedMessage]);
    setAnalyzingFile(true);
    setError(null);

    try {
      if (isPDF) {
        const preview = await previewPDFImport(file);
        beginImport({ id: importId, kind: "pdf", fileName: file.name, preview });
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            user_id: "nutrix",
            conversation_id: conversationId ?? "attachment",
            role: "assistant",
            content: `I extracted ${preview.total_entries} food entries and opened the PDF review page. Review or edit them there. Shall I save the selected entries?`,
            message_type: "action_preview",
            action_id: importId,
            metadata: {
              client_import: true,
              import_kind: "pdf",
              file_name: file.name,
              entry_count: preview.total_entries,
            },
            created_at: new Date().toISOString(),
          },
        ]);
        navigate("/pdf-import");
      } else {
        const extraction = await analyzeNutritionImage(file);
        beginImport({ id: importId, kind: "image", fileName: file.name, extraction });
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            user_id: "nutrix",
            conversation_id: conversationId ?? "attachment",
            role: "assistant",
            content: `I analyzed ${file.name} and opened the Food Log with the nutrition details prefilled. The date defaults to today—change “Consumed at” if this meal was yesterday or another date. I’ll save the edited values. Shall I save this meal?`,
            message_type: "action_preview",
            action_id: importId,
            metadata: {
              client_import: true,
              import_kind: "image",
              file_name: file.name,
              proposal: {
                entries: [{
                  food_name: extraction.food_name,
                  quantity_value: extraction.quantity_value,
                  quantity_unit: extraction.quantity_unit,
                  calories: extraction.calories,
                  protein_g: extraction.protein_g,
                  carbs_g: extraction.carbs_g,
                  fat_g: extraction.fat_g,
                }],
              },
            },
            created_at: new Date().toISOString(),
          },
        ]);
        navigate("/food-log");
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setAnalyzingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const panelWidth = Math.min(390, window.innerWidth - 24);
  const panelHeight = Math.min(620, window.innerHeight - 28);
  const openRight = position.x + 86 + panelWidth <= window.innerWidth - 12;
  const panelLeft = openRight
    ? position.x + 78
    : Math.max(12, position.x - panelWidth - 14);
  const panelTop = Math.min(
    Math.max(14, position.y - panelHeight + 76),
    Math.max(14, window.innerHeight - panelHeight - 14),
  );
  const greetingOnLeft = position.x > window.innerWidth / 2;

  return (
    <div className="nutrix-layer" aria-live="polite">
      {!isOpen && (
        <div
          className={`nutrix-greeting ${greetingVisible ? "is-visible" : ""} ${
            greetingOnLeft ? "is-left" : "is-right"
          }`}
          style={{ left: position.x, top: position.y }}
        >
          <strong>Hey, I’m NutriX AI 👋</strong>
          <span>Your personal nutrition assistant</span>
        </div>
      )}

      {!isOpen && (
        <div className="nutrix-launcher-wrap" style={{ left: position.x, top: position.y }}>
          <button
            type="button"
            className="nutrix-drag-handle"
            aria-label="Drag NutriX assistant"
            title="Drag to reposition"
            onPointerDown={(event) => beginDrag(event, true)}
          >
            <span />
          </button>
          <button
            type="button"
            className="nutrix-launcher"
            aria-label="Open NutriX AI chat"
            onPointerDown={(event) => beginDrag(event, true)}
            onClick={() => {
              if (dragMoved.current) {
                dragMoved.current = false;
                return;
              }
              void openChat();
            }}
          >
            <img src={nutrixAgent} alt="" draggable={false} />
            <span className="nutrix-online-dot" />
          </button>
        </div>
      )}

      {isOpen && (
        <section
          className="nutrix-panel"
          style={{ left: panelLeft, top: panelTop, width: panelWidth, height: panelHeight }}
          aria-label="NutriX AI assistant"
        >
          <header className="nutrix-header" onPointerDown={beginDrag}>
            <div className="nutrix-header-avatar">
              <img src={nutrixAgent} alt="" />
              <span />
            </div>
            <div className="nutrix-header-copy">
              <strong>NutriX AI</strong>
              <span>Personal nutrition assistant</span>
            </div>
            <button
              type="button"
              className="nutrix-icon-button"
              aria-label="Conversation history"
              title="Conversation history"
              onClick={() => setHistoryOpen((current) => !current)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5M12 7v5l3 2" /></svg>
            </button>
            <button
              type="button"
              className="nutrix-icon-button"
              aria-label="Start new conversation"
              title="New conversation"
              onClick={newConversation}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button
              type="button"
              className="nutrix-icon-button nutrix-close"
              aria-label="Close NutriX chat"
              onClick={() => setIsOpen(false)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </header>

          {historyOpen && (
            <aside className="nutrix-history">
              <div className="nutrix-history-heading">
                <strong>Recent conversations</strong>
                <button type="button" onClick={newConversation}>New chat</button>
              </div>
              {conversations.length === 0 ? (
                <p>No conversations yet.</p>
              ) : (
                conversations.map((conversation) => (
                  <button
                    type="button"
                    key={conversation.id}
                    className={conversation.id === conversationId ? "is-active" : ""}
                    onClick={() => loadConversation(conversation.id)}
                  >
                    <span>{conversation.title}</span>
                    <small>{new Date(conversation.updated_at).toLocaleDateString()}</small>
                  </button>
                ))
              )}
            </aside>
          )}

          <div className="nutrix-messages" ref={scrollRef}>
            {loadingHistory ? (
              <div className="nutrix-center-state"><span className="nutrix-spinner" />Loading conversation…</div>
            ) : messages.length === 0 ? (
              <div className="nutrix-welcome">
                <img src={nutrixAgent} alt="NutriX AI waving" />
                <span className="nutrix-eyebrow">YOUR NUTRITION COPILOT</span>
                <h2>Hi! I’m NutriX AI.</h2>
                <p>Log meals, check your goals, or ask for a personalized nutrition summary.</p>
                <div className="nutrix-quick-prompts">
                  {quickPrompts.map((prompt) => (
                    <button type="button" key={prompt} onClick={() => submitMessage(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const proposal = proposalFrom(message);
                const canResolve =
                  message.message_type === "action_preview" &&
                  message.action_id &&
                  !resolvedActions.has(message.action_id);

                return (
                  <article key={message.id} className={`nutrix-message is-${message.role}`}>
                    {message.role === "assistant" && (
                      <img className="nutrix-message-avatar" src={nutrixAgent} alt="" />
                    )}
                    <div className="nutrix-message-content">
                      <div className="nutrix-bubble">{message.content}</div>
                      {proposal?.entries?.map((entry, index) => (
                        <EntryProposal key={`${message.id}-${index}`} entry={entry} />
                      ))}
                      {proposal?.deletions?.map((deletion) => (
                        <div className="nutrix-delete-proposal" key={`${message.id}-${deletion.kind}-${deletion.id}`}>
                          <span>Delete</span>
                          <div>
                            <strong>{deletion.label}</strong>
                            <small>
                              {deletion.kind === "food_entry"
                                ? `${deletion.meal_type ?? "meal"}${deletion.calories !== undefined ? ` · ${deletion.calories} kcal` : ""}`
                                : `${deletion.is_active ? "Active" : "Saved"} health goal`}
                            </small>
                          </div>
                        </div>
                      ))}
                      {proposal?.goal_update && (
                        <div className="nutrix-goal-proposal">
                          {Object.entries(proposal.goal_update).map(([key, value]) => (
                            <div key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value}</strong></div>
                          ))}
                        </div>
                      )}
                      {canResolve && message.action_id && (
                        <div className="nutrix-action-buttons">
                          <button
                            type="button"
                            className="is-confirm"
                            disabled={actionBusy === message.action_id}
                            onClick={() => resolveAction(message.action_id!, true)}
                          >
                            {actionBusy === message.action_id ? "Saving…" : "Confirm"}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy === message.action_id}
                            onClick={() => resolveAction(message.action_id!, false)}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      <time>{formatTime(message.created_at)}</time>
                    </div>
                  </article>
                );
              })
            )}
            {(sending || analyzingFile) && (
              <div className="nutrix-typing"><i /><i /><i /><span>NutriX is thinking</span></div>
            )}
          </div>

          {error && <div className="nutrix-error" role="alert">{error}</div>}

          <form className="nutrix-composer" onSubmit={submit}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void analyzeAttachment(file);
              }}
            />
            <button
              type="button"
              className="nutrix-attach-button"
              disabled={sending || analyzingFile || importSaving}
              aria-label="Attach food image, nutrition label, or PDF"
              title="Attach image or PDF"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" /></svg>
            </button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitMessage(input);
                }
              }}
              placeholder="Ask NutriX anything…"
              rows={1}
              maxLength={4000}
              disabled={sending || analyzingFile || importSaving}
              aria-label="Message NutriX AI"
            />
            <button type="submit" disabled={!input.trim() || sending || analyzingFile || importSaving} aria-label="Send message">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" /></svg>
            </button>
          </form>
          <footer>NutriX can make mistakes. Review nutrition estimates.</footer>
        </section>
      )}
    </div>
  );
}
