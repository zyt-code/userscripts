# Repository Guidelines

## Project Structure & Module Organization

This repository is a personal Tampermonkey (油猴) script collection. - `README.md` is the script index and install entry.
- Each script lives in its own kebab-case directory: `zhihu-share-img/`.
- The userscript is `zhihu-share-img/zhihu-share.user.js`. A matching `README.md` documents behavior, limits, and the install badge.
- `.workbuddy/` is local review notes and is gitignored. Do not commit it.

Add a new script as `<feature-name>/<feature-name>.user.js` plus a short README, then add a row to the root table.

## Build, Test, and Development Commands

There is no `npm` or `make` workflow. Edit the `.user.js` file and reload it in Tampermonkey.

- Install from the raw URL listed in `README.md`, or drag the `.user.js` file into a browser with Tampermonkey.
- After edits, bump `@version` in the metadata block so installed copies pick up `@updateURL` / `@downloadURL`.
- Verify on `https://www.zhihu.com/*` and `https://zhuanlan.zhihu.com/*`: open Share, run 生成图片, and confirm the PNG downloads.

## Coding Style & Naming Conventions

Userscripts are plain browser JavaScript wrapped in an IIFE with `'use strict'`. Indent with 4 spaces. Use `camelCase` for functions and variables, and kebab-case for directories and filenames.

Keep a complete metadata header: `@name`, `@namespace`, `@version`, `@description`, `@match`, `@noframes`, `@grant`, `@run-at`, `@require`, `@updateURL`, and `@downloadURL`. Point update URLs at `https://raw.githubusercontent.com/zyt-code/userscripts/main/<dir>/<file>.user.js`.

Grant only APIs you use (`GM_addStyle` today). Load libraries with `@require` (html2canvas, qrcode-generator) instead of vendoring them. Prefer existing selectors and the off-screen card over new global CSS.

## Testing Guidelines

There is no automated test suite. After selector or export changes, check an answer page and a `zhuanlan.zhihu.com` column page. Cover a folded answer, a blank share QR code, and a failed avatar fetch. Downloads should be named `标题_作者.png`. Record selector breakage in the script README.

## Commit & Pull Request Guidelines

History uses short Conventional Commits in Chinese, such as `fix: ...` and `docs: ...`. Keep the subject tied to the script behavior.

PRs should state the user-visible change, the Zhihu pages you tried, and any linked issue. Include a screenshot or the exported PNG when the card layout changes, and bump `@version` in the same change.

## Security & Configuration Tips

Scripts run on live Zhihu pages. Do not add unused `@grant` values, and do not request cookies or storage without a documented reason. Keep cross-origin images on `crossOrigin='anonymous'` and fall back if canvas export would be tainted.
