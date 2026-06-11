# 时差观赛 Android APK 兼容性调研原型

这是一个最小 Android WebView 原型，用来验证手机端 APK 是否能承载“无剧透复播净屏”能力。它不是正式产品版，也不是完整浏览器。

## 当前行为

- 默认打开 `https://scgs.tv/`。
- `scgs.tv`、`www.scgs.tv`、`worldcup.cctv.com` 在 App 内打开。
- 其他链接交给系统浏览器或外部 App。
- `worldcup.cctv.com` 页面加载完成后，注入仓库现有的 `extension/content.js` 和 `extension/style.css`。
- 支持基础返回、刷新、回首页、视频全屏 custom view。
- Debug 包开启 WebView 调试，可用 Chrome `chrome://inspect` 查看控制台与 DOM；Release 包会关闭调试。

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

## Release 签名

Debug 包可以安装测试，但不适合公开给用户下载。正式发布 APK 需要使用同一把 release 签名密钥；以后每次升级都必须用同一把密钥签名，否则用户无法覆盖安装更新。

1. 生成签名密钥，并把 `.jks` 文件放在 `android-probe` 目录下或你自己的安全目录里。
2. 复制 `keystore.properties.example` 为 `keystore.properties`。
3. 在 `keystore.properties` 里填写 `storeFile`、`storePassword`、`keyAlias`、`keyPassword`。
4. 构建正式包：

```text
cd android-probe
gradlew.bat :app:assembleRelease
```

`keystore.properties` 和密钥文件已在仓库 `.gitignore` 中排除，不要提交到 Git。

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
