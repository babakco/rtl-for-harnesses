# جدول پشتیبانی

`manifest.json` منبع حقیقت است. این جدول برای خواندن سریع است؛ اگر نسخهٔ
نصب‌شدهٔ شما با ستون «نسخهٔ مستند» فرق داشت، `./rtl-harness detect` را اجرا
کنید و README همان هارنس را بخوانید.

| # | هارنس | slug | برنامهٔ اصلی | خروجی | روش | نسخهٔ مستند | پروفایل | ریسک |
|---|---|---|---|---|---|---|---|---|
| 1 | DeepSeek Harness | `deepseek-harness` | `/Applications/DeepSeek Harness.app` | `/Applications/DeepSeek Harness-RTL.app` | `electron-asar` | `0.2.1-rc.2` | مشترک (`~/.dsh`) | متوسط |
| 2 | MiniMax Code | `minimax-code` | `/Applications/MiniMax Code.app` | `/Applications/MiniMax Code-RTL.app` | `electron-asar-preload` | `3.1.4` | جدا | کم |
| 3 | OpenCode | `opencode` | `/Applications/OpenCode.app` | `/Applications/OpenCode-RTL.app` | `electron-asar` | `2.0.32` | مشترک | متوسط |
| 4 | WorkBuddy AI | `workbuddy-ai` | `/Applications/WorkBuddy AI.app` | `/Applications/WorkBuddy AI RTL.app` | `electron-asar-surgical` | `5.8.4` | مشترک | متوسط |
| 5 | ZCode | `zcode` | `/Applications/ZCode.app` | `/Applications/ZCode-RTL.app` | `electron-asar` | `3.16.2` | مشترک | متوسط |
| 6 | Freebuff | `freebuff` | `/Applications/Freebuff.app` | `/Applications/Freebuff-RTL.app` | `electron-asar` | `0.0.184` | مشترک | متوسط |
| 7 | Codex / ChatGPT | `codex` | `/Applications/ChatGPT.app` | `$HOME/Applications/ChatGPT-RTL.app` | `electron-asar-framework` | `26.1007.30912` | مشترک | بالا |
| 8 | Kimi | `kimi` | `/Applications/Kimi.app` | `/Applications/Kimi RTL.app` | `electron-asar-preload` | `3.2.14` | مشترک | متوسط |
| 9 | Zed | `zed` | `/Applications/Zed.app` | `/Applications/Zed-RTL.app` | `native-source-rust` | `1.18.1` | مشترک | بالا |
| 10 | Google Antigravity | `antigravity` | `/Applications/Antigravity.app` | `/Applications/Antigravity RTL.app` | `electron-asar-preload` | `2.22.0` | مشترک | متوسط |
| 11 | Qoder | `qoder` | `/Applications/Qoder.app` | `/Applications/Qoder-RTL.app` | `electron-asar-surgical` | `0.4.2` | مشترک | متوسط |
| 12 | Cline | `cline` | `/Applications/Cline.app` | `$HOME/Applications/Cline RTL.app` | `tauri-source` | `0.0.45` | جدا | بالا |
| 13 | Xiaomi MiMo AI | `xiaomi-mimo` | `/Applications/Xiaomi MiMo AI.app` | `/Applications/Xiaomi MiMo AI-RTL.app` | `electron-asar` | `26.922.222056` | مشترک | متوسط |
| 14 | GitHub Copilot | `github-copilot` | `/Applications/GitHub Copilot.app` | همان برنامه (درجا) | `webkit-dylib` | `1.1.15` | مشترک / درجا | بالا |
| 15 | Claude Desktop | `claude-desktop` | `/Applications/Claude.app` | `$HOME/Applications/Claude-RTL.app` | `electron-asar` | `3.1623.0` | مشترک | متوسط |

## شناسه‌های bundle

| هارنس | شناسهٔ برنامهٔ اصلی | شناسهٔ خروجی |
|---|---|---|
| DeepSeek Harness | `com.deepseek.dsh` | `com.deepseek.dsh.rtl` |
| MiniMax Code | `com.minimax.agent` | `com.minimax.agent` |
| OpenCode | `ai.opencode.desktop` | `ai.opencode.desktop` |
| WorkBuddy AI | `com.workbuddy.workbuddy-ai` | `com.workbuddy.workbuddy-ai` |
| ZCode | `dev.zcode.app` | `dev.zcode.app.rtl` |
| Freebuff | `com.freebuff.desktop` | `com.freebuff.desktop.rtl` |
| Codex / ChatGPT | `com.openai.codex` | `com.openai.codex` |
| Kimi | `com.moonshot.kimichat` | `com.moonshot.kimichat` |
| Zed | `dev.zed.Zed` | `dev.zed.Zed-RTL` |
| Google Antigravity | `com.google.antigravity` | `com.google.antigravity.rtl` |
| Qoder | `com.qoder.app` | `com.qoder.app.rtl` |
| Cline | `bot.cline.app` | `bot.cline.app.rtl` |
| Xiaomi MiMo AI | `com.xiaomi.mimo.desktop-ai` | `com.xiaomi.mimo.desktop-ai` |
| GitHub Copilot | `com.github.githubapp` | `com.github.githubapp` |
| Claude Desktop | `com.anthropic.claudefordesktop` | `com.anthropic.claudefordesktop` |

## تفسیر ریسک

- **کم:** کپی مستقل، وابستگی کم، پروفایل جدا.
- **متوسط:** asar/preload، پروفایل مشترک یا selectorهای حساس.
- **بالا:** درجا، framework integrity، build سورس طولانی، یا وابستگی به
  نسخهٔ دقیق upstream.

## وضعیت تأیید

`lastVerifiedVersion` در manifest برای هر هارنس ثبت می‌شود. مقدار `null`
یعنی در این مخزن دوباره build/verify نشده است؛ این به معنی خراب بودن نیست،
فقط یعنی شواهد این مخزن آن را تأیید نکرده. در این بازبینی، ZCode با نسخهٔ
`3.16.2` در حالت کپی build و verify شد؛ بقیهٔ ۱۴ خروجی فقط read-only تأیید
شدند. نتیجهٔ کامل در [`verification.md`](verification.md) است.

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../AUTHORS.md)
