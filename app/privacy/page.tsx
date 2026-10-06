import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー | GUILD イベント",
};

/**
 * Google の OAuth 同意画面を「本番環境」に公開するには、この URL の登録が要る。
 * 内容はアプリの実際の動き（lib/server/・app/api/）と食い違わないように保つこと。
 */
export default function PrivacyPage() {
  const h2 = "text-ink mt-8 mb-2 text-base font-bold";
  const p = "text-ink text-sm leading-7";
  const ul = "text-ink list-disc space-y-1 pl-5 text-sm leading-7";

  return (
    <article className="px-4 pt-6 pb-10 md:mx-auto md:max-w-3xl md:px-0 md:pt-0">
      <h1 className="text-ink text-2xl font-bold">プライバシーポリシー</h1>
      <p className="text-ink-soft mt-1 text-xs">制定日：2026年9月25日・改定日：2026年10月6日</p>

      <p className={`${p} mt-5`}>
        GUILD イベント（以下「本サービス」）は、阪大 × 京大 AIコミュニティ「GUILD」の
        メンバーがイベントに申し込み、会議の日程を調整するためのサービスです。
        本サービスが扱う情報と、その使い方を以下に定めます。
      </p>

      <h2 className={h2}>1. 取得する情報</h2>
      <ul className={ul}>
        <li>イベントの申込時に入力されたお名前・大学・Discord 名・備考</li>
        <li>
          カレンダー連携（Google）をオンにした場合：Google アカウントのメールアドレス、
          カレンダーの一覧、各カレンダーの空き時間（予定がある時間帯のみ）
        </li>
        <li>
          カレンダー連携（iPhone）をオンにした場合：登録された公開カレンダーのリンク
        </li>
        <li>
          カレンダー連携（Lark）をオンにした場合：CalDAV のサーバー・ユーザー名・同期用パスワード
          （Lark で発行される同期専用のもので、Lark のログイン用パスワードではありません）
        </li>
        <li>
          外部ゲストとして招かれた場合：招待した人が入れたお名前。カレンダー連携・手動の予定は
          メンバーと同じ扱いで、その会議の日程調整にだけ使います（ゲストを外すと一緒に消えます）
        </li>
        <li>
          「毎週の予定」「この会議の予定」に手動で入れた場合：30 分ごとの予定あり／空いているの区別
          （予定の内容は入力しません）
        </li>
        <li>
          Google Meet をつないだ場合：Google アカウントのメールアドレス。要求する権限は
          「本サービスが作った Meet の会議室の作成・参照」のみで、主催する会議の Meet リンクを作るためだけに使います
        </li>
        <li>
          会議に資料を追加した場合：ファイル本体・ファイル名・大きさ・追加した人の名前
        </li>
        <li>
          マイページの「メール通知」にメールアドレスを入れた場合：そのメールアドレス
        </li>
      </ul>
      <p className={`${p} mt-2`}>
        Google カレンダーについては、予定の件名・場所・参加者・説明などの内容を取得しません。
        本サービスが要求する権限は「空き時間の参照」と「カレンダー一覧の参照」のみです。
        iPhone のカレンダーはリンクの仕様上、予定の内容を含むデータが届きますが、
        サーバー上で時間帯だけを取り出し、それ以外は保存せずに破棄します。
      </p>

      <h2 className={h2}>2. 利用目的</h2>
      <p className={p}>
        カレンダーから得た情報は、日程調整機能で「参加者全員（または 1 人を除く全員）が
        参加できる時間」を計算するためだけに使います。広告、分析、その他の目的には使いません。
      </p>
      <p className={`${p} mt-2`}>
        メールアドレス（マイページで入れたもの、またはカレンダー連携・Google Meet 連携で得たもの。Gmail を優先）は、
        参加する会議に資料が追加されたことを知らせるためだけに使います。通知はマイページでいつでも止められます。
      </p>

      <h2 className={h2}>3. 他のメンバーへの表示</h2>
      <p className={p}>
        会議ページ（メンバー向け）では、その会議の参加者について次のことを表示します。
        予定の件名・場所・説明などの中身は、どこにも表示しません。
      </p>
      <ul className={`${ul} mt-2`}>
        <li>候補の時間帯の 30 分ごとに、誰に予定があるか</li>
        <li>
          決まった日時に参加できる人・できない人と、その理由（予定あり・予定未登録・
          カレンダーを読み込めない・不参加）
        </li>
      </ul>
      <p className={`${p} mt-2`}>
        外部ゲストの招待ページには、時間帯と人数だけを表示し、メンバーの名前は表示しません。
        なお、会議ページはログインなしで開けるため、そのページの URL を知っている人は見ることができます。
      </p>

      <h2 className={h2}>4. 保存と管理</h2>
      <ul className={ul}>
        <li>
          Google の認証情報（リフレッシュトークン）、iPhone カレンダーのリンク、Lark の同期用の情報は、
          Supabase（東京リージョン）のデータベースに保存します。
          この保存先はブラウザからは読み書きできず、本サービスのサーバーからのみ参照します。
        </li>
        <li>
          外部カレンダーの空き時間は保存しません。計算のたびに取得し、計算後に破棄します。
          手動で入れた予定は、同じデータベースに保存し、本人が消すか会議が削除されるまで残ります。
        </li>
        <li>
          会議の資料は Supabase のストレージ（非公開）に保存します。ダウンロードのたびに
          短時間だけ有効なリンクを発行し、会議ページで「削除」されるまで残ります。
          会議ページと、その会議に招かれた外部ゲストの招待ページから見られます。
        </li>
      </ul>

      <h2 className={h2}>5. 第三者への提供</h2>
      <p className={p}>
        法令に基づく場合を除き、取得した情報を第三者に提供・販売しません。
      </p>

      <h2 className={h2}>6. 連携の解除と削除</h2>
      <ul className={ul}>
        <li>
          マイページの「カレンダー連携」でスイッチをオフにするか「解除」を押すと、保存している
          認証情報・リンクをデータベースから削除します。Google の場合は、あわせて
          Google アカウント側の許可も取り消します。
        </li>
        <li>
          Google 側の許可は、本サービスを使わずに{" "}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-navy underline"
            target="_blank"
            rel="noreferrer"
          >
            Google アカウントの「サードパーティ製のアプリとサービス」
          </a>{" "}
          からいつでも取り消せます。
        </li>
      </ul>

      <h2 className={h2}>7. Google API サービスのユーザーデータに関するポリシー</h2>
      <p className={p}>
        本サービスによる Google API から受け取った情報の使用および他のアプリへの転送は、
        限定使用の要件を含め、
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="text-navy underline"
          target="_blank"
          rel="noreferrer"
        >
          Google API サービスのユーザーデータに関するポリシー
        </a>
        に準拠します。
      </p>

      <h2 className={h2}>8. お問い合わせ</h2>
      <p className={p}>
        本ポリシーや情報の取り扱いについては、GUILD の Discord から運営までご連絡ください。
      </p>
    </article>
  );
}
