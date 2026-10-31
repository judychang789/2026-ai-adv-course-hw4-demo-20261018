# 取消未付款訂單並回補庫存

## 目標

讓登入會員可取消自己的 `pending` 訂單，並在同一個 SQLite transaction 內把所有訂單品項的庫存回補，將訂單狀態改為 `cancelled`。

## 範圍與限制

- 新增 `POST /api/orders/:id/cancel`；僅 JWT 驗證後的訂單擁有者可呼叫。
- 僅 `pending` 訂單可取消；已付款、已失敗或已取消訂單回傳 `409`，不改動庫存。
- 找不到訂單或訂單不屬於目前會員時回傳 `404`，避免洩漏訂單存在性。
- 狀態更新、訂單品項讀取與庫存回補必須是單一 transaction，避免重複取消造成重複回補。
- 擴充 SQLite status constraint，並為既有資料庫執行可保留資料的 migration。

## 實作步驟

1. 在 orders schema 與既有資料庫 migration 加入 `cancelled` 狀態。
2. 在 order service 實作擁有者限定、條件式狀態轉換與逐項庫存回補的 transaction。
3. 新增 API 路由與 OpenAPI 文件；同步調整後台訂單篩選狀態。
4. 執行指定 acceptance test，接著執行 unit 與 integration test；確認所有 API 回應維持 `{ data, error, message }`。

## 驗收條件

- 取消多品項 pending 訂單回傳 200、狀態為 `cancelled`，每項庫存精確回補。
- paid、已取消、跨會員與未登入情況分別回傳正確錯誤，且不多次回補庫存。
- 現有 unit、integration 與 cancel-order acceptance tests 都通過。
