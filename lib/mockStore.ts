"use client";

import { MOCK_APPLICATIONS, MOCK_EVENTS } from "./mockData";
import type { ApplicationRecord, EventRecord, NewApplication } from "./types";

const KEY = "guild-events:applications";

/**
 * Supabase 未設定時の保存先。localStorage に applications だけを持つ。
 * events は読み取り専用なので mockData をそのまま返す。
 */
function read(): ApplicationRecord[] {
  if (typeof window === "undefined") return MOCK_APPLICATIONS;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) {
    window.localStorage.setItem(KEY, JSON.stringify(MOCK_APPLICATIONS));
    return MOCK_APPLICATIONS;
  }
  try {
    return JSON.parse(raw) as ApplicationRecord[];
  } catch {
    return MOCK_APPLICATIONS;
  }
}

function write(rows: ApplicationRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(rows));
}

export const mockStore = {
  events(): EventRecord[] {
    return MOCK_EVENTS;
  },

  applications(): ApplicationRecord[] {
    return read();
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
    write([...read(), row]);
    return row;
  },

  /** 行は消さず status を cancelled にする（DB 側と同じ挙動） */
  cancel(id: string) {
    write(
      read().map((row) =>
        row.id === id ? { ...row, status: "cancelled" as const } : row,
      ),
    );
  },
};
