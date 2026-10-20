export const UNIVERSITIES = ["阪大", "京大", "その他"] as const;
export type University = (typeof UNIVERSITIES)[number];

/** events テーブル 1 行 */
export type EventRecord = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  /** 地図で探せる住所（016）。画面では Google マップへのリンク。無ければ null */
  address?: string | null;
  /** ISO8601 */
  event_date: string;
  capacity: number | null;
  /**
   * fixed＝日時が決まっている / scheduling＝日程調整中（event_date は仮）/ failed＝そろう時間が無かった（015）。
   * 015 より前のデータ・モックでは無いので、無ければ fixed とみなす（isScheduled）
   */
  date_status?: "fixed" | "scheduling" | "failed";
  /** 日程調整中の結果発表の時刻 */
  schedule_deadline?: string | null;
};

/** 日時が決まっているイベントか（日程調整中・不成立でない） */
export function isScheduled(e: Pick<EventRecord, "date_status">): boolean {
  return (e.date_status ?? "fixed") === "fixed";
}

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
export const VENUES = ["阪大", "京大", "オンライン", "その他"] as const;
export type Venue = (typeof VENUES)[number];

export type NewEvent = {
  title: string;
  description: string | null;
  location: string | null;
  address: string | null;
  /** ISO8601 */
  event_date: string;
  capacity: number | null;
};
