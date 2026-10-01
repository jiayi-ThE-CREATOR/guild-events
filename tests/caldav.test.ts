import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarsFrom, decodeNumericRefs, hrefProp, hrefsWithoutData, icsTexts, normalizeServer, parseMultistatus } from "../lib/server/caldav.ts";

// 名前空間の接頭辞はサーバーごとに違う（D: / d: / 既定名前空間）ので混ぜておく
const principalXml = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response><D:href>/</D:href>
    <D:propstat><D:prop><D:current-user-principal><D:href>/principals/u1/</D:href></D:current-user-principal></D:prop>
    <D:status>HTTP/1.1 200 OK</D:status></D:propstat>
  </D:response>
</D:multistatus>`;

const homeXml = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <response><href>/principals/u1/</href>
    <propstat><prop><C:calendar-home-set><href>/calendars/u1/</href></C:calendar-home-set></prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
</multistatus>`;

const listXml = `<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response><d:href>/calendars/u1/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response><d:href>/calendars/u1/work/</d:href>
    <d:propstat><d:prop>
      <d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>
      <d:displayname>仕事</d:displayname>
      <cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set>
    </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response><d:href>/calendars/u1/tasks/</d:href>
    <d:propstat><d:prop>
      <d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>
      <cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set>
    </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response><d:href>/calendars/u1/plain/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
    <d:propstat><d:prop><d:displayname/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>
  </d:response>
</d:multistatus>`;

const reportXml = `<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response><d:href>/calendars/u1/work/a.ics</d:href>
    <d:propstat><d:prop><cal:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:a
SUMMARY:R&amp;D 会議
DTSTART:20261005T010000Z
DTEND:20261005T020000Z
END:VEVENT
END:VCALENDAR
</cal:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
</d:multistatus>`;

test("principal と calendar-home-set の href を読む（接頭辞の違いを吸収）", () => {
  assert.equal(hrefProp(parseMultistatus(principalXml), "current-user-principal"), "/principals/u1/");
  assert.equal(hrefProp(parseMultistatus(homeXml), "calendar-home-set"), "/calendars/u1/");
});

test("予定を入れられるカレンダーだけを挙げる（タスク専用・ただのフォルダは除く）", () => {
  assert.deepEqual(calendarsFrom(parseMultistatus(listXml)), [
    { href: "/calendars/u1/work/", name: "仕事" },
    { href: "/calendars/u1/plain/", name: "" },
  ]);
});

test("calendar-data の ICS を取り出す（XML の実体参照は戻す）", () => {
  const [ics] = icsTexts(parseMultistatus(reportXml));
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:R&D 会議/);
});

test("normalizeServer はホスト名だけでも https にし、http は localhost だけ許す", () => {
  assert.equal(normalizeServer("caldav.larksuite.com"), "https://caldav.larksuite.com/");
  assert.equal(normalizeServer("https://caldav.larksuite.com/dav"), "https://caldav.larksuite.com/dav");
  assert.equal(normalizeServer("http://example.com"), null);
  assert.equal(normalizeServer("http://localhost:5232/"), "http://localhost:5232/");
  assert.equal(normalizeServer(""), null);
});

// Lark の実際の返し方（2026-10-01）：calendar-query は本文 404、multiget は改行を数値参照で返す
const larkQueryXml = `<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response><D:href>/u/cal/e1</D:href><D:propstat><D:prop><C:calendar-data/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat></D:response>
  <D:response><D:href>/u/cal/e1</D:href><D:propstat><D:prop><C:calendar-data/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat></D:response>
  <D:response><D:href>/u/cal/e2</D:href><D:propstat><D:prop><C:calendar-data/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat></D:response>
</D:multistatus>`;
const larkMultigetXml = `<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:response><D:href>/u/cal/e1</D:href><D:propstat><D:prop><C:calendar-data>BEGIN:VCALENDAR&#xD;&#xA;PRODID:&#39;-//ByteDance Inc// Calendar&#xD;&#xA;BEGIN:VEVENT&#xD;&#xA;UID:e1&#xD;&#xA;DTSTART:20261005T010000Z&#xD;&#xA;DTEND:20261005T020000Z&#xD;&#xA;END:VEVENT&#xD;&#xA;END:VCALENDAR&#xD;&#xA;</C:calendar-data></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`;

test("本文を返さなかった予定の href を重複なしで挙げる（Lark の calendar-query）", () => {
  const responses = parseMultistatus(larkQueryXml);
  assert.deepEqual(icsTexts(responses), []);
  assert.deepEqual(hrefsWithoutData(responses), ["/u/cal/e1", "/u/cal/e2"]);
});

test("数値参照の改行を戻して ICS として読める（Lark の multiget）", () => {
  const [ics] = icsTexts(parseMultistatus(larkMultigetXml));
  assert.match(ics, /\r\nBEGIN:VEVENT\r\n/);
  assert.match(ics, /PRODID:'-\/\/ByteDance/);
  assert.equal(decodeNumericRefs("a&#10;b&#x41;"), "a\nbA");
});
