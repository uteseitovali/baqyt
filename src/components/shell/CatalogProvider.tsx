"use client";

import { useState } from "react";
import { setCatalog, type CatalogSource } from "@/lib/data/programs";
import type { Program } from "@/lib/domain/types";

/* ============================================================================
   ПЕРЕНОС КАТАЛОГА НА КЛИЕНТ

   Серверный снапшот и браузерный — разные экземпляры модуля, поэтому каталог,
   загруженный из базы в layout, нужно явно перенести через границу.

   Почему пропом, а не fetch'ем на маунте: «Живая настройка» пересчитывает
   выдачу синхронно, значит программы должны быть на руках уже к первой
   отрисовке. Запрос на маунте дал бы водопад и кадр с пустым экраном, а без
   базы — ещё и лишний сетевой запрос там, где сегодня их ноль.

   Снапшот пишется в инициализаторе useState: он выполняется один раз и до
   того, как отрисуются дети, — то есть до первого вызова getProgramById или
   rankPrograms на странице.
   ========================================================================= */

interface CatalogProviderProps {
  programs: Program[];
  source: CatalogSource;
  children: React.ReactNode;
}

export function CatalogProvider({ programs, source, children }: CatalogProviderProps) {
  useState(() => {
    setCatalog(programs, source);
    return null;
  });

  return <>{children}</>;
}
