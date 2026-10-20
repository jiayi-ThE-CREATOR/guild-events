import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncEvent } from "../lib/server/event-sync.ts";
import type { Meeting } from "../lib/server/meetings.ts";

type Row = Record<string, unknown>;

/**
 * syncEvent が使う分だけの Supabase の偽物。events の update と、applications の select / insert。
 * insert は「同じイベント・同じ名前の有効な行」で 23505、定員を超えると満席の例外（DB のトリガーと同じ）
 */
function fakeDb(capacity: number | null, applications: Row[] = []) {
  const events: Row[] = [{ id: "e1", date_status: "scheduling", event_date: "x", schedule_deadline: "y" }];
  const client = {
    from(table: string) {
      return {
        update(values: Row) {
          return {
            eq(_k: string, id: string) {
              for (const e of events) if (e.id === id) Object.assign(e, values);
              return Promise.resolve({ error: null });
            },
          };
        },
        select() {
          return {
            in(_k: string, names: string[]) {
              return Promise.resolve({ data: applications.filter((a) => names.includes(a.name as string)), error: null });
            },
          };
        },
        insert(row: Row) {
          assert.equal(table, "applications");
          const active = applications.filter((a) => a.event_id === row.event_id && a.status !== "cancelled");
          if (active.some((a) => a.name === row.name)) return Promise.resolve({ error: { code: "23505", message: "dup" } });
          if (capacity !== null && active.length >= capacity) {
            return Promise.resolve({ error: { code: "P0001", message: "満席のため申請できません" } });
          }
          applications.push({ ...row, status: "applied" });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { admin: client as unknown as SupabaseClient, events, applications };
}

const base = {
  id: "m1",
  event_id: "e1",
  ranges: [{ fromDate: "2026-11-10", toDate: "2026-11-12", dayStartMin: 600, dayEndMin: 1260 }],
  deadline: "2026-11-08T00:00:00.000Z",
  duration_min: 120,
  attendees: null,
  confirmed_start: null,
} as unknown as Meeting;

test("決まったら日時を入れ、空いていた人を参加させる（ゲストは入れない・大学は過去の申請から）", async () => {
  const db = fakeDb(null, [{ event_id: "old", name: "b", university: "京大", status: "attended" }]);
  await syncEvent(db.admin, {
    ...base,
    status: "confirmed",
    confirmed_start: "2026-11-10T03:00:00.000Z",
    attendees: ["a", "b", "guest:x"],
  });
  assert.equal(db.events[0].date_status, "fixed");
  assert.equal(db.events[0].event_date, "2026-11-10T03:00:00.000Z");
  assert.equal(db.events[0].schedule_deadline, null);
  const joined = db.applications.filter((a) => a.event_id === "e1");
  assert.deepEqual(joined.map((a) => [a.name, a.university]), [["a", "その他"], ["b", "京大"]]);
});

test("もう参加している人は二重にしない。定員に達したらそこで打ち切る", async () => {
  const db = fakeDb(2, [{ event_id: "e1", name: "b", university: "阪大", status: "applied" }]);
  await syncEvent(db.admin, {
    ...base,
    status: "confirmed",
    confirmed_start: "2026-11-10T03:00:00.000Z",
    attendees: ["a", "b", "c"],
  });
  const joined = db.applications.filter((a) => a.event_id === "e1").map((a) => a.name);
  assert.deepEqual(joined, ["b", "a"]);
});

test("募集し直したら日程調整中に戻し、日時は最初の候補の開始・結果発表を写す", async () => {
  const db = fakeDb(null);
  await syncEvent(db.admin, { ...base, status: "open" });
  assert.equal(db.events[0].date_status, "scheduling");
  assert.equal(db.events[0].schedule_deadline, "2026-11-08T00:00:00.000Z");
  // 日本時間 11/10 10:00
  assert.equal(db.events[0].event_date, "2026-11-10T01:00:00.000Z");
});

test("不成立なら failed。イベントにつながっていない会議では何もしない", async () => {
  const db = fakeDb(null);
  await syncEvent(db.admin, { ...base, status: "failed" });
  assert.equal(db.events[0].date_status, "failed");
  const other = fakeDb(null);
  await syncEvent(other.admin, { ...base, event_id: null, status: "failed" });
  assert.equal(other.events[0].date_status, "scheduling");
});
