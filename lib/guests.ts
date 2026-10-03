/**
 * 外部ゲスト。システムの中ではメンバー名の代わりに "guest:<id>" というキーで扱い、
 * 予定・不参加・カレンダー連携などのテーブルをメンバーと共用する。
 * 画面と Discord に出すときだけ「名前（ゲスト）」に置き換える。
 */
export const GUEST_PREFIX = "guest:";

export function guestKey(id: string): string {
  return `${GUEST_PREFIX}${id}`;
}

export function isGuestKey(key: string): boolean {
  return key.startsWith(GUEST_PREFIX);
}

export function guestLabel(name: string): string {
  return `${name}（ゲスト）`;
}

/** キーを表示名に。ラベルが無ければ（メンバーなら）そのまま */
export function labelOf(labels: Record<string, string>, key: string): string {
  return labels[key] ?? key;
}
