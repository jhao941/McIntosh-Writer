// 界面文案（简体中文 / English），按 Apple Human Interface Guidelines 的 Writing 一节和 Apple Style Guide 写：
// 按钮用动词、会打开对话框的加省略号（正文里提到时不加）、英文按钮和选项用标题式大小写、复选框用句子式；
// 中文沿用 Apple 的译法（Choose = 选取、Click = 点按、Double-click = 连按），中英文之间加空格，引号用 “”。
//
//   mwI18n.t("btn.play")                 → 当前语言的文案
//   mwI18n.t("status.font", { name })    → 替换 {name}
//   mwI18n.apply()                       → 填好页面上带 data-i18n* 属性的元素
//   语言：网址 ?lang=en / ?lang=zh，或上次在页面上切换的，否则跟随浏览器
(function (root) {
  const STRINGS = {
    "zh-Hans": {
      "nav.inspect": "字形检查",
      "nav.legacy": "旧版",
      "nav.lang": "English",

      "stage.hint": "点按以重新播放",
      "input.placeholder": "输入要书写的文字",
      "btn.play": "播放",
      "btn.play.hint": "播放（⌘↩）",
      "section.appearance": "外观",
      "section.layout": "排版",
      "section.letterforms": "写法",
      "section.playback": "播放与导出",
      "btn.export": "下载 SVG 动画",
      "btn.static": "导出图片",
      "label.speed": "速度",
      "label.weight": "粗细",
      "weight.hint": "1.55× 与开机画面的粗细相同",
      "label.center": "文字居中",
      "label.lineSpacing": "行距",
      "lineSpacing.hint": "调整多行文字之间的距离",
      "label.theme": "配色",
      "label.videoRatio": "宽高比",
      "videoRatio.landscape": "横向 16:9",
      "videoRatio.portrait": "竖向 9:16",
      "btn.video": "导出视频",
      "theme.ink": "浅色",
      "theme.night": "深色",
      "theme.color": "渐变",
      "label.gradientMode": "背景",
      "gradientMode.light": "白色",
      "gradientMode.dark": "深色",
      "label.ocross": "o 的连笔",
      "ocross.over": "越过顶部",
      "ocross.through": "穿过中间",
      "label.pjoin": "p 和 s 的写法",
      "pjoin.one": "一笔写完",
      "pjoin.lift": "中途抬笔",
      "label.font": "字体",
      "btn.chooseFont": "选取字体…",

      "status.font": "字体：{name}",
      "status.missing": "无法书写以下字符：{chars}",
      "status.videoUnsupported": "此浏览器不支持导出视频。",
      "status.videoExporting": "正在导出视频…",
      "status.videoConverting": "正在转换为 MP4…",
      "status.videoFallback": "MP4 转换不可用，已下载 WebM 视频。",
      "status.videoReady": "视频已下载。",
      "status.staticReady": "图片已下载。",
      "source.json": "data/apple（工具生成）",
      "source.info": "{count} 个字形 · {hash}",

      "setup.title": "选取 Macintosh Skeletal 字体",
      "setup.body": "<p>McIntosh Writer 使用 macOS 27 附带的 Macintosh Skeletal 字体书写，项目本身不包含这个字体。"
        + "点按下方的“选取字体”，按下 Command-Shift-G，输入以下路径，然后选取 <b>MacintoshSkeletal.otf</b>。</p>"
        + "<p><code>/System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/</code></p>"
        + "<p>选取一次后，浏览器会记住这个字体。也可以用 tools 文件夹中的脚本生成 data/apple，详见 README。</p>",
      "error.notSkeletal": "这个文件不是 Macintosh Skeletal 字体。请选取 MacintoshSkeletal.otf。",
      "error.load": "无法载入这个字体：{reason}",

      "file.title": "通过本地服务器打开",
      "file.body": "<p>直接打开的网页无法载入读取字体所需的组件。连按项目文件夹中的 <b>start.command</b>，它会启动本地服务器并打开网页。</p>"
        + "<p>也可以在“终端”中进入项目文件夹，运行 <code>python3 -m http.server 8000</code>，然后打开 <code>http://localhost:8000/</code>。</p>",

      "inspect.title": "字形检查",
      "inspect.intro": "按 Macintosh Skeletal 字体的数据画出文字，用来检查字形和连笔。可以直接选取字体，"
        + "也可以用 tools 文件夹中的脚本生成 data/apple，两种来源的结果相同。macOS 27 附带的字体位于 "
        + "<code>/System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/</code>"
        + "（在选取窗口中按下 Command-Shift-G 输入路径）。",
      "inspect.text": "文字",
      "inspect.compare": "叠加对比",
      "compare.none": "无",
      "inspect.joins": "标出字母之间的连笔",
      "inspect.late": "用蓝色显示后补的笔画",
      "inspect.compareNote": "（橙色：{name}）",
      "inspect.noFont": "还没有字体。点按“选取字体”并选取 MacintoshSkeletal.otf，或者用 tools 文件夹中的脚本生成 data/apple。",
      "inspect.reference": "与 Apple 原版动画对照",
      "inspect.referenceNote": "灰色是 SF-Hello 中的原版 hello 动画，黑色是由字体画出的结果（整体缩放、平移对齐后）。"
        + "数字是平均偏差，单位为字体单位（x 高度约 370）。",
      "inspect.referenceMissing": "要显示对照，请把 <a href=\"https://github.com/JaceThings/SF-Hello\">SF-Hello</a> "
        + "克隆到本项目旁边，并在包含两者的文件夹中启动服务器。",
      "inspect.deviation": "偏差 {value}",
    },

    en: {
      "nav.inspect": "Glyph Inspector",
      "nav.legacy": "Legacy",
      "nav.lang": "简体中文",

      "stage.hint": "Click to replay",
      "input.placeholder": "Enter text to write",
      "btn.play": "Play",
      "btn.play.hint": "Play (⌘↩)",
      "section.appearance": "Appearance",
      "section.layout": "Layout",
      "section.letterforms": "Letterforms",
      "section.playback": "Playback & Export",
      "btn.export": "Download Animated SVG",
      "btn.static": "Export Image",
      "label.speed": "Speed",
      "label.weight": "Weight",
      "weight.hint": "1.55× matches the hello screen",
      "label.center": "Center Text",
      "label.lineSpacing": "Line Spacing",
      "lineSpacing.hint": "Adjust the distance between lines",
      "label.theme": "Colors",
      "label.videoRatio": "Aspect Ratio",
      "videoRatio.landscape": "Landscape 16:9",
      "videoRatio.portrait": "Portrait 9:16",
      "btn.video": "Export Video",
      "theme.ink": "Light",
      "theme.night": "Dark",
      "theme.color": "Gradient",
      "label.gradientMode": "Background",
      "gradientMode.light": "White",
      "gradientMode.dark": "Dark",
      "label.ocross": "Joins After o",
      "ocross.over": "Over the Top",
      "ocross.through": "Through the Middle",
      "label.pjoin": "Letters p and s",
      "pjoin.one": "One Stroke",
      "pjoin.lift": "Lift Pen Partway",
      "label.font": "Font",
      "btn.chooseFont": "Choose Font…",

      "status.font": "Font: {name}",
      "status.missing": "Can’t write these characters: {chars}",
      "status.videoUnsupported": "Video export isn’t supported by this browser.",
      "status.videoExporting": "Exporting video…",
      "status.videoConverting": "Converting to MP4…",
      "status.videoFallback": "MP4 conversion isn’t available, so the WebM video was downloaded.",
      "status.videoReady": "Video downloaded.",
      "status.staticReady": "Image downloaded.",
      "source.json": "data/apple (from tools)",
      "source.info": "{count} glyphs · {hash}",

      "setup.title": "Choose the Macintosh Skeletal Font",
      "setup.body": "<p>McIntosh Writer writes with Macintosh Skeletal, a font that comes with macOS 27. "
        + "The font isn’t included with this project. Click Choose Font below, press Command-Shift-G, "
        + "enter the following path, then choose <b>MacintoshSkeletal.otf</b>.</p>"
        + "<p><code>/System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/</code></p>"
        + "<p>Your browser remembers the font after you choose it once. You can also generate data/apple "
        + "with the scripts in the tools folder; see the README.</p>",
      "error.notSkeletal": "This file isn’t the Macintosh Skeletal font. Choose MacintoshSkeletal.otf instead.",
      "error.load": "Unable to load the font: {reason}",

      "file.title": "Open Through a Local Server",
      "file.body": "<p>A page opened directly from a file can’t load the components it needs to read the font. "
        + "Double-click <b>start.command</b> in the project folder to start a local server and open the page.</p>"
        + "<p>Or, in Terminal, go to the project folder, run <code>python3 -m http.server 8000</code>, "
        + "then open <code>http://localhost:8000/</code>.</p>",

      "inspect.title": "Glyph Inspector",
      "inspect.intro": "Draws text from the Macintosh Skeletal font data so you can inspect letterforms and joins. "
        + "Choose the font directly, or generate data/apple with the scripts in the tools folder; both give the same result. "
        + "macOS 27 includes the font at "
        + "<code>/System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/</code> "
        + "(press Command-Shift-G in the file dialog to enter the path).",
      "inspect.text": "Text",
      "inspect.compare": "Compare With",
      "compare.none": "None",
      "inspect.joins": "Highlight joins between letters",
      "inspect.late": "Show added strokes in blue",
      "inspect.compareNote": " (orange: {name})",
      "inspect.noFont": "No font yet. Click Choose Font and choose MacintoshSkeletal.otf, or generate data/apple with the scripts in the tools folder.",
      "inspect.reference": "Compared with Apple’s Original Animations",
      "inspect.referenceNote": "Gray shows Apple’s original hello animations from SF-Hello; black shows the result drawn from the font, "
        + "scaled and aligned. The number is the average deviation in font units (x-height ≈ 370).",
      "inspect.referenceMissing": "To show the comparison, clone <a href=\"https://github.com/JaceThings/SF-Hello\">SF-Hello</a> "
        + "next to this project and start the server from the folder that contains both.",
      "inspect.deviation": "Deviation {value}",
    },
  };

  const KEY = "mcintosh.lang";
  function pick() {
    const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("lang") : null;
    if (q) return q.startsWith("zh") ? "zh-Hans" : "en";
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && STRINGS[saved]) return saved;
    } catch { /* 忽略 */ }
    const langs = typeof navigator !== "undefined" ? navigator.languages || [navigator.language] : [];
    return langs.some((l) => /^zh/i.test(l)) ? "zh-Hans" : "en";
  }
  const lang = pick();

  function t(key, vars = {}) {
    const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
  }

  // data-i18n：文字；data-i18n-html：带格式的段落；data-i18n-title / -placeholder / -aria-label：属性
  function apply(scope = document) {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    for (const el of scope.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
    for (const el of scope.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
    for (const attr of ["title", "placeholder", "aria-label"]) {
      const data = "i18n" + attr.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
      for (const el of scope.querySelectorAll(`[data-i18n-${attr}]`)) el.setAttribute(attr, t(el.dataset[data]));
    }
  }

  function setLang(l) {
    try { localStorage.setItem(KEY, l); } catch { /* 忽略 */ }
    const url = new URL(location.href);
    url.searchParams.delete("lang");
    location.href = url.href;
  }

  root.mwI18n = { lang, other: lang === "en" ? "zh-Hans" : "en", t, apply, setLang };
})(typeof window !== "undefined" ? window : globalThis);
