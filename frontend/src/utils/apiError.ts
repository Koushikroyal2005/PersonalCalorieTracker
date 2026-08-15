import axios from "axios";

interface ApiErrorBody {
  detail?: string;
  error?: {
    message?: string;
  };
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return (
      error.response?.data?.error?.message ??
      error.response?.data?.detail ??
      "The request failed"
    );
  }

  return "An unexpected error occurred";
}