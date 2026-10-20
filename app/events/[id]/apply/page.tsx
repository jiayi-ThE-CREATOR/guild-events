import { redirect } from "next/navigation";

/**
 * 参加はイベントページの「参加する」ボタンだけになった（申請フォームは廃止）。
 * 古いリンクから来た人はイベントページへ送る
 */
export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/events/${id}`);
}
