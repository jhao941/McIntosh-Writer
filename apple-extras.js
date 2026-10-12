// Apple 骨架字体里没有、我们自己补的字形。在创建 apple-shaper / apple-writer 之前调用：
//   appleExtras.extend(glyphs);   // glyphs = data/apple/glyphs.json，直接往 glyphs.glyphs 里加
//   appleExtras.extend(glyphs, { zLoop: "big" })   // 同时把 z 底部的小圈放大（见下）
//   appleExtras.extend(glyphs, { cross: { sweep, rise, flat, advance, whole, kern, entry }, replace: true })
//     用另一组穿法重建 o.crossed…（手调穿法时用，私有仓库的 o-edit.html；默认值见 appleExtras.CROSS）
//
// o.crossed（及 .highEntry、.initial）：o 从中间穿过去再出笔（Apple SF-Hello 的 hola、olá、dobar 是这样写的；
// 字体里的 o 都是越过顶出笔）。进笔沿用字体的（只换末端，见 ENTRY），整个 o 换成 SF-Hello hola 原稿的写法（私有仓库旧版 legacy.html 的 o）：
// 从顶上起笔逆时针绕一圈，回到顶上往左回卷一小下，再斜穿过中间到右下，方向转平就停，o 自己没有出笔。
// 后一个字母照样用 highEntry / midEntry，由 apple-writer.js 的 joinCrossed 接上（apple-shaper.js 的 oCross 选项负责替换 o）。
(function (root) {
  // o.midExit 的坐标系里（字体单位，y 朝上），点是曲线经过的点（下面 toControl 换成控制点；第一个点是起笔的控制点）。
  // 取自旧版的 ola，也就是 SF-Hello hola 原稿的 o 和 ol 那段连笔：整体缩放（0.845）、平移到字体 o.midExit 的圆的位置
  // （高度相同、左右居中，不改形状）。点是按真实的画字结果拟合的（ola、hola、bola 一起画出来量）：
  //   · 画出来的 o 离原稿平均约 2 单位、最远约 6 单位
  //   · 一圈的曲率平缓变化、不反向（曲率半径 115 以上，整圈曲率的总变化比原稿还小）。只按位置贴原稿的话，
  //     点疏密不均，曲率会忽大忽小：细笔下左上角显得平、左侧有个反向的小弯
  //   · 起笔夹住，开头一小段曲率为 0；起点放在回来那一笔越过顶的地方、方向和它一致（原稿也是这样），这段藏在下面，
  //     顶上没有折痕
  //   · 点的间距从左上（约 50 单位）到底下（约 130 单位）逐渐变稀
  //   · 后 4 个点（回卷、斜穿的终点）和字宽 ADVANCE 是对着原稿 ol 一起拟合的：l 的位置和原稿差 2 单位以内，
  //     从回卷到 l 的竖笔一路左转、曲率半径单调变大（和原稿一样）
  const SWEEP = [
    [336, 357], [290, 342], [241, 312], [200, 264], [175, 192], [184, 92], [260, 25],
    [372, 43], [451, 152], [444, 291], [338, 357], [266, 268], [337, 156], [470, 114],
  ];
  // whole：SWEEP 是整个 o（从顶上起笔）。false 时只是圆绕回右上方以后的那段，前面保留字体自己的圆
  const WHOLE = true;
  // 出笔：现在不用（空的），o 斜穿完就交给 apple-writer.js 的 joinCrossed。
  // 以前在这里给 o 加一段出笔，再和后一个字母的进笔按通用的 6→3 混合；两条尾巴交叉（o 往上、highEntry 往下），连笔成 S 形
  const RISE = [];
  const FLAT = [];
  // 字体里的 o → 穿过的写法（接 e、t 前字体用 midExit，对应平着出笔的那种）
  const CROSSED = {
    "o": "o.crossed", "o.midExit": "o.crossed.midExit",
    "o.highEntry": "o.crossed.highEntry", "o.highEntry.midExit": "o.crossed.highEntry.midExit",
    "o.initial": "o.crossed.initial", "o.midExit.initial": "o.crossed.midExit.initial",
  };
  // 字体里没有规则会选、但一笔写完的写法：
  //   · 默认的 p 写完圆抬笔，出笔另起一笔（字体标了 joiningOptionalForward）；p.connected 写到底再沿竖笔回上去绕圆、接着出笔。
  //     词尾的 p 没有出笔，本来就是一笔，不用换
  //   · 接在从高处出笔的字母（b、o、v、w）后面的 s.highEntry：身子收在左下，出笔从右下另起（隔约 300、没标相切），要抬笔；
  //     s.connected.highEntry 在左下绕一个小圈接着出笔（macintosh 的 sh、rose 的 se）。其他位置的 s 出笔标了相切，本来就是一笔
  // 西里尔字母等其他带 .connected 的换了笔数不减或更多，不换
  const CONNECTED = {
    "p": "p.connected", "p.highEntry": "p.connected.highEntry", "p.initial": "p.connected.initial",
    "s.highEntry": "s.connected.highEntry",
    "er.cyrl": "er.cyrl.connected", "er.cyrl.highEntry": "er.cyrl.connected.highEntry", "er.cyrl.initial": "er.cyrl.connected.initial",
  };
  // 穿过的 o 比字体里的底子宽多少（字体单位）：o 的笔画在斜穿的终点就停了，比越顶出笔短约 100，
  // 后一个字母跟着往左挪（Apple 原稿 ol 的 l 正好在这里）
  const ADVANCE = -100;
  // 个别后一个字母再挪多少：x 的进笔短、末端是尖角，挪近了找不到能顺着接上的点；
  // e、t（字体在它们前面用 midExit）按 o 和 e 的圈之间的距离对齐旧版的 oe（Apple 没有穿过的 oe 可以对照）
  const KERN = { x: 80, e: 40, t: 40 };
  // 进笔的末端（o.midExit 坐标，控制点）：字体的进笔是给越顶的 o 设计的，末端落在字体自己的 o 上，原稿的 o 左上角
  // 瘦一圈，照用的话进笔悬在 o 外面 15–20 单位，"贴上去再折回"时贴着 o 外侧走一段再拐上来，细笔下是个尖角或鼓包。
  // 换成这几个点，进笔切着落到 o 的左侧（原稿 hola 里 h 的收笔也是这样落上去的），落上以后两遍重合（差 2 单位以内），
  // 中间只拐一次弯。前 3 个点要和前一个字母混合，不动
  const ENTRY = {
    "o.midExit": [[162, 195], [182, 241]], // 接在从低处出笔的字母后面（h、d、l……）；字体原来是 [164, 204], [186, 265]
    "o.highEntry.midExit": [[193, 268], [226, 295]], // 接在从高处出笔的字母后面（b、o、v、w）；字体原来是一个点 [215, 314]
  };
  const CROSS = { sweep: SWEEP, rise: RISE, flat: FLAT, advance: ADVANCE, whole: WHOLE, kern: KERN, entry: ENTRY };
  // 新字形 ← 字体里的底子、出笔用哪一种
  const SOURCES = {
    "o.crossed": ["o.midExit", "rise"],
    "o.crossed.highEntry": ["o.highEntry.midExit", "rise"],
    "o.crossed.initial": ["o.midExit.initial", "rise"],
    "o.crossed.midExit": ["o.midExit", "flat"],
    "o.crossed.highEntry.midExit": ["o.highEntry.midExit", "flat"],
    "o.crossed.midExit.initial": ["o.midExit.initial", "flat"],
  };

  // 上面的点是 Apple 原稿曲线经过的点；字体里的点是 B 样条控制点（曲线往内收）。
  // 反推控制点 P，使 B 样条经过这些点：(P[i-1] + 4P[i] + P[i+1]) / 6 = Q[i]，迭代几次求解
  function toControl(Q) {
    let P = Q.map((q) => [...q]);
    for (let it = 0; it < 20; it++) {
      P = P.map((p, i) => {
        if (i === 0 || i === Q.length - 1) return p;
        return [0, 1].map((k) => (6 * Q[i][k] - P[i - 1][k] - P[i + 1][k]) / 4);
      });
    }
    return P;
  }

  // z 底部的小圈：字体里只有约 100×50（5 个控制点），开机画面的粗细下会糊成一团（Apple 自己画出来也是这样）。
  // 可选 big：以圈底为中心把这 5 个点放大 1.8 倍。默认不改
  function zLoop(G, mode) {
    for (const [name, g] of Object.entries(G)) {
      if (!/^z(\.|$)/.test(name) || /crossed/.test(name)) continue;
      const strokes = g.strokes.filter((s) => s.type === "Open");
      const s = strokes[strokes.length - 1];
      const P = s.points;
      const b = P.findIndex((p, i) => i > 1 && p[1] < 30); // 斜线落到的最低点
      if (b < 2 || b + 4 >= P.length) continue;
      const [ax, ay] = P[b], w = P[b][3];
      let loop;
      if (mode === "big") {
        const cx = P.slice(b, b + 5).reduce((t, p) => t + p[0], 0) / 5;
        loop = P.slice(b, b + 5).map((p) => [cx + (p[0] - cx) * 1.8, ay + (p[1] - ay) * 1.8, 0, w]);
        s.points = [...P.slice(0, b), ...loop, ...P.slice(b + 5)];
      }
    }
  }

  function extend(data, opts = {}) {
    const G = data.glyphs;
    if (opts.zLoop) zLoop(G, opts.zLoop);
    // pJoin 选项：p（和写法一样的西里尔 р）、高处进笔的 s 换成字体自带、但规则不选的一笔写完的写法
    data.connected = Object.fromEntries(Object.entries(CONNECTED).filter(([from, to]) => G[from] && G[to]));
    const ref = G["o.midExit"];
    if (!ref) return data;
    const refOval = ref.strokes.filter((s) => s.type === "Open")[1].points;
    const cross = { ...CROSS, ...(opts.cross || {}) };
    for (const [name, [srcName, tailName]] of Object.entries(SOURCES)) {
      const src = G[srcName];
      if (!src || (G[name] && !opts.replace)) continue;
      const tail = cross[tailName];
      const strokes = src.strokes.filter((s) => s.type === "Open");
      const ovalIndex = src.strokes.indexOf(strokes[strokes.length - 1]);
      const oval = src.strokes[ovalIndex];
      // 和 o.midExit 的圆对齐（各写法只是整体平移）
      const dx = oval.points[0][0] - refOval[0][0], dy = oval.points[0][1] - refOval[0][1];
      // 圆绕回右上方：过了最低点之后第一个高于 280 的点
      let bottom = 0;
      oval.points.forEach((p, i) => { if (p[1] < oval.points[bottom][1]) bottom = i; });
      let cut = oval.points.findIndex((p, i) => i > bottom && p[1] > 280 + dy);
      if (cut < 0) cut = oval.points.length - 1;
      const w = oval.points[0][3];
      const keep = cross.whole ? [] : oval.points.slice(0, cut + 1);
      const points = [...keep, ...toControl([...cross.sweep, ...tail]).map(([x, y]) => [x + dx, y + dy, 0, w])];
      // 字体的圆起笔的影子点离第一个实点约 50 单位，进笔"贴上去再折回"时会在 o 顶上伸出一个角；收近到 15 单位，藏进笔画里
      if (!cross.whole && oval.start && oval.start.oncurve === false) {
        const [a, b] = [points[0], points[1]];
        const k = 15 / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1);
        points[0] = [b[0] + (a[0] - b[0]) * k, b[1] + (a[1] - b[1]) * k, 0, w];
      }
      const end = points[points.length - 1];
      const prev = points[points.length - 2];
      const newOval = {
        ...oval,
        points,
        end: { oncurve: false, tangency: 0, cap: "round", target: [(end[0] + prev[0]) / 2, (end[1] + prev[1]) / 2, 0, w] },
      };
      // 进笔：前 3 个点照旧，末端换成 cross.entry 的（字体的进笔对象是共用的，换成新对象）
      const jb = src.info.joinsBackward, entryTail = cross.entry && cross.entry[srcName];
      const entry = jb !== undefined && entryTail && src.strokes[jb];
      const newEntry = entry && {
        ...entry,
        points: [...entry.points.slice(0, 3), ...entryTail.map(([x, y]) => [x + dx, y + dy, 0, entry.points[0][3]])],
      };
      const out = src.strokes.map((s, i) => (i === ovalIndex ? newOval : entry && i === jb ? newEntry : s)).filter((s) => s.type !== "Final Attachment Anchor");
      out.push({ type: "Final Attachment Anchor", points: [newOval.end.target] });
      // cross：编辑页用来把 sweep / 出笔的点画到字上（各写法相对 o.midExit 的平移、用哪种出笔）
      G[name] = { advance: src.advance + cross.advance, info: { ...src.info, joinsForward: ovalIndex }, strokes: out, extra: true,
        cross: { offset: [dx, dy], tail: tailName } };
    }
    // 排字时（oCross 选项）把哪个 o 换成哪个穿过的写法：apple-shaper.js 和 apple-font.js 共用
    data.crossed = Object.fromEntries(Object.entries(CROSSED).filter(([, to]) => G[to]));
    data.crossKern = { ...cross.kern };
    return data;
  }

  const api = { extend, crossedOf: SOURCES, CROSS };
  root.appleExtras = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
