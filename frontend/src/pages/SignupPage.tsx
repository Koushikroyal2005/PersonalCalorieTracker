import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAppDispatch, useAppSelector } from "../app/hooks";
import { PasswordVisibilityIcon } from "../components/auth/PasswordVisibilityIcon";
import { loginUser, registerUser } from "../features/auth/authApi";
import { setCredentials } from "../features/auth/authSlice";
import { getApiErrorMessage } from "../utils/apiError";

const signupSchema = z.object({
  full_name: z.string().trim().min(2, "Enter at least 2 characters").max(100),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});
type SignupForm = z.infer<typeof signupSchema>;
const fieldClass = "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export function SignupPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = useAppSelector((state) => state.auth.token);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<SignupForm>({ resolver: zodResolver(signupSchema), defaultValues: { full_name: "", email: "", password: "" } });
  const signupMutation = useMutation({
    mutationFn: async (data: SignupForm) => { await registerUser(data); return loginUser({ email: data.email, password: data.password }); },
    onSuccess: (response) => { dispatch(setCredentials(response)); navigate("/"); },
  });
  if (token) return <Navigate to="/" replace />;

  return (
    <main className="min-h-screen bg-[#f3f7f5] p-4 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-3xl border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] lg:grid-cols-[1fr_1.05fr]">
        <section className="flex items-center justify-center px-6 py-12 sm:px-12">
          <form onSubmit={handleSubmit((data) => signupMutation.mutate(data))} className="w-full max-w-md">
            <div className="mb-8 lg:hidden"><span className="grid size-11 place-items-center rounded-xl bg-emerald-600 font-black text-white">N</span></div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Get started</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">Create your account</h1>
            <p className="mt-2 text-sm text-slate-500">Your meals and health data stay private to your account.</p>
            <label className="mt-8 block text-sm font-semibold text-slate-700">Full name<input {...register("full_name")} autoComplete="name" placeholder="Your name" className={fieldClass} />{errors.full_name && <span className="mt-1 block text-xs font-normal text-red-600">{errors.full_name.message}</span>}</label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">Email address<input {...register("email")} type="email" autoComplete="email" placeholder="you@example.com" className={fieldClass} />{errors.email && <span className="mt-1 block text-xs font-normal text-red-600">{errors.email.message}</span>}</label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Password
              <div className="relative">
                <input
                  {...register("password")}
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="new-password"
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
            {signupMutation.isError && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{getApiErrorMessage(signupMutation.error)}</p>}
            <button disabled={signupMutation.isPending} className="mt-6 w-full rounded-xl bg-emerald-600 py-3.5 font-bold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-50">{signupMutation.isPending ? "Creating account…" : "Create account"}</button>
            <p className="mt-6 text-center text-sm text-slate-500">Already registered? <Link to="/login" className="font-bold text-emerald-700 hover:text-emerald-800">Sign in</Link></p>
          </form>
        </section>
        <aside className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -bottom-24 -right-20 size-80 rounded-full bg-emerald-500/20 blur-2xl" />
          <div className="relative"><div className="grid size-12 place-items-center rounded-2xl bg-emerald-500 text-xl font-black">N</div><p className="mt-5 text-sm font-bold uppercase tracking-[0.2em] text-emerald-300">NutriTrack</p></div>
          <div className="relative"><h2 className="text-4xl font-extrabold leading-tight tracking-tight">One log.<br />A clearer picture.</h2><div className="mt-8 space-y-4">{["AI nutrition extraction from food photos", "Flexible macro and micronutrient tracking", "Date-aware reports and personal goals"].map((item, index) => <div key={item} className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-emerald-500 text-xs font-black">{index + 1}</span><p className="text-sm text-slate-300">{item}</p></div>)}</div></div>
          <p className="relative text-xs text-slate-500">Built for consistent everyday tracking</p>
        </aside>
      </div>
    </main>
  );
}
