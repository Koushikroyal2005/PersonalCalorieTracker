import api from "../../services/api";
import type {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  User,
} from "../../types/auth";

export async function registerUser(data: RegisterRequest): Promise<User> {
  const response = await api.post<User>("/auth/register", data);
  return response.data;
}

export async function loginUser(
  data: LoginRequest,
): Promise<TokenResponse> {
  const response = await api.post<TokenResponse>("/auth/login", data);
  return response.data;
}

export async function fetchProfile(): Promise<User> {
  const response = await api.get<User>("/auth/profile");
  return response.data;
}