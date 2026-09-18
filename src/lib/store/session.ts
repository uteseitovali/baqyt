"use client";

import { create } from "zustand";
import type { MergeResult } from "@/lib/sync/merge";

/* ============================================================================
   СОСТОЯНИЕ АККАУНТА И СИНХРОНИЗАЦИИ

   Отдельный стор от journey: путь — это данные пользователя, а это —
   состояние соединения с сервером. Их жизненные циклы не совпадают, и
   persist'ить второе не нужно.
   ========================================================================= */

export interface SessionUser {
  id: string;
  email: string;
}

/** Что показываем рядом с аккаунтом: честно про состояние синхронизации. */
export type SyncState = "off" | "idle" | "syncing" | "saved" | "error";

interface SessionStore {
  /** Есть ли аккаунты вообще (задан ли DATABASE_URL на сервере). */
  authEnabled: boolean;
  /** unknown — ещё не спросили сервер; важно, чтобы не мигать «войти». */
  status: "unknown" | "guest" | "signed-in";
  user: SessionUser | null;
  sync: SyncState;
  /** Что именно слилось при последнем входе — показываем пользователю. */
  lastMerge: MergeResult["summary"] | null;

  setAuthEnabled: (enabled: boolean) => void;
  setUser: (user: SessionUser | null) => void;
  setSync: (state: SyncState) => void;
  setLastMerge: (summary: MergeResult["summary"] | null) => void;
}

export const useSession = create<SessionStore>()((set) => ({
  authEnabled: false,
  status: "unknown",
  user: null,
  sync: "off",
  lastMerge: null,

  setAuthEnabled: (enabled) =>
    set((s) => ({
      authEnabled: enabled,
      // Без аккаунтов состояние определено сразу: это гость, и спрашивать
      // сервер незачем.
      status: enabled ? s.status : "guest",
      sync: enabled ? s.sync : "off",
    })),

  setUser: (user) =>
    set({
      user,
      status: user ? "signed-in" : "guest",
      sync: user ? "idle" : "off",
    }),

  setSync: (sync) => set({ sync }),
  setLastMerge: (lastMerge) => set({ lastMerge }),
}));
