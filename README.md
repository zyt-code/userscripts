# userscripts

个人油猴（Tampermonkey）脚本集合。

## 脚本列表

| 目录 | 脚本 | 说明 | 安装链接 |
| --- | --- | --- | --- |
| [zhihu-share-img](./zhihu-share-img) | 知乎回答生成分享长图 | 在知乎"分享"弹窗中注入"生成图片"选项，一键导出含头像、正文、二维码的分享卡片长图 | [![一键安装](https://img.shields.io/badge/%E4%B8%80%E9%94%AE%E5%AE%89%E8%A3%85-Tampermonkey-00485B?logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/zyt-code/userscripts/main/zhihu-share-img/zhihu-share.user.js) |

## 安装方式

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展；
2. 点击上表中的安装徽标，篡改猴会自动唤起安装界面，确认即可。

> 也可以直接将 `.user.js` 文件拖入浏览器，由 Tampermonkey 自动识别安装。

脚本内已配置 `@updateURL` / `@downloadURL`（指向本仓库 raw 文件路径），后续在仓库中更新版本号后，篡改猴会自动检查并推送更新。

## 目录结构

```
userscripts/
├── README.md
├── LICENSE
└── zhihu-share-img/
    ├── README.md
    └── zhihu-share.user.js
```
