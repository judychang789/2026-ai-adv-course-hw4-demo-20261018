# SubAgent 小隊

本專案的 SubAgent 角色：

- `security-reviewer.md`：檢查權限、身分驗證、金流與輸入驗證。
- `code-reviewer.md`：檢查業務邏輯、邊界條件、規格符合度與測試覆蓋。
- `test-runner.md`：執行指定測試，只回報失敗項目、位置與可能原因。

所有角色都必須遵守根目錄 `AGENTS.md` 的專案規範。Review 類角色只讀取檔案，不修改程式；測試角色不得使用 Edit 或 Write。
