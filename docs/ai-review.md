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

## 第二輪獨立驗收（2026-10-18）

本輪未採用或假設前述結論；重新從攻擊者、異常資料與測試逃逸角度檢查實作，並執行獨立的最小驗證。

### 1. High — 未登入即可取得任意訂單的綠界付款表單

1. **檔案與行號**：`src/routes/pageRoutes.js:60-71`，尤其是 `:61-70`。
2. **最小重現步驟／驗證測試**：在記憶體 SQLite 建立一筆 `pending` 訂單後，不帶 JWT 或 Session，執行 `GET /ecpay/payment/{otherUserOrderId}`。
3. **實際結果與預期結果**：實際回應 `200` 且包含 `ecpay-form`；預期應回 `401` 或至少 `404`，不能讓未授權請求取得另一位會員訂單的付款表單與交易資訊。獨立腳本已實際得到 `{ status: 200, containsPaymentForm: true }`。
4. **風險等級**：High。攻擊者只需取得或猜到訂單 ID，就能替他人啟動付款流程，並取得該訂單的商品、金額與回跳資訊；也可能造成錯誤付款或社交工程風險。
5. **為什麼現有測試沒有抓到**：Integration test 只測正常會員流程 `GET /ecpay/payment/{order.id}`（`tests/integration/order-checkout.integration.test.js:316-341`），沒有測試未登入、其他會員或不存在 session 的請求。

### 2. High — 缺少 `CheckMacValue` 的「付款成功」回應仍會被接受

1. **檔案與行號**：`src/services/paymentService.js:10-27`，尤其是 `:15-17`。
2. **最小重現步驟／驗證測試**：呼叫 `isTradePaid({ merchant_trade_no: 'ORD123', total_amount: 100 }, { MerchantTradeNo: 'ORD123', TradeAmt: '100', TradeStatus: '1' })`，故意省略 `CheckMacValue`。
3. **實際結果與預期結果**：實際回傳 `true`；預期應拒絕並拋出驗證錯誤。因 `CheckMacValue` 不存在時條件式不進入 `verifyCheckMacValue`，但交易編號、金額和狀態仍可通過。
4. **風險等級**：High。付款狀態更新依賴此結果；若第三方回應可被竄改、代理錯誤或被測試替身不完整地模擬，缺少簽章的 paid 回應可能直接把訂單標為 paid。
5. **為什麼現有測試沒有抓到**：成功付款測試使用 `signedTradeInfo()` 產生完整簽章（`tests/integration/order-checkout.integration.test.js:348-353`）；偽造測試只測錯誤簽章與錯誤金額（`:426-435`），沒有測「完全沒有簽章」。

### 3. Medium — 未付款／非 paid 回應完全跳過簽章驗證

1. **檔案與行號**：`src/services/paymentService.js:10-13` 與 `src/routes/orderRoutes.js:531-535`。
2. **最小重現步驟／驗證測試**：讓 QueryTradeInfo 回傳 `TradeStatus=0`，不帶 `CheckMacValue`，或帶任意錯誤 `CheckMacValue`；呼叫 `POST /api/orders/{id}/check-payment`。
3. **實際結果與預期結果**：實際回 `200`、保留 pending，並把未驗證的 `TradeStatus` 放入 `ecpay_trade_status`；預期所有第三方回應都應先驗證簽章，驗證失敗應回 `ECPAY_QUERY_ERROR`。
4. **風險等級**：Medium。現階段不會直接把訂單標為 paid，但攻擊者可影響付款狀態顯示與前端流程判斷；更重要的是，這讓第三方回應完整性規則只套用在 paid 分支，容易形成未來擴充時的繞過點。
5. **為什麼現有測試沒有抓到**：現有 pending 測試刻意使用未簽章回應（`tests/integration/order-checkout.integration.test.js:383-399`），並將 `200` 視為成功，因此反而固定了這個缺口；沒有錯誤簽章的非 paid 測試。

### 4. Low — 購物車接受「整數字串」，與 API 的 integer 型別契約不一致

1. **檔案與行號**：`src/utils/validators.js:15-17`，以及 `src/routes/cartRoutes.js:195-197`、`:296-299`。
2. **最小重現步驟／驗證測試**：對 POST 或 PATCH `/api/cart` 傳送 JSON `{ "quantity": "3" }`。
3. **實際結果與預期結果**：實際 `parsePositiveInteger` 會把 `"3"` 轉成數字並接受；若 API schema 的 `type: integer` 是嚴格契約，預期應回 `400 VALIDATION_ERROR`，只接受 JSON number `3`。小數 `1.9`、0、負數目前會被拒絕，這部分驗證正常。
4. **風險等級**：Low。型別鬆散可能造成不同客戶端、OpenAPI validator 與後端行為不一致；目前未直接造成越權或金額繞過。
5. **為什麼現有測試沒有抓到**：`tests/cart.test.js:100-110` 只測 `1.9`、`3abc` 與陣列，沒有測數字字串；OpenAPI 文件宣告 integer，但沒有 schema 驗證測試。

## 第二輪測試執行結果

- `npm run test:unit`：7 files passed，56 tests passed。
- `npm run test:integration`：1 file passed，10 tests passed。
- 全部既有測試通過不代表第二輪安全驗收通過；上述最小驗證顯示仍有未被既有測試覆蓋的安全缺口。

## 第二輪結論

目前不建議將付款流程視為完成驗收。至少應先處理付款表單的訂單擁有權、所有 QueryTradeInfo 回應的必要簽章驗證，以及補上未登入／跨使用者／缺少簽章的負向測試。

## 交付前自我檢查補充

本節只補充本輪已完成的審查與測試證據；本輪沒有修改產品程式、測試、SubAgent 定義或設定檔，也沒有 commit 或 push。既有章節中的原始審查紀錄保留不變。

> 後續設定校正（2026-10-31）：本報告與 `.claude/agents/` 已更新，以反映實際目錄結構及 Codex／Claude Code 的設定邊界；這不是第二輪審查當日的產品程式或測試變更。

### SubAgent 分工與實際結論

本次審查使用的三份角色定義實際位於 `.claude/agents/`，而 `.agents/` 目錄目前沒有角色定義。這些檔案是 Claude Code 相容的 agent definitions，已使用 YAML frontmatter 宣告名稱、說明與可用工具；它們不是 Codex CLI 自動載入的子代理或工具權限設定。Codex 的持久專案規範由根目錄 `AGENTS.md` 載入，角色分工在本報告中應視為審查流程與責任劃分，而非由 Codex 強制執行的沙箱。角色定義位於：

- `security-reviewer`（`.claude/agents/security-reviewer.md`）：檢查權限、身分驗證、輸入驗證、敏感資料、注入、Session/JWT 與金流。Claude Code 設定為只讀工具，不修改檔案。實際結論：確認付款表單路由缺少擁有者驗證；確認 paid QueryTradeInfo 可缺少 `CheckMacValue`；確認非 paid 回應也未驗證簽章。
- `code-reviewer`（`.claude/agents/code-reviewer.md`）：檢查業務邏輯、邊界條件、規格符合度與測試是否被跳過或弱化。Claude Code 設定為只讀工具，不修改檔案。實際結論：確認付款表單的授權邊界缺口；確認付款簽章驗證只覆蓋部分分支；指出既有 pending 測試使用未簽章回應，未能證明完整性規則。
- `test-runner`（`.claude/agents/test-runner.md`）：執行指定測試，只回報失敗項目、位置與可能原因；Claude Code 設定可讀取檔案並執行測試、不可 Edit/Write。實際結論：兩組指定測試均通過，但既有測試未涵蓋本輪三個付款安全負向案例；另以獨立記憶體 SQLite HTTP 驗證確認付款表單未授權請求回傳 200。

### 已確認問題總表

下列項目都有程式位置、最小重現、實際／預期結果、風險與測試缺口證據；它們仍是待修正問題，本報告沒有宣稱已修正。

| 問題 | 位置／函式 | 風險 | 最小重現與結果 |
| --- | --- | --- | --- |
| 未授權取得任意訂單付款表單 | `src/routes/pageRoutes.js:61-70`，`GET /ecpay/payment/:orderId` | High | 記憶體 DB 建立 pending 訂單後，不帶 JWT/Session 呼叫該路由；實際 `200` 且包含 `ecpay-form`，預期 `401` 或 `404`。既有 integration 只測正常流程 `tests/integration/order-checkout.integration.test.js:316-341`。 |
| paid 回應缺少 CheckMacValue 仍被接受 | `src/services/paymentService.js:10-27`，`isTradePaid`，特別是 `:15-17` | High | 傳入 `TradeStatus=1`、正確 `MerchantTradeNo`/`TradeAmt` 但省略 `CheckMacValue`；實際 `isTradePaid(...) === true`，預期拋出驗證錯誤。既有成功案例使用完整簽章，偽造案例未測缺欄位。 |
| 非 paid 回應跳過簽章驗證 | `src/services/paymentService.js:10-13`、`src/routes/orderRoutes.js:531-535` | Medium | QueryTradeInfo 回傳 `TradeStatus=0` 且無簽章或錯誤簽章；實際回 `200`、保留 pending 並回傳 `ecpay_trade_status`，預期簽章失敗回 `ECPAY_QUERY_ERROR`。既有 pending 測試 `tests/integration/order-checkout.integration.test.js:383-399` 刻意使用未簽章回應。 |

### 僅建議／尚待確認事項（不列為已確認 bug）

- `parsePositiveInteger`（`src/utils/validators.js:15-17`）接受整數字串如 `"3"`。這是 API `integer` 型別契約是否應嚴格拒絕字串的規格建議；本輪未將它列為已確認安全漏洞，也沒有證據顯示可造成越權或金額繞過。若產品要求嚴格 JSON 型別，應新增規格測試後再決定是否調整。
- 付款回應是否必須驗證 `MerchantID` 欄位，需依 ECPay QueryTradeInfo 的正式回應契約確認；本輪已確認的是缺少或錯誤 `CheckMacValue` 的分支缺口，不把 MerchantID 未額外比對列為已確認 bug。
- 既有文件中先前的修正紀錄與「已修正」標記屬原始審查紀錄；本輪未重新修改那些內容，也不以它們作為本輪問題已修正的證明。

### 指定測試完整摘要

- `npm run test:unit`：7 個 test files 通過，56 個 tests 通過，無失敗項目。
- `npm run test:integration`：`tests/integration/order-checkout.integration.test.js` 通過，10 個 tests 通過，無失敗項目。
- 測試全數通過只表示既有測試案例通過；未涵蓋的未授權付款表單、缺少 paid 簽章、錯誤非 paid 簽章案例，仍由本輪獨立最小驗證確認為問題。

## 已確認問題修正紀錄與回歸證據

本節保留上方原始問題描述，並記錄本次實際修正與測試證據。三項問題已完成修正；本節不把原始發現刪除或改寫成未曾發生。

### 1. 未授權取得任意訂單付款表單 — 已修正

- **修正方式**：`src/routes/pageRoutes.js:3-4,62-72` 引入 `authMiddleware`，並改用 `findOrderForUser(req.params.orderId, req.user.userId)`；未登入回 401，跨使用者回 404。`public/js/pages/checkout.js` 改以帶有 `Auth.getAuthHeaders()` 的 fetch 載入付款表單，維持前端付款流程可用。
- **回歸測試**：`tests/integration/order-checkout.integration.test.js:392-405` 驗證未登入與跨使用者請求；`:124-144` 驗證 checkout script 會帶授權標頭；`:318-350` 驗證擁有者可正常取得付款表單。
- **測試證據**：整合測試通過；未登入請求預期 401、跨使用者請求預期 404、擁有者請求預期 200 並產生合法 ECPay 表單。

### 2. paid 回應缺少 `CheckMacValue` 仍被接受 — 已修正

- **修正方式**：`src/services/paymentService.js:10-17` 要求 `CheckMacValue` 必須存在且通過 `verifyCheckMacValue`，再判斷交易狀態；缺少或錯誤簽章會進入既有的 `ECPAY_QUERY_ERROR` 錯誤流程。
- **回歸測試**：`tests/integration/order-checkout.integration.test.js:431-452` 傳送缺少 `CheckMacValue` 的 paid 回應，驗證回 500、錯誤碼為 `ECPAY_QUERY_ERROR`，且訂單仍為 pending。
- **測試證據**：整合測試通過；合法簽章 paid 回應仍可在 `:352-390` 將訂單轉為 paid。

### 3. 非 paid 回應跳過簽章驗證 — 已修正

- **修正方式**：`src/services/paymentService.js:10-20` 將簽章驗證提前到所有 `TradeStatus` 分支之前，因此 unpaid 或其他非 paid 回應也必須先通過簽章驗證。`src/routes/orderRoutes.js:517-545` 維持驗證失敗時回 `ECPAY_QUERY_ERROR` 且不改變訂單狀態。
- **回歸測試**：`tests/integration/order-checkout.integration.test.js:407-429` 使用合法簽章的 unpaid 回應確認仍回 200/pending；`:454-472` 使用錯誤簽章的 unpaid 回應確認回 500/ECPAY_QUERY_ERROR 且訂單仍 pending。
- **測試證據**：整合測試通過，涵蓋合法 unpaid、錯誤 unpaid 簽章與既有 paid／錯誤金額／錯誤簽章案例。

## 修正後測試摘要

- `npm run test:unit`：7 個 test files 通過，56 個 tests 通過，無失敗項目。
- `npm run test:integration`：1 個 test file 通過，13 個 tests 通過，無失敗項目。
