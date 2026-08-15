import { createContext, useContext } from "react";

import type { NutritionExtraction } from "../../types/nutritionExtraction";
import type { PDFImportPreview } from "../../types/pdfImport";
import type { GoalInput } from "../../types/goal";

export type PendingChatImport =
  | {
      id: string;
      kind: "image";
      fileName: string;
      extraction: NutritionExtraction;
    }
  | {
      id: string;
      kind: "pdf";
      fileName: string;
      preview: PDFImportPreview;
    }
  | {
      id: string;
      kind: "goal";
      values: Partial<GoalInput>;
    };

export interface ChatImportEvent {
  id: string;
  importId: string;
  status: "completed" | "cancelled";
  message: string;
}

export type ChatImportSaveHandler = () => Promise<void>;

export interface ChatImportContextValue {
  pendingImport: PendingChatImport | null;
  events: ChatImportEvent[];
  saving: boolean;
  beginImport: (pending: PendingChatImport) => void;
  registerSaveHandler: (handler: ChatImportSaveHandler | null) => void;
  confirmPending: () => Promise<void>;
  completePending: (message: string) => void;
  cancelPending: () => void;
}

export const ChatImportContext = createContext<ChatImportContextValue | null>(null);

export function useChatImport(): ChatImportContextValue {
  const context = useContext(ChatImportContext);
  if (!context) throw new Error("useChatImport must be used inside ChatImportProvider");
  return context;
}
