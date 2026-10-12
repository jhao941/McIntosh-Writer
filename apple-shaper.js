// 照 Apple 骨架字体的 OpenType 规则排字：选写法（GSUB）+ 字距和重音位置（GPOS），不需要字体文件。
// 规则来自 data/apple/rules.json（tools/apple-rules.py），字宽和字符表来自 data/apple/glyphs.json（tools/apple-extract.py）。
// 结果和 harfbuzz 排同一个字体一致（tools/apple-check.py 逐词核对）。
//
//   const shaper = appleShaper.create(rules, glyphs);
//   shaper.shape("wave")  → [{ glyph: "w.initial", cluster: 0, x: 0, y: 0, advance: 808 }, …]
//   shaper.shape("cel·la", { lang: "CAT" })  按语言换写法（locl），lang 用 OpenType 语言标签
//   shaper.shape("quiz", { alternates: { q: "q.crossed", f: "f.noLoop" } })
//     字体里有些写法（q.crossed / noLoop / lowLoop、f.noLoop / continuous、t.tall、p.connected、s.connected、w.short）
//     没有规则会主动选，只在规则里派生出词首、词尾、highEntry 等形式；先换掉基本字形，后面的规则照常跑
//   shaper.shape("wood", { oCross: true })  o 从中间穿过去（需要先 appleExtras.extend(glyphs)）
//   shaper.shape("happy", { pJoin: true })  p 和 s 一笔写完（同上）
(function (root) {
  const IGNORE_MARKS = 8;
  const GSUB_FEATURES = new Set(["ccmp", "locl", "calt"]); // harfbuzz 默认打开的；ctrl 不是标准特性，默认不开
  const GPOS_FEATURES = new Set(["kern", "mark"]);

  function create(rules, glyphs) {
    const cmap = glyphs.cmap;
    const isMark = (g) => rules.glyphClass[g] === 3;
    const advanceOf = (g) => (glyphs.glyphs[g] ? glyphs.glyphs[g].advance : 0);
    // 覆盖表转成 Set，查得快
    const sets = new WeakMap();
    const inCov = (list, g) => {
      let s = sets.get(list);
      if (!s) sets.set(list, (s = new Set(list)));
      return s.has(g);
    };

    function scriptOf(text) {
      if (/[Ͱ-Ͽἀ-῿]/.test(text)) return "grek";
      if (/[Ѐ-ԯ]/.test(text)) return "cyrl";
      return "latn";
    }

    // 某个表（GSUB / GPOS）在这个文字、语言下要跑的规则组，按编号从小到大（harfbuzz 同一阶段的做法）
    function lookupsFor(table, script, lang, enabled) {
      const langs = table.scripts[script] || table.scripts.DFLT;
      const featureIdx = (lang && langs[lang]) || langs.dflt || [];
      const out = new Set();
      for (const i of featureIdx) if (enabled.has(table.features[i].tag)) table.features[i].lookups.forEach((l) => out.add(l));
      return [...out].sort((a, b) => a - b);
    }

    // ---------- 字符 → 字形 ----------
    function mapChars(text) {
      const buf = [];
      let cluster = 0;
      for (const ch of text) {
        if (cmap[ch]) buf.push({ g: cmap[ch], cluster });
        else {
          // 字体里没有这个带重音的字母：拆成字母 + 附加符号（ą → a + ̨）
          const parts = [...ch.normalize("NFD")];
          if (parts.length > 1 && parts.every((p) => cmap[p])) parts.forEach((p) => buf.push({ g: cmap[p], cluster }));
          else buf.push({ g: ".notdef", cluster });
        }
        cluster += ch.length;
      }
      return buf;
    }

    // ---------- GSUB ----------
    // 从 i 往前 / 往后找下一个不被忽略的字形
    const skip = (buf, flag) => (k) => flag & IGNORE_MARKS && isMark(buf[k].g);
    function next(buf, i, flag) {
      const ignored = skip(buf, flag);
      for (let k = i + 1; k < buf.length; k++) if (!ignored(k)) return k;
      return -1;
    }
    function prev(buf, i, flag) {
      const ignored = skip(buf, flag);
      for (let k = i - 1; k >= 0; k--) if (!ignored(k)) return k;
      return -1;
    }
    // 依次匹配：test(k, 第几个) 判断 buf[k] 是否符合；返回匹配到的位置列表或 null
    function matchForward(buf, i, n, flag, test) {
      const pos = [];
      let k = i;
      for (let m = 0; m < n; m++) {
        k = next(buf, k, flag);
        if (k < 0 || !test(buf[k].g, m)) return null;
        pos.push(k);
      }
      return pos;
    }
    function matchBackward(buf, i, n, flag, test) {
      let k = i;
      for (let m = 0; m < n; m++) {
        k = prev(buf, k, flag);
        if (k < 0 || !test(buf[k].g, m)) return false;
      }
      return true;
    }

    // 在位置 i 上试一组规则；成功返回下一个要处理的位置，失败返回 -1
    function applyGsub(lookupIndex, buf, i) {
      const lk = rules.gsub.lookups[lookupIndex];
      const flag = lk.flag;
      const g = buf[i].g;
      if (flag & IGNORE_MARKS && isMark(g)) return -1;
      for (const st of lk.subtables) {
        if (lk.type === 1) {
          if (st.map[g]) {
            buf[i].g = st.map[g];
            return i + 1;
          }
        } else if (lk.type === 2) {
          const seq = st.map[g];
          if (seq) {
            buf.splice(i, 1, ...seq.map((s) => ({ g: s, cluster: buf[i].cluster })));
            return i + seq.length;
          }
        } else if (lk.type === 4) {
          for (const [comps, lig] of st.ligatures[g] || []) {
            const pos = matchForward(buf, i, comps.length, flag, (x, m) => x === comps[m]);
            if (!pos) continue;
            buf[i].g = lig;
            for (const k of pos.reverse()) buf.splice(k, 1);
            return i + 1;
          }
        } else if (lk.type === 6) {
          const tryRule = (input, backtrack, lookahead, records, testIn, testBack, testAhead) => {
            const pos = matchForward(buf, i, input, flag, testIn);
            if (!pos) return -1;
            const seq = [i, ...pos];
            if (!matchBackward(buf, i, backtrack, flag, testBack)) return -1;
            if (lookahead && !matchForward(buf, seq[seq.length - 1], lookahead, flag, testAhead)) return -1;
            // 命中：在输入序列的指定位置上跑嵌套规则（没有嵌套规则的命中也算，用来拦住后面的规则）
            let end = seq[seq.length - 1] + 1;
            for (const [seqIndex, nested] of records) {
              const before = buf.length;
              applyGsub(nested, buf, seq[seqIndex]);
              end += buf.length - before;
            }
            return end;
          };
          if (st.format === 1) {
            for (const r of st.rules[g] || []) {
              const end = tryRule(
                r.input.length, r.backtrack.length, r.lookahead.length, r.lookups,
                (x, m) => x === r.input[m], (x, m) => x === r.backtrack[m], (x, m) => x === r.lookahead[m]
              );
              if (end >= 0) return end;
            }
          } else if (inCov(st.input[0], g)) {
            const end = tryRule(
              st.input.length - 1, st.backtrack.length, st.lookahead.length, st.lookups,
              (x, m) => inCov(st.input[m + 1], x), (x, m) => inCov(st.backtrack[m], x), (x, m) => inCov(st.lookahead[m], x)
            );
            if (end >= 0) return end;
          }
        }
      }
      return -1;
    }

    // ---------- GPOS ----------
    function applyGpos(lookupIndex, buf) {
      const lk = rules.gpos.lookups[lookupIndex];
      for (let i = 0; i < buf.length; i++) {
        const g = buf[i].g;
        if (lk.type === 2) {
          if (lk.flag & IGNORE_MARKS && isMark(g)) continue;
          const j = next(buf, i, lk.flag);
          if (j < 0) continue;
          const h = buf[j].g;
          for (const st of lk.subtables) {
            let v = null;
            if (st.format === 2) {
              if (!inCov(st.coverage, g)) continue;
              v = st.pairs[`${st.class1[g] || 0},${st.class2[h] || 0}`];
            } else v = st.pairs[g] && st.pairs[g][h];
            if (!v) continue;
            const [a, b] = v;
            buf[i].advance += a.XAdvance || 0;
            buf[i].dx += a.XPlacement || 0;
            buf[i].dy += a.YPlacement || 0;
            if (b) {
              buf[j].advance += b.XAdvance || 0;
              buf[j].dx += b.XPlacement || 0;
              buf[j].dy += b.YPlacement || 0;
            }
            break;
          }
        } else if (lk.type === 4) {
          if (!isMark(g)) continue;
          let b = i - 1;
          while (b >= 0 && isMark(buf[b].g)) b--;
          if (b < 0) continue;
          for (const st of lk.subtables) {
            const m = st.marks[g];
            const anchor = m && st.bases[buf[b].g] && st.bases[buf[b].g][m[0]];
            if (!anchor) continue;
            buf[i].attach = { base: b, dx: anchor[0] - m[1], dy: anchor[1] - m[2] };
            break;
          }
        }
      }
    }

    // 排字以后再换写法（对照表由 apple-extras.js 补上），只换后面还接着字母的（词尾、空格前不换）：
    //   oCross：o 从中间穿过去（glyphs.crossed → o.crossed…）。穿过的 o 斜穿到右下就停，后一个字母照样用原来的写法，
    //     由 apple-writer.js 的 joinCrossed 接上；字宽比原来的 o 窄（o 的笔画短了），个别字母再按 glyphs.crossKern 挪
    //   pJoin：p 和 s 一笔写完（glyphs.connected → 字体自带的 p.connected…、s.connected.highEntry）。字体默认的 p 写完圆抬笔，
    //     出笔另起一笔，b o v w 后面的 s 写完身子抬笔；.connected 的写法一笔写完，但字体的规则从来不选它们
    //     （规则里也不认它们，先换的话前后字母会选错写法）
    // 在定位（字距、重音位置）之后再换：新字形不在字体的重音定位表里，先换的话重音会掉到后一个字母上。
    // 换了写法以后按新字宽把后面的字形往后挪（自己的重音不动），和 apple-font.js 的做法一样
    function swapForms(out, table) {
      for (let i = 0; i < out.length; i++) {
        const target = table[out[i].glyph];
        if (!target || !glyphs.glyphs[target]) continue;
        let j = i + 1;
        while (j < out.length && isMark(out[j].glyph)) j++;
        const nextGlyph = j < out.length && glyphs.glyphs[out[j].glyph];
        if (!nextGlyph || !nextGlyph.strokes.some((s) => s.type === "Open")) continue;
        // 穿过的 o 后面个别字母再挪（glyphs.crossKern，按后一个字母的基本字形名）
        const kern = table === glyphs.crossed ? (glyphs.crossKern || {})[out[j].glyph.split(".")[0]] || 0 : 0;
        const delta = glyphs.glyphs[target].advance - advanceOf(out[i].glyph) + kern;
        out[i].glyph = target;
        out[i].advance += delta;
        for (let k = j; k < out.length; k++) out[k].x += delta;
      }
    }

    function shape(text, opts = {}) {
      const script = scriptOf(text);
      const buf = mapChars(text);
      if (opts.alternates) for (const it of buf) if (opts.alternates[it.g] && glyphs.glyphs[opts.alternates[it.g]]) it.g = opts.alternates[it.g];
      for (const li of lookupsFor(rules.gsub, script, opts.lang, GSUB_FEATURES)) {
        for (let i = 0; i < buf.length; ) {
          const end = applyGsub(li, buf, i);
          i = end >= 0 ? Math.max(end, i + 1) : i + 1;
        }
      }
      for (const it of buf) Object.assign(it, { advance: isMark(it.g) ? 0 : advanceOf(it.g), dx: 0, dy: 0 });
      for (const li of lookupsFor(rules.gpos, script, opts.lang, GPOS_FEATURES)) applyGpos(li, buf);
      // 累加笔位置；附加符号放到它所附的字母上
      let x = 0;
      const out = buf.map((it) => {
        const o = { glyph: it.g, cluster: it.cluster, x: x + it.dx, y: it.dy, advance: it.advance };
        x += it.advance;
        return o;
      });
      buf.forEach((it, i) => {
        if (!it.attach) return;
        out[i].x = out[it.attach.base].x + it.attach.dx;
        out[i].y = out[it.attach.base].y + it.attach.dy;
      });
      if (opts.oCross) swapForms(out, glyphs.crossed || {});
      if (opts.pJoin) swapForms(out, glyphs.connected || {});
      return out;
    }

    return { shape };
  }

  const api = { create };
  root.appleShaper = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
