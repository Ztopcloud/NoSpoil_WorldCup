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

## 百度链接推送

服务器上设置百度推送接口后，后台每次保存 `matches.json` 时，如果有新的直播/复播链接被发布，会自动把站点首页推送给百度。

```powershell
$env:BAIDU_SUBMIT_ENDPOINT="http://data.zz.baidu.com/urls?site=https://scgs.tv&token=你的百度推送token"
node admin-server.js
```

如果后续新增了独立的视频页或文章页，也可以把扫描脚本加入服务器定时任务。脚本会扫描 `website` 下除后台页以外的 `.html` 页面，并用 `website/data/baidu-submitted-urls.json` 记录已推送 URL，避免重复提交。

```powershell
cd C:\MCP_Files\NoSpoil_WorldCup\website
$env:BAIDU_SUBMIT_ENDPOINT="http://data.zz.baidu.com/urls?site=https://scgs.tv&token=你的百度推送token"
node baidu-submit.js --scan
```

Windows 任务计划程序示例：

```powershell
schtasks /Create /TN "SCGS Baidu URL Submit" /SC HOURLY /TR "powershell -NoProfile -ExecutionPolicy Bypass -Command `"cd C:\MCP_Files\NoSpoil_WorldCup\website; `$env:BAIDU_SUBMIT_ENDPOINT='http://data.zz.baidu.com/urls?site=https://scgs.tv&token=你的百度推送token'; node baidu-submit.js --scan`""
```

## 回放缺失与同步失败邮件通知

`auto-update.js` 会在赛后等待窗口后仍未找到央视全场回放时发出告警；部署同步失败、自动 Git 失败、CBS 数据抓取失败时也会发邮件。邮件配置写在 `website/.env`：

```text
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-account@example.com
SMTP_PASS=你的 SMTP 授权码
SMTP_FROM=your-account@example.com
ALERT_EMAIL_TO=receiver@example.com
```

邮件模块优先使用 `nodemailer`，也内置了轻量 SMTP 兜底发送器；如果要安装正式依赖，可在 `website` 目录运行 `npm install`。没有配置 SMTP 时，自动更新只写日志，不会中断任务。

试运行会预览“将发送”的邮件内容，不写入数据也不真正发送邮件：

```powershell
node website/auto-update.js --dry-run
```

## 宝塔计划任务自动更新

如果线上站点根目录是 `/www/wwwroot/scgs.tv`，可以直接在宝塔「计划任务」里运行仓库提供的入口：

```bash
bash /www/wwwroot/scgs.tv/auto-update-baota.sh
```

这个入口会：

- `cd /www/wwwroot/scgs.tv`
- 写日志到 `/www/wwwroot/scgs.tv/.tmp/auto-update/run.log`
- 设置 `SCGS_LOCAL_SITE_ROOT=true`，让脚本只更新当前站点文件，不触发 `RSYNC_HOST` 远程同步

首次上线前建议在宝塔终端先试运行：

```bash
cd /www/wwwroot/scgs.tv
node -v
SCGS_LOCAL_SITE_ROOT=true node auto-update.js --dry-run
```

或直接走同一个入口：

```bash
bash /www/wwwroot/scgs.tv/auto-update-baota.sh --dry-run
tail -n 100 /www/wwwroot/scgs.tv/.tmp/auto-update/run.log
```

宝塔服务器上的 `.env` 建议只保留邮件配置；如果残留了 `RSYNC_HOST`、`RSYNC_PATH`、`RSYNC_USER`、`RSYNC_PORT`，`auto-update-baota.sh` 也会通过 `SCGS_LOCAL_SITE_ROOT=true` 忽略远程同步。

## 小红书备用链接验活

小红书外链近期可能只返回笔记壳页面，并要求登录或用 App 打开；站内不会再把它当作稳定网页回放源。批量检查当前数据里的小红书链接：

```powershell
node website/check-xhs-links.js
```

默认输出不会打印小红书标题，避免被赛果剧透。排查单条链接：

```powershell
node website/check-xhs-links.js --url "https://www.xiaohongshu.com/explore/..."
```

如确实需要核对笔记标题，可追加 `--show-title`。

如果要在 Windows 任务计划程序里每小时自动跑 `auto-update.js`，不要直接指向 `.bat`，否则 `cmd.exe` 很容易闪窗。仓库里提供了一个隐藏窗口用的入口：

```text
website/auto-update-runner.ps1
```

推荐把计划任务改成下面这样：

```powershell
schtasks /Create /TN "SCGS_AutoUpdate" /SC HOURLY /MO 1 /ST 12:28 /F /TR "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"C:\MCP_Files\NoSpoil_WorldCup\website\auto-update-runner.ps1\""
```

如果机器上已经有旧任务，先删掉旧的再重建更干净：

```powershell
schtasks /Delete /TN "SCGS_AutoUpdate" /F
```

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

## 手动同步到服务器

不要用 `node` 直接运行 `.md` 文件，Markdown 不是 JavaScript。

如果要把 `website/` 同步到服务器，直接在仓库根目录运行：

```powershell
node website/deploy.js
```

也可以用更短的入口：

```powershell
node gx
```

默认部署现在是增量模式：

- 会自动检查站点文件哪些真的变了
- 没变的文件不会重复上传
- 最新 APK 只有在构建产物变了时才会复制并上传
- 浏览器扩展只有在 `extension/` 源文件变了时才会重新打包并上传

如果扩展源文件发生变化，会重新打包并上传：

- `public/scgs-tv-extension-chromium.zip`
- `public/scgs-tv-extension-firefox.zip`
- `public/scgs-tv-extension.zip`
- `public/nospoil-worldcup-extension.zip`

如果只想同步单个文件，可以指定文件名：

```powershell
node website/deploy.js app.js
node website/deploy.js data/matches.json
node website/deploy.js sw.js
node gx app.js
```

如果怀疑 `.deploy-state.json` 记录和线上实际内容不一致，可以强制重传：

```powershell
node website/deploy.js --force index.html news.html styles.css robots.txt sitemap.xml
```

如果只想单独上传最新 APK，可以直接运行：

```powershell
node website/deploy.js --apk
node gx --apk
```

这条命令会自动从 `android-probe/app/build/outputs/apk/` 里找到最新 APK，复制到 `website/public/时差观赛.apk`，然后只上传这个 APK 到服务器的 `public/时差观赛.apk`。
