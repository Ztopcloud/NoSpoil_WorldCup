# 时差观赛 Android APK 兼容性调研原型

这是一个最小 Android WebView 原型，用来验证手机端 APK 是否能承载“无剧透复播净屏”能力。它不是正式产品版，也不是完整浏览器。

## 当前行为

- 默认打开 `https://scgs.tv/`。
- `scgs.tv`、`www.scgs.tv`、`worldcup.cctv.com` 在 App 内打开。
- 其他链接交给系统浏览器或外部 App。
- `worldcup.cctv.com` 页面加载完成后，注入仓库现有的 `extension/content.js` 和 `extension/style.css`。
- 支持基础返回、刷新、回首页、视频全屏 custom view。
- 开启 WebView 调试，可用 Chrome `chrome://inspect` 查看控制台与 DOM。

## 构建方式

1. 用 Android Studio 打开 `android-probe` 目录。
2. 等待 Gradle 同步完成。
3. 连接安卓真机或模拟器，运行 `app`。

命令行环境已配置 Android SDK 时也可执行：

```text
cd android-probe
./gradlew :app:assembleDebug
```

Windows 下使用：

```text
cd android-probe
gradlew.bat :app:assembleDebug
```

本仓库当前没有提交 Gradle Wrapper；如果机器没有全局 Gradle，先在 Android Studio 中打开工程，或用本机 Gradle 生成 wrapper。

## 调研记录模板

| URL | Android 版本 | 设备 | 页面加载 | 视频出现 | 可播放 | 可全屏 | 脚本注入 | 剧透隐藏 | 跳片头 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `https://worldcup.cctv.com/2026/match/22920296/index.shtml` |  |  |  |  |  |  |  |  |  |  |
| `https://worldcup.cctv.com/2026/match/23510405/index.shtml` |  |  |  |  |  |  |  |  |  |  |
| `https://worldcup.cctv.com/2026/match/23510406/index.shtml` |  |  |  |  |  |  |  |  |  |  |
| `https://worldcup.cctv.com/2026/match/22920302/index.shtml` |  |  |  |  |  |  |  |  |  |  |
| `https://worldcup.cctv.com/2026/match/22920299/index.shtml` |  |  |  |  |  |  |  |  |  |  |

## 判定标准

- 可做 MVP：页面稳定加载，视频可播放/全屏，净屏脚本能隐藏主要标题、推荐、侧栏，跳片头失败也不影响播放。
- 只能外跳：WebView 无法稳定播放，但系统浏览器或官方 App 可播放。
- 换路线：页面强依赖官方 App、登录态、DRM 或 WebView 禁止能力，导致内置净屏不可控。
