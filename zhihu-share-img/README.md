# 知乎回答生成分享长图

在知乎"分享"弹窗中插入"生成图片"选项，一键将当前回答导出为精美的分享卡片长图（PNG）。

## 功能特性

- **一键生成**：在任意回答的"分享"菜单中点击"生成图片"，自动导出长图
- **卡片内容完整**：包含问题标题、作者昵称与头像、回答正文、发布/编辑时间
- **高清二维码**：从原生分享浮层提取二维码并重绘，支持微信长按/扫码跳转原文
- **2x 高清导出**：基于 html2canvas 以 2 倍缩放渲染，图片清晰
- **自动展开全文**：若回答处于折叠状态，生成前自动点击"阅读全文"
- **防重保护**：生成期间全局加锁，按钮显示 Loading 并禁用，避免重复触发
- **SPA 适配**：通过 MutationObserver 监听 DOM 变动，知乎站内跳转后菜单仍可自动注入

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展；
2. 点击下方安装徽标（或直接打开 `.user.js` raw 链接），篡改猴会自动唤起安装界面：

[![一键安装](https://img.shields.io/badge/%E4%B8%80%E9%94%AE%E5%AE%89%E8%A3%85-Tampermonkey-00485B?logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/zyt-code/userscripts/main/zhihu-share-img/zhihu-share.user.js)

3. 访问 [www.zhihu.com](https://www.zhihu.com/) 即可生效。

脚本已配置 `@updateURL` / `@downloadURL`，安装后在仓库中更新版本号即可自动推送更新。

## 使用方法

1. 打开任意知乎回答页；
2. 点击回答下方的"分享"按钮，弹出分享菜单；
3. 点击新增的"生成图片"菜单项；
4. 等待片刻（按钮显示"正在生成..."），图片自动下载，文件名为 `标题_作者.png`。

## 技术说明

| 项目 | 说明 |
| --- | --- |
| 匹配站点 | `https://www.zhihu.com/*`、`https://zhuanlan.zhihu.com/*` |
| 依赖 | html2canvas 1.4.1（jsDelivr CDN `@require` 自动引入） |
| 权限 | `GM_addStyle`（注入卡片离屏排版样式） |
| 运行时机 | `document-idle` |

- **跨域头像处理**：作者头像先通过 `crossOrigin='anonymous'` 转为 Base64，避免画布被污染导致导出失败；转换失败时回退使用原图地址。
- **二维码获取**：优先读取分享浮层中的 `<canvas>`，其次匹配 `qr` 相关 `<img>`，最后回退到全局二维码选择器；无二维码时卡片底部仅显示提示文案。
- **离屏渲染**：卡片在 `left: -9999px` 的固定容器中排版（宽 620px），不影响页面显示。

## 已知限制

- 知乎页面结构改版（类名变更）可能导致标题/作者/正文提取失败；
- 正文中的外站图片若不支持跨域，可能渲染为空白；
- 回答页走原有 `.ContentItem` 解析；专栏页（`zhuanlan.zhihu.com`）仅在主页选择器全部未命中后回退到 `.Post-Main` / `.Post-RichText`。
