// 直接读 Apple 的骨架字体文件（MacintoshSkeletal.otf）：不用先跑 tools/apple-extract.py、tools/apple-rules.py。
// 骨架数据从字体的 strk 表里读，排字交给 harfbuzz（vendor/harfbuzzjs，WebAssembly 版），
// 输出和 data/apple/glyphs.json + apple-shaper.js 的格式一样，apple-writer.js、apple-extras.js 照常用。
//
//   const font = await appleFont.load(arrayBuffer);   // 字体文件的内容
//   appleExtras.extend(font.glyphs);                   // 补 o.crossed 等（可选）
//   const writer = appleWriter.create(font.glyphs);
//   const L = writer.layout(font.shaper.shape("hello", { oCross: true, pJoin: true, lang: "CAT" }));
//   font.source  { version, sha256, glyphCount }
//
// 浏览器里不能直接读系统文件，要用户选一次字体文件（apple.html 会把它存在浏览器里，下次不用再选）。
// macOS 27 自带的在 /System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/
(function (root) {
  // harfbuzzjs 的位置：默认和本文件同目录下的 vendor/harfbuzzjs/
  const here = typeof document !== "undefined" && document.currentScript ? document.currentScript.src : null;
  let hbPromise = null;
  function harfbuzz(url) {
    if (!hbPromise) {
      const target = url || (here ? new URL("vendor/harfbuzzjs/index.mjs", here).href : "./vendor/harfbuzzjs/index.mjs");
      hbPromise = import(target);
    }
    return hbPromise;
  }

  const MARK = 3; // GDEF 字形类别：附加符号

  async function sha256(bytes) {
    if (!(root.crypto && root.crypto.subtle)) return "";
    const h = await root.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // strk 表里的一个点 [x, y, z, 笔宽]（单位 em）→ 字体单位，和 tools/apple-extract.py 一样
  const r1 = (v, upm) => Math.round(v * upm * 10) / 10;
  const point = (p, upm) => [r1(p[0], upm), r1(p[1], upm), r1(p[2] || 0, upm), r1(p[3], upm)];
  function endInfo(e, upm) {
    const out = { oncurve: e.oncurve !== false, tangency: e.tangency || 0, cap: e.cap || "round" };
    if ((e.attachmentRadiusScale ?? 1) !== 1) out.attachmentRadiusScale = e.attachmentRadiusScale;
    if (e.target) out.target = point(e.target, upm);
    return out;
  }

  async function load(buffer, opts = {}) {
    const hb = await harfbuzz(opts.hbUrl);
    const bytes = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const face = new hb.Face(new hb.Blob(bytes));
    const font = new hb.Font(face);
    const strkBytes = face.referenceTable("strk");
    if (!strkBytes || !strkBytes.length) {
      // 没有 strk 表：不是 Apple 的骨架字体。code 给界面挑本地化的提示
      const err = new Error("This file isn’t the Macintosh Skeletal font (no strk table).");
      err.code = "not-skeletal";
      throw err;
    }
    const strk = JSON.parse(new TextDecoder().decode(strkBytes));
    const head = face.referenceTable("head");
    const upm = head ? new DataView(head.buffer, head.byteOffset).getUint16(18) : 1000;
    const nameTable = (id) => { try { return face.getName(id, "en"); } catch { return ""; } };

    // 字形编号 → 名字：strk 表自带一份和字体一致的字形顺序
    const order = strk.glyphOrder;
    const idOf = new Map(order.map((n, i) => [n, i]));
    const glyphs = {};
    for (const [name, g] of Object.entries(strk.glyphs)) {
      const strokes = g.strokes.map((s) => {
        const item = { type: s.type, points: s.points.map((p) => point(p, upm)) };
        const info = s.info;
        if (info) {
          if ((info.deferred || "Not") !== "Not") item.deferred = info.deferred;
          if (info.start) item.start = endInfo(info.start, upm);
          if (info.end) item.end = endInfo(info.end, upm);
        }
        return item;
      });
      glyphs[name] = { advance: idOf.has(name) ? font.glyphHAdvance(idOf.get(name)) : 0, info: g.info, strokes };
    }
    const data = {
      source: { version: nameTable(5), sha256: await sha256(bytes), glyphCount: order.length },
      metrics: { unitsPerEm: upm },
      glyphs,
    };

    // 排字：harfbuzz 按字体自己的 GSUB / GPOS 规则（和 apple-shaper.js 一致，tools/apple-check 核对过）
    function shape(text, o = {}) {
      const buf = new hb.Buffer();
      buf.addText(text);
      buf.guessSegmentProperties();
      if (o.lang) buf.setLanguage(hb.otTagToLanguage(o.lang.padEnd(4, " "))); // OpenType 语言标签，比如 "CAT"
      hb.shape(font, buf);
      const infos = buf.getGlyphInfos(), pos = buf.getGlyphPositions();
      let x = 0;
      const out = infos.map((g, i) => {
        const item = { glyph: order[g.codepoint] || font.glyphName(g.codepoint), cluster: g.cluster, x: x + pos[i].xOffset, y: pos[i].yOffset, advance: pos[i].xAdvance, mark: face.getGlyphClass(g.codepoint) === MARK };
        x += pos[i].xAdvance;
        return item;
      });
      if (o.oCross) swapForms(out, data.crossed || {});
      if (o.pJoin) swapForms(out, data.connected || {});
      return out.map(({ mark, ...g }) => g);
    }

    // 排字以后再换写法：o 从中间穿过去（data.crossed）、p 和 s 一笔写完（data.connected），对照表由 apple-extras.js 补上。
    // 和 apple-shaper.js 的 swapForms 一样：词尾、空格前不换，换了以后按新字宽把后面的字形往后挪
    function swapForms(out, table) {
      for (let i = 0; i < out.length; i++) {
        const target = table[out[i].glyph];
        if (!target || !glyphs[target]) continue;
        let j = i + 1;
        while (j < out.length && out[j].mark) j++;
        const next = j < out.length && glyphs[out[j].glyph];
        if (!next || !next.strokes.some((s) => s.type === "Open")) continue;
        // 穿过的 o 后面个别字母再挪（data.crossKern，按后一个字母的基本字形名）
        const kern = table === data.crossed ? (data.crossKern || {})[out[j].glyph.split(".")[0]] || 0 : 0;
        const delta = glyphs[target].advance - glyphs[out[i].glyph].advance + kern;
        out[i].glyph = target;
        out[i].advance += delta;
        for (let k = j; k < out.length; k++) out[k].x += delta; // 自己的重音不动
      }
    }

    return { glyphs: data, shaper: { shape }, source: data.source };
  }

  const api = { load };
  root.appleFont = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
