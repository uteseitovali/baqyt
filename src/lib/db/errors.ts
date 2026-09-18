/* ============================================================================
   ЧИТАЕМОЕ ОПИСАНИЕ СБОЯ БАЗЫ

   Наивное `error.message` здесь не работает. Когда хост недоступен, Node
   пробует несколько адресов (IPv6 и IPv4) и заворачивает неудачи в
   AggregateError, у которого собственный message — пустая строка. В итоге
   /api/health показывал бы «деградировали» без единого слова о причине —
   ровно там, где объяснение и нужно.
   ========================================================================= */

export function describeDbError(error: unknown): string {
  if (error instanceof AggregateError) {
    const inner = error.errors.map(describeDbError).filter(Boolean);
    return inner.length > 0 ? [...new Set(inner)].join("; ") : "соединение не установлено";
  }

  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (error.message) return code ? `${error.message} (${code})` : error.message;
    return code ?? error.name;
  }

  return String(error) || "неизвестная ошибка";
}
