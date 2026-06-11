---
name: homepage-redesign-worldcup
overview: 重构首页为2026世界杯风格：顶部倒计时、新标题文案、4步教程、CCTV风格4列赛程卡片（104场比赛数据），删除旧内容区块。
design:
  architecture:
    framework: html
  styleKeywords:
    - CCTV体育赛事风格
    - 卡片式布局
    - 深色头部+浅色内容区
    - 国旗并排展示
    - 4列密集网格
    - 悬停放大+阴影
    - 倒计时数字大字
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: clamp(36px,5vw,72px)
      weight: 900
    subheading:
      size: clamp(20px,2.5vw,32px)
      weight: 600
    body:
      size: 15px
      weight: 400
  colorSystem:
    primary:
      - "#050c2f"
      - "#071a54"
      - "#006bff"
      - "#08d5ff"
      - "#ff275f"
    background:
      - "#ffffff"
      - "#f2f6fb"
      - "#050c2f"
    text:
      - "#10172a"
      - "#5b6680"
      - "#ffffff"
      - rgba(255,255,255,0.84)
    functional:
      - "#ffd66b"
      - "#ff275f"
      - "#08d5ff"
      - "#d8e0ee"
todos:
  - id: update-matches-json
    content: 编写website/data/matches.json，包含2026世界杯104场完整赛程数据（小组赛72场完整对阵+淘汰赛轮次框架），每场含id、date、timeBeijing、home、away、homeCode、awayCode、group、round字段
    status: completed
  - id: restructure-html
    content: 重构website/index.html：新增倒计时横幅、更新Hero标题和按钮（删除查看比赛入口、加浏览器图标）、替换tournament-strip为4步教程卡片、删除feature-section和match-centre区域、新增赛程4列网格容器
    status: completed
  - id: add-countdown-css
    content: 在website/styles.css中新增倒计时横条样式（深色满宽背景、大字数字+小字单位、秒数脉冲动画、响应式缩放）
    status: completed
    dependencies:
      - restructure-html
  - id: add-tutorial-css
    content: 在website/styles.css中新增教程4步卡片样式（4列grid、序号圆标、悬停上浮效果、浅色背景区）
    status: completed
    dependencies:
      - restructure-html
  - id: add-schedule-css
    content: 在website/styles.css中新增赛程4列网格+match-tile卡片样式（国旗并排、VS突出、日期时间、央视风格悬停scale+阴影+边框高亮、响应式断点）
    status: completed
    dependencies:
      - restructure-html
  - id: update-app-js
    content: 更新website/app.js：新增倒计时updateCountdown函数、新增renderSchedule函数适配match-tile卡片渲染、更新fetch路径适配新数据结构
    status: completed
    dependencies:
      - update-matches-json
      - restructure-html
---

## 用户需求

### 首页顶部倒计时

在首页Hero区上方新增实时倒计时横幅，显示距离2026年美加墨世界杯开幕的剩余天数、小时、分钟和秒数。倒计时动态刷新，目标时间是2026年6月11日19:00 UTC（美东时间下午3点，墨西哥城阿兹特克体育场揭幕战：墨西哥vs南非）。

### Hero区域标题改造

- 主标题改为：**2026美加墨世界杯**
- 副标题：**不熬夜也能无剧透完整观赛**
- 描述文案：**睡够了再起来看世界杯，拒绝一切剧透和干扰，精力更充沛、更尽兴**
- 删除"查看比赛入口"按钮
- 保留"安装时差观赛助手"按钮，按钮旁增加Chrome、Edge、Firefox浏览器小图标

### 教程4步卡片区

删掉原来的"2026世界杯复播导航"4格统计条，替换为4步教程卡片，按央视网页风格设计：

- 第1步：下载插件压缩包并解压到固定文件夹
- 第2步：选择浏览器（Chrome/Edge/360等）
- 第3步：打开扩展管理页，启用开发者模式，加载已解压扩展
- 第4步：打开复播页面，确认助手生效后无剧透观赛

### 删除旧区块

- 删除"从醒来到开球，少一步打扰"标题及其下方3个feature-card（复播导航、安装助手、安装步骤）
- 删除"时差观赛比赛入口"match-centre区域及match-list

### 新增赛程展示区

- 小标题：**2026世界杯复播**
- 副标题：**48支国家队 · 104场比赛**
- 赛程卡片采用4列网格布局（桌面端一行4个，平板2个，手机1个）
- 每张卡片展示：双方国旗（使用flagcdn.com加载）+ "国家队A VS 国家队B" + 日期（月/日）+ 北京时间
- 参考央视worldcup.cctv.com风格：国旗居中、VS字样突出、时间信息清晰
- 悬停效果：卡片放大scale(1.03)、阴影加深、顶部/左侧边框高亮为--cyan色
- 小组赛72场全部展示（淘汰赛对手未定暂用占位符）
- 每张卡片可点击跳转到对应官方复播链接

### 国旗方案

使用flagcdn.com国旗图片，格式为 `https://flagcdn.com/w80/{country_code}.png`，与央视网页风格一致。matches.json中增加countryCode字段。

## 技术方案

### 1. 倒计时实现

在HTML中新增倒计时容器，使用JavaScript的`setInterval`每秒更新一次。目标时间硬编码为`2026-06-11T19:00:00Z`。计算逻辑：

- 计算当前时间与目标时间的差值（毫秒）
- 换算为天、小时、分钟、秒
- 使用CSS Grid或Flexbox横排展示4个时间单位，参考大型赛事倒计时风格（数字大字+单位小字）

### 2. HTML结构重构

现有页面结构大幅度调整：

- Hero区前新增 `countdown-bar` 区块
- Hero区 `.hero-copy` 内标题和按钮改造
- 删除 `.tournament-strip` 区块
- 新增 `.tutorial-steps` 4步教程区
- 删除 `.feature-section` 区块
- 删除 `#matches .match-centre` 区块
- 新增 `.schedule-grid` 赛程4列网格区

### 3. 赛程数据

`matches.json` 替换为104场完整赛程，每场比赛包含：

- `id`, `date`, `timeBeijing`（北京时间）, `home`, `away`
- `homeCode`, `awayCode`（国家代码，用于flagcdn.com）
- `group`（小组，如A组）
- `round`（阶段：group/round32/round16/quarter/semi/third/final）
- `replayUrl`（复播链接，赛前可为空）

小组赛72场全部有确切对阵；淘汰赛轮次有日期和时段但对手待定。

### 4. 国旗加载

使用flagcdn.com CDN，国家代码对照：

- 巴西=br, 阿根廷=ar, 德国=de, 法国=fr, 英格兰=gb-eng, 西班牙=es等
- CSS设置国旗图片固定尺寸（如48x32px或60x40px），与文字垂直居中

### 5. 浏览器图标

三个浏览器图标使用内联SVG或Unicode符号，放在"安装时差观赛助手"按钮旁：

- Chrome: 圆形四色图标（红黄绿+蓝圆）
- Edge: 蓝绿渐变波浪图标
- Firefox: 橙色火狐图标
使用简洁CSS绘制的圆形色块表示，无需额外图片资源。

### 6. CSS新增样式要点

- `.countdown-bar`: 顶部全宽深色背景条，居中展示倒计时数字
- `.countdown-item`: 每个时间单位（天/时/分/秒），数字特大、单位小字在下
- `.tutorial-steps`: 4列grid，每列一张步骤卡片，带序号圆标
- `.schedule-grid`: grid-template-columns: repeat(4, 1fr)，gap适中
- `.match-tile`: 赛程卡片，白色背景，圆角，默认轻微阴影
- `.match-tile:hover`: transform:scale(1.03), box-shadow增强, border-color变--cyan
- `.match-flags`: 双方国旗并排，中间VS字样
- `.match-info`: 日期+北京时间在国旗下方

### 7. 响应式

- 桌面(>1200px): 4列赛程网格
- 平板(768-1200px): 3列→2列
- 手机(<768px): 1列，教程步骤也变为1列
- 倒计时在小屏适当缩小字号

### 8. app.js更新

- 新增`updateCountdown()`函数
- 修改赛程渲染函数为`renderSchedule()`，适配新match-tile结构
- 保留fetch matches.json逻辑
- 按round分组展示（小组赛优先，后续淘汰赛）

## 性能考量

- 倒计时每秒更新仅修改textContent，无DOM重建
- 104场赛程一次性渲染，按需可加分页（当前先全量渲染）
- flagcdn.com图片异步加载，不影响首屏
- 避免在match-tiles中使用复杂动画，仅CSS transition悬停

## 设计风格

采用**央视体育赛事风格**（央视worldcup.cctv.com），以深色头部+浅色内容区对比为主调，赛程卡片使用白底卡片式布局，国旗与球队名称并排，整体干净利落，信息密度高但不杂乱。

### 首页布局（从上到下）

1. **倒计时横条**：深色背景（--midnight），居中展示4个白色数字块（天/时/分/秒），冒号分隔，微光动画
2. **Hero头部**：保留现有深色渐变背景+球场观众图，标题改为两行大字号白色文字，描述换为浅色副文案，按钮区域保留红色主按钮+浏览器图标
3. **教程4步区**：浅色背景，4张白色卡片并排，每张带大序号圆标（--cyan底色）、步骤标题、简短说明，卡片有轻微阴影和悬停上浮效果
4. **2026世界杯复播区**：浅色背景，标题居中，副标题48支国家队·104场比赛，下方4列赛程卡片网格
5. **底部CTA**：保留现有final-cta深蓝渐变区域
6. **底栏**：不变

### 赛程卡片细节

- 白色卡片，圆角8px，边框1px --line色
- 上方：双方国旗并排（中间VS字样，红色加粗）
- 下方：日期（小字灰色）+ 北京时间（加粗深色）
- 悬停：scale(1.03)，阴影从轻微到明显，顶部边框变--cyan亮色
- 卡片底部可选"观看复播"小按钮（对有链接的已赛场次）

### 教程卡片细节

- 白底圆角卡片，顶部序号圆标（--cyan填充+白色数字）
- 步骤标题加粗
- 简短描述文案（--muted色）
- 悬停轻微上浮+阴影加深

### 倒计时横条

- 深色满宽背景（--midnight或--navy）
- 居中Flexbox排列4个时间块
- 每块：大号白色数字（48px+）+ 小号单位标签（14px, --cyan色）
- 秒数数字带微妙脉冲动画