import { test } from "node:test";
import assert from "node:assert/strict";
import { combineBusy, manualState, validCells, weeklyKey, type ManualLayer } from "../lib/manual.ts";
import { jstMidnight } from "../lib/slots.ts";

const H = 60 * 60 * 1000;
/** 2026-09-28（月）の日本時間 h 時 */
const at = (h: number) => jstMidnight("2026-09-28") + h * H;
const from = at(9);
const to = at(13);
const layer = (cells: Record<string, "busy" | "free">, exclusive = false): ManualLayer => ({ cells, exclusive });
const iso = (b: { start: number; end: number }[]) =>
  b.map((x) => [(x.start - at(0)) / H, (x.end - at(0)) / H]);

test("weeklyKey は日本時間の曜日と分", () => {
  assert.equal(weeklyKey(at(9)), "1-540");
  assert.equal(weeklyKey(at(23.5)), "1-1410");
});

test("手動が何も無ければ外部カレンダーのまま", () => {
  assert.deepEqual(iso(combineBusy([{ start: at(10), end: at(11) }], null, null, from, to)), [[10, 11]]);
});

test("毎週の「空いている」は外部カレンダーの予定を打ち消す（手動が優先）", () => {
  const weekly = layer({ "1-600": "free" });
  assert.deepEqual(
    iso(combineBusy([{ start: at(10), end: at(11) }], weekly, null, from, to)),
    [[10.5, 11]],
  );
});

test("毎週の「予定あり」は外部カレンダーに足される", () => {
  const weekly = layer({ "1-540": "busy" });
  assert.deepEqual(
    iso(combineBusy([{ start: at(11), end: at(12) }], weekly, null, from, to)),
    [[9, 9.5], [11, 12]],
  );
});

test("この会議の予定は毎週の予定より優先", () => {
  const weekly = layer({ "1-540": "busy" });
  const meeting = layer({ [String(at(9))]: "free", [String(at(12))]: "busy" });
  assert.equal(manualState(at(9), weekly, meeting), "free");
  assert.deepEqual(iso(combineBusy([], weekly, meeting, from, to)), [[12, 12.5]]);
});

test("「空いている以外は予定あり」：塗った空き以外はすべて埋まる（カレンダーも無視）", () => {
  const meeting = layer({ [String(at(10))]: "free", [String(at(10.5))]: "free" }, true);
  assert.deepEqual(
    iso(combineBusy([{ start: at(10), end: at(11) }], null, meeting, from, to)),
    [[9, 10], [11, 13]],
  );
});

test("毎週の「空いている以外は予定あり」も同じ。この会議の空きがあればそちらが勝つ", () => {
  const weekly = layer({ "1-540": "free" }, true);
  const meeting = layer({ [String(at(12))]: "free" });
  assert.deepEqual(iso(combineBusy([], weekly, meeting, from, to)), [[9.5, 12], [12.5, 13]]);
});

test("validCells は形の違うキー・値を弾く", () => {
  assert.ok(validCells({ "1-540": "busy" }, "weekly"));
  assert.ok(!validCells({ "7-540": "busy" }, "weekly"));
  assert.ok(!validCells({ "1-545": "busy" }, "weekly"));
  assert.ok(!validCells({ "1-540": "maybe" }, "weekly"));
  assert.ok(validCells({ [String(at(9))]: "free" }, "meeting"));
  assert.ok(!validCells({ [String(at(9) + 1)]: "free" }, "meeting"));
  assert.ok(!validCells([], "meeting"));
});
