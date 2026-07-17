#!/usr/bin/env python3
"""Deck assembly helpers for the presentation-maker skill.

The agent builds decks ONLY through these functions — never raw OOXML.
All layout constants assume a 16:9 slide (13.333 x 7.5 in).
"""
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
import os

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
MARGIN = Inches(0.83)  # consistent outer margin on every slide
CONTENT_W = Inches(13.333 - 2 * 0.83)


def _rgb(hex6):
    return RGBColor.from_string(hex6)


def _blank_slide(prs, theme):
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank layout
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = _rgb(theme["colors"]["bg"])
    return slide


def _textbox(slide, x, y, w, h):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    return box, tf


def _set_run(para, text, theme, size, color_key, font_key="body", bold=False):
    para.text = text
    run = para.runs[0]
    run.font.name = theme["fonts"][font_key]
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = _rgb(theme["colors"][color_key])
    return run


def new_deck(theme):
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    return prs


def add_title_slide(prs, theme, title, subtitle=""):
    slide = _blank_slide(prs, theme)
    _, tf = _textbox(slide, MARGIN, Inches(2.5), CONTENT_W, Inches(1.6))
    _set_run(tf.paragraphs[0], title, theme, 44, "text", "heading", bold=True)
    if subtitle:
        _, sf = _textbox(slide, MARGIN, Inches(4.3), CONTENT_W, Inches(0.8))
        _set_run(sf.paragraphs[0], subtitle, theme, 20, "muted")
    _accent_bar(slide, theme, Inches(2.2))


def _accent_bar(slide, theme, y):
    from pptx.enum.shapes import MSO_SHAPE
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, MARGIN, y, Inches(0.9), Inches(0.08))
    bar.fill.solid()
    bar.fill.fore_color.rgb = _rgb(theme["colors"]["primary"])
    bar.line.fill.background()


def add_section_slide(prs, theme, title, kicker=""):
    slide = _blank_slide(prs, theme)
    if kicker:
        _, kf = _textbox(slide, MARGIN, Inches(2.6), CONTENT_W, Inches(0.5))
        _set_run(kf.paragraphs[0], kicker.upper(), theme, 14, "primary", bold=True)
    _, tf = _textbox(slide, MARGIN, Inches(3.1), CONTENT_W, Inches(1.4))
    _set_run(tf.paragraphs[0], title, theme, 36, "text", "heading", bold=True)


def _header(slide, theme, title, kicker=""):
    if kicker:
        _, kf = _textbox(slide, MARGIN, Inches(0.55), CONTENT_W, Inches(0.4))
        _set_run(kf.paragraphs[0], kicker.upper(), theme, 12, "primary", bold=True)
    _, tf = _textbox(slide, MARGIN, Inches(0.95), CONTENT_W, Inches(0.9))
    _set_run(tf.paragraphs[0], title, theme, 28, "text", "heading", bold=True)


def _bullets_into(tf, theme, bullets, size=18):
    for i, item in enumerate(bullets):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        _set_run(para, str(item), theme, size, "text")
        para.space_after = Pt(10)


def add_bullets_slide(prs, theme, title, bullets, kicker=""):
    slide = _blank_slide(prs, theme)
    _header(slide, theme, title, kicker)
    _, tf = _textbox(slide, MARGIN, Inches(2.1), CONTENT_W, Inches(4.6))
    _bullets_into(tf, theme, bullets)


def add_two_column_slide(prs, theme, title, left_title, left_bullets, right_title, right_bullets):
    slide = _blank_slide(prs, theme)
    _header(slide, theme, title)
    col_w = Inches((13.333 - 2 * 0.83 - 0.5) / 2)
    for idx, (col_title, col_bullets) in enumerate(((left_title, left_bullets), (right_title, right_bullets))):
        x = MARGIN + idx * (col_w + Inches(0.5))
        _, ht = _textbox(slide, x, Inches(2.1), col_w, Inches(0.5))
        _set_run(ht.paragraphs[0], col_title, theme, 18, "primary", bold=True)
        _, bt = _textbox(slide, x, Inches(2.7), col_w, Inches(3.9))
        _bullets_into(bt, theme, col_bullets, size=16)


def add_stats_slide(prs, theme, title, stats):
    if len(stats) > 4:
        raise ValueError("add_stats_slide supports at most 4 stats")
    slide = _blank_slide(prs, theme)
    _header(slide, theme, title)
    n = len(stats)
    gap = Inches(0.4)
    card_w = (CONTENT_W - gap * (n - 1)) / n if n > 1 else CONTENT_W
    for i, (value, label) in enumerate(stats):
        x = MARGIN + i * (card_w + gap)
        _, vf = _textbox(slide, x, Inches(2.9), card_w, Inches(1.1))
        vf.paragraphs[0].alignment = PP_ALIGN.CENTER
        _set_run(vf.paragraphs[0], str(value), theme, 40, "primary", "heading", bold=True)
        _, lf = _textbox(slide, x, Inches(4.0), card_w, Inches(0.7))
        lf.paragraphs[0].alignment = PP_ALIGN.CENTER
        _set_run(lf.paragraphs[0], str(label), theme, 14, "muted")


def add_quote_slide(prs, theme, quote, attribution=""):
    slide = _blank_slide(prs, theme)
    _, tf = _textbox(slide, Inches(1.6), Inches(2.4), Inches(10.1), Inches(2.2))
    _set_run(tf.paragraphs[0], '"%s"' % quote, theme, 28, "text", "heading")
    if attribution:
        _, af = _textbox(slide, Inches(1.6), Inches(4.8), Inches(10.1), Inches(0.6))
        _set_run(af.paragraphs[0], "— %s" % attribution, theme, 16, "muted")


def add_closing_slide(prs, theme, title, lines):
    slide = _blank_slide(prs, theme)
    _, tf = _textbox(slide, MARGIN, Inches(2.7), CONTENT_W, Inches(1.2))
    _set_run(tf.paragraphs[0], title, theme, 40, "text", "heading", bold=True)
    _, lf = _textbox(slide, MARGIN, Inches(4.1), CONTENT_W, Inches(1.5))
    _bullets_into(lf, theme, lines, size=16)


def save_deck(prs, path):
    path = os.path.abspath(path)
    prs.save(path)
    return path
