# WebMap

Leafletを使った、地点管理・ルート検索・距離／面積計測の地図アプリです。ビルドせずに静的ファイルを配信でき、保存地点はブラウザのlocalStorageで管理します。

**[WebMapを開く](https://takayuki-minagawa.github.io/web-map/)**

## 主な機能

- 地図上の地点をタイトル・説明・9種類のアイコンで保存、編集、削除
- アイコン別のフィルターとマーカー管理一覧
- 従来のJSONバックアップと、他の地図ツールで使える**GeoJSON入出力**
- 日本国内の住所・施設名検索、東京／大阪／京都への移動
- 現在地と精度円の表示
- 出発地・到着地を指定した自動車ルートの距離・所要時間表示
- 距離、面積、周長の概算計測と、日本の地域メッシュコード（1/2メッシュ）表示
- 表示中の地図をPNG画像として保存

## 使い方

1. 地図をクリックし、タイトルとアイコンを設定して「保存」を押します。
2. 「マーカー管理」から保存地点へ移動したり、編集・削除したりできます。
3. ルートは「出発地」を選んで地図をクリックし、続いて到着地をクリックすると取得します。「ルートクリア」で取得中の処理も取り消します。
4. 「距離計測」または「面積計測」を選び、地図上に頂点を追加します。同じモードのボタンで計測モードを終了し、「計測リセット」でやり直せます。
5. 住所検索は入力後のEnterまたは「検索」で実行します。候補がない場合は短いキーワードで再検索してください。

### JSON・GeoJSONの入出力

「マーカー管理」にある「JSONエクスポート」は従来形式のバックアップ、「GeoJSONエクスポート」はGeoJSONの`FeatureCollection`を保存します。どちらもフィルターで非表示の地点を含む、保存地点すべてが対象です。一時的な検索結果・現在地・ルートは含みません。

「インポート」で`.json`または`.geojson`を選択すると、**保存地点全体をファイルの内容で置き換えます**。空の配列／空のFeatureCollectionは保存地点を空にします。先にエクスポートすると以前の地点を保管できます。

- ファイル全体の検証と保存が成功してから置き換えます。不正な内容やストレージへの保存失敗時は既存地点を維持します。
- 従来JSONは`lat`、`lng`、`title`を持つオブジェクトの配列です。数値文字列の座標にも対応します。
- GeoJSONはWGS84の`Point`だけを含む`FeatureCollection`に対応します。座標の順序は**[経度, 緯度]**です。線・面・MultiPointや投影座標系のデータは対応しません。
- GeoJSONの`properties.title`（または`name`）、`description`、`iconType`を読み込みます。無名の地点には名前を付けます。その他の属性・高度は保持しません。
- 不正・重複したIDは再割り当てし、未知のアイコンはデフォルトに戻します。
- 保存できない場合は警告を表示します。通常の編集が保存できなかった場合は、ページを閉じる前にエクスポートしてください。

GeoJSONの例:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [139.7671, 35.6812] },
      "properties": {
        "title": "東京駅",
        "description": "集合場所",
        "iconType": "star"
      }
    }
  ]
}
```

## 外部サービス・データの扱い

保存地点のタイトルや説明をアプリから外部へ送信することはありません。ただし、**地図の表示範囲はOpenStreetMap、検索語は検索サービス、ルートの出発地と到着地の座標はOSRMに送信されます**。Leafletとhtml2canvasはCDNから読み込みます。秘密情報を検索語に含めないでください。

- インターネット接続が必要です。オフライン地図やサービスワーカーは実装していません。
- 現在地取得はHTTPSまたはlocalhostで、ブラウザの位置情報許可が必要です。
- localStorageはブラウザ・サイト単位です。ブラウザデータの削除で地点も消えます。別環境への移行はエクスポート／インポートを使用してください。
- 計測値は地球を球面とした概算です。測量用途の精度はありません。地域メッシュコードは日本の地域メッシュ統計向けです。
- 公共のAPIは無償ですが、可用性・応答品質の保証はありません。ルートは自動車向けで、徒歩・自転車ルートではありません。

### 検索サービスの利用制限と設定

既定のNominatim公開APIには[利用方針](https://operations.osmfoundation.org/policies/nominatim/)があり、**アプリ全体で最大1リクエスト/秒**、自動補完禁止などの制約があります。明示的な検索操作でのみ送信し、このアプリはページ内の送信開始間隔を1.1秒以上に制限します。同じ検索語の結果はページ内で最大50件キャッシュし、ページを再読み込みすると消えます。

このブラウザ内制限は、複数タブ・複数利用者を合算した制限を保証しません。公開運用で利用者が増える場合は、運営者が全体の流量を制御するプロキシ、自前のNominatim、または利用規模に適したプロバイダーを用意してください。

`config.json`の`searchUrl`と`routeUrl`で配信先を設定できます。JavaScriptの変更は不要で、変更はページの再読み込み後に反映されます。検索先はNominatim互換、ルート先はOSRM互換のHTTPSエンドポイント（クエリ・認証情報を含まないURL、ブラウザから使う場合はCORS対応）が必要です。

検索・ルート通信は15秒でタイムアウトします。検索や経路指定の変更・クリア後に古い応答が表示を上書きすることを防ぎ、HTTPエラーは「候補なし」と区別して表示します。

[OSMタイル利用方針](https://operations.osmfoundation.org/policies/tiles/)に従い、一括ダウンロードやオフライン向けのタイル先読み機能は設けていません。

## ローカルで実行

```bash
git clone https://github.com/Takayuki-Minagawa/web-map.git
cd web-map
python3 server.py
```

ブラウザで`http://localhost:8000/`を開きます。ポートの指定は`python3 server.py 8080`です。開発サーバーは全インターフェースで待ち受けます。自分のPCからだけ使いたい場合は次のコマンドを使用できます。

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

最近のChrome、Firefox、Safari、Edgeを対象としています。JavaScript、localStorage、Fetch／AbortController、Canvasが必要です。

## 開発・検証

Node.js 22.13以上とPython 3を用意します。アプリの通常利用にNode.jsやnpmは不要です。

```bash
npm ci
npm run lint
npm test
npx playwright install chromium
npm run test:browser
```

単体テストはデータの検証・GeoJSON変換・API通信を、ブラウザテストは保存地点の操作やインポートの失敗・検索・ルートの競合を検証します。ブラウザテストではライブラリをローカルから読み、地図タイルとAPIをモックするため、公共サービスへテスト用リクエストを送りません。

GitHub Actionsの検証・デプロイは**Ubuntu（Linux）のみ**で実行します。依存関係はlockfileに固定し、lint・単体テスト・Chromiumテストの失敗時はデプロイしません。mainへのpush後、明示的に選んだ公開用ファイルだけをGitHub Pagesへ配信します。

### ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.html` / `style.css` | 画面とスタイル |
| `map.js` | 地図・ダイアログ・操作の連携 |
| `marker-data.js` | 保存地点の検証・正規化・GeoJSON変換 |
| `map-services.js` | HTTP通信・検索の間隔制御／キャッシュ・API応答検証 |
| `config.json` | 検索／ルートサービスの配信設定 |
| `server.py` | ローカル開発用HTTPサーバー |
| `tests/` | 単体・ブラウザ回帰テスト |
| `.github/workflows/ci.yml` | Linuxでの検証とPagesデプロイ |

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 主なライブラリ・参考資料

- [Leaflet 1.9.4](https://github.com/Leaflet/Leaflet/releases/tag/v1.9.4) — BSD-2-Clause
- [html2canvas](https://html2canvas.hertzen.com/) — MIT
- [OpenStreetMap](https://www.openstreetmap.org/copyright) — 地図データの帰属・ライセンス
- [Nominatim](https://nominatim.org/) / [OSRM](https://project-osrm.org/)
- [RFC 7946: GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946)

不具合・機能提案は[GitHub Issues](https://github.com/Takayuki-Minagawa/web-map/issues)へお願いします。
