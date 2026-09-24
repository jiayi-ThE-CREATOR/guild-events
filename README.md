# GUILD イベント管理運営システム

阪大 × 京大 AIコミュニティ「GUILD」のイベント申込アプリ。
GUILD勉強会ハンズオン資料（2026-08-01）のクライアント依頼を、
情報設計3案のうち **案1a「定番タブ型」** の UI で実装したもの。

Next.js 16（App Router / TypeScript）＋ Tailwind CSS v4 ＋ Supabase。

## MVP の 5 機能

| # | 機能 | 画面 |
|---|------|------|
| 1 | イベント一覧を見る | `/` |
| 2 | イベント詳細を見る | `/events/[id]` |
| 3 | 参加申請する | `/events/[id]/apply` |
| 4 | 申請をキャンセルする | `/mypage` |
| 5 | 自分の申込状況を見る | `/mypage` |

大学の区分は **阪大（青）／京大（赤）の2つだけ**。オンラインは区分を設けず、
イベント作成時の「場所」で表す（`lib/format.ts` の `campusOf` が location から判定し、
どちらでもなければバッジを出さない）。

MVP に加えて入れているもの：

- **イベントの作成・編集・削除** — 一覧ヘッダーの `＋` から `/events/new`、
  詳細の「運営メニュー」から編集・削除。作成と編集はフォームを共用（`EventForm`）。
  削除すると `ON DELETE CASCADE` でそのイベントの申請も消える。
  場所は「阪大 / 京大 / オンライン」＋詳細の2段で入力し、`composeLocation` が
  `大阪大学 豊中キャンパス B203` のような文字列に組み立てる（編集時は `parseLocation` で戻す）。
  `lib/members.ts` の `ORGANIZERS` に載っている名前でこの端末に登録されている場合だけ表示される。
  ただし表示制御にすぎず、API を直接叩けば誰でも操作できる。
  `events` に insert / update / delete のポリシーが必要（`migrations/002`, `003`）

- **これから／もう終わったイベントのタブ** — 開催日が今日より前なら「終了」。
  終了したイベントは詳細でも申請導線を出さない
- **参加者一覧** — 詳細画面に申請者を申請順で表示（キャンセル済みは除く）
- **カレンダー連携** — 申請済みの人に iCal / Outlook / Google の導線を出す。
  `events` に終了時刻の列が無いので、`lib/calendar.ts` の
  `DEFAULT_DURATION_HOURS`（既定2時間）を足した時刻で登録される

マイページは名前を選んだ時点でこの端末に登録される。申請が1件も無くても登録でき、
その場合は所属が不明なので名前だけを表示する。

## スマホと PC で UI を切り替える

同じ URL・同じ機能のまま、768px（Tailwind の `md`）を境にシェルを差し替えている。

| | スマホ（〜767px） | PC（768px〜） |
|---|---|---|
| ナビ | 画面下の固定タブ（`BottomNav`） | 上部ヘッダー（`SiteHeader`） |
| 全体 | 幅430px の白いカード1枚 | 背景の上に最大1080px の作業領域 |
| 一覧 | 1列 | 2列（1280px 以上で3列） |
| 詳細 | 縦積み | 最大768px の読みやすい幅・カバー拡大 |
| 申請フォーム | 全画面 | 最大576px の白いカード |
| マイページ | 1列 | 申込中は2列グリッド |

## 動かす

```bash
npm install
npm run dev     # http://localhost:3000
```

`.env.local` が無い状態でも **モックデータ＋ localStorage** で全機能が動く。
DB を用意せずに UI を触れるので、まずはこのまま起動してよい。

## Supabase につなぐ

このアプリが Supabase に対して使う値は 3 つある。どれをどこに置くかを間違えると、
動かないか、最悪は他人のデータが読めるようになるので、まず役割を押さえる。

| 値 | 形 | 何に使う | 置き場所 |
|---|---|---|---|
| Project URL | `https://xxxx.supabase.co` | DB の住所 | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key（旧 anon key） | `sb_publishable_…`（旧形式は `eyJ…`） | ブラウザから DB を読み書きする。RLS のポリシーの範囲でしか触れない | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret key（旧 service_role key） | `sb_secret_…`（旧形式は `eyJ…`） | サーバーから RLS を越えて触る。日程調整のカレンダー連携だけが使う | `SUPABASE_SECRET_KEY` |

`NEXT_PUBLIC_` で始まる変数は**ビルド時にブラウザ向けの JS に埋め込まれる**。
Secret key を `NEXT_PUBLIC_` 付きの変数に入れると、サイトを開いた人全員に配られ、
`calendar_sources`（各自のカレンダーの鍵）まで読めてしまう。Secret key は必ず
`SUPABASE_SECRET_KEY` という名前（`NEXT_PUBLIC_` なし）で置く。

### A. プロジェクトを新しく作る場合

1. [supabase.com](https://supabase.com) にログイン → **New project**
   - Organization：自分の個人 Organization でよい
   - Name：`guild-events` など
   - Database Password：自動生成でよい（このアプリは使わない。控えだけ取っておく）
   - Region：**Northeast Asia (Tokyo)**（遅延が一番小さい）
   - 作成に 1〜2 分かかる。ダッシュボードが開くまで待つ
2. 左メニュー **SQL Editor** → **New query** に
   [`supabase/schema.sql`](supabase/schema.sql) の中身を全部貼って **Run**
   - テーブル作成 → 二重申請・定員の制約 → RLS → サンプルデータまで 1 回で入る
   - 下に `Success. No rows returned` と出れば成功
   - `already exists` が出たら、既に一度流している。B の手順へ
3. 同じく SQL Editor で
   [`supabase/migrations/004_calendar_sources.sql`](supabase/migrations/004_calendar_sources.sql) を Run
   （日程調整を使うときだけ。`schema.sql` には入れていない）。
   001〜003 は `schema.sql` に含まれているので流さなくてよい
4. 左メニュー **Table Editor** に `events` / `applications`（と `calendar_sources`）が出ていれば DB 側は完了

### B. 既にあるプロジェクトに後から足す場合

`schema.sql` は流し直さない（テーブルが既にあるのでエラーになる）。
代わりに `supabase/migrations/` の SQL を**番号順に**、まだ流していないものだけ Run する。

| ファイル | 中身 | 流したかの見分け方 |
|---|---|---|
| `001_fix_capacity_trigger.sql` | 定員トリガーを同時申請でも超えない形に直す | Database → Functions の `applications_capacity_guard` が security definer か |
| `002_allow_event_create.sql` | アプリからイベントを作れるようにする | Authentication → Policies の `events` に `insert_events` があるか |
| `003_allow_event_edit_delete.sql` | 編集・削除できるようにする | 同じく `update_events` / `delete_events` があるか |
| `004_calendar_sources.sql` | 日程調整のカレンダー連携の保存先 | Table Editor に `calendar_sources` があるか |

どれも何度流しても安全に作ってあるので、迷ったら全部流してよい。

### キーを取ってくる

ダッシュボード左下の歯車 **Project Settings** から：

- **Project URL** — **Data API** の画面（または画面上部の **Connect** ボタン）にある
  `https://xxxx.supabase.co`
- **Publishable key** — **API Keys** の画面。`sb_publishable_…` をコピー。
  新しい形式のキーが無いプロジェクトでは **Legacy API keys** タブの `anon` `public` を使う（中身は同じ役割）
- **Secret key** — 同じ **API Keys** の画面。`sb_secret_…` の行で **Reveal** を押してコピー。
  Legacy の場合は `service_role` `secret`。
  **チャット・Discord・スクショに貼らない。** 漏れたら同じ画面で作り直し（古いキーを削除）、
  Vercel と `.env.local` の値を差し替える

### 手元（`npm run dev`）で使う

1. `.env.local.example` をコピーして `.env.local` を作る

   ```bash
   cp .env.local.example .env.local
   ```

2. `.env.local` を開いて値を貼る。`=` の前後にスペースや引用符を入れない

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx
   # 日程調整を使うときだけ
   SUPABASE_SECRET_KEY=sb_secret_xxxxxxxx
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
   ```

3. `npm run dev` を**止めてから起動し直す**（環境変数は起動時にしか読まれない）

`.env.local` は `.gitignore` 済みなので commit されない。

`NEXT_PUBLIC_` の 2 つがそろった時点で、アプリは自動的にモックから本番 DB に切り替わる。
画面側のコードは一切変更しなくてよい（`lib/data.ts` が両方を吸収している）。
逆に片方でも欠けていると、エラーも出さずにモック（この端末の localStorage）で動くので、
「申請したのに他の端末から見えない」ときはまずここを疑う。

### Vercel（本番）で使う

1. Vercel のダッシュボード → `guild-events` プロジェクト → **Settings** → **Environment Variables**
2. 上の表の変数を 1 つずつ **Add**。Environments は **Production / Preview / Development すべて** にチェック
   - Secret key と Google の 2 つは **Sensitive** をオンにしておく（登録後に画面で中身が見えなくなる）
3. **Deployments** → 一番上のデプロイの `…` → **Redeploy**
   - 環境変数は**デプロイした時点の値**が使われる。追加・変更しただけでは今動いているサイトに反映されない
   - 特に `NEXT_PUBLIC_` の 2 つはビルド時に JS に埋め込まれるので、Redeploy しないと絶対に変わらない

### つながったかの確かめ方

| 確かめること | 期待する結果 |
|---|---|
| イベント一覧を開く | `schema.sql` のサンプルイベントが出る（モックのときと同じ内容なので、Table Editor で 1 件タイトルを変えてから見ると確実） |
| 別の端末（スマホなど）で申請 → PC のイベント詳細の参加者一覧 | その申請が見える（モックだと端末ごとに別れて見えない） |
| `/schedule` を開く | 「カレンダー連携はまだ設定されていません」が**出ない**（出るなら `SUPABASE_SECRET_KEY` が読めていない） |

### よくあるつまずき

| 症状 | 原因と直し方 |
|---|---|
| 一覧が空・申請が他の端末から見えない | `NEXT_PUBLIC_` の 2 つのどちらかが欠けてモックで動いている。値を確認して dev を再起動／Vercel なら Redeploy |
| 「読み込みに失敗しました」 | URL の打ち間違い、またはプロジェクトが一時停止中（無料プランは 1 週間アクセスが無いと止まる。ダッシュボードの **Restore** で戻る） |
| `relation "events" does not exist` | `schema.sql` をまだ流していない |
| 作成・編集・削除だけ失敗する | 002・003 を流していない（B の表を参照） |
| `/schedule` が「まだ設定されていません」のまま | `SUPABASE_SECRET_KEY` の名前違い（`NEXT_PUBLIC_` を付けた等）、または Redeploy 忘れ |
| `relation "calendar_sources" does not exist` | 004 を流していない |

## 構成

```
app/
  page.tsx                    01 イベント一覧（大学フィルタ）
  events/[id]/page.tsx        02 イベント詳細
  events/[id]/apply/page.tsx  03 参加申請フォーム
  mypage/page.tsx             04 マイページ（申込中 / 参加済み / カレンダー連携）
  schedule/page.tsx           05 日程調整（空いている時間を探す）
  api/calendar/…              カレンダー連携の登録・解除・Google の同意画面の往復
  api/schedule/…              連携済みメンバー一覧・空き時間の検索
components/
  BottomNav.tsx               下部タブ（イベント / マイページ）
  EventCard.tsx               一覧カード
  Badge.tsx                   大学・受付状況のバッジ
  PageHeader.tsx              「← タイトル」ヘッダー
  CalendarConnections.tsx     マイページのカレンダー連携スイッチ
lib/
  data.ts                     DB を触る唯一の入口（Supabase ↔ モックを吸収）
  supabase.ts                 クライアント生成と設定判定
  mockStore.ts / mockData.ts  Supabase 未設定時の保存先
  profile.ts                  この端末の「名前＋大学」（認証の代わり）
  format.ts                   日付整形・location から大学タグを導く
  slots.ts                    空き時間探し（純関数）
  ics.ts                      ICS から埋まっている時間を取り出す（純関数）
  server/                     サーバー専用（secret key・Google・ICS の取得）
supabase/schema.sql           テーブル / RLS / サンプルデータ
supabase/migrations/          既に schema.sql を流した DB に後から当てる差分
tests/                        npm test（node --test）
```

## 日程調整（カレンダー連携）

各自のカレンダーを読んで、全員が参加できる会議の時間を探す機能。誰でも使える。

- **マイページ** — 「カレンダー連携」でサービスごとのスイッチをオンにする（複数オン可）。
  Google はスイッチを押すと同意画面へ飛ぶ。iPhone は iCloud の公開カレンダーの
  リンク（`webcal://…`）を貼る。Microsoft は準備中
- **`/schedule`** — 参加者・期間・長さ・時間帯を選んで探す。
  全員そろう時間が無ければ、1 人欠け（A-1 人）の時間を出す。それも無ければ「見つからない」

**予定の中身は誰にも見えない。** Google は「空き時間」と「カレンダー一覧」の scope だけを取り、
件名や場所は API から最初から返ってこない。iPhone の ICS は件名ごと届くが、サーバーで
時間だけ取り出して捨てる。検索結果は時間帯と人数だけで、誰が埋まっているかは返さない
（読み込めなかった人の名前だけは、連携し直してもらうために出す）。

token とリンクは `calendar_sources` テーブルに入る。RLS を有効にしてポリシーを 1 つも
作っていないので、ブラウザ（anon key）からは読めず、`app/api/` の Route Handler が
secret key で接続したときだけ触れる。

数え方の決まり（`lib/ics.ts` / `lib/server/google.ts`）：

- 終日予定・「予定なし」にした予定・キャンセル済みは埋まっている扱いにしない
- Google は自分のカレンダーと URL で取り込んだカレンダーだけ数え、他人の購読・祝日は数えない
- 時刻はすべて日本時間。タイムゾーンの無い ICS の時刻も日本時間とみなす
- 1 人でもカレンダーを読めなければ検索を止める（その人を無視した結果を出さないため）

### 有効にする手順（初回だけ）

1. Supabase の SQL Editor で [`supabase/migrations/004_calendar_sources.sql`](supabase/migrations/004_calendar_sources.sql) を実行
2. Google Cloud Console でプロジェクトを作り、Google Calendar API を有効にする
3. OAuth 同意画面：User Type は「外部」、scope は `calendar.freebusy` と
   `calendar.calendarlist.readonly`（どちらも非機密なので審査は不要）。
   公開ステータスは **「本番環境」にする**（テストのままだと 7 日で連携が切れる）
4. 認証情報 → OAuth クライアント ID（ウェブアプリケーション）。承認済みリダイレクト URI に
   `https://<本番ドメイン>/api/calendar/google/callback` と
   `http://localhost:3000/api/calendar/google/callback` を登録
5. Vercel の Environment Variables（と `.env.local`）に 3 つ足して Redeploy：
   `SUPABASE_SECRET_KEY`（Supabase の Project Settings → API Keys の secret key）、
   `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`

未設定のあいだは、画面に「カレンダー連携はまだ設定されていません」と出るだけで他の機能は動く。

## 申請のルール

`status` は `applied`（申請中）/ `cancelled`（キャンセル済み）/ `attended`（出席済）の3つ。
**キャンセルは行を削除せず `cancelled` に変える。** 運営に履歴が残り、席も戻る。

| ルール | アプリ側 | DB 側（最後の砦） |
|---|---|---|
| 同じイベントに同じ名前は1件まで | 申請前に検査してエラー表示 | `applications_one_per_person`（cancelled は除くので再申請は可） |
| 定員を超えて申請できない | 満席ならボタンを「満席」に置換 | `applications_capacity_guard` トリガー（events 行をロックして数えるので同時申請でも超えない） |

アプリ側の検査は「押す前に気づかせる」ためのもので、同時申請の競合は DB 側で止める。

## 運営がやること

参加者向けの画面しか無いので、運営作業は Supabase の SQL Editor / Table Editor で行う。
そのままコピペできる SQL を [`supabase/schema.sql`](supabase/schema.sql) の末尾に置いてある。

- **イベントの追加・編集** — Table Editor の `events` → Insert row
- **出席をとる** — 該当イベントの `applied` を `attended` に更新する。
  マイページの「参加済み」はこの値を見ているので、更新するまでは空のまま
- **申請者一覧・大学別の集計** — 末尾の select 文をそのまま実行

## 設計上の割り切り

- **認証は入れない。** 資料の設計どおり「名前＋大学」で本人を識別する。
  初回申請時の入力を localStorage に覚え、マイページはそれで自分の申請を引く。
  記録が無い端末では名前で検索する（**同姓同名は同一人物として扱われる**）。
- **RLS は全開放。** `schema.sql` のポリシーは誰でも読み書きできる。
  本番サービスでは NG（他人の申請をキャンセルできてしまう）。ログインと組み合わせて絞るのが本来の姿。
- **終了の判定は開催日だけで行う。** 開始時刻や終了時刻は見ておらず、開催日が今日より前なら終了扱い。
  当日は一日中「これから」に残る。

## 既知の未対応

- 入力欄にフォーカスリングが無い（枠線の色が変わるのみ）
- 一覧の申請者数を `applications` の行を引いて数えている。
  Supabase の既定の行数上限（1000行）を超えると件数がずれる
- `npm audit` の high 3件は Next 16.2.12 が抱える postcss / sharp 由来。
  `audit fix --force` は next@9 まで落とすので上流の更新待ち
- 自動テストは日程調整の純関数（`lib/slots.ts` / `lib/ics.ts`）だけ。`npm test` で走る

## 資料の設計から変えた点

- `applications` に任意カラム `discord` / `note` を 2 本追加した。
  申請フォームに「Discord名」「ひとこと」があり、入力を保存する先が必要だったため。
- イベントの終了時刻とカバー画像は列を持たないので、詳細画面では開始時刻のみを表示し、
  カバーは装飾（ストライプ）にしている。
- 大学タグ（阪大 / 京大 / オンライン）は列を追加せず `location` の文字列から導出している
  （`lib/format.ts` の `campusOf`）。
