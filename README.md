# TokeniZer

A browser extension that shows live token count, cache timer, and
session/weekly usage bars on claude.ai.

Reads Claude's own SSE stream and `/usage` endpoint directly —
no third-party extensions required. No data leaves your browser.

![TokeniZer panel](./screenshots/panel.png)

---

## Features

| | |
|---|---|
| **Context Window** | Live token count with progress bar against the 200k limit |
| **Cache Timer** | Countdown showing how long your conversation stays cached |
| **Session Limit** | 5-hour usage % with exact reset countdown |
| **Weekly Limit** | 7-day usage % with exact reset countdown |
| **Privacy-first** | Zero external requests — all data stays local |

Usage bars are more accurate than Claude's own `/usage` page because they
read raw, unrounded utilization fractions directly from the SSE stream.

---

## Supported Browsers

| Browser | Status |
|---|---|
| Chrome | ✅ Supported |
| Edge | ✅ Supported |
| Firefox | ✅ Supported |

---

## Installation

### Chrome / Edge — One-click install

1. Go to [**Releases**](../../releases/latest) and download `tokenizer-v1.0.0.zip`
2. Open `chrome://extensions` and enable **Developer mode** (top-right toggle)
3. Drag and drop the `.zip` directly onto the page
4. Open [claude.ai](https://claude.ai) — the panel appears automatically

### Firefox

1. Go to [**Releases**](../../releases/latest) and download `tokenizer-v1.0.0.xpi`
2. Drag it into any Firefox window → click **Add**

### Userscript (Tampermonkey / Violentmonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Go to [**Releases**](../../releases/latest) and click `tokenizer.user.js`
3. Tampermonkey will prompt to install automatically

---

## How It Works

- **MAIN-world fetch intercept** — intercepts Claude's SSE stream at
  `document_start` to extract live `input_tokens` counts as you chat
- **`/usage` endpoint** — reads session and weekly utilization fractions
  directly from Claude's API (exact, unrounded values)
- **Local tokenizer** — `o200k_base` tokenizer for approximate context
  window counts before the first API response
- **DOM polling** — cache timer read from Claude's native UI every 1.5s
- All processing is local — no external servers



## Privacy

- Makes requests **only to `claude.ai`**
- Reads your session's `lastActiveOrg` cookie to query Claude's `/usage` endpoint
- No analytics, no telemetry, no external servers
- All state stored in `chrome.storage.local`

---

## License

MIT © 2026 Soumik Majumder

See [LICENSE](./LICENSE) for full terms.
See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for bundled dependencies.