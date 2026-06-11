from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = Path(__file__).resolve().parent / "xiaohongshu-cards"
WIDTH, HEIGHT = 1242, 1660

COLORS = {
    "midnight": (5, 12, 47),
    "navy": (7, 26, 84),
    "blue": (0, 107, 255),
    "cyan": (8, 213, 255),
    "red": (255, 39, 95),
    "gold": (255, 214, 107),
    "paper": (255, 255, 255),
    "muted": (192, 204, 230),
}


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/NotoSansSC-VF.ttf",
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


FONT = {
    "eyebrow": font(34, True),
    "title": font(92, True),
    "title_small": font(78, True),
    "subtitle": font(44, True),
    "body": font(38),
    "body_bold": font(42, True),
    "small": font(28),
    "number": font(88, True),
    "url": font(58, True),
}


def text_size(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def wrap_text(draw, text, fnt, max_width):
    lines = []
    for paragraph in text.split("\n"):
        current = ""
        for ch in paragraph:
            trial = current + ch
            if text_size(draw, trial, fnt)[0] <= max_width:
                current = trial
            else:
                if current:
                    lines.append(current)
                current = ch
        if current:
            lines.append(current)
    return lines


def draw_multiline(draw, xy, text, fnt, fill, max_width, line_gap=16, anchor=None):
    x, y = xy
    lines = wrap_text(draw, text, fnt, max_width)
    if anchor == "mm":
        heights = [text_size(draw, line, fnt)[1] for line in lines]
        total_h = sum(heights) + line_gap * (len(lines) - 1)
        y -= total_h / 2
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += text_size(draw, line, fnt)[1] + line_gap
    return y


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_bg():
    bg_path = ROOT / "website" / "assets" / "hero-bg.png"
    bg = Image.open(bg_path).convert("RGB")
    scale = max(WIDTH / bg.width, HEIGHT / bg.height)
    bg = bg.resize((int(bg.width * scale), int(bg.height * scale)), Image.Resampling.LANCZOS)
    left = (bg.width - WIDTH) // 2
    top = (bg.height - HEIGHT) // 2
    bg = bg.crop((left, top, left + WIDTH, top + HEIGHT)).convert("RGBA")

    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for y in range(HEIGHT):
        alpha = int(220 - 55 * (y / HEIGHT))
        od.line([(0, y), (WIDTH, y)], fill=(5, 12, 47, alpha))
    od.rectangle((0, 0, WIDTH, HEIGHT), fill=(5, 12, 47, 72))
    return Image.alpha_composite(bg, overlay)


def paste_logo(canvas):
    logo_path = ROOT / "website" / "assets" / "logo-white-wide.png"
    logo = Image.open(logo_path).convert("RGBA")
    logo_w = 230
    logo_h = int(logo.height * logo_w / logo.width)
    logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, (88, 78))


def draw_footer(draw, number):
    draw.text((88, 1500), f"{number:02d} / 07", font=FONT["small"], fill=(255, 255, 255, 180))
    draw.text((WIDTH - 88, 1494), "scgs.tv", font=FONT["small"], fill=COLORS["cyan"], anchor="ra")


def draw_header(draw, kicker):
    rounded_rect(draw, (88, 190, 88 + 300, 250), 30, (255, 255, 255, 26), (255, 255, 255, 44), 1)
    draw.text((120, 203), kicker, font=FONT["eyebrow"], fill=COLORS["cyan"])


def draw_card_base(number, kicker):
    canvas = make_bg()
    paste_logo(canvas)
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, kicker)
    draw_footer(draw, number)
    return canvas, draw


def draw_big_title(draw, title, y=330, small=False):
    fnt = FONT["title_small"] if small else FONT["title"]
    return draw_multiline(draw, (88, y), title, fnt, COLORS["paper"], WIDTH - 176, 18)


def bullet(draw, y, title, body):
    x = 120
    rounded_rect(draw, (88, y, WIDTH - 88, y + 160), 28, (5, 12, 47, 196), (255, 255, 255, 64), 1)
    draw.ellipse((x, y + 58, x + 22, y + 80), fill=COLORS["red"])
    draw.text((x + 46, y + 34), title, font=FONT["body_bold"], fill=COLORS["paper"])
    draw.text((x + 46, y + 88), body, font=FONT["small"], fill=COLORS["muted"])


def cards():
    return [
        {
            "file": "card-01-cover.png",
            "kicker": "世界杯补赛党",
            "title": "不熬夜，也能\n无剧透看世界杯",
            "subtitle": "给第二天补完整复播的人",
            "kind": "cover",
        },
        {
            "file": "card-02-pain.png",
            "kicker": "最怕什么",
            "title": "不是找不到复播，\n是还没点开就被剧透",
            "bullets": [
                ("标题", "谁赢了、谁进球，常常写得明明白白"),
                ("评论", "刚打开页面，赛果已经飘进眼睛"),
                ("推荐", "缩略图和热榜会提前泄露比赛走向"),
            ],
        },
        {
            "file": "card-03-solution.png",
            "kicker": "解决思路",
            "title": "只看时间和对阵，\n先别看比分和赛果",
            "bullets": [
                ("赛程导航", "只展示北京时间、轮次、双方球队"),
                ("官方复播", "点击后进入官方公开复播页面观看"),
                ("本地辅助", "浏览器助手尽量隐藏可能剧透的信息"),
            ],
        },
        {
            "file": "card-04-workflow.png",
            "kicker": "使用流程",
            "title": "三步进入\n无剧透补赛状态",
            "steps": [
                ("1", "安装时差观赛助手"),
                ("2", "打开 scgs.tv 选择比赛"),
                ("3", "进入官方公开复播页面"),
            ],
        },
        {
            "file": "card-05-checklist.png",
            "kicker": "防剧透清单",
            "title": "睡醒看球前，\n先把这些都关掉",
            "checks": ["手机免打扰", "别刷新闻 App", "别搜球队名", "电脑提前停在 scgs.tv"],
        },
        {
            "file": "card-06-safe.png",
            "kicker": "边界说明",
            "title": "这是导航工具，\n不是视频搬运站",
            "bullets": [
                ("不上传", "本站不存储、不上传赛事视频"),
                ("不转播", "不嵌入未经允许的视频页面"),
                ("不伪装", "插件是第三方本地浏览器辅助工具"),
            ],
        },
        {
            "file": "card-07-url.png",
            "kicker": "收藏备用",
            "title": "补世界杯复播，\n浏览器输入",
            "kind": "url",
        },
    ]


def render_card(idx, spec):
    canvas, draw = draw_card_base(idx, spec["kicker"])
    if spec.get("kind") == "cover":
        y = draw_big_title(draw, spec["title"], 350)
        draw.text((88, y + 44), spec["subtitle"], font=FONT["subtitle"], fill=COLORS["cyan"])
        rounded_rect(draw, (88, 1040, WIDTH - 88, 1240), 36, (255, 39, 95, 235))
        draw.text((WIDTH // 2, 1092), "只看时间和对阵", font=FONT["subtitle"], fill=COLORS["paper"], anchor="ma")
        draw.text((WIDTH // 2, 1152), "不看比分 · 不看赛果", font=FONT["body"], fill=(255, 255, 255, 225), anchor="ma")
    elif spec.get("kind") == "url":
        y = draw_big_title(draw, spec["title"], 350)
        rounded_rect(draw, (112, y + 70, WIDTH - 112, y + 260), 34, (255, 255, 255, 235))
        draw.text((WIDTH // 2, y + 120), "scgs.tv", font=FONT["url"], fill=COLORS["midnight"], anchor="ma")
        draw.text((WIDTH // 2, y + 208), "时差观赛 / 无剧透复播导航", font=FONT["small"], fill=COLORS["blue"], anchor="ma")
        draw.text((88, 1110), "建议先收藏这组图。比赛前一晚把电脑浏览器打开，第二天直接从这里进复播。", font=FONT["body"], fill=COLORS["paper"])
    else:
        y = draw_big_title(draw, spec["title"], 322, small=len(spec["title"]) > 15)
        if "bullets" in spec:
            yy = max(y + 80, 690)
            for title, body in spec["bullets"]:
                bullet(draw, yy, title, body)
                yy += 196
        if "steps" in spec:
            yy = max(y + 90, 720)
            for num, label in spec["steps"]:
                rounded_rect(draw, (88, yy, WIDTH - 88, yy + 150), 28, (5, 12, 47, 196), (255, 255, 255, 64), 1)
                draw.text((146, yy + 31), num, font=FONT["number"], fill=COLORS["red"])
                draw.text((250, yy + 54), label, font=FONT["body_bold"], fill=COLORS["paper"])
                yy += 185
        if "checks" in spec:
            yy = max(y + 90, 720)
            for label in spec["checks"]:
                rounded_rect(draw, (88, yy, WIDTH - 88, yy + 112), 24, (5, 12, 47, 196), (255, 255, 255, 64), 1)
                draw.ellipse((126, yy + 38, 162, yy + 74), fill=COLORS["cyan"])
                draw.text((135, yy + 31), "✓", font=FONT["small"], fill=COLORS["midnight"])
                draw.text((196, yy + 32), label, font=FONT["body_bold"], fill=COLORS["paper"])
                yy += 142

    img = canvas.convert("RGB")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img.save(OUT_DIR / spec["file"], quality=95)


def make_contact_sheet():
    thumbs = []
    for spec in cards():
        img = Image.open(OUT_DIR / spec["file"]).convert("RGB")
        img.thumbnail((220, 294), Image.Resampling.LANCZOS)
        thumbs.append((spec["file"], img.copy()))
    sheet = Image.new("RGB", (4 * 260 + 40, 2 * 350 + 60), (242, 246, 251))
    d = ImageDraw.Draw(sheet)
    for i, (name, img) in enumerate(thumbs):
        x = 30 + (i % 4) * 260
        y = 30 + (i // 4) * 350
        sheet.paste(img, (x, y))
        d.text((x, y + img.height + 12), name, font=FONT["small"], fill=COLORS["midnight"])
    sheet.save(OUT_DIR / "contact-sheet.png", quality=92)


def main():
    for idx, spec in enumerate(cards(), 1):
        render_card(idx, spec)
    make_contact_sheet()
    print(f"Generated {len(cards())} cards in {OUT_DIR}")


if __name__ == "__main__":
    main()
