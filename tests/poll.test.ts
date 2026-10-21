import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickOption, pollOptionsProblem, type PollOption } from "../lib/poll.ts";
import { pollDecidedMessage, pollOpenedMessage } from "../lib/server/discord.ts";
import { decidePoll } from "../lib/server/poll.ts";
import type { Meeting } from "../lib/server/meetings.ts";

const opt = (id: string, start: string, voters: string[]): PollOption => ({
  id,
  start,
  end: new Date(Date.parse(start) + 2 * 3600e3).toISOString(),
  voters,
});

test("一番多く印が付いた日程。同数なら早いほう。誰も付けていなければ null", () => {
  const a = opt("a", "2026-11-11T09:00:00.000Z", ["x", "y"]);
  const b = opt("b", "2026-11-10T09:00:00.000Z", ["x", "y"]);
  const c = opt("c", "2026-11-09T09:00:00.000Z", ["x"]);
  assert.equal(pickOption([a, b, c])?.id, "b");
  assert.equal(pickOption([opt("d", "2026-11-09T09:00:00.000Z", [])]), null);
});

test("投票の時間帯の検査", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  const r = (start: string, end: string) => ({ start, end });
  assert.equal(pollOptionsProblem([], now), "日程を 1 つ以上選んでください");
  assert.match(pollOptionsProblem([r("2026-11-10T09:15:00Z", "2026-11-10T11:00:00Z")], now)!, /30 分刻み/);
  assert.match(pollOptionsProblem([r("2026-10-30T09:00:00Z", "2026-10-30T11:00:00Z")], now)!, /今より後/);
  assert.match(pollOptionsProblem([r("2026-11-10T09:00:00Z", "2026-11-10T09:00:00Z")], now)!, /終わりは始まりより後/);
  // 日本時間 11/10 22:00〜11/11 01:00 は日をまたぐ
  assert.match(pollOptionsProblem([r("2026-11-10T13:00:00Z", "2026-11-10T16:00:00Z")], now)!, /その日のうち/);
  // 日本時間 22:00〜24:00 はよい
  assert.equal(pollOptionsProblem([r("2026-11-10T13:00:00Z", "2026-11-10T15:00:00Z")], now), null);
  assert.match(
    pollOptionsProblem([r("2026-11-10T09:00:00Z", "2026-11-10T11:00:00Z"), r("2026-11-10T09:00:00.000Z", "2026-11-10T12:00:00Z")], now)!,
    /2 つ/,
  );
  // 長さの違う時間帯を並べてよい
  assert.equal(
    pollOptionsProblem([r("2026-11-10T09:00:00Z", "2026-11-10T12:00:00Z"), r("2026-11-12T10:00:00Z", "2026-11-12T11:30:00Z")], now),
    null,
  );
});

const meeting = {
  id: "m1",
  event_id: "e1",
  title: "GUILD勉強会 #5",
  location: null,
  address: null,
  participants: ["x", "y", "z"],
  status: "voting",
  deadline: "2026-11-05T00:00:00.000Z",
  duration_min: 120,
} as unknown as Meeting;

test("Discord：投票開始は @everyone でイベントのページへ、決定は印を付けた人を参加として出す", () => {
  const start = pollOpenedMessage(meeting, [{ start: "2026-11-10T09:00:00.000Z", end: "2026-11-10T11:00:00.000Z" }], "https://x/events/e1");
  assert.ok(start.startsWith("@everyone"));
  assert.ok(start.includes("・11/10（火）18:00〜20:00"));
  assert.ok(start.includes("https://x/events/e1"));
  const done = pollDecidedMessage(meeting, opt("a", "2026-11-10T09:00:00.000Z", ["x", "z"]), "u");
  assert.ok(done.includes("✅ 参加（2人）：x、z"));
  assert.ok(pollDecidedMessage(meeting, null, "u").includes("決まりませんでした"));
});

/** decidePoll が使う分だけの、表をメモリに持つ Supabase の偽物 */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  type Row = Record<string, unknown>;
  function query(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let action: { kind: "select" } | { kind: "update"; values: Row } | { kind: "insert"; row: Row } = { kind: "select" };
    const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (action.kind === "insert") {
        tables[table].push({ ...action.row, status: action.row.status ?? "applied" });
        return { data: null, error: null };
      }
      const hit = rows();
      if (action.kind === "update") for (const r of hit) Object.assign(r, (action as { values: Row }).values);
      return { data: hit, error: null };
    };
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
      order: () => q,
      update: (values: Row) => ((action = { kind: "update", values }), q),
      insert: (row: Row) => ((action = { kind: "insert", row }), Promise.resolve(run())),
      maybeSingle: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve(run()),
    };
    return q;
  }
  return { from: query } as unknown as SupabaseClient;
}

test("締め切りで一番多い時間帯に決め（長さもその時間帯に）、イベントに日時を入れ、印を付けた人を参加にする", async () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    meetings: [{ ...meeting }],
    meeting_poll_options: [
      { id: "o1", meeting_id: "m1", start_at: "2026-11-10T09:00:00.000Z", end_at: "2026-11-10T11:00:00.000Z" },
      { id: "o2", meeting_id: "m1", start_at: "2026-11-12T09:00:00.000Z", end_at: "2026-11-12T12:00:00.000Z" },
    ],
    meeting_poll_votes: [
      { option_id: "o1", member_name: "x" },
      { option_id: "o2", member_name: "x" },
      { option_id: "o2", member_name: "z" },
    ],
    events: [{ id: "e1", date_status: "scheduling" }],
    applications: [],
  };
  const decided = await decidePoll(fakeDb(tables), meeting, "https://x");
  assert.equal(decided.status, "confirmed");
  assert.equal(decided.confirmed_start, "2026-11-12T09:00:00.000Z");
  // 長さは選んだ時間帯（3 時間）になる
  assert.equal(decided.duration_min, 180);
  assert.deepEqual(decided.attendees, ["x", "z"]);
  assert.equal(tables.events[0].date_status, "fixed");
  assert.equal(tables.events[0].event_date, "2026-11-12T09:00:00.000Z");
  assert.deepEqual(tables.applications.map((a) => a.name), ["x", "z"]);
});

test("主催者が選んだ日程なら、印が少なくてもそこに決める", async () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    meetings: [{ ...meeting }],
    meeting_poll_options: [
      { id: "o1", meeting_id: "m1", start_at: "2026-11-10T09:00:00.000Z", end_at: "2026-11-10T11:00:00.000Z" },
      { id: "o2", meeting_id: "m1", start_at: "2026-11-12T09:00:00.000Z", end_at: "2026-11-12T11:00:00.000Z" },
    ],
    meeting_poll_votes: [{ option_id: "o2", member_name: "x" }, { option_id: "o2", member_name: "y" }],
    events: [{ id: "e1", date_status: "scheduling" }],
    applications: [],
  };
  const decided = await decidePoll(fakeDb(tables), meeting, "https://x", "o1");
  assert.equal(decided.confirmed_start, "2026-11-10T09:00:00.000Z");
  assert.deepEqual(decided.attendees, []);
});
