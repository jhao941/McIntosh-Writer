// 把 apple-shaper.js 排好的字形画成笔画：Apple 骨架字体的控制点 → 三次贝塞尔，相邻笔画接成连贯的一笔。
//
//   const writer = appleWriter.create(glyphs);          // glyphs = data/apple/glyphs.json
//   const L = writer.layout(shaper.shape("hello"));     // { smooth: 0 } 不重新拟合，直接输出 B 样条换算的贝塞尔
//   L.paths  按书写顺序的笔画：{ segs: [[x0,y0,x1,y1,x2,y2,x3,y3], …], width, glyphs: [第几个字形…], joins, late }
//            late：抬笔时才补的笔画（t 的横、x 的另一撇、重音）
//            joins：字母之间的接口 { seg: 第几段, count: 几段, from: 前一个字形名, to: 后一个字形名, glyphs: [两个字形的序号] }
//   L.dots   i、j 的点：{ x, y, r, glyph, after }（after：书写顺序上排在 L.paths 的第几笔之后）
//   坐标是字体单位，y 朝下（基线 0，x 高度约 −370）。width 是字体里存的笔的半径（开机画面的笔宽 = width × 2 × 1.55）。
//
// 字体里的点是均匀三次 B 样条的控制点（曲线不经过它们；Macintosh Skeletal Filled 项目从 Apple 的渲染程序里确认过）。
// 一笔写下来就是一串控制点，整串画成一条 B 样条，天然光滑。规则：
//   · 一笔的起笔和收笔（词首、词尾、重音、x 的另一撇……）：曲线从第一个控制点写起、写到最后一个控制点
//     （和 SF-Hello 原稿对比过，比让曲线自然收在端点附近更贴）
//   · 字母之间：前一个字母"接出去"那笔的最后 3 个控制点和后一个字母"接进来"那笔的前 3 个控制点，
//     换成 3 个新点（Apple 的做法），两边各自的曲线保持不动。新点按位置渐变混合估算（权重见 JOIN_W）
//     穿过的 o（apple-extras.js）后面例外：不混合，跳过后一个字母进笔开头的几个点、补 0–2 个点接上（见 joinCrossed）
//   · 字母内部两笔之间：
//       端点几乎重合（m、n 的进笔升到顶、竖笔从同一点往下）→ 尖角
//       前一笔标了 tangency（a c d g q 的进笔 → 圆、t 的上升 → 竖）→ 贴到后一笔上，倒着走回它的起点，折返再写
//       前一笔收在实点上、或后一笔标了 tangency（k 的竖写到底再往上）→ 在前一笔的终点折返
//       两侧都是影子点、间隔又大（x 开头的斜线、默认 p 的出笔）→ 抬笔
//       其余 → 直接接着写
//   · 闭合的圈（macOS 版的 o）：进笔贴上去绕一整圈，再绕到出笔贴上的地方接出去
//   · 每个字母里，从 joinsBackward 那笔到 joinsForward 那笔之间的笔画连成一笔；
//     其余的（x 的另一撇、t 的横、i 的点……）等到抬笔（词尾、空格）时再补
//   · 最后整笔重新拟合成少量锚点的贝塞尔（方便手改；字母之间的接口段原样保留）
(function (root) {
  const SNAP = 10; // 字母内部两笔端点相距小于这个值：当作同一个点（尖角）
  const LIFT_GAP = 50; // 两侧都是影子点、间隔大于这个值：抬笔
  const SMOOTH = 4; // 重新拟合的误差上限
  // 字母之间 3 个新控制点的混合权重（越靠后越像后一个字母）。拿 Macintosh Skeletal Filled 的连接字形
  // （从 Apple 渲染程序记录的）对照调过：这组权重下接口中心线平均只差约 2 个单位，接近测量误差
  const JOIN_W = [1 / 6, 1 / 2, 5 / 6];

  const unit = (v) => {
    const n = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / n, v[1] / n];
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const bez = (c, t) => {
    const u = 1 - t;
    return [u * u * u * c[0] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
      u * u * u * c[1] + 3 * u * u * t * c[3] + 3 * u * t * t * c[5] + t * t * t * c[7]];
  };

  // 一串控制点（clampStart / clampEnd：曲线是否正好停在首 / 尾控制点上）→ 贝塞尔段
  // 均匀三次 B 样条的每一段由相邻 4 个控制点决定；停在端点上的做法是把端点重复两次
  function bspline(run) {
    let Q = run.pts;
    if (run.closed) Q = [...Q, Q[0], Q[1], Q[2]];
    else {
      if (run.clampStart) Q = [Q[0], Q[0], ...Q];
      if (run.clampEnd) Q = [...Q, Q[Q.length - 1], Q[Q.length - 1]];
    }
    while (Q.length < 4) Q = [...Q, Q[Q.length - 1]];
    const segs = [];
    for (let i = 0; i + 3 < Q.length; i++) {
      const [a, b, c, d] = Q.slice(i, i + 4);
      segs.push([
        (a[0] + 4 * b[0] + c[0]) / 6, (a[1] + 4 * b[1] + c[1]) / 6,
        (2 * b[0] + c[0]) / 3, (2 * b[1] + c[1]) / 3,
        (b[0] + 2 * c[0]) / 3, (b[1] + 2 * c[1]) / 3,
        (b[0] + 4 * c[0] + d[0]) / 6, (b[1] + 4 * c[1] + d[1]) / 6,
      ]);
    }
    // 控制点下标 → 第几段：控制点 k（补齐前的下标）影响的段是 [k + pad − 3, k + pad]
    const pad = !run.closed && run.clampStart ? 2 : 0;
    const joins = (run.joins || []).map((j) => {
      const first = Math.max(0, j.from + pad - 3), last = Math.min(segs.length - 1, j.to + pad);
      return { ...j.info, seg: first, count: last - first + 1 };
    });
    return { segs, joins };
  }

  // ---------- 重新拟合 ----------
  // B 样条的段数等于控制点数，偏多；整笔重新拟合成少量锚点的贝塞尔（偏离不超过 SMOOTH 单位），
  // 在尖角（方向突变超过 60°）和字母之间的接口段处切开，接口段原样保留，每一截两端沿用原曲线的方向
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const len = (a) => Math.hypot(a[0], a[1]);
  const startTan = (c) => unit(len([c[2] - c[0], c[3] - c[1]]) > 1e-6 ? [c[2] - c[0], c[3] - c[1]] : len([c[4] - c[0], c[5] - c[1]]) > 1e-6 ? [c[4] - c[0], c[5] - c[1]] : [c[6] - c[0], c[7] - c[1]]);
  const endTan = (c) => unit(len([c[6] - c[4], c[7] - c[5]]) > 1e-6 ? [c[6] - c[4], c[7] - c[5]] : len([c[6] - c[2], c[7] - c[3]]) > 1e-6 ? [c[6] - c[2], c[7] - c[3]] : [c[6] - c[0], c[7] - c[1]]);
  const d1 = (c, t) => { const u = 1 - t; return [0, 1].map((k) => 3 * u * u * (c[2 + k] - c[k]) + 6 * u * t * (c[4 + k] - c[2 + k]) + 3 * t * t * (c[6 + k] - c[4 + k])); };
  const d2 = (c, t) => [0, 1].map((k) => 6 * (1 - t) * (c[4 + k] - 2 * c[2 + k] + c[k]) + 6 * t * (c[6 + k] - 2 * c[4 + k] + c[2 + k]));

  // 点列 P 拟合一段三次曲线（两端切线 t0、t1 固定，t1 朝回指），误差超过 tol 就在误差最大处拆开（Schneider 的做法）
  function fitCubic(P, t0, t1, tol) {
    const p0 = P[0], p3 = P[P.length - 1];
    const chord = len(sub(p3, p0));
    const u = [0];
    for (let i = 1; i < P.length; i++) u.push(u[i - 1] + len(sub(P[i], P[i - 1])));
    for (let i = 0; i < u.length; i++) u[i] /= u[u.length - 1] || 1;
    const solve = () => {
      let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
      P.forEach((q, i) => {
        const t = u[i], s = 1 - t, b1 = 3 * s * s * t, b2 = 3 * s * t * t;
        const A1 = mul(t0, b1), A2 = mul(t1, b2);
        c00 += dot(A1, A1); c01 += dot(A1, A2); c11 += dot(A2, A2);
        const r = sub(q, add(mul(p0, s * s * s + b1), mul(p3, b2 + t * t * t)));
        x0 += dot(A1, r); x1 += dot(A2, r);
      });
      const det = c00 * c11 - c01 * c01;
      let a = det ? (x0 * c11 - x1 * c01) / det : chord / 3;
      let b = det ? (c00 * x1 - c01 * x0) / det : chord / 3;
      if (!(a > chord * 0.05) || !(b > chord * 0.05)) a = b = chord / 3;
      return [...p0, ...add(p0, mul(t0, a)), ...add(p3, mul(t1, b)), ...p3];
    };
    let c = solve();
    for (let it = 0; it < 4; it++) {
      // 牛顿法把每个点的参数挪到曲线上离它最近的地方，再解一次
      u.forEach((t, i) => {
        const q = bez(c, t), v = d1(c, t), a = d2(c, t), e = sub(q, P[i]);
        const den = dot(v, v) + dot(e, a);
        if (den) u[i] = Math.min(1, Math.max(0, t - dot(e, v) / den));
      });
      c = solve();
    }
    let worst = 0, wi = 0;
    P.forEach((q, i) => {
      const e = len(sub(bez(c, u[i]), q));
      if (e > worst) { worst = e; wi = i; }
    });
    if (worst <= tol || P.length < 8) return [c];
    wi = Math.min(P.length - 4, Math.max(3, wi));
    const tm = unit(sub(P[wi + 1], P[wi - 1]));
    return [...fitCubic(P.slice(0, wi + 1), t0, mul(tm, -1), tol), ...fitCubic(P.slice(wi), tm, t1, tol)];
  }

  function refitPath(path, tol) {
    const fixedOf = new Map(); // 段下标 → 它所在的接口
    for (const j of path.joins) for (let k = j.seg; k < j.seg + j.count; k++) fixedOf.set(k, j);
    const keep = (k) => fixedOf.has(k);
    const segs = path.segs.map((c, k) => ({ c, k })).filter(({ c, k }) => keep(k) || len(sub([c[6], c[7]], [c[0], c[1]])) > 0.5);
    // 切成若干截：同一个接口的段合成一截原样保留，尖角处断开
    const pieces = [];
    segs.forEach(({ c, k }, i) => {
      const prev = segs[i - 1];
      const corner = prev && dot(endTan(prev.c), startTan(c)) < 0.5;
      const sameJoin = prev && keep(k) && fixedOf.get(prev.k) === fixedOf.get(k);
      if (!pieces.length || corner || (keep(k) !== keep(prev.k)) || (keep(k) && !sameJoin)) pieces.push({ segs: [c], join: fixedOf.get(k) });
      else pieces[pieces.length - 1].segs.push(c);
    });
    const out = [], joins = [];
    for (const pc of pieces) {
      if (pc.join) {
        const known = joins.find((j) => j.src === pc.join);
        if (known) known.count += pc.segs.length;
        else joins.push({ ...pc.join, seg: out.length, count: pc.segs.length, src: pc.join });
        out.push(...pc.segs);
        continue;
      }
      if (pc.segs.length < 2) { out.push(...pc.segs); continue; }
      const P = [];
      for (const c of pc.segs) for (let i = 0; i < 12; i++) P.push(bez(c, i / 12));
      const lastSeg = pc.segs[pc.segs.length - 1];
      P.push([lastSeg[6], lastSeg[7]]);
      out.push(...fitCubic(P, startTan(pc.segs[0]), mul(endTan(lastSeg), -1), tol));
    }
    path.segs = out;
    path.joins = joins.map(({ src, ...j }) => j);
  }

  // ---------- 穿过的 o → 下一个字母 ----------
  // 通用的 6→3 混合要求两边的尾巴大致是同一条路（前一个字母的出笔和后一个字母的进笔重叠）。穿过的 o 从右下往右上出笔，
  // highEntry 的进笔从高处往下沉，两条尾巴交叉，混出来的控制多边形先左转、再右转、再左转，曲线就是 S 形。
  // 这里不混合：o 的控制点写到斜穿的终点为止，直接接到后一个字母进笔里"方向已经转过来"的那个点上，中间补 0–2 个点。
  //   · 可以接的点 B[s]：控制多边形 A[n−2] → A[n−1] → B[s] → B[s+1] 两处都左转，且 B[s] → B[s+1] 的方向不低于到达方向
  //     （均匀 B 样条的曲线拐点不会比控制多边形多，多边形一路左转，曲线就没有 S 弯）
  //   · 桥接点：最小化控制多边形的三阶差分平方和 Σ|Δ³P|²（曲率变化最平缓），一个点时是
  //     X = [15(A0 + B0) − 6(A1 + B1) + (A2 + B2)] / 20（A0 是 o 的最后一个点，B0 = B[s]）
  //   · 在第一个可以接的点和后一个点、桥接 0–2 个点这几种接法里，挑接口附近曲线曲率变化最单调的
  // 坐标是 y 朝下（左转 = 叉积为负）
  const crs = (u, v) => u[0] * v[1] - u[1] * v[0];
  const angle = (v) => Math.atan2(-v[1], v[0]);
  function fair(A, B, m) {
    // A 的最后 3 个点、m 个未知点、B 的前 3 个点；对含未知点的每个 4 点窗口，Δ³ = p3 − 3p2 + 3p1 − p0
    const P = [...A.slice(-3), ...Array(m).fill(null), ...B.slice(0, 3)], D3 = [-1, 3, -3, 1];
    return [0, 1].map((ax) => {
      const N = Array.from({ length: m }, () => Array(m).fill(0)), r = Array(m).fill(0);
      for (let j = 0; j + 3 < P.length; j++) {
        const a = Array(m).fill(0);
        let c = 0;
        D3.forEach((d, t) => { const q = P[j + t]; if (q) c += d * q[ax]; else a[j + t - 3] += d; });
        for (let u = 0; u < m; u++) { r[u] -= a[u] * c; for (let v = 0; v < m; v++) N[u][v] += a[u] * a[v]; }
      }
      if (m === 1) return [r[0] / N[0][0]];
      if (m === 2) { const det = N[0][0] * N[1][1] - N[0][1] * N[1][0]; return [(r[0] * N[1][1] - N[0][1] * r[1]) / det, (N[0][0] * r[1] - N[1][0] * r[0]) / det]; }
      return [];
    }).reduce((xs, ys) => xs.map((x, i) => [x, ys[i]]));
  }
  // 一串控制点画成的 B 样条：曲率全变差 − 首尾差（曲率单调时为 0），有右转时记下最大的反向曲率
  function bumpOf(P) {
    const ks = [];
    for (let i = 0; i + 3 < P.length; i++) for (let k = 0; k < 16; k++) {
      const t = k / 16, w1 = [-((1 - t) ** 2) / 2, (3 * t * t - 4 * t) / 2, (-3 * t * t + 2 * t + 1) / 2, t * t / 2], w2 = [1 - t, 3 * t - 2, 1 - 3 * t, t];
      const d1 = [0, 1].map((j) => w1.reduce((s, w, q) => s + w * P[i + q][j], 0)), d2 = [0, 1].map((j) => w2.reduce((s, w, q) => s + w * P[i + q][j], 0));
      ks.push(-crs(d1, d2) / Math.hypot(d1[0], d1[1]) ** 3);
    }
    let tv = 0, neg = 0;
    ks.forEach((k, i) => { if (i) tv += Math.abs(k - ks[i - 1]); neg = Math.max(neg, -k); });
    return { bump: tv - Math.abs(ks[ks.length - 1] - ks[0]), neg };
  }
  function joinCrossed(A, B) {
    const n = A.length, a0 = A[n - 1], e0 = sub(a0, A[n - 2]), arrive = angle(e0);
    let first = -1, best = null;
    for (let s = 0; s + 1 < B.length && (first < 0 || s <= first + 1); s++) {
      const e1 = sub(B[s], a0), e2 = sub(B[s + 1], B[s]);
      if (B[s][0] < a0[0] + 40 || crs(e0, e1) > 0 || crs(e1, e2) > 0 || angle(e2) < arrive) continue;
      if (first < 0) first = s;
      for (let m = 0; m <= 2; m++) {
        const mid = fair(A, B.slice(s), m);
        const r = bumpOf([...A.slice(-4), ...mid, ...B.slice(s, s + 4)]);
        const v = r.bump + (r.neg > 1e-5 ? 1 : 0);
        if (!best || v < best.v) best = { v, skip: s, mid };
      }
    }
    return best;
  }

  function create(data) {
    const G = data.glyphs;

    // 字形里的一笔：控制点换到词里的位置（y 朝下）
    const strokeOf = (s, ox, oy) => ({
      pts: s.points.map((p) => [p[0] + ox, -(p[1] + oy)]),
      startOn: !s.start || s.start.oncurve !== false,
      endOn: !s.end || s.end.oncurve !== false,
      startTan: (s.start && s.start.tangency) || 0,
      endTan: (s.end && s.end.tangency) || 0,
      closed: s.type === "Closed",
      width: s.points[0][3],
    });
    const lone = (S) => ({ pts: S.pts, clampStart: true, clampEnd: true, closed: S.closed });

    function layout(shaped, opts = {}) {
      const paths = [];
      const dots = [];
      let path = null; // 正在写的这一笔：{ runs: [{ pts, clampStart, clampEnd, joins }], … }
      let last = null; // 最后接上的那一笔
      let lastGlyph = -1;
      let pending = []; // 等抬笔时再补的笔画
      let loop = null; // 还没写的闭合圈（等知道出笔从哪接出去再写）
      const run = () => path.runs[path.runs.length - 1];
      const lift = () => {
        if (loop) writeLoop(null);
        if (path) run().clampEnd = true; // 收笔：曲线写到最后一个控制点
        path = null;
        last = null;
        for (const p of pending) {
          if (p.dot) dots.push({ ...p.dot, after: paths.length }); // after：书写顺序上排在第几笔之后（做动画用）
          else paths.push(p.path);
        }
        pending = [];
      };
      const later = (S, gi) => pending.push({ path: { runs: [lone(S)], width: S.width, glyphs: [gi], late: true } });
      const dotOf = (s, sg, gi) => ({ dot: { x: s.points[0][0] + sg.x, y: -(s.points[0][1] + sg.y), r: s.points[0][3] / 2, glyph: gi } });

      // 字母之间：A 的最后 3 个控制点和 B 的前 3 个控制点换成 3 个新点（按位置渐变混合，权重 JOIN_W）
      function joinLetters(S, info) {
        const R = run();
        const n = R.pts.length;
        if (G[info.from] && G[info.from].cross && n >= 4) {
          const c = joinCrossed(R.pts, S.pts);
          if (c) {
            R.pts.push(...c.mid, ...S.pts.slice(c.skip));
            (R.joins ||= []).push({ from: n - 1, to: n + c.mid.length, info });
            return;
          }
        }
        // 前一笔只有 3 个点（默认 p、s.highEntry 抬笔后另起的那一小笔出笔）也照样换：3 个点全部换成新点
        if (n < 3 || S.pts.length < 3) {
          R.pts.push(...S.pts);
          return;
        }
        const A = R.pts.slice(n - 3), B = S.pts.slice(0, 3);
        const C = JOIN_W.map((w, k) => lerp(A[k], B[k], w));
        R.pts.splice(n - 3, 3, ...C, ...S.pts.slice(3));
        (R.joins ||= []).push({ from: n - 3, to: n - 1, info });
      }
      // 闭合的圈（macOS 版的 o：进笔、圈、出笔三笔）：进笔沿切线贴到圈上，顺着进笔的方向绕一整圈回来，
      // 再接着绕到出笔贴上的地方，接出笔——和 iOS 版把 o 写成一整笔是一样的。
      // 圈是第一笔（词首的 o）就从出笔贴上的地方开始绕；后面没有出笔就绕一圈收住
      const nearest = (P, q) => P.reduce((k, p, i) => (dist(p, q) < dist(P[k], q) ? i : k), 0);
      function startLoop(S) {
        let i0 = null, dir = 1;
        if (last) {
          const a = last.pts[last.pts.length - 1], pa = last.pts[last.pts.length - 2] || a;
          const v = [a[0] - pa[0], a[1] - pa[1]], P = S.pts, n = P.length;
          i0 = nearest(P, a);
          const step = (d) => { const q = P[(i0 + d + n) % n]; return (q[0] - P[i0][0]) * v[0] + (q[1] - P[i0][1]) * v[1]; };
          dir = step(1) >= step(-1) ? 1 : -1;
        }
        loop = { S, i0, dir };
      }
      function writeLoop(next) {
        const P = loop.S.pts, n = P.length;
        let { i0: start, dir } = loop;
        const j0 = next ? nearest(P, next.pts[0]) : null;
        if (start === null) {
          start = j0 ?? 0;
          if (next) {
            // 绕回 j0 时的方向要顺着出笔
            const v = [next.pts[1][0] - next.pts[0][0], next.pts[1][1] - next.pts[0][1]];
            const into = (d) => { const q = P[(j0 - d + n) % n]; return (P[j0][0] - q[0]) * v[0] + (P[j0][1] - q[1]) * v[1]; };
            dir = into(1) >= into(-1) ? 1 : -1;
          }
        }
        const seq = [];
        let k = start;
        for (let i = 0; i <= n; i++) { seq.push(P[k]); k = (k + dir + n) % n; } // 一整圈，回到起点
        if (j0 !== null) for (k = start; k !== j0; ) { k = (k + dir + n) % n; seq.push(P[k]); } // 再绕到出笔的地方
        const R = run();
        if (R.pts.length && dist(R.pts[R.pts.length - 1], seq[0]) < SNAP) seq.shift();
        R.pts.push(...seq);
        loop = null;
      }

      // 字母内部：前一笔 A 已在路径里，接上同一个字母的下一笔 S
      function joinInside(A, S) {
        const R = run();
        const a = A.pts[A.pts.length - 1], b = S.pts[0];
        if (dist(a, b) < SNAP) {
          // 尖角：两笔都正好停在这个点上
          R.clampEnd = true;
          path.runs.push({ pts: [a, ...S.pts.slice(1)], clampStart: true });
        } else if (A.endTan > 0) {
          // 贴上去再折回：顺着 S 倒着走回它的起点，折返
          let k = 0;
          S.pts.forEach((p, i) => { if (dist(p, a) < dist(S.pts[k], a)) k = i; });
          R.pts.push(...S.pts.slice(0, k + 1).reverse());
          R.clampEnd = true;
          path.runs.push({ pts: [...S.pts], clampStart: true });
        } else if (A.endOn || S.startTan > 0) {
          // 在前一笔的终点折返，再顺着 S 写
          R.clampEnd = true;
          path.runs.push({ pts: [a, ...S.pts], clampStart: true });
        } else {
          R.pts.push(...S.pts); // 直接接着写
        }
      }

      shaped.forEach((sg, gi) => {
        const g = G[sg.glyph];
        if (!g || !g.strokes.some((s) => s.type === "Open" || s.type === "Closed" || s.type === "Dot")) {
          lift(); // 空格、没有笔画的字形：抬笔
          return;
        }
        const { joinsForward: jf, joinsBackward: jb } = g.info;
        const drawn = g.strokes.map((s, i) => ({ s, i })).filter(({ s }) => (s.type === "Open" || s.type === "Closed") && !s.deferred);
        if (!drawn.length) {
          // 重音符号之类：不打断正在写的这一笔，抬笔时再补
          for (const s of g.strokes) {
            if (s.type === "Dot") pending.push(dotOf(s, sg, gi));
            else if (s.type === "Open") later(strokeOf(s, sg.x, sg.y), gi);
          }
          return;
        }
        const from = jb ?? drawn[0].i;
        const to = jf ?? drawn[drawn.length - 1].i;
        if (jb === undefined || !path) lift();
        g.strokes.forEach((s, i) => {
          if (s.type === "Dot") return pending.push(dotOf(s, sg, gi));
          if (s.type !== "Open" && s.type !== "Closed") return;
          const S = strokeOf(s, sg.x, sg.y);
          if (s.deferred || i < from || i > to) return later(S, gi);
          // 字母内部两侧都是影子点、间隔又大：抬笔
          if (path && last && i !== from && !last.endOn && !S.startOn && !last.endTan && !S.startTan &&
            dist(last.pts[last.pts.length - 1], S.pts[0]) > LIFT_GAP) lift();
          if (S.closed) {
            if (!path) {
              path = { runs: [{ pts: [], clampStart: true }], width: S.width, glyphs: [gi] };
              paths.push(path);
            }
            startLoop(S);
          } else if (loop) {
            writeLoop(S);
            run().pts.push(...S.pts); // 出笔顺着圈接出去
          } else if (!path) {
            path = { runs: [{ pts: [...S.pts], clampStart: true }], width: S.width, glyphs: [gi] }; // 起笔：从第一个控制点写起
            paths.push(path);
          } else if (i === from) {
            joinLetters(S, { from: shaped[lastGlyph].glyph, to: sg.glyph, glyphs: [lastGlyph, gi] });
          } else {
            joinInside(last, S);
          }
          if (!path.glyphs.includes(gi)) path.glyphs.push(gi);
          last = S;
          lastGlyph = gi;
        });
        if (jf === undefined) lift(); // 词尾写法：这个字母写完就抬笔
      });
      lift();

      // 控制点 → 贝塞尔，按需重新拟合
      const tol = opts.smooth ?? SMOOTH;
      const out = paths.map((p) => {
        const segs = [], joins = [];
        for (const r of p.runs) {
          const b = bspline(r);
          joins.push(...b.joins.map((j) => ({ ...j, seg: j.seg + segs.length })));
          segs.push(...b.segs);
        }
        const res = { segs, width: p.width, glyphs: p.glyphs, joins, late: !!p.late };
        if (tol > 0) refitPath(res, tol);
        return res;
      });
      const xs = [], ys = [];
      for (const p of out) for (const c of p.segs) for (let k = 0; k < 8; k += 2) xs.push(c[k]), ys.push(c[k + 1]);
      for (const d of dots) xs.push(d.x), ys.push(d.y);
      const bounds = xs.length
        ? { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
        : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
      return { paths: out, dots, bounds };
    }

    return { layout };
  }

  const api = { create };
  root.appleWriter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
