import api from "../../services/api";
import type {
  PDFImportConfirmRequest,
  PDFImportPreview,
  PDFImportResult,
} from "../../types/pdfImport";

export async function previewPDFImport(
  document: File,
): Promise<PDFImportPreview> {
  const formData = new FormData();
  formData.append("document", document);

  const response = await api.post<PDFImportPreview>(
    "/imports/pdf/preview",
    formData,
    {
      timeout: 120_000,
    },
  );

  return response.data;
}

export async function confirmPDFImport(
  request: PDFImportConfirmRequest,
): Promise<PDFImportResult> {
  const response = await api.post<PDFImportResult>(
    "/imports/pdf/confirm",
    request,
    {
      timeout: 60_000,
    },
  );

  return response.data;
}