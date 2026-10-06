# 匯入紀錄

## 2026-10-06：首次整理 `cook.docx`

來源是使用者提供的本機 Word 檔，原檔未提交到 repository。文件內容主要是 Gemini 料理對話：`User prompt`、AI `Response` 與後續修訂交錯出現。

原定以 `pandoc -t markdown` 抽取，但執行環境回報 `CommandNotFoundException`，因此改用 Python 標準函式庫讀取 DOCX 內的 `word/document.xml`，抽取段落與表格文字。此替代方式沒有驗證 Word 版面、圖片內容或文件以外的對話。

本次只把可從使用者提問或實作回饋辨認的料理放入 `data/recipe-registry.json`，並把使用者自述的器材與習慣放入 `data/kitchen-profile.json`。來源線索有節錄或摘要；它們不是已驗證食譜。AI 回答中的時間、溫度、食安判斷和「完美」「絕對不失敗」等保證沒有匯入正式步驟。

`data/recipes.json` 暫時維持空陣列，等待逐道核對後再新增。這份初次整理也不宣稱涵蓋文件內的每道料理。
