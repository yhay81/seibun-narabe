# Metrics

許可するイベントは `visited`、`searched`、`compared`、`amount_changed`、`summary_copied`、`saved`、`returned` です。

各行にはランダムなブラウザUUIDのSHA-256、許可済みイベント名、QAフラグ、時刻だけを保存し、35日後に削除します。検索語、食品番号、量、成分値、氏名、連絡先、IPアドレス、広告識別子はスキーマにありません。

本番は `npm run metrics`、ローカルは `pwsh -File ops/product-metrics.ps1 -Local` で確認します。利用者数は `is_qa = 0` の異なる端末IDだけを数え、自動QAは利用者に含めません。
