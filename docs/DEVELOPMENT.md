# 開発メモ

## 設計

- `js/logic.js` の `build(state, { mask })` が、入力の状態から `{ lines, issues, errors, warns }` を返します。DOMには触りません。
- `lines` は `{ k, t }` の配列です。`k` は `n`（通常）、`c`（コメント）、`h`（見出し行）、`s`（インデント付きのサブコマンド）。
- `issues` は `{ sev: 'error' | 'warn', tab, msg }` です。`tab` は画面のタブID（`model` `lan` `vlan` `wan` `forward` `route` `vpn` `admin`）で、画面のバッジと一覧に使います。
- 空のセクション見出しは、`build` の最後で取り除きます。
- `js/app.js` は状態 `S` を持ち、入力のたびに `refresh()` で再描画します。
- パスワード、事前共有鍵、接続IDは `localStorage` に保存しません（`save()` で除外）。

## 機能を足す手順

1. `js/logic.js` の `defaults()` に状態を足します。
2. `build()` にコマンド生成と入力チェックを足します。エラーは `E(tab, msg)`、注意は `W(tab, msg)`。
3. `index.html` に入力欄を足します（`data-k` は状態のキー、`data-when="key=value"` で表示を切り替え）。
4. 一覧形式の入力は `data-list` の行にして、`js/app.js` の `renderLists()` と追加ボタンを足します。
5. `tests/generate.test.js` にテストを足します。
6. `npm test` を実行します。

## 公式資料で書式を確認できたコマンド

- 拠点間IPsec（`tunnel select`、`ipsec tunnel`、`ipsec sa policy`、`ipsec ike ...`、`ip route ... gateway tunnel N`、`ipsec auto refresh on`）
- L2TP/IPsec（`tunnel encapsulation l2tp`、`l2tp tunnel auth off`、`l2tp keepalive use on`、`pp select anonymous`、`pp bind tunnelN-tunnelM`、`pp auth request mschap-v2`、`ip pp remote address pool`、`ipsec transport`、`l2tp service on l2tp`）
- ポート開放（`nat descriptor masquerade static`、`outer=inner` の書式）
- VLAN（`lan type ... port-based-option=divide-network`、`vlan port mapping`、`vlan lanN/M 802.1q vid=`、`lan flexible-port`、`dns host`）

## 確認できていない項目（実機・コマンドリファレンスで要確認）

- `ipsec ike group ... modp2048`
- `ip tunnel tcp mss limit auto`
- `ip lan1 proxyarp on`
- 分割したLANでの `dns host vlan1 vlan2` の書き方
- RTX830 / RTX1210 / RTX1220 で、LAN分割の反映に再起動が必要か

## 参考にした資料

- YAMAHA RTシリーズ コマンドリファレンス（`vlan port mapping`、`lan type`、`vlan interface 802.1q`、`dns host`、`nat descriptor masquerade static`）
  https://www.rtpro.yamaha.co.jp/RT/manual/
- YAMAHA フレキシブルLAN/WANポート（`lan flexible-port`）
  https://www.rtpro.yamaha.co.jp/RT/docs/flexible-lan/index.html
- 拠点間IPsecの設定例（RTX1210）
  https://www.allied-telesis.co.jp/support/list/awp/rel/5.4.9-1.1/613-002735_C/docs/overview-263.html
- L2TP/IPsecの設定例
  https://qiita.com/mayo00/items/9cd9d5b8b5871b00bcd4
  https://www.nedia.ne.jp/2019/05
- タグVLANの設定例（RTX1200）
  https://dev.classmethod.jp/articles/rtx1200-inter-vlan-routing/

## これから

- IPoE（v6プラス、DS-Lite）
- 既存configの読み込み
- パケットフィルター（`ip filter`）
