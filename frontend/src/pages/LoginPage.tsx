import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAppDispatch, useAppSelector } from "../app/hooks";
import { PasswordVisibilityIcon } from "../components/auth/PasswordVisibilityIcon";
import { loginUser } from "../features/auth/authApi";
import { setCredentials } from "../features/auth/authSlice";
import { getApiErrorMessage } from "../utils/apiError";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must contain at least 8 characters"),
});
type LoginForm = z.infer<typeof loginSchema>;
const fieldClass = "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = useAppSelector((state) => state.auth.token);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const loginMutation = useMutation({ mutationFn: loginUser, onSuccess: (response) => { dispatch(setCredentials(response)); navigate("/"); } });
  if (token) return <Navigate to="/" replace />;

  return (
    <main className="min-h-screen bg-[#f3f7f5] p-4 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-3xl border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] lg:grid-cols-[1.05fr_1fr]">
        <aside className="relative hidden overflow-hidden bg-emerald-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 size-80 rounded-full border-[50px] border-emerald-600/60" />
          <div className="relative"><div className="grid size-12 place-items-center rounded-2xl bg-white text-xl font-black text-emerald-700">N</div><p className="mt-5 text-sm font-bold uppercase tracking-[0.2em] text-emerald-200">NutriTrack</p></div>
          <div className="relative"><h2 className="max-w-md text-4xl font-extrabold leading-tight tracking-tight">Understand what you eat. Build habits that last.</h2><p className="mt-5 max-w-md leading-7 text-emerald-100">Log meals, extract nutrition with AI, and see every calorie, macro, and micronutrient in one calm dashboard.</p><div className="mt-8 flex gap-3">{["Private", "AI assisted", "Goal focused"].map((item) => <span key={item} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">{item}</span>)}</div></div>
          <p className="relative text-xs text-emerald-200">Your personal nutrition workspace</p>
        </aside>
        <section className="flex items-center justify-center px-6 py-12 sm:px-12">
          <form onSubmit={handleSubmit((data) => loginMutation.mutate(data))} className="w-full max-w-md">
            <div className="mb-8 lg:hidden"><span className="grid size-11 place-items-center rounded-xl bg-emerald-600 font-black text-white">N</span></div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Welcome back</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">Sign in to NutriTrack</h1>
            <p className="mt-2 text-sm text-slate-500">Continue tracking your nutrition and goals.</p>
            <label className="mt-8 block text-sm font-semibold text-slate-700">Email address<input {...register("email")} type="email" autoComplete="email" placeholder="you@example.com" className={fieldClass} />{errors.email && <span className="mt-1 block text-xs font-normal text-red-600">{errors.email.message}</span>}</label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Password
              <div className="relative">
                <input
                  {...register("password")}
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="At least 8 characters"
                  className={`${fieldClass} pr-12`}
                />
                <button
                  type="button"
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  className="absolute right-2 top-1/2 mt-0.5 grid size-9 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <PasswordVisibilityIcon visible={passwordVisible} />
                </button>
              </div>
              {errors.password && <span className="mt-1 block text-xs font-normal text-red-600">{errors.password.message}</span>}
            </label>
            {loginMutation.isError && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{getApiErrorMessage(loginMutation.error)}</p>}
            <button type="submit" disabled={loginMutation.isPending} className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3.5 font-bold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-50">{loginMutation.isPending ? "Signing in…" : "Sign in"}</button>
            <p className="mt-6 text-center text-sm text-slate-500">New to NutriTrack? <Link to="/signup" className="font-bold text-emerald-700 hover:text-emerald-800">Create an account</Link></p>
          </form>
        </section>
      </div>
    </main>
  );
}
