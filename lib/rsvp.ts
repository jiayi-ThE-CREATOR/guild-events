/**
 * 決まった会議の出欠に、あとからの参加登録（参加する／参加をやめる）を上書きする。
 * 副作用なしの純関数（tests/rsvp.test.ts）。
 */

export type Rsvp = { member_name: string; attending: boolean };

export function applyRsvps(
  participants: string[],
  attendees: string[],
  declined: string[],
  rsvps: Rsvp[],
): { participants: string[]; attendees: string[]; declined: string[] } {
  const yes = new Set(rsvps.filter((r) => r.attending).map((r) => r.member_name));
  const no = new Set(rsvps.filter((r) => !r.attending).map((r) => r.member_name));
  // 参加者に選ばれていなかった人は、登録した順に後ろへ足す
  const all = [...participants, ...rsvps.map((r) => r.member_name).filter((m) => !participants.includes(m))];
  return {
    participants: all,
    attendees: all.filter((m) => !no.has(m) && (yes.has(m) || attendees.includes(m))),
    declined: all.filter((m) => !yes.has(m) && (no.has(m) || declined.includes(m))),
  };
}
