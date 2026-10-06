# 個人料理食譜 App

這是個人食譜 App 的資料與程式碼 repository。目前已有可在瀏覽器預覽的基礎版，尚未部署網站。

基礎版會列出從料理對話整理的候選料理、依名稱與狀態搜尋，並在目前瀏覽器的 IndexedDB 儲存料理心得與照片。備份可匯出或匯入 JSON；備份檔含私人照片與心得，請勿提交到 repository。候選料理沒有可照做的步驟；正式食譜資料仍待核對。

## 目錄

- `data/recipes.json`：已整理的正式食譜；目前仍是空陣列。
- `data/recipe-registry.json`：待核對的料理線索與實作回饋。
- `data/kitchen-profile.json`：從使用者自述整理的器材與料理習慣；型號和規格仍待本人核對。
- `data/cooking-knowledge.json`：可跨食譜使用的料理知識；目前是空陣列。
- `schemas/`：食譜與候選料理資料格式。
- `docs/`：資料規則與匯入紀錄。
- `source/`：日後放經確認可存入 repository 的原始資料；目前沒有 `cook.docx`。
- `icons/`：日後放 App 圖示。

## 後續方向

預計製作可在手機使用的離線優先 PWA。repository 先維持私有，暫不啟用 GitHub Pages。依 [GitHub Pages 官方說明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)，GitHub Free 不能從私有 repository 發布 Pages；支援私有 repository 的方案所發布的 Pages 網站通常仍可由網路上任何人存取。正式部署前須選定方案並確認網站公開範圍。

個人料理紀錄與照片預計儲存在手機的 IndexedDB，並提供匯出與備份方式；單靠瀏覽器本機儲存無法保證資料永久保留。

在本人確認食譜來源與內容前，不將對話或 Word 文件中的敘述標成「已驗證食譜」。

## 本機預覽

此 App 使用 `fetch` 讀取 JSON，不適合直接雙擊 `index.html`。在本專案目錄啟動本機靜態伺服器，例如 `python -m http.server 8000`，再用瀏覽器開啟 `http://localhost:8000/`。正式手機安裝需要 HTTPS 部署；目前尚未啟用。
