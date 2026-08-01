SELECT
  COUNT(DISTINCT CASE WHEN is_qa = 0 THEN session_hash END) AS users,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'searched' THEN session_hash END) AS searchers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'compared' THEN session_hash END) AS comparers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'amount_changed' THEN session_hash END) AS amount_changers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'summary_copied' THEN session_hash END) AS copiers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'saved' THEN session_hash END) AS savers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'returned' THEN session_hash END) AS returned,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'compared' AND created_at >= unixepoch() - 7 * 86400 THEN session_hash END) AS comparers_7d,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'summary_copied' AND created_at >= unixepoch() - 7 * 86400 THEN session_hash END) AS copiers_7d,
  COUNT(CASE WHEN is_qa = 1 THEN 1 END) AS qa_rows
FROM product_events;
