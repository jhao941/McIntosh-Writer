# McIntosh Writer

[English](README.md) | [简体中文](README.zh-CN.md)

<p align="center">
  <img src="docs/images/hello-default.png" alt="McIntosh Writer 图标" width="280">
  <img src="docs/images/hello-dark.png" alt="深色外观下的 McIntosh Writer 图标" width="280">
</p>

McIntosh Writer 用 Apple 开机画面“hello”的手写体书写文字，一笔连贯地写出来，并可存储为 SVG 动画。

它使用 Macintosh Skeletal 字体书写。这是 Apple 随 macOS 27 和 iOS 27 附带的字体，用于设置新 Mac 或 iPhone 时显示的“hello”。
本仓库不包含这个字体，McIntosh Writer 读取的是你的 Mac 上已有的那一份。

## 功能

- 书写字体支持的任意文字，包括带重音的拉丁字母、希腊字母和西里尔字母，并以一笔一笔的动画呈现
- 字形和连笔与 Apple 自己的渲染结果一致
- 调整书写速度和笔画粗细，默认粗细与开机画面相同
- 选择浅色、深色或渐变配色
- 字母 o 的连笔可以越过顶部（字体原样），也可以穿过中间（Apple 早年 hello 动画的写法）
- 字母 p 和 s 可以一笔写完，也可以像字体默认的那样中途抬笔
- 下载 SVG 动画，用于网页、Keynote 或 Figma
- 在“字形检查”中查看字母之间的连笔，并对比两个版本的字体

## 系统要求

- 装有 macOS 27 的 Mac（系统附带 Macintosh Skeletal 字体）
- 最新版本的 Safari、Chrome 或 Firefox
- Python 3，用于启动本地网页服务器（随 Xcode 命令行工具附带）

## 开始使用

1. 克隆仓库：

   ```bash
   git clone https://github.com/jhao941/McIntosh-Writer.git
   ```

2. 在 McIntosh-Writer 文件夹中连按 `start.command`。它会启动本地网页服务器，并在浏览器中打开 McIntosh Writer。

   也可以自己启动服务器：在该文件夹中运行 `python3 -m http.server 8000`，然后打开 <http://localhost:8000/>。这个服务器会让浏览器继续使用缓存中的旧文件，因此更新 McIntosh Writer 后，请按下 Command-Shift-R 重新载入页面（在 Safari 中按下 Option-Command-R）。用 `start.command` 启动的服务器没有这个问题。

3. 点按“选取字体”，按下 Command-Shift-G，输入以下路径，然后选取 `MacintoshSkeletal.otf`：

   ```text
   /System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/
   ```

浏览器会记住这个字体，只需选取一次。

在“访达”中直接打开 `index.html` 时，McIntosh Writer 无法运行：浏览器不允许从文件打开的网页载入读取字体所需的组件。

界面提供英文和简体中文，默认跟随浏览器的语言。要切换语言，请点按右上角的语言名称。

### 对比不同版本的字体

iOS 27 的同一个 framework 中也有一份 Macintosh Skeletal，和 macOS 版本略有不同。
要对比两者，请在“字形检查”中选取这两个字体，然后从“叠加对比”菜单中选择其中一个。

## 工作原理

**笔画。** Macintosh Skeletal 把每个字形的中心线存储在一张私有的 `strk` 表中：这是一份 JSON，包含笔的半径、端点标记和连笔信息。
其中的点是均匀三次 B 样条的控制点。`apple-font.js` 从字体文件中读取这张表，
`apple-writer.js` 把每一笔写成一条连续的 B 样条，再重新拟合成少量光滑的贝塞尔曲线。

**字母的写法。** 字体的 GSUB 和 GPOS 表决定每个字母用哪种写法（例如 `o` 之后的 `a.highEntry`、`e` 之前的 `v.midExit`），
并确定重音的位置和字距。在浏览器中，由 harfbuzz 执行这些规则。
`apple-shaper.js` 是用 JavaScript 写成的等效排字程序，使用 `tools/apple-rules.py` 导出的规则；两者在全部 38018 个测试用例中结果相同。

**字母之间的连笔。** 前一个字母的最后 3 个控制点和后一个字母的前 3 个控制点，替换为 3 个新点，按位置以 1/6、1/2、5/6 的权重混合；
每个字母其余的曲线保持不变。在小写字母两两组合的全部 2028 个连笔中，结果与从 Apple 渲染程序记录的连笔平均相差 2.2 个字体单位（x 高度约为 370 个单位）。

**字母内部的笔画。** 两笔的端点重合时形成尖角。标记了 tangency 的笔画会流入下一笔，并在下一笔的起点折返：
`a`、`c`、`d`、`g`、`q` 就是这样进入它们的圆，`t` 也是这样先升起再写竖。两侧都是影子点且相距较远的笔画是分开的两笔，例如 `x` 开头的斜线。
闭合的圈（例如 macOS 版字体中的 `o`）会绕一整圈，再接到出笔离开的位置。横画、重音以及 `i` 和 `j` 上的点在抬笔时补上。

**其他写法。** 字体里有一种 p 写到底后沿竖笔回到上方，绕过圆直接接下一个字母；还有一种接在 b、o、v、w 后面的 s，在底部绕一个小圈后直接接下一个字母。但字体的规则从不选用它们。
McIntosh Writer 在排字之后换上这些写法，和换上从中间穿过的 o 的做法相同。

## 文件

| 文件 | 说明 |
|---|---|
| `index.html`、`writer-app.js` | McIntosh Writer：文字、动画、配色和 SVG 下载 |
| `apple.html` | 字形检查：连笔、与原版动画对照、两个字体叠加对比 |
| `start.command` | 启动本地网页服务器并打开 McIntosh Writer |
| `apple-font.js` | 读取 `MacintoshSkeletal.otf`，用 harfbuzz 排字 |
| `apple-shaper.js` | 用 `tools/apple-rules.py` 导出的规则排字 |
| `apple-writer.js` | 把排好的字形画成笔画 |
| `apple-extras.js` | 补充从中间穿过的 o 的各种形式，并选用字体中一笔写完的 p 和 s |
| `apple-source.js` | 为两个页面载入字体：选取的文件，或 `data/apple/` |
| `i18n.js` | 英文和简体中文的界面文字 |
| `vendor/harfbuzzjs/` | harfbuzzjs 1.6.2（MIT 许可） |
| `tools/` | 可选脚本：导出字体数据并核对结果 |

### 可选工具

McIntosh Writer 不需要这些脚本。它们把字体数据导出到 `data/apple/`（git 会忽略这个文件夹），并相互核对各部分的结果。

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
FONT=/System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/MacintoshSkeletal.otf
venv/bin/python tools/apple-extract.py "$FONT"   # 笔画数据 → data/apple/glyphs.json
venv/bin/python tools/apple-rules.py "$FONT"     # GSUB 和 GPOS 规则 → data/apple/rules.json
venv/bin/python tools/apple-check.py "$FONT" && node tools/apple-check.mjs   # 核对 apple-shaper.js 与 harfbuzz
node tools/apple-font-check.mjs "$FONT"          # 核对 apple-font.js 与 data/apple
```

`tools/filled-check.py` 用 Macintosh Skeletal Filled 测量连笔的误差，需要另外下载那个字体。

## 致谢

- **Macintosh Skeletal** 归 Apple Inc. 所有，最早由 X 上的 [@itspdfu](https://x.com/itspdfu) 和
  [@SteveMoser](https://x.com/SteveMoser) 发现。
- npwitk 的 [**Macintosh Skeletal Filled**](https://github.com/npwitk/Macintosh-Skeletal-Filled)
  证实了这些点是 B 样条控制点，揭示了 Apple 渲染程序连接字母的方式，以及开机画面按存储半径的 1.55 倍绘制笔画。
  它的字体只在本地电脑上用于校准和核对连笔，本仓库不包含它的任何文件或数据。
- Gigi（[@g-cqd](https://github.com/g-cqd)）和 Jace（[@JaceThings](https://github.com/JaceThings)）的
  [**SF-Hello**](https://github.com/JaceThings/SF-Hello) 公开了 Apple 早年的 hello 动画。
  把它克隆到本仓库旁边后，“字形检查”会将结果与这些动画对照。从中间穿过的 o 的那一笔，描自其中的“hola”动画。
- [**HarfBuzz**](https://github.com/harfbuzz/harfbuzz) 和 [**harfbuzzjs**](https://github.com/harfbuzz/harfbuzzjs)
  在浏览器中完成排字。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 免责声明

McIntosh Writer 是一个独立的研究项目，与 Apple Inc. 没有关联，也未获其赞助或认可；与 McIntosh Laboratory, Inc. 也没有关系。

Macintosh Skeletal、它的字形、笔画数据以及“hello”手写体的设计均归 Apple Inc. 所有。
本仓库不包含任何 Apple 字体文件，也不包含从中提取的数据。McIntosh Writer 读取的是你自己设备上的字体，
可选工具会把输出存储到 `data/apple/`，git 会忽略这个文件夹。请勿再分发这个字体或从中提取的任何内容。

Apple、Mac、Macintosh、iPhone、macOS 和 iOS 是 Apple Inc. 的商标。McIntosh 是 McIntosh Laboratory, Inc. 的商标。
如果你是权利人，希望修改或删除某些内容，请提交 issue。

## 许可

本仓库的代码以 [MIT 许可](LICENSE)发布。该许可不涵盖 Apple 的字体、字形或数据。
