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

- **イベント作成** — 一覧ヘッダーの `＋` から `/events/new`。
  場所は「阪大 / 京大 / オンライン」＋詳細の2段で入力し、`composeLocation` が
  `大阪大学 豊中キャンパス B203` のような文字列に組み立てる。
  認証が無いので誰でも作れる（`events` に insert ポリシーが必要）

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

1. supabase.com でプロジェクトを作る（Region は Northeast Asia (Tokyo)）
2. SQL Editor で [`supabase/schema.sql`](supabase/schema.sql) を上から実行する
   （テーブル作成 → RLS → サンプルデータまで 1 ファイルで完結）
3. Project Settings → API Keys から **Project URL** と **Publishable key（anon key）** をコピー
   ※ secret / service_role key は絶対に使わない
4. `.env.local.example` を `.env.local` にコピーして 2 つの値を貼る
5. `npm run dev` を再起動

2 つの環境変数がそろった時点で、アプリは自動的にモックから本番 DB に切り替わる。
画面側のコードは一切変更しなくてよい（`lib/data.ts` が両方を吸収している）。

Vercel にデプロイする場合は、同じ 2 つを Environment Variables に登録する。
入れ忘れたまま Deploy するとデータが表示されないので、後から追加したら Redeploy する。

## 構成

```
app/
  page.tsx                    01 イベント一覧（大学フィルタ）
  events/[id]/page.tsx        02 イベント詳細
  events/[id]/apply/page.tsx  03 参加申請フォーム
  mypage/page.tsx             04 マイページ（申込中 / 参加済み）
components/
  BottomNav.tsx               下部タブ（イベント / マイページ）
  EventCard.tsx               一覧カード
  Badge.tsx                   大学・受付状況のバッジ
  PageHeader.tsx              「← タイトル」ヘッダー
lib/
  data.ts                     DB を触る唯一の入口（Supabase ↔ モックを吸収）
  supabase.ts                 クライアント生成と設定判定
  mockStore.ts / mockData.ts  Supabase 未設定時の保存先
  profile.ts                  この端末の「名前＋大学」（認証の代わり）
  format.ts                   日付整形・location から大学タグを導く
supabase/schema.sql           テーブル / RLS / サンプルデータ
supabase/migrations/          既に schema.sql を流した DB に後から当てる差分
```

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
- 自動テストが無い

## 資料の設計から変えた点

- `applications` に任意カラム `discord` / `note` を 2 本追加した。
  申請フォームに「Discord名」「ひとこと」があり、入力を保存する先が必要だったため。
- イベントの終了時刻とカバー画像は列を持たないので、詳細画面では開始時刻のみを表示し、
  カバーは装飾（ストライプ）にしている。
- 大学タグ（阪大 / 京大 / オンライン）は列を追加せず `location` の文字列から導出している
  （`lib/format.ts` の `campusOf`）。
