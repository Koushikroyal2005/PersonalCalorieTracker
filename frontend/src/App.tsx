import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";

import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AppLayout } from "./components/layouts/AppLayout";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const FoodLogPage = lazy(() => import("./pages/FoodLogPage").then((module) => ({ default: module.FoodLogPage })));
const GoalsPage = lazy(() => import("./pages/GoalsPage").then((module) => ({ default: module.GoalsPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const SignupPage = lazy(() => import("./pages/SignupPage").then((module) => ({ default: module.SignupPage })));
const PDFImportPage = lazy(() =>
  import("./pages/PDFImportPage").then((module) => ({
    default: module.PDFImportPage,
  })),
);

function PageLoader() {
  return <div className="grid min-h-screen place-items-center bg-slate-50"><div className="text-center"><span className="mx-auto block size-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" /><p className="mt-3 text-sm font-semibold text-slate-500">Loading NutriTrack…</p></div></div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="food-log" element={<FoodLogPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="pdf-import" element={<PDFImportPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
