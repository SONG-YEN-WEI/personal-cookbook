# 個人料理食譜 App

這是個人食譜 App 的資料與程式碼 repository。目前已有可在瀏覽器預覽的基礎版，尚未部署網站。

App 會列出獨立的食譜卡與待核對候選料理，提供晚餐組合、料理日曆和逐道料理紀錄。私人照片與完成後心得保存在目前瀏覽器的 IndexedDB；備份可匯出或匯入 JSON。備份檔含私人照片與心得，請勿提交到 repository。候選料理沒有可照做的步驟。

## 目錄

- `data/recipes.json`：可照做的獨立食譜卡；每個版本有自己的步驟與狀態。
- `data/recipe-registry.json`：待核對的料理線索與實作回饋。
- `data/meal-sessions.json`：不含私人照片的預設餐次；只保存日期、餐別、狀態和 recipe ID／version 參照。
- `data/cooking-history.json`：預設的逐道待回報測試紀錄；不含照片或完成後的私人心得。
- `data/legacy-meal-notes.json`：尚不能可靠拆分成獨立菜卡的舊組合餐線索，不在食譜卡清單顯示。
- `data/kitchen-profile.json`：從使用者自述整理的器材與料理習慣；型號和規格仍待本人核對。
- `data/cooking-knowledge.json`：可跨食譜使用的料理知識；目前是空陣列。
- `schemas/`：食譜、候選料理、餐次與逐道料理紀錄資料格式。
- `docs/`：資料規則與匯入紀錄。
- `source/`：日後放經確認可存入 repository 的原始資料；目前沒有 `cook.docx`。
- `icons/`：日後放 App 圖示。

## 後續方向

預計製作可在手機使用的離線優先 PWA。repository 先維持私有，暫不啟用 GitHub Pages。依 [GitHub Pages 官方說明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)，GitHub Free 不能從私有 repository 發布 Pages；支援私有 repository 的方案所發布的 Pages 網站通常仍可由網路上任何人存取。正式部署前須選定方案並確認網站公開範圍。

App 首次開啟時，會把預設餐次和待回報測試匯入 IndexedDB；之後本機編輯不會被重新載入的預設資料覆蓋。一般日期先保存可選卡、移除與排序的晚餐草稿，按「開始料理」才建立餐次；已預建的 2026-10-06 晚餐可直接開始。每道菜保留各自的測試與評分／心得／照片；整體餐桌照片只屬於餐次。料理日曆可按日期查看草稿、餐次與實作紀錄。單靠瀏覽器本機儲存無法保證資料永久保留，請下載備份；v2 備份包含草稿、餐次、逐道紀錄和照片，仍可匯入舊版 v1 備份。

在本人確認食譜來源與內容前，不將對話或 Word 文件中的敘述標成「已驗證食譜」。

## 本機預覽

此 App 使用 `fetch` 讀取 JSON，不適合直接雙擊 `index.html`。在本專案目錄啟動本機靜態伺服器，例如 `python -m http.server 8000`，再用瀏覽器開啟 `http://localhost:8000/`。正式手機安裝需要 HTTPS 部署；目前尚未啟用。
