# McIntosh Writer

[English](README.md) | [简体中文](README.zh-CN.md)

<p align="center">
  <img src="docs/images/hello-default.png" alt="McIntosh Writer icon" width="280">
  <img src="docs/images/hello-dark.png" alt="McIntosh Writer icon in dark appearance" width="280">
</p>

McIntosh Writer writes text in the handwriting from Apple’s hello screen,
one continuous stroke at a time, and saves the result as an animated SVG.

It draws with Macintosh Skeletal, the font Apple includes with macOS 27 and
iOS 27 for the hello you see when you set up a new Mac or iPhone. The font
isn’t included in this repository; McIntosh Writer reads the copy that’s
already on your Mac.

## Features

- Write any text the font supports, including accented Latin, Greek and
  Cyrillic letters, with a stroke-by-stroke animation
- Letterforms and joins that match Apple’s own rendering
- Adjust speed and pen weight; the default weight matches the hello screen
- Choose Light, Dark or Gradient colors
- Join the letter o over the top, as the font does, or through the middle,
  as Apple’s earlier hello animations did
- Write p and s in one continuous stroke, or lift the pen partway, as the
  font does by default
- Download an animated SVG for webpages, Keynote or Figma
- Inspect joins and compare two versions of the font in the Glyph Inspector

## Requirements

- A Mac with macOS 27, which includes the Macintosh Skeletal font
- A current version of Safari, Chrome or Firefox
- Python 3 to run a local web server (included with the Xcode Command Line
  Tools)

## Getting started

1. Clone the repository:

   ```bash
   git clone https://github.com/jhao941/McIntosh-Writer.git
   ```

2. In the McIntosh-Writer folder, double-click `start.command`. It starts a
   local web server and opens McIntosh Writer in your browser.

   To start the server yourself instead, run
   `python3 -m http.server 8000` in the folder, then open
   <http://localhost:8000/>. This server lets your browser keep using cached
   copies of files, so after you update McIntosh Writer, reload the page with
   Command-Shift-R (in Safari, Option-Command-R). The server that
   `start.command` starts doesn't have this problem.

3. Click Choose Font, press Command-Shift-G, enter the following path, then
   choose `MacintoshSkeletal.otf`:

   ```text
   /System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/
   ```

Your browser remembers the font, so you need to choose it only once.

McIntosh Writer can’t run when you open `index.html` directly from the
Finder, because browsers don’t let a page opened from a file load the
components it uses to read the font.

The interface is available in English and Simplified Chinese. It follows
your browser’s language; to switch, click the language name in the
top-right corner.

### Compare versions of the font

The iOS 27 software includes a slightly different version of Macintosh
Skeletal in the same framework. To compare it with the macOS version, choose
both fonts in the Glyph Inspector, then choose one of them from the Compare
With menu.

## How it works

**Strokes.** Macintosh Skeletal stores the center line of every glyph in a
private `strk` table: a JSON document with pen radii, end-point flags and
joining information. The points are control points of uniform cubic
B-splines. `apple-font.js` reads the table from the font file, and
`apple-writer.js` turns each pen path into one continuous B-spline, then
refits it into a few smooth Bézier curves.

**Letter forms.** The font’s GSUB and GPOS tables choose the form of each
letter (for example, `a.highEntry` after `o` and `v.midExit` before `e`),
position accents and apply kerning. In the browser, harfbuzz runs these
tables. `apple-shaper.js` is an equivalent shaper written in JavaScript that
uses rules exported by `tools/apple-rules.py`; the two produce identical
results for all 38,018 test cases.

**Joins between letters.** The last three control points of one letter and
the first three of the next are replaced with three new points, blended
by position with weights of 1/6, 1/2 and 5/6. Each letter keeps the rest of
its own curve. Across all 2,028 joins between pairs of lowercase letters,
the result is on average 2.2 font units from joins recorded from Apple’s
renderer (the x-height is about 370 units).

**Strokes within a letter.** Strokes whose ends meet form a corner. A stroke
marked with tangency flows into the next stroke and turns back at its start:
that’s how `a`, `c`, `d`, `g` and `q` enter their bowls and how `t` rises
before its stem. Strokes whose off-curve ends lie far apart are separate pen
strokes, like the opening diagonal of `x`. Closed loops, such as `o` in the
macOS version of the font, are written once around and continue to where
the exit stroke leaves. Crossbars, accents and the dots on `i` and `j` are
added when the pen lifts.

**Alternate forms.** The font includes forms of p that retrace the stem and
continue around the bowl into the next letter, and a form of s that loops at
the bottom and continues into the next letter after b, o, v or w, but its
rules never choose them. McIntosh Writer swaps them in after shaping, the
same way it swaps in the forms of o that join through the middle.

## Files

| File | Description |
|---|---|
| `index.html`, `writer-app.js` | McIntosh Writer: text, animation, colors and SVG download |
| `apple.html` | Glyph Inspector: joins, comparison with the original animations, two fonts overlaid |
| `start.command` | Starts a local web server and opens McIntosh Writer |
| `apple-font.js` | Reads `MacintoshSkeletal.otf` and shapes text with harfbuzz |
| `apple-shaper.js` | Shapes text with rules exported by `tools/apple-rules.py` |
| `apple-writer.js` | Turns shaped glyphs into pen paths |
| `apple-extras.js` | Adds forms of o that join through the middle, and chooses the font’s one-stroke forms of p and s |
| `apple-source.js` | Loads fonts for both pages, from chosen files or from `data/apple/` |
| `i18n.js` | Interface text in English and Simplified Chinese |
| `vendor/harfbuzzjs/` | harfbuzzjs 1.6.2 (MIT License) |
| `tools/` | Optional scripts that export the font’s data and verify the results |

### Optional tools

McIntosh Writer doesn’t need these scripts. They export the font’s data to
`data/apple/`, which git ignores, and check each part against the others.

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
FONT=/System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/MacintoshSkeletal.otf
venv/bin/python tools/apple-extract.py "$FONT"   # Stroke data → data/apple/glyphs.json
venv/bin/python tools/apple-rules.py "$FONT"     # GSUB and GPOS rules → data/apple/rules.json
venv/bin/python tools/apple-check.py "$FONT" && node tools/apple-check.mjs   # apple-shaper.js vs. harfbuzz
node tools/apple-font-check.mjs "$FONT"          # apple-font.js vs. data/apple
```

`tools/filled-check.py` measures the joins against Macintosh Skeletal
Filled. It requires that font, which you download separately.

## Credits

- **Macintosh Skeletal** is the property of Apple Inc. It was first found by
  [@itspdfu](https://x.com/itspdfu) and [@SteveMoser](https://x.com/SteveMoser)
  on X.
- [**Macintosh Skeletal Filled**](https://github.com/npwitk/Macintosh-Skeletal-Filled)
  by npwitk showed that the points are B-spline control points, how Apple’s
  renderer joins letters and that the hello screen draws the pen at 1.55
  times its stored radius. Its fonts were used only on a local computer, to
  calibrate and check the joins. This repository includes none of its files
  or data.
- [**SF-Hello**](https://github.com/JaceThings/SF-Hello) by Gigi
  ([@g-cqd](https://github.com/g-cqd)) and Jace
  ([@JaceThings](https://github.com/JaceThings)) publishes Apple’s earlier
  hello animations. When it’s cloned next to this repository, the Glyph
  Inspector compares results with these animations. The stroke of o that
  joins through the middle is traced from its “hola” animation.
- [**HarfBuzz**](https://github.com/harfbuzz/harfbuzz) and
  [**harfbuzzjs**](https://github.com/harfbuzz/harfbuzzjs) shape text in the
  browser. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Disclaimer

McIntosh Writer is an independent research project. It isn’t affiliated
with, sponsored by or endorsed by Apple Inc., and it isn’t connected with
McIntosh Laboratory, Inc.

Macintosh Skeletal, its letterforms, its stroke data and the design of the
hello handwriting are the property of Apple Inc. This repository contains no
Apple font files and no data extracted from them. McIntosh Writer reads the
font from your own device, and the optional tools save their output to
`data/apple/`, which git ignores. Don’t redistribute the font or anything
extracted from it.

Apple, Mac, Macintosh, iPhone, macOS and iOS are trademarks of Apple Inc.
McIntosh is a trademark of McIntosh Laboratory, Inc. If you’re a rights
holder and want something changed or removed, open an issue.

## License

The code in this repository is available under the [MIT License](LICENSE).
The license doesn’t cover Apple’s font, letterforms or data.
