# Blog Proofreading Automation

WordPress で新規投稿した下書きや予約投稿を Google スプレッドシートへ自動反映し、シート上で校閲できるようにするプラグインです。

## フロー

1. WordPress で投稿を新規作成または更新する
2. 投稿が下書きまたは予約投稿なら、自動で Apps Script Webhook に送信される
3. Apps Script が Google スプレッドシートの行を追加または更新する
4. シート上で校閲ステータス、修正文、コメントを管理する

## 同期される項目

- `post_id`
- `site_name`
- `site_url`
- `post_status`
- `title`
- `slug`
- `excerpt`
- `content`
- `preview_url`
- `edit_url`
- `author`
- `categories`
- `tags`
- `updated_at`

## WordPress 側セットアップ

1. このフォルダを `wp-content/plugins/blog-proofreading-automation` に配置します
2. WordPress 管理画面でプラグインを有効化します
3. `設定 > Blog Proofreading` を開きます
4. Google Apps Script を Web アプリとして公開した URL を `Apps Script webhook URL` に設定します
5. 必要なら `Shared secret` を設定します

## Google スプレッドシート側セットアップ

1. Google スプレッドシートを新規作成します
2. 拡張機能 > Apps Script を開きます
3. [`apps-script/google-sheets-webhook.gs`](./apps-script/google-sheets-webhook.gs) の内容を貼り付けます
4. `SPREADSHEET_ID` と `SHARED_SECRET` を編集します
5. `Deploy > New deployment` から Web アプリとして公開します
6. 発行された URL を WordPress 側に設定します

## 推奨カラム

Apps Script は初回実行時に以下のヘッダーを自動で作成します。

- `post_id`
- `site_name`
- `title`
- `post_status`
- `author`
- `categories`
- `tags`
- `updated_at`
- `preview_url`
- `edit_url`
- `excerpt`
- `content`
- `proofreading_status`
- `reviewed_content`
- `review_comment`
- `last_received_at`

## 補足

- 同じ `post_id` があれば、シートの既存行を上書き更新します
- WordPress 側では下書きと予約投稿のみ同期対象です
- 公開済みの記事を同期したい場合は対象ステータスをプラグイン側で追加してください
