# Picking Mini

薬局で薬品の置き場所を素早く検索・登録・編集するための、スマホ向け簡易Webアプリです。

## 構成

- フロントエンド: `index.html`, `app.js`, `style.css`
- バックエンド: Google Apps Script Web App
- DB: Google Spreadsheet

## Google Spreadsheet

1. `PickingMini_DB` という名前でスプレッドシートを作成します。
2. `DrugMaster` シートを作成します。
3. 1行目に以下のヘッダーを設定します。

```text
id
displayName
genericName
aliases
location
note
imageUrl
favorite
createdAt
updatedAt
```

GAS側でもヘッダーが無い場合は自動作成します。

## GAS設定

1. `gas/Code.js` の `SPREADSHEET_ID` にスプレッドシートIDを設定します。
2. Google Apps Script に `gas/Code.js` と `gas/appsscript.json` を反映します。
3. Web Appとしてデプロイします。
4. 発行されたWeb App URLを `app.js` の `GAS_WEB_APP_URL` に設定します。

## フロントエンド設定

`app.js` の先頭にある定数を変更します。

```js
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/xxxxx/exec';
```

空文字のままの場合は、ローカル確認用のダミーデータで動作します。

## API

### GET search

```text
?action=search&q=アムロ
```

`displayName`, `genericName`, `aliases`, `location`, `note` を小文字化して部分一致検索します。最大20件を返します。

### GET detail

```text
?action=detail&id=xxx
```

### POST save

新規登録します。`displayName` は必須です。

### POST update

既存データを更新します。`id` は必須です。

## 注意

このアプリは薬品の置き場所メモ用です。医療情報や患者情報は扱わず、調剤監査や処方判断には使用しません。
