import { NextResponse } from "next/server";
import { z } from "zod";
import { loadCatalog } from "@/lib/data/catalog.server";
import { isDbEnabled } from "@/lib/db/client";
import { describeDbError } from "@/lib/db/errors";
import { insertShareWithinLimit, purgeExpiredShares } from "@/lib/db/shares.repo";
import { shareableSchema } from "@/lib/share/schema";
import { generateSlug, hashCreator, hashSlug } from "@/lib/share/slug";

export const runtime = "nodejs";

/* ============================================================================
   POST /api/share — сохранить сводку и выдать ссылку на 30 дней.

   Эндпоинт открытый: гость без аккаунта тоже может показать подборку семье.
   Открытая запись — самая рискованная часть фичи, поэтому граница узкая:
     • тело — не больше 2 КБ (считаются реально прочитанные байты) и только
       application/json;
     • сводка проходит строгую схему с закрытым словарём: произвольного текста
       и ссылок в ней быть не может, значит, и хостингом чужих сообщений
       эндпоинт не станет;
     • каждая программа должна существовать в каталоге;
     • не больше десяти ссылок в час с одного адреса.

   Без DATABASE_URL отвечает 503 с mode: "inline": клиент и так не должен сюда
   ходить, но если пришёл — ему прямо говорят, что делать вместо этого.
   ========================================================================= */

const MAX_BODY_BYTES = 2048;

const bodySchema = z.strictObject({ summary: shareableSchema });

function clientAddress(request: Request): string {
  // Берём ПОСЛЕДНИЙ элемент: его дописал ближайший доверенный прокси, а всё
  // левее клиент мог подставить сам (первый элемент подделывается одной
  // строкой заголовка). Там, где прокси перезаписывает заголовок целиком
  // (Vercel), элемент один — и это адрес клиента. Совсем без прокси заголовку
  // верить нельзя вовсе: лимит по адресу там обходится (README §10).
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Читает тело не больше max байт. Content-Length верить нельзя (его может не
 * быть при chunked, его можно занизить), поэтому считаем фактические байты
 * и обрываем чтение на превышении — гигабайт в память не попадёт.
 */
async function readBodyCapped(request: Request, max: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isDbEnabled()) {
    return json(
      {
        error:
          "Хранение ссылок выключено: DATABASE_URL не задан. Сводка кодируется прямо в адрес — сервер не нужен.",
        mode: "inline",
      },
      503,
    );
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Нужен Content-Type: application/json" }, 415);
  }

  const raw = await readBodyCapped(request, MAX_BODY_BYTES);
  if (raw === null) return json({ error: "Слишком большое тело запроса" }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Некорректный JSON" }, 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: "Сводка не прошла проверку",
        issues: parsed.error.issues.slice(0, 5).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      422,
    );
  }
  const { summary } = parsed.data;

  /* Программа, которой нет в каталоге, — признак подделки или устаревшей
     вкладки. Отказываем, а не сохраняем: страница потом всё равно не смогла
     бы её показать. */
  const catalog = await loadCatalog();
  const known = new Set(catalog.programs.map((p) => p.id));
  if (summary.programs.some((p) => !known.has(p.programId))) {
    return json({ error: "В сводке есть программа, которой нет в каталоге" }, 422);
  }

  try {
    const slug = generateSlug();
    const result = await insertShareWithinLimit({
      slugHash: hashSlug(slug),
      summary,
      creatorHash: hashCreator(clientAddress(request)),
    });

    if (!result.ok) {
      return json({ error: "Слишком много ссылок за час. Попробуйте позже." }, 429);
    }

    // Уборка — не на критическом пути: её сбой не должен отнять у человека
    // уже созданную ссылку.
    void purgeExpiredShares().catch(() => {});

    // Слаг не логируем: он и есть право на чтение.
    return json(
      { mode: "stored", path: `/shared/${slug}`, expiresAt: result.expiresAt.toISOString() },
      201,
    );
  } catch (error) {
    console.warn("[bagyt/share] сохранить ссылку не удалось:", describeDbError(error));
    return json(
      {
        error: "База недоступна — ссылка не сохранена. Можно поделиться ссылкой без хранения.",
        mode: "inline",
      },
      503,
    );
  }
}
