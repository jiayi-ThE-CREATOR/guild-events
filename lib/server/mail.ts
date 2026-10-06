import nodemailer from "nodemailer";

/**
 * メール送信（Gmail の SMTP・アプリ パスワード）。
 * GMAIL_USER と GMAIL_APP_PASSWORD が無ければ何もしない。失敗しても呼び出し元は止めない。
 * 宛先どうしが見えないよう、全員を BCC にして 1 通で送る（Gmail は 1 日 500 通まで）。
 */

export function mailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export async function sendBcc(recipients: string[], subject: string, text: string): Promise<void> {
  if (!mailConfigured() || recipients.length === 0) return;
  const user = process.env.GMAIL_USER!;
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: process.env.GMAIL_APP_PASSWORD! },
  });
  try {
    await transport.sendMail({
      from: { name: "GUILD イベント", address: user },
      to: { name: "GUILD イベント", address: user },
      bcc: recipients,
      subject,
      text,
    });
  } catch (e) {
    console.error(`[mail] 送信に失敗: ${(e as Error).message}`);
  }
}
