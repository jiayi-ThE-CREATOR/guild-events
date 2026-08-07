"use client";

import { MOCK_APPLICATIONS, MOCK_EVENTS } from "./mockData";
import type {
  ApplicationRecord,
  EventRecord,
  NewApplication,
  NewEvent,
} from "./types";

const APPLICATIONS_KEY = "guild-events:applications";
const EVENTS_KEY = "guild-events:events";

/**
 * Supabase 未設定時の保存先。events / applications とも localStorage に置く。
 * 初回だけ mockData の内容を書き込んで種にする。
 */
function read<T>(key: string, seed: T[]): T[] {
  if (typeof window === "undefined") return seed;
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    window.localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return seed;
  }
}

function write<T>(key: string, rows: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(rows));
}

export const mockStore = {
  events(): EventRecord[] {
    return read(EVENTS_KEY, MOCK_EVENTS);
  },

  insertEvent(input: NewEvent): EventRecord {
    const row: EventRecord = { id: crypto.randomUUID(), ...input };
    write(EVENTS_KEY, [...read(EVENTS_KEY, MOCK_EVENTS), row]);
    return row;
  },

  updateEvent(id: string, input: NewEvent): EventRecord {
    const rows = read(EVENTS_KEY, MOCK_EVENTS).map((e) =>
      e.id === id ? { ...e, ...input } : e,
    );
    write(EVENTS_KEY, rows);
    return rows.find((e) => e.id === id)!;
  },

  /** DB の ON DELETE CASCADE に合わせ、そのイベントの申請も消す */
  removeEvent(id: string) {
    write(
      EVENTS_KEY,
      read(EVENTS_KEY, MOCK_EVENTS).filter((e) => e.id !== id),
    );
    write(
      APPLICATIONS_KEY,
      read(APPLICATIONS_KEY, MOCK_APPLICATIONS).filter(
        (a) => a.event_id !== id,
      ),
    );
  },

  applications(): ApplicationRecord[] {
    return read(APPLICATIONS_KEY, MOCK_APPLICATIONS);
  },

  insert(input: NewApplication): ApplicationRecord {
    const row: ApplicationRecord = {
      id: crypto.randomUUID(),
      event_id: input.event_id,
      name: input.name,
      university: input.university,
      status: "applied",
      discord: input.discord,
      note: input.note,
      created_at: new Date().toISOString(),
    };
    write(APPLICATIONS_KEY, [
      ...read(APPLICATIONS_KEY, MOCK_APPLICATIONS),
      row,
    ]);
    return row;
  },

  /** 行は消さず status を cancelled にする（DB 側と同じ挙動） */
  cancel(id: string) {
    write(
      APPLICATIONS_KEY,
      read(APPLICATIONS_KEY, MOCK_APPLICATIONS).map((row) =>
        row.id === id ? { ...row, status: "cancelled" as const } : row,
      ),
    );
  },
};
