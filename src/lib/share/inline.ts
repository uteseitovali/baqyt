import { parseShareable } from "./schema";
import type { ShareableSummary } from "./summary";

/* ============================================================================
   ССЫЛКА БЕЗ СЕРВЕРА

   Когда DATABASE_URL не задан, хранить сводку негде, и сетевой запрос был бы
   вранья ради: он бы всё равно упал. Поэтому та же сводка сжимается и
   кладётся в сам адрес: /shared?d=<...>. Открывает такую ссылку клиентская
   страница, которая ничего не запрашивает, а только декодирует параметр.

   Формат: «z.» + base64url(deflate-raw(JSON)). Если в браузере нет
   CompressionStream — «j.» + base64url(JSON), это чуть длиннее, но работает.
   Читаются оба префикса.

   Модуль работает в браузере и в Node (тесты), поэтому без Buffer.
   ========================================================================= */

export const INLINE_PARAM = "d";

/** Потолок на длину параметра: настоящая сводка — сотни символов. */
const MAX_ENCODED_CHARS = 2048;
/** Потолок на РАЗЖАТЫЙ размер: защита от «бомбы» — мегабайты из килобайт. */
const MAX_DECODED_BYTES = 4096;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!BASE64URL.test(text)) return null;
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

const hasCompression = () =>
  typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Разжимает не больше MAX_DECODED_BYTES. Читаем поток кусками и обрываем, как
 * только лимит превышен, — целиком «бомба» в память не попадает.
 */
async function inflateCapped(bytes: Uint8Array): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    // Конструктор бросает, если браузер не знает формат «deflate-raw»
    // (часть старых Safari), — поэтому поток строится внутри try.
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DECODED_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null; // битый поток
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function encodeInline(summary: ShareableSummary): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(summary));

  if (hasCompression()) {
    try {
      return "z." + toBase64Url(await deflate(json));
    } catch {
      /* упало сжатие — уходим на несжатый формат */
    }
  }
  return "j." + toBase64Url(json);
}

/**
 * Декодирует параметр из ссылки. НИКОГДА не бросает: любая порча, обрезка,
 * подделка или несоответствие схеме — null. Ссылке из чужих рук доверия нет.
 */
export async function decodeInline(param: string): Promise<ShareableSummary | null> {
  if (param.length < 3 || param.length > MAX_ENCODED_CHARS) return null;

  const kind = param.slice(0, 2);
  if (kind !== "z." && kind !== "j.") return null;

  const raw = fromBase64Url(param.slice(2));
  if (!raw) return null;

  let json: Uint8Array | null;
  if (kind === "z.") {
    if (!hasCompression()) return null;
    json = await inflateCapped(raw);
  } else {
    json = raw.byteLength <= MAX_DECODED_BYTES ? raw : null;
  }
  if (!json) return null;

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(json);
    return parseShareable(JSON.parse(text));
  } catch {
    return null;
  }
}
