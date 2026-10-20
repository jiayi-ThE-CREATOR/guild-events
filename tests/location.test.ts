import { test } from "node:test";
import assert from "node:assert/strict";
import { campusOf, composeLocation, parseLocation } from "../lib/format.ts";

test("その他は詳細をそのまま場所にし、大学のタグは付かない", () => {
  assert.equal(composeLocation("その他", "  梅田のカフェ "), "梅田のカフェ");
  assert.equal(campusOf("梅田のカフェ"), "その他");
});

test("編集で開き直すと元の区分と詳細に戻る（その他も）", () => {
  for (const [venue, detail] of [
    ["阪大", "豊中キャンパス B203"],
    ["京大", "吉田キャンパス"],
    ["オンライン", "Discord"],
    ["その他", "梅田のカフェ"],
  ] as const) {
    assert.deepEqual(parseLocation(composeLocation(venue, detail)), { venue, detail });
  }
  // 場所が空のイベントは、区分を選んでいない状態に戻す
  assert.deepEqual(parseLocation(null), { venue: "", detail: "" });
});
