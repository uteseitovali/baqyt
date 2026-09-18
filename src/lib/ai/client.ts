import { z } from "zod";

/* ============================================================================
   AI-СЛОЙ

   Провайдер-агностичный клиент поверх OpenAI-совместимого /chat/completions.
   Работает с OpenAI, Groq, OpenRouter, Together, локальным Ollama — меняется
   только BASE_URL и MODEL в переменных окружения.

   Ключевое архитектурное решение: LLM здесь — УСИЛИТЕЛЬ, а не зависимость.
   Ранжирование, диагностика и маршрут считаются детерминированно в
   src/lib/domain. AI только переписывает формулировки живым языком. Если ключа
   нет, провайдер лёг или ответ не прошёл валидацию — продукт продолжает
   работать полностью, а интерфейс честно показывает «сгенерировано правилами».
   ========================================================================= */

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export function readAIConfig(): AIConfig | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    ),
    model: process.env.AI_MODEL || "gpt-4o-mini",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 12_000),
  };
}

export function isAIEnabled(): boolean {
  return readAIConfig() !== null;
}

interface CompletionArgs<T extends z.ZodTypeAny> {
  system: string;
  user: string;
  schema: T;
  /** Насколько творческим может быть ответ. Для фактов держим низко. */
  temperature?: number;
  maxTokens?: number;
}

export type AIOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "disabled" | "timeout" | "http" | "parse" | "schema"; message: string };

/** Достаёт JSON из ответа, даже если модель обернула его в ```json. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON не найден в ответе");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Единственная точка обращения к LLM во всём приложении.
 * Возвращает размеченный результат — вызывающий код обязан обработать провал.
 */
export async function completeStructured<T extends z.ZodTypeAny>({
  system,
  user,
  schema,
  temperature = 0.4,
  maxTokens = 900,
}: CompletionArgs<T>): Promise<AIOutcome<z.infer<T>>> {
  const config = readAIConfig();
  if (!config) {
    return { ok: false, reason: "disabled", message: "AI_API_KEY не задан" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        reason: "http",
        message: `${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, reason: "parse", message: "Пустой ответ провайдера" };
    }

    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch (error) {
      return {
        ok: false,
        reason: "parse",
        message: error instanceof Error ? error.message : "Не удалось разобрать JSON",
      };
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        reason: "schema",
        message: result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      };
    }

    return { ok: true, data: result.data };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      reason: aborted ? "timeout" : "http",
      message: error instanceof Error ? error.message : "Неизвестная ошибка сети",
    };
  } finally {
    clearTimeout(timer);
  }
}
