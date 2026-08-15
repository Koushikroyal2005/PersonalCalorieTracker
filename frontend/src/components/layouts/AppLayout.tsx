import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { ChatImportProvider } from "../../features/chat/ChatImportProvider";
import { NutrixChatWidget } from "../chat/NutrixChatWidget";
import { clearCredentials } from "../../features/auth/authSlice";

const navigation = [
    { to: "/", label: "Dashboard", end: true },
    { to: "/food-log", label: "Food log", end: false },
    { to: "/pdf-import", label: "PDF import", end: false },
    { to: "/goals", label: "Goals", end: false },
  ];

export function AppLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAppSelector((state) => state.auth.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeNavigationIndex = Math.max(
    0,
    navigation.findIndex((item) =>
      item.to === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(item.to),
    ),
  );

  function logout() {
    dispatch(clearCredentials());
    navigate("/login");
  }

  const initials = (user?.full_name || "User")
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <ChatImportProvider>
    <div className="min-h-screen overflow-x-hidden bg-[#f6f8f7] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-[0_1px_12px_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3" onClick={() => setMenuOpen(false)}>
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-600 text-lg font-black text-white shadow-sm shadow-emerald-200">
              N
            </span>
            <span>
              <span className="block text-base font-extrabold tracking-tight text-slate-950">NutriTrack</span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:block">Daily nutrition</span>
            </span>
          </Link>

          <nav className="relative hidden w-[420px] grid-cols-4 rounded-xl bg-slate-100 p-1 md:grid" aria-label="Main navigation">
            <span
              aria-hidden="true"
              className="absolute bottom-1 left-1 top-1 w-[calc((100%_-_8px)/4)] rounded-lg bg-white shadow-sm transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: `translateX(${activeNavigationIndex * 100}%)` }}
            />
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative z-10 rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors duration-300 ${
                    isActive
                      ? "text-emerald-700"
                      : "text-slate-600 hover:text-slate-950"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <div className="grid size-9 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
              {initials}
            </div>
            <div className="hidden max-w-32 lg:block">
              <p className="truncate text-sm font-semibold text-slate-800">{user?.full_name || "User"}</p>
              <p className="text-xs text-slate-400">Signed in</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              Log out
            </button>
          </div>

          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-10 place-items-center rounded-lg border border-slate-200 text-xl md:hidden"
          >
            {menuOpen ? "×" : "☰"}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-slate-100 bg-white px-4 py-3 md:hidden">
            <nav className="space-y-1">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2.5 text-sm font-semibold ${
                      isActive ? "bg-emerald-50 text-emerald-700" : "text-slate-600"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm font-medium text-slate-600">{user?.full_name}</span>
              <button type="button" onClick={logout} className="text-sm font-semibold text-red-600">Log out</button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <div key={location.pathname} className="page-slide-in">
          <Outlet />
        </div>
      </main>
      <NutrixChatWidget />
    </div>
    </ChatImportProvider>
  );
}
