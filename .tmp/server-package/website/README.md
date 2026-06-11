# Website 目录说明

这里用于开发“时差观赛”网站，正式域名为 `scgs.tv`。

## 当前实现

当前公开视频站使用纯静态 HTML/CSS/JS，不需要构建步骤。比赛视频链接后台是一个本地 Node.js 管理工具，用来写入 `data/matches.json`。

本地预览方式：

1. 进入 `website` 目录。
2. 使用任意静态服务器打开目录，或直接打开 `index.html`。
3. 如果直接打开文件时浏览器拦截 JSON 读取，请使用静态服务器预览。

后台维护方式：

```text
cd website
node admin-server.js
```

打开 `http://localhost:4181/admin` 后，可以维护单场 `liveUrl` / `replayUrl`，也可以把央视单场视频链接批量粘贴进去预览匹配并写回 `matches.json`。如需给后台加口令，可启动前设置 `ADMIN_TOKEN` 环境变量。

插件下载文件放在：

```text
website/public/scgs-tv-extension.zip
```

## 推荐页面

- 首页：比赛列表 + 产品说明。
- 插件下载页：下载插件和安装入口。
- 安装教程页：Chrome 开发者模式安装教程。
- 免责声明页：版权和第三方说明。

## 数据原则

比赛数据只允许包含：

- 日期
- 北京时间
- 主队
- 客队
- 官方复播链接
- 建议跳过前段秒数

不允许包含：

- 比分
- 胜负
- 晋级结果
- 赛后标题
- 球员表现
- 暗示性描述

## 部署建议

优先使用 Cloudflare Pages、Vercel 或 Netlify。

公开视频站不需要后端和数据库；后台只建议在本地或内网运行，用完后把更新后的 `matches.json` 随网站一起发布。
