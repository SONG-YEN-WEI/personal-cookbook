# 個人料理食譜 App

這是個人食譜 App 的資料與程式碼 repository。目前只建立專案骨架，尚無可使用的 App，也尚未部署網站。

## 目錄

- `data/recipes.json`：食譜資料；目前是空陣列，尚未匯入食譜。
- `data/recipe-registry.json`：料理索引與狀態；目前是空陣列。
- `data/kitchen-profile.json`：家中器材與料理習慣；目前是空物件，資料待本人確認。
- `data/cooking-knowledge.json`：可跨食譜使用的料理知識；目前是空陣列。
- `schemas/`：日後放資料格式定義。
- `docs/`：日後放資料規則、設計與匯入紀錄。
- `source/`：日後放經確認可存入 repository 的原始資料；目前沒有 `cook.docx`。
- `icons/`：日後放 App 圖示。

## 後續方向

預計製作可在手機使用的離線優先 PWA。repository 先維持私有，暫不啟用 GitHub Pages。依 [GitHub Pages 官方說明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)，GitHub Free 不能從私有 repository 發布 Pages；支援私有 repository 的方案所發布的 Pages 網站通常仍可由網路上任何人存取。正式部署前須選定方案並確認網站公開範圍。

個人料理紀錄與照片預計儲存在手機的 IndexedDB，並提供匯出與備份方式；單靠瀏覽器本機儲存無法保證資料永久保留。

在本人確認食譜來源與內容前，不將對話或 Word 文件中的敘述標成「已驗證食譜」。
