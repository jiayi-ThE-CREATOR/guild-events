/** 会議まわりで画面とサーバーが共有する値 */

/** 作成から何時間後に結果を発表するか（選べる値） */
export const MEETING_DEADLINE_HOURS = [6, 12, 24, 48, 72, 168];

export type MeetingStatus = "open" | "confirmed" | "failed";

export type MeetingSummary = {
  id: string;
  title: string;
  organizer: string;
  participants: string[];
  duration_min: number;
  deadline: string;
  status: MeetingStatus;
  confirmed_start: string | null;
  created_at: string;
};

export type ParticipantState = "connected" | "unconnected" | "unreadable" | "declined";

export function durationLabel(min: number): string {
  return min < 60 ? `${min}分` : min % 60 === 0 ? `${min / 60}時間` : `${Math.floor(min / 60)}時間${min % 60}分`;
}

export function hoursLabel(h: number): string {
  return h % 24 === 0 ? `${h / 24}日後` : `${h}時間後`;
}
