# Claude Code SubAgent 小隊

本目錄使用 Claude Code agent definition 格式。每份角色檔頂端的 YAML frontmatter 用於支援此格式的工具設定名稱、說明、模型與可用工具。

Codex 不會自動將此目錄註冊為子代理，也不會由這些檔案強制工具權限；Codex 的持久專案規範以根目錄 `AGENTS.md` 為準。需要在 Codex 重用流程時，應建立 `.agents/skills/<skill-name>/SKILL.md`。

本專案的 SubAgent 角色：

- `security-reviewer.md`：檢查權限、身分驗證、金流與輸入驗證。
- `code-reviewer.md`：檢查業務邏輯、邊界條件、規格符合度與測試覆蓋。
- `test-runner.md`：執行指定測試，只回報失敗項目、位置與可能原因。

所有角色都必須遵守根目錄 `AGENTS.md` 的專案規範。Review 類角色只讀取檔案，不修改程式；測試角色不得使用 Edit 或 Write。
