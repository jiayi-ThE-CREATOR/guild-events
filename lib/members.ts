/**
 * GUILD メンバー一覧（Discord の表示名）。
 *
 * 認証を入れない設計なので、name がそのまま本人の識別子になる。
 * 自由入力だと表記ゆれで自分の申請を引けなくなるため、
 * 申請フォームとマイページの両方でこの一覧から選ばせる。
 *
 * メンバーが増減したらここだけ直せば両画面に反映される。
 * 並び順は Discord のメンバー一覧に合わせてあるだけなので、変えて構わない。
 */
export const MEMBERS = [
  "ゆうき",
  "仙入功樹",
  "王佳翌＿おう",
  "笠井翔洋",
  "Keita Komatsu",
  "Nao",
  "Yorito Shimada",
  "あき",
  "きむら",
  "しゅんや",
  "ゆうか",
  "冨山快治",
  "嶋田 千真",
  "木野本　輝",
  "清水崇仁郎",
] as const;

export function isMember(name: string): boolean {
  return (MEMBERS as readonly string[]).includes(name);
}
