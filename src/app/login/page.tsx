"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, Label, SectionHeading } from "@/components/ui/Primitives";
import { useSession } from "@/lib/store/session";
import { adoptRemoteJourney } from "@/lib/sync/client";
import type { JourneySnapshot } from "@/lib/sync/merge";

/* ============================================================================
   ВХОД В АККАУНТ

   Два шага: адрес → код из письма. Вход здесь не обязателен и не является
   входом в продукт: путь целиком проходится гостем, а аккаунт нужен только
   чтобы прогресс пережил смену устройства.

   Поэтому экран прямо говорит, что произойдёт с уже пройденным путём:
   он сольётся с сохранённым, а не заменится им.
   ========================================================================= */

const INPUT_CLASS =
  "h-11 w-full rounded-[var(--r-sm)] border border-line bg-surface px-3.5 " +
  "text-[15px] text-ink placeholder:text-[14px] placeholder:text-faint " +
  "transition-colors focus:border-accent";

export default function LoginPage() {
  const router = useRouter();
  const authEnabled = useSession((s) => s.authEnabled);
  const status = useSession((s) => s.status);
  const setUser = useSession((s) => s.setUser);

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as {
        error?: string;
        code?: string;
        delivery?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Не удалось отправить код");
        return;
      }

      setStep("code");
      setNotice(
        data.code
          ? `Код для демо: ${data.code}`
          : "Код отправлен. Почтовый провайдер в этой сборке не подключён — код напечатан в логе сервера.",
      );
    } catch {
      setError("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await response.json()) as {
        error?: string;
        user?: { id: string; email: string };
        journey?: JourneySnapshot | null;
      };

      if (!response.ok || !data.user) {
        setError(data.error ?? "Войти не удалось");
        return;
      }

      setUser(data.user);
      // Слияние до перехода: на следующем экране человек должен увидеть
      // уже общий путь, а не мигание двух состояний.
      await adoptRemoteJourney(data.journey ?? null);
      router.push("/");
    } catch {
      setError("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  }

  if (!authEnabled) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 py-16 sm:px-6">
        <Card className="p-6">
          <SectionHeading title="Аккаунты выключены" />
          <p className="t-body mt-3 text-[14px] text-muted">
            В этой сборке не задан <code>DATABASE_URL</code>, поэтому входа нет.
            Это не мешает пройти путь целиком: анкета, рекомендации и маршрут
            работают полностью, а прогресс хранится в этом браузере.
          </p>
          <Button className="mt-5" onClick={() => router.push("/")}>
            Вернуться к пути
          </Button>
        </Card>
      </div>
    );
  }

  if (status === "signed-in") {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 py-16 sm:px-6">
        <Card className="p-6">
          <SectionHeading title="Вы уже вошли" />
          <p className="t-body mt-3 text-[14px] text-muted">
            Прогресс сохраняется автоматически: анкета, отобранные программы и
            отметки в маршруте.
          </p>
          <Button className="mt-5" onClick={() => router.push("/")}>
            К пути
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-16 sm:px-6">
      <Card className="p-6">
        <SectionHeading
          label="Аккаунт"
          title="Вход по коду"
          description="Чтобы путь не потерялся при смене устройства"
        />

        <p className="t-body mt-3 text-[14px] text-muted">
          Аккаунт не обязателен. Всё, что вы уже заполнили в этом браузере,
          при входе <strong className="text-ink">сольётся</strong> с сохранённым,
          а не заменится им: отмеченные задачи останутся отмеченными,
          отобранные программы — отобранными.
        </p>

        {step === "email" ? (
          <form onSubmit={requestCode} className="mt-6 space-y-3">
            <Label>Почта</Label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className={INPUT_CLASS}
              aria-label="Адрес почты"
            />
            <Button type="submit" disabled={busy || email.length < 3}>
              {busy ? "Отправляем…" : "Получить код"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6 space-y-3">
            <Label>Код из шести цифр</Label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              className={`${INPUT_CLASS} t-num tracking-[0.3em]`}
              aria-label="Код из письма"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Проверяем…" : "Войти"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setNotice(null);
                }}
              >
                Другой адрес
              </Button>
            </div>
          </form>
        )}

        {notice && (
          <p className="mt-4 rounded-[var(--r-sm)] border border-line bg-sunken px-3.5 py-2.5 text-[13px] text-muted">
            {notice}
          </p>
        )}
        {error && <p className="mt-4 text-[13px] font-medium text-danger">{error}</p>}
      </Card>
    </div>
  );
}
