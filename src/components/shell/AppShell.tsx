"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { JourneyRail } from "./JourneyRail";
import { cn } from "@/lib/utils/cn";
import { useJourney } from "@/lib/store/journey";
import { useSession } from "@/lib/store/session";

/* ============================================================================
   Оболочка приложения: шапка с логотипом и темой, маршрутная лента, подвал
   с честной пометкой о данных.
   ========================================================================= */

function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Bagyt — на главную">
      {/* Знак: три вехи маршрута, соединённые линией */}
      <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden>
        <path
          d="M5 21 L13 13 L23 7"
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          className="transition-[stroke-dasharray] duration-500"
        />
        <circle cx="5" cy="21" r="3" fill="var(--accent)" />
        <circle cx="13" cy="13" r="2.4" fill="var(--canvas)" stroke="var(--accent)" strokeWidth={2} />
        <circle cx="23" cy="7" r="2.4" fill="var(--canvas)" stroke="var(--accent)" strokeWidth={2} />
      </svg>
      <span className="text-[17px] font-extrabold tracking-[-0.03em]">Bagyt</span>
    </Link>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("bagyt-theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("bagyt-theme", next);
    } catch {
      /* приватный режим — просто не запоминаем */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      className="grid size-9 place-items-center rounded-[10px] border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {mounted && theme === "dark" ? (
        <svg viewBox="0 0 20 20" className="size-4 fill-none stroke-current" strokeWidth={1.7}>
          <circle cx="10" cy="10" r="3.6" />
          <path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="size-4 fill-none stroke-current" strokeWidth={1.7}>
          <path d="M16.5 11.8A7 7 0 0 1 8.2 3.5a7 7 0 1 0 8.3 8.3z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function ResetButton() {
  const reset = useJourney((s) => s.reset);
  const profileCompleted = useJourney((s) => s.profileCompleted);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (!profileCompleted) return null;

  return (
    <button
      onClick={() => {
        if (confirming) {
          reset();
          setConfirming(false);
          window.location.href = "/";
        } else {
          setConfirming(true);
        }
      }}
      className={cn(
        "h-9 rounded-[10px] border px-3 text-[12.5px] font-semibold transition-colors",
        confirming
          ? "border-danger/40 bg-danger-soft text-danger"
          : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {confirming ? "Точно сбросить?" : "Сбросить"}
    </button>
  );
}

/**
 * Точка входа в аккаунт. Без подключённой базы не показывается вовсе:
 * предлагать вход там, где его нет, — обман интерфейса.
 */
function AccountButton() {
  const authEnabled = useSession((s) => s.authEnabled);
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const sync = useSession((s) => s.sync);
  const setUser = useSession((s) => s.setUser);

  if (!authEnabled || status === "unknown") return null;

  if (status === "guest") {
    return (
      <Link
        href="/login"
        className="h-9 rounded-[10px] border border-line bg-surface px-3 text-[12.5px] font-semibold leading-9 text-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        Войти
      </Link>
    );
  }

  const syncLabel: Record<string, string> = {
    syncing: "сохраняем…",
    saved: "сохранено",
    error: "не сохранилось",
    idle: "синхронизировано",
    off: "",
  };

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[12px] text-faint md:block" title={user?.email}>
        {user?.email} · {syncLabel[sync]}
      </span>
      <button
        onClick={() => {
          void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
            // Локальный прогресс остаётся: выход из аккаунта — не сброс пути.
            setUser(null);
          });
        }}
        className="h-9 rounded-[10px] border border-line bg-surface px-3 text-[12.5px] font-semibold text-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        Выйти
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isIntro = pathname === "/";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[var(--page-max)] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="hidden text-[12.5px] text-faint sm:block">
              Персональный маршрут поступления
            </span>
            <AccountButton />
            <ResetButton />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {!isIntro && (
        <div className="sticky top-[57px] z-30">
          <JourneyRail />
        </div>
      )}

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-line bg-sunken/60">
        <div className="mx-auto w-full max-w-[var(--page-max)] px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <p className="t-label mb-2">О данных</p>
              <p className="t-body text-[13px] text-muted">
                Каталог программ — кураторский демонстрационный срез. Требования,
                стоимость и даты подачи меняются каждый приёмный цикл: перед подачей
                подтверждайте их на официальном сайте вуза, ссылка есть у каждой
                программы. Bagyt не гарантирует поступление и не оценивает шансы
                в процентах.
              </p>
            </div>
            <p className="t-label shrink-0">
              Bagyt · LOCUS Hackathon 2026 · Кейс 02
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
