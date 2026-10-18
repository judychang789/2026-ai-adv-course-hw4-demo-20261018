# AI Review：訂單、付款、運費與購物車

審查日期：2026-10-18

審查角色：`security-reviewer`、`code-reviewer`、`test-runner`

範圍：訂單建立與查詢、付款狀態、運費計算、購物車 API，以及相關 Unit/Integration tests。

本次只進行唯讀檢查與測試，未修改程式碼。

## 發現的問題

### High — 訂單詳情未驗證訂單所屬使用者（已修正）

- 位置：`src/routes/orderRoutes.js:350-360`
- `GET /api/orders/:id` 已改用 `findOrderForUser(req.params.id, req.user.userId)`。
- 已補上「其他會員讀取該訂單應回 404」的 API 測試。

### Medium — 購物車 PATCH 未限制數量為正整數（已修正）

- 位置：`src/routes/cartRoutes.js:292-315`
- 已沿用 POST 使用的 `parsePositiveInteger`，拒絕 `0`、負數、小數、Infinity 與其他非正整數值。
- 已補上購物車 API 邊界測試。

### Medium — 1500 元免運邏輯與測試不一致（已修正）

- 實作位置：`src/utils/shipping.js:39-41`
- `qualifiesForFreeShipping` 已改為使用 `subtotal >= 1500`，並恢復 1500 元免運測試。

## 修正紀錄

- 訂單詳情改為依目前會員 `userId` 查詢，避免跨會員讀取。
- 購物車 PATCH 改用正整數驗證，拒絕 0、負數、小數與非有限數值。
- 免運門檻改為滿 1500 元即免基本運費。
- 新增／恢復對應邊界測試。

## 已檢查且目前看起來合理的部分

- 訂單建立在 `src/services/orderService.js` 使用單一 transaction，涵蓋建立訂單、品項 snapshot、扣庫存與清空購物車。
- 建立訂單時小計與運費由伺服器依購物車目前商品價格重新計算，沒有信任客戶端金額。
- 付款查詢會驗證交易編號、交易金額與 CheckMacValue；只有 pending 訂單會轉為 paid。
- 付款與付款查詢路由有依使用者查詢訂單；測試環境的 mock payment 也有環境限制。
- 購物車 JWT 優先、Session fallback 的 dualAuth 行為符合專案規範；SQL 查詢中的 owner 欄位來自固定的內部選項，不是客戶端字串。
- Integration test 有覆蓋庫存不足、transaction rollback、ECPay 金額與簽章驗證等重要情境。

## 測試執行結果

### `npm run test:unit`

結果：通過。

- Test Files：7 passed。
- Tests：56 passed。

### `npm run test:integration`

結果：通過。

- Test Files：1 passed。
- Tests：10 passed。
- 相關測試檔：`tests/integration/order-checkout.integration.test.js`。

## 建議後續順序

1. 先修正訂單詳情 ownership authorization，並新增跨使用者存取測試。
2. 統一購物車數量驗證為正整數，新增邊界測試。
3. 確認免運門檻規格，決定使用 `>= 1500` 或調整測試期待。
4. 在允許 localhost bind 的環境重新執行兩組測試，再判斷是否存在其他 runtime failure。
