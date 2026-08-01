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

大学フィルタ（すべて / 阪大 / 京大 / オンライン）と申請者数バーは、
一覧 UI を成立させるための表示であり、定員到達での締切処理は入れていない。

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
```

## 設計上の割り切り

- **認証は入れない。** 資料の設計どおり「名前＋大学」で本人を識別する。
  初回申請時の入力を localStorage に覚え、マイページはそれで自分の申請を引く。
  記録が無い端末では名前で検索する（同姓同名は区別できない）。
- **RLS は全開放。** `schema.sql` のポリシーは誰でも読み書きできる。
  本番サービスでは NG（他人の申請を消せてしまう）。ログインと組み合わせて絞るのが本来の姿。
- **一覧は開催予定のイベントのみ。** 終了したイベントはマイページの「参加済み」でだけ見える。

## 資料の設計から変えた点

- `applications` に任意カラム `discord` / `note` を 2 本追加した。
  申請フォームに「Discord名」「ひとこと」があり、入力を保存する先が必要だったため。
- イベントの終了時刻とカバー画像は列を持たないので、詳細画面では開始時刻のみを表示し、
  カバーは装飾（ストライプ）にしている。
- 大学タグ（阪大 / 京大 / オンライン）は列を追加せず `location` の文字列から導出している
  （`lib/format.ts` の `campusOf`）。
