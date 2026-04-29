Rev result + ROI Worker 完成版

配置:
- GitHubルート直下に worker.js を置く
- wrangler.toml もルート直下に置く

確認URL:
/api/health
/api/result?race=大阪杯
/api/roi/analyze

結果登録POST:
/api/result/import

POST JSON例:
[
  {
    "race":{"date":"2025/04/06","place":"阪神","raceName":"大阪杯","grade":"G1"},
    "result":{"first":"5","second":"13","third":"7","umaren":"5-13","sanrenpuku":"5-7-13"},
    "payout":{"umaren":3880,"sanrenpuku":6910},
    "prediction":{"umaren":["5-13"],"sanrenpuku":["5-7-13"]}
  }
]

KVなしでも大阪杯サンプルは返ります。
KVを使う場合はCloudflareで RESULT_DB binding を追加してください。
