# RTX Config Builder

YAMAHA RTXシリーズ（RTX830 / RTX1210 / RTX1220 / RTX1300）の設定ファイルを、画面の入力から作るWebアプリです。ビルド不要の静的ページで、ブラウザだけで動きます。

## できること

- 機種の選択（ポート構成が機種ごとに切り替わります）
- LAN（IPアドレス、DHCP）、WAN（PPPoE / 固定IP / DHCP）、NAT、ポート開放、スタティックルート
- VLAN（ポートで分ける / タグで分ける）
- VPN（拠点間IPsec、リモートアクセスL2TP/IPsec）
- 入力チェックと、configのリアルタイムプレビュー、コピー

## 始め方（VS Code）

1. このフォルダをVS Codeで開きます（`ファイル > フォルダーを開く`）。
2. 推奨拡張機能の案内が出たらインストールします（Live Server など）。
3. `index.html` を右クリックして `Open with Live Server`。または、ターミナルで `npm start` を実行し、`http://localhost:8080` を開きます。
4. テストは `npm test`（Node.js 20 以上）。

## 構成

| パス | 内容 |
| --- | --- |
| `index.html` | 画面の骨組み |
| `css/style.css` | スタイル（ライト/ダーク両対応） |
| `js/logic.js` | configの生成と入力チェック（画面に依存しない純粋なロジック） |
| `js/app.js` | 画面の動作（タブ、フォーム、プレビュー、コピー） |
| `tests/` | 生成ロジックのテスト（`node:test`） |
| `docs/DEVELOPMENT.md` | 開発メモ（設計、確認済みコマンド、機能の追加手順） |

## GitHub Pages で公開する

GitHub のリポジトリで `Settings > Pages` を開き、`Deploy from a branch`、ブランチ `main`、フォルダ `/ (root)` を選びます。

## 注意

- 生成したconfigは、実機に入れる前に検証環境で確認してください。
- コマンドはファームウェアのバージョンで差があります。確認できていない項目は `docs/DEVELOPMENT.md` にまとめています。
- 接続IDやパスワードは、ブラウザに保存しません。
