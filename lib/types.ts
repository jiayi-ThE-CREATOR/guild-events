export const UNIVERSITIES = ["阪大", "京大", "その他"] as const;
export type University = (typeof UNIVERSITIES)[number];

/** events テーブル 1 行 */
export type EventRecord = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  /** ISO8601 */
  event_date: string;
  capacity: number | null;
};

/** 申請中 / キャンセル済み / 出席済。キャンセルは行を消さず status を変える */
export type ApplicationStatus = "applied" | "cancelled" | "attended";

/** applications テーブル 1 行 */
export type ApplicationRecord = {
  id: string;
  event_id: string;
  name: string;
  university: string;
  status: ApplicationStatus;
  discord: string | null;
  note: string | null;
  created_at: string;
};

/** 一覧・詳細で使う、申請数を添えたイベント */
export type EventWithCount = EventRecord & { applied: number };

/** マイページで使う、イベントを添えた申請 */
export type ApplicationWithEvent = ApplicationRecord & {
  event: EventRecord | null;
};

export type NewApplication = {
  event_id: string;
  name: string;
  university: University;
  discord: string | null;
  note: string | null;
};

/** イベント作成時の「場所」の区分。詳細と組み合わせて location 文字列を作る */
export const VENUES = ["阪大", "京大", "オンライン"] as const;
export type Venue = (typeof VENUES)[number];

export type NewEvent = {
  title: string;
  description: string | null;
  location: string | null;
  /** ISO8601 */
  event_date: string;
  capacity: number | null;
};
