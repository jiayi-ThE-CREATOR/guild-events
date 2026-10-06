import { test } from "node:test";
import assert from "node:assert/strict";
import { emailIn, filesMail, pickEmail, sizeLabel } from "../lib/notify-email.ts";

test("ラベルの中のメールアドレスを拾う（Lark の「アドレス（カレンダー名）」も）", () => {
  assert.equal(emailIn("Taro@Gmail.com"), "taro@gmail.com");
  assert.equal(emailIn("taro@larksuite.com（仕事・個人）"), "taro@larksuite.com");
  assert.equal(emailIn("iPhone カレンダー"), null);
});

test("Gmail を優先し、無ければ最初のアドレス", () => {
  assert.equal(pickEmail(["a@univ.ac.jp", "b@gmail.com"]), "b@gmail.com");
  assert.equal(pickEmail(["a@univ.ac.jp", "x@outlook.com"]), "a@univ.ac.jp");
  assert.equal(pickEmail(["iPhone カレンダー", null]), null);
});

test("手で入れたアドレスが一番優先。形が正しくなければ使わない", () => {
  assert.equal(pickEmail(["b@gmail.com"], "me@example.com"), "me@example.com");
  assert.equal(pickEmail(["b@gmail.com"], "not-an-email"), "b@gmail.com");
});

test("資料追加のメール：メンバーにはリンク、ゲストには無し", () => {
  const files = [{ name: "議事録.pdf", size: 2_500_000 }];
  const member = filesMail("定例", "王", files, "https://x/schedule/m1");
  assert.equal(member.subject, "【GUILD】「定例」に資料が追加されました");
  assert.ok(member.text.includes("・議事録.pdf（2.4 MB）"));
  assert.ok(member.text.includes("https://x/schedule/m1"));
  const guest = filesMail("定例", "王", files, null);
  assert.ok(!guest.text.includes("https://"));
  assert.ok(!guest.text.includes("マイページ"));
});

test("大きさの表示", () => {
  assert.equal(sizeLabel(900), "900 B");
  assert.equal(sizeLabel(20_480), "20 KB");
});
