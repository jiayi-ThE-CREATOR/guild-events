/**
 * メール通知の宛先選び（純関数。tests/notify-email.test.ts で確かめている）。
 *
 * - マイページで「通知用メール」を入れていれば、それを使う
 * - 無ければ、つないでいるカレンダーや Google Meet のラベルからメールアドレスを拾い、
 *   Gmail（@gmail.com / @googlemail.com）を優先する。Gmail が無ければ最初に見つかったもの
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** ラベル（「taro@gmail.com」「taro@example.com（仕事・個人）」など）の中のメールアドレス */
export function emailIn(label: string | null | undefined): string | null {
  const m = (label ?? "").match(EMAIL);
  return m ? m[0].toLowerCase() : null;
}

export function isValidEmail(s: string): boolean {
  return new RegExp(`^${EMAIL.source}$`).test(s.trim());
}

function isGmail(email: string): boolean {
  return /@(gmail|googlemail)\.com$/i.test(email);
}

export function pickEmail(labels: (string | null | undefined)[], override?: string | null): string | null {
  if (override && isValidEmail(override)) return override.trim().toLowerCase();
  const found = [...new Set(labels.map(emailIn).filter((e): e is string => !!e))];
  return found.find(isGmail) ?? found[0] ?? null;
}

/** 資料が追加されたときのメール（件名と本文）。link が無いのはゲスト宛て（招待リンクは送れない） */
export function filesMail(
  title: string,
  uploader: string,
  files: { name: string; size: number }[],
  link: string | null,
): { subject: string; text: string } {
  const lines = files.map((f) => `・${f.name}（${sizeLabel(f.size)}）`);
  return {
    subject: `【GUILD】「${title}」に資料が追加されました`,
    text: [
      `${uploader} さんが、会議「${title}」に資料を追加しました。`,
      "",
      ...lines,
      "",
      link ? `会議ページから見られます：\n${link}` : "招待リンクのページから見られます。",
      "",
      "――",
      "GUILD イベント（このメールは送信専用です）",
      link ? "通知の宛先や停止はマイページの「メール通知」で変えられます。" : null,
    ]
      .filter((l) => l !== null)
      .join("\n"),
  };
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
