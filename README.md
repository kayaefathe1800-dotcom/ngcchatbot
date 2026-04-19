## 社長資料チャットボット

社内資料だけを根拠に回答する、日本語対応の Next.js チャットボットです。資料に記載がない内容は推測せず、`資料に記載がありません。` と返します。

### 主な機能

- LINE風のシンプルなチャットUI
- 会話履歴の表示
- `Enter` で送信、`Shift + Enter` で改行
- PDF / テキスト資料のアップロード
- 初期資料を `data/documents` から自動読み込み
- Vercel にそのままデプロイしやすい構成

### セットアップ

`.env.example` を参考に `.env.local` を作成し、OpenAI API キーを設定してください。

```bash
npm install
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開くと確認できます。

### Vercel デプロイ

1. GitHub にプッシュ
2. Vercel でリポジトリを読み込み
3. 環境変数 `OPENAI_API_KEY` を設定
4. 必要に応じて `OPENAI_MODEL` を設定

### 資料の置き場所

- 初期資料: `data/documents`
- 追加資料: 画面からアップロード

アップロード資料はブラウザセッション中に参照されます。永続化が必要な場合は、Vercel Blob やデータベース連携を追加してください。
