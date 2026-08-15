import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  ChatImportContext,
  type ChatImportEvent,
  type ChatImportSaveHandler,
  type PendingChatImport,
} from "./chatImportContext";

export function ChatImportProvider({ children }: PropsWithChildren) {
  const saveHandler = useRef<ChatImportSaveHandler | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingChatImport | null>(null);
  const [events, setEvents] = useState<ChatImportEvent[]>([]);
  const [saving, setSaving] = useState(false);

  const beginImport = useCallback((pending: PendingChatImport) => {
    saveHandler.current = null;
    setPendingImport(pending);
  }, []);

  const registerSaveHandler = useCallback((handler: ChatImportSaveHandler | null) => {
    saveHandler.current = handler;
  }, []);

  const completePending = useCallback(
    (message: string) => {
      if (!pendingImport) return;
      setEvents((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          importId: pendingImport.id,
          status: "completed",
          message,
        },
      ]);
      saveHandler.current = null;
      setPendingImport(null);
    },
    [pendingImport],
  );

  const cancelPending = useCallback(() => {
    if (!pendingImport) return;
    setEvents((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        importId: pendingImport.id,
        status: "cancelled",
        message: pendingImport.kind === "goal"
          ? "Okay, I cancelled the new goal. Nothing was saved."
          : "Okay, I cancelled that import. Nothing was saved.",
      },
    ]);
    saveHandler.current = null;
    setPendingImport(null);
  }, [pendingImport]);

  const confirmPending = useCallback(async () => {
    if (!pendingImport) throw new Error("There is no action waiting to be saved.");
    if (!saveHandler.current) {
      throw new Error("The review page is still preparing. Please try again in a moment.");
    }

    setSaving(true);
    try {
      await saveHandler.current();
    } finally {
      setSaving(false);
    }
  }, [pendingImport]);

  const value = useMemo(
    () => ({
      pendingImport,
      events,
      saving,
      beginImport,
      registerSaveHandler,
      confirmPending,
      completePending,
      cancelPending,
    }),
    [
      pendingImport,
      events,
      saving,
      beginImport,
      registerSaveHandler,
      confirmPending,
      completePending,
      cancelPending,
    ],
  );

  return <ChatImportContext.Provider value={value}>{children}</ChatImportContext.Provider>;
}
