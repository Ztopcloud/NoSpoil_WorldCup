# 时差观赛服务器更新包

生成时间：2026-06-11 22:20:21

## 上传方式

把本包解压后的 `website/` 目录内容上传到服务器网站根目录。
如服务器根目录已经是 website 对应目录，则上传 `website/` 里面的全部文件和文件夹。

## 关键更新

- Android APK：public/时差观赛.apk
- Windows 包：public/nospoil-worldcup-windows.zip
- Chrome/Chromium 插件：public/scgs-tv-extension-chromium.zip
- Firefox 插件：public/scgs-tv-extension-firefox.zip
- 兼容旧下载名：public/scgs-tv-extension.zip、public/nospoil-worldcup-extension.zip
- 后台脚本：admin.html、admin.js、admin-server.js
- 赛事数据：data/matches.json

## 发布后检查

1. 打开首页，确认 Android 下载链接指向 public/时差观赛.apk。
2. 打开安装助手页，确认插件、Windows、Android 三类下载都可用。
3. 如使用后台，重启 node admin-server.js 后打开 /admin，确认单场维护里有“跳过秒数”。
4. 重新安装 0.1.7 版插件，测试小红书链接默认不跳过，CCTV 默认跳过。
