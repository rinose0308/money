# 我が家マネー

夫婦2人で共有する家計簿・資産管理アプリ。
ビルド不要の静的HTML + Supabase で動作。Vercel に無料デプロイ。

## 構成

```
money/
├── index.html          ログイン (Magic Link)
├── onboarding.html     初回設定 (世帯作成 or 参加)
├── dashboard.html      ダッシュボード
├── assets.html         資産管理 (Phase 2)
├── transactions.html   支出明細 (Phase 4)
├── import.html         CSV取り込み (Phase 2/4)
├── settings.html       設定 (招待コード表示)
├── js/
│   ├── config.js       Supabase接続情報
│   ├── supabase.js     Supabaseクライアント + 認証ヘルパー
│   ├── nav.js          共通ナビゲーション
│   └── utils.js        フォーマッタ・toast
├── css/styles.css      スタイル
├── supabase/migrations/0001_initial.sql   DBスキーマ
└── vercel.json         デプロイ設定
```

---

## セットアップ手順

### 1. Supabase でDBスキーマを実行

1. https://supabase.com/dashboard で対象プロジェクトを開く
2. 左メニュー **SQL Editor** → **New query**
3. `supabase/migrations/0001_initial.sql` の中身をコピーして貼り付け
4. **Run** をクリック → 「Success. No rows returned」が出ればOK
5. 左メニュー **Table Editor** で7テーブル(households, profiles, accounts, asset_snapshots, transactions, incomes, category_rules) が作成されていることを確認

### 2. Supabase Auth の設定

1. 左メニュー **Authentication** → **URL Configuration**
2. **Site URL** に以下を設定:
   - ローカル動作確認: `http://localhost:3000`
   - 本番: `https://YOUR-VERCEL-DOMAIN.vercel.app`
3. **Redirect URLs** に上記2つを追加(両方併記OK)
4. **Save**

### 3. Vercel にデプロイ

1. このリポジトリ (`rinose0308/money`) を Vercel に Import
2. Framework Preset: **Other** を選択 (静的サイト)
3. Build/Output 設定はデフォルトでOK (ビルドなし)
4. Deploy
5. デプロイ後の URL を控えて、Supabase Auth の URL Configuration に追加(2-2参照)

### 4. ローカルで動作確認 (任意)

```bash
# Python (Windowsなら標準で入っている)
cd money
python -m http.server 3000
# → http://localhost:3000 を開く
```

または Node.js:
```bash
npx serve -p 3000
```

> 注: `file://` で開くと ES Modules が動きません。必ずローカルサーバー経由で開いてください。

---

## 使い方

### 初回 (夫または妻のどちらか先に登録)

1. `/index.html` を開く
2. メールアドレス入力 → ログインリンクをメール送信
3. メール内のリンクをクリック
4. `/onboarding.html` で「新しく世帯を作る」を選択 → 表示名・世帯名を入力
5. `/dashboard.html` に遷移 → `/settings.html` で **招待コード** を確認

### 配偶者の招待

1. 配偶者に **招待コード(8文字)** を伝える
2. 配偶者が `/index.html` でメール入力 → ログイン
3. `/onboarding.html` で「配偶者の世帯に参加する」を選択 → 招待コードを入力
4. 同じデータが共有される状態に

---

## Phase 1 完了チェックリスト

- [x] Next.js → 静的HTMLに変更 (ビルドなしの軽量構成)
- [x] Supabase クライアントセットアップ
- [x] DBマイグレーション (全テーブル + RLS)
- [x] Magic Link ログイン
- [x] 認証ガード (未ログイン → /index.html, profile未作成 → /onboarding.html)
- [x] 世帯作成 / 招待コードで参加
- [x] ダッシュボードのレイアウト枠 (4枚のメトリクスカード + 空のチャート)
- [x] レスポンシブ対応 (スマホ1カラム / タブレット2カラム / PC4カラム)
- [x] 設定画面で招待コード表示

## Phase 2 (これから) 予定

- 口座マスタ管理 (CRUD)
- 月次残高入力フォーム
- 過去CSV (`我が家マネー - シート1.csv`) の取り込み
- ダッシュボードの資産推移チャート実データ表示
- 総資産・前月比メトリクス実装

---

## 技術メモ

- 認証: Supabase Auth Magic Link (パスワード不要)
- アクセス制御: PostgreSQL Row Level Security (RLS)
- フロントエンド: 素のHTML + ES Modules (ビルドなし)
- ライブラリ: Chart.js (CDN), Supabase JS (esm.sh)
- 金額: bigint で保存、JS側でも整数として扱う (浮動小数点誤差回避)
- 日付: ISO `YYYY-MM-DD` 文字列で統一

## トラブルシューティング

**Q. ログインリンクが届かない**
A. Supabase の Email Templates / SMTP 設定を確認。デフォルトでは Supabase 提供のメール(送信元 `noreply@mail.app.supabase.io`)が使われます。スパムフォルダもチェック。

**Q. ログインリンクをクリックしても元のページに戻る**
A. Supabase Auth の **Redirect URLs** にデプロイ先 URL が追加されているか確認。

**Q. `permission denied for table` エラー**
A. SQL マイグレーションが完全に実行されたか確認。RLS ポリシーが全テーブルに作成されている必要があります。
