# 2026 首发传播素材包

这个目录用于发布“时差观赛 / scgs.tv”的首发内容，面向小红书图文和知乎长文。

## 文件说明

- `xiaohongshu-cards/`：7 张小红书竖版图，尺寸 `1242x1660`。
- `xiaohongshu-post.md`：小红书标题、正文、标签和发图顺序。
- `zhihu-article.md`：知乎文章正文，可直接复制后按平台编辑器微调排版。
- `generate_xiaohongshu_cards.py`：图片生成脚本，修改文案后可重新运行。

## 使用建议

- 小红书正文不要把外链当主动作，建议写“浏览器输入 scgs.tv”。
- 知乎文章可自然放 `https://scgs.tv`，中段和文末各一次即可。
- 全部文案保持“官方公开复播页面”“无剧透导航”“本地浏览器辅助工具”等表述。
- 不使用“官方授权”“世界杯官方入口”“免费看世界杯”“直播”“搬运资源”等高风险说法。

## 重新生成图片

```powershell
python .\marketing\launch-2026\generate_xiaohongshu_cards.py
```
