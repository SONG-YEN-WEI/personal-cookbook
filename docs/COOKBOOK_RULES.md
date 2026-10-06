# 食譜狀態與證據規則

`data/recipe-registry.json` 保存從對話中辨認出的候選料理。它可以有做過的回饋，但沒有經核對的完整步驟，因此 App 不會把它當成可直接照做的食譜。

`data/recipes.json` 才保存有食材與步驟的正式食譜。加入前須核對版本、份量、器材、食安與來源；不能只根據 AI 回答就標示「已驗證」。

- `planned`：已形成可測試的獨立菜卡，但這個版本尚未做完第一次實證。
- `unreviewed`：有料理線索，但是否實作或採用哪一版尚不清楚。
- `tested`：使用者明確表示做過，但配方或結果仍待整理。
- `needs_revision`：使用者明確回報實作問題，後續版本尚待確認。
- `validated`：使用者實作後確認結果滿意；只用於正式食譜。

料理紀錄和照片儲存在使用者目前的瀏覽器 IndexedDB。備份須由使用者自行下載並妥善保存。日後若發布公開網站，必須先檢查 `data/` 與其他靜態檔案是否適合公開。

Meal Session 與 Recipe Card 分開：餐次只保存日期、餐別、狀態及有序的 `recipeId`／`version` 清單；每道菜的 `testNumber`、pending／料理後狀態、評分、心得、照片在獨立 Cooking History 紀錄。整體餐桌照片是餐次層級資料，只存在 IndexedDB，不提交到 GitHub。Recipe Card 的 `validated` 必須明確來自使用者對該版本的實作回報；另一道菜成功的保嫩技法只可當設計依據。

修訂食譜時新增同一 `id` 的新 `version`，保留舊版本，避免舊餐次指向不存在或已改內容的步驟。候選料理沒有已核對版本，加入餐次按鈕維持停用。

豬小里肌厚塊的首次測試使用食物溫度計確認最厚處中心至少 63°C（145°F），離火靜置至少 3 分鐘；固定煎炸時間或表面顏色不能取代中心溫度判斷。依據：[USDA FSIS Fresh Pork From Farm to Table](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/meat-catfish/fresh-pork-farm-table)。
