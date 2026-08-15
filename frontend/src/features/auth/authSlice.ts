import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { TokenResponse, User } from "../../types/auth";

interface AuthState {
  user: User | null;
  token: string | null;
}

function readStoredUser(): User | null {
  const value = sessionStorage.getItem("user");

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as User;
  } catch {
    sessionStorage.removeItem("user");
    return null;
  }
}

const initialState: AuthState = {
  user: readStoredUser(),
  token: sessionStorage.getItem("access_token"),
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<TokenResponse>) => {
      state.user = action.payload.user;
      state.token = action.payload.access_token;

      sessionStorage.setItem(
        "access_token",
        action.payload.access_token,
      );
      sessionStorage.setItem(
        "user",
        JSON.stringify(action.payload.user),
      );
    },
    clearCredentials: (state) => {
      state.user = null;
      state.token = null;

      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("user");
    },
  },
});

export const { setCredentials, clearCredentials } = authSlice.actions;
export default authSlice.reducer;