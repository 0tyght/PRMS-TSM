"""Create a print-ready Smart Tha Pho LINE tester poster with real QR links.

Usage:
  python create-line-test-poster.py --citizen @example --driver @example --output poster.png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont


WIDTH, HEIGHT = 2480, 3508  # A4 at 300 dpi
MARGIN = 170
GREEN = "#076130"
GREEN_DARK = "#043F22"
LIME = "#A6D92D"
INK = "#153426"
MUTED = "#557062"
PAPER = "#F7FAF4"
CARD = "#FFFFFF"
LINE_GREEN = "#06C755"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "LeelaUIb.ttf" if bold else "LeelawUI.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def centered(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, text_font, fill: str) -> None:
    left, top, right, bottom = box
    bounds = draw.textbbox((0, 0), text, font=text_font)
    x = left + ((right - left) - (bounds[2] - bounds[0])) // 2
    y = top + ((bottom - top) - (bounds[3] - bounds[1])) // 2 - bounds[1]
    draw.text((x, y), text, fill=fill, font=text_font)


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill: str, outline: str | None = None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def qr_image(add_friend_url: str) -> Image.Image:
    code = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=18, border=5)
    code.add_data(add_friend_url)
    code.make(fit=True)
    return code.make_image(fill_color="#111111", back_color="white").convert("RGB")


def panel(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    audience: str,
    title: str,
    basic_id: str,
    command_lines: list[str],
    accent: str,
) -> None:
    left, top, right, bottom = box
    rounded(draw, box, 42, CARD, outline="#DDE9DC", width=5)
    rounded(draw, (left + 54, top + 52, left + 440, top + 120), 34, "#EAF8D7")
    centered(draw, (left + 54, top + 48, left + 440, top + 124), audience, font(29, True), GREEN)
    draw.text((left + 58, top + 160), title, fill=INK, font=font(52, True))
    draw.text((left + 58, top + 230), "สแกน QR เพื่อเพิ่มเพื่อน", fill=MUTED, font=font(33))

    qr = qr_image(f"https://line.me/R/ti/p/{basic_id}")
    qr_side = 570
    qr.thumbnail((qr_side, qr_side), Image.Resampling.NEAREST)
    qr_x = left + 58
    qr_y = top + 320
    rounded(draw, (qr_x - 24, qr_y - 24, qr_x + qr_side + 24, qr_y + qr_side + 24), 28, "#FFFFFF", outline="#CFE4D0", width=5)
    canvas.paste(qr, (qr_x, qr_y))

    rounded(draw, (left + 675, top + 320, right - 55, bottom - 55), 28, "#F1F8EE")
    draw.text((left + 725, top + 375), "เริ่มทดสอบ", fill=GREEN, font=font(34, True))
    y = top + 455
    for number, line in enumerate(command_lines, start=1):
        rounded(draw, (left + 725, y - 2, left + 785, y + 58), 30, accent)
        centered(draw, (left + 725, y - 2, left + 785, y + 58), str(number), font(27, True), "#FFFFFF")
        draw.text((left + 815, y), line, fill=INK, font=font(32, True if number == len(command_lines) else False))
        y += 98

    rounded(draw, (left + 58, bottom - 155, left + 628, bottom - 65), 28, LINE_GREEN)
    centered(draw, (left + 58, bottom - 154, left + 628, bottom - 64), f"LINE ID  {basic_id}", font(31, True), "#FFFFFF")
    draw.text((left + 690, bottom - 130), "ใช้บัญชี LINE ทดสอบตามที่ได้รับมอบหมาย", fill=MUTED, font=font(26))


def create_poster(citizen_id: str, driver_id: str, output: Path) -> None:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(canvas)

    draw.rectangle((0, 0, WIDTH, 780), fill=GREEN_DARK)
    for index in range(16):
        x = -160 + index * 180
        draw.ellipse((x, 510 - (index % 3) * 80, x + 360, 870 - (index % 3) * 80), fill="#0A6B36")
    rounded(draw, (MARGIN, 132, MARGIN + 140, 272), 36, LIME)
    centered(draw, (MARGIN, 124, MARGIN + 140, 280), "ทพ", font(44, True), GREEN_DARK)
    draw.text((MARGIN + 180, 140), "SMART THA PHO", fill=LIME, font=font(34, True))
    draw.text((MARGIN + 180, 192), "เทศบาลเมืองท่าโพธิ์", fill="#E4F4DE", font=font(30))
    draw.text((MARGIN, 350), "ทดสอบระบบผ่าน LINE", fill="#FFFFFF", font=font(86, True))
    draw.text((MARGIN, 465), "ระบบบริหารจัดการการเก็บขยะ", fill="#FFFFFF", font=font(56, True))
    draw.text((MARGIN, 565), "เลือกสแกน QR ให้ตรงกับบทบาทของผู้ทดสอบ", fill="#D8EFD3", font=font(35))

    panel(canvas, draw, (MARGIN, 920, WIDTH - MARGIN, 1990), "สำหรับประชาชน", "บริการเก็บขยะ", citizen_id, ["พิมพ์ “เริ่มต้น”", "เลือก “รถเก็บขยะ”", "เลือก “ลงทะเบียนบริการเก็บขยะ”"], GREEN)
    panel(canvas, draw, (MARGIN, 2130, WIDTH - MARGIN, 3200), "สำหรับพนักงานประจำรถขยะ", "งานเก็บขยะของฉัน", driver_id, ["พิมพ์ “เริ่มต้น”", "เลือก “ยืนยันตัวตน”", "กรอกรหัสพนักงานและเบอร์โทรศัพท์"], "#4A8F26")

    draw.text((MARGIN, 3330), "สำหรับทดสอบระบบเท่านั้น  •  หากพบปัญหา โปรดแจ้งเจ้าพนักงานสาธารณสุข", fill=MUTED, font=font(30))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, "PNG", dpi=(300, 300), optimize=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--citizen", required=True, help="LINE Basic ID, e.g. @example")
    parser.add_argument("--driver", required=True, help="LINE Basic ID, e.g. @example")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    create_poster(args.citizen, args.driver, args.output)
