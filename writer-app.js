// 主页面（index.html）：输入文字 → Apple 骨架字体排字、画字 → 一笔书写的动画，可以下载带动画的 SVG。
// 字体来源见 apple-source.js（载入字体文件，或者 tools/ 生成的 data/apple/）。
(async () => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PEN_SPEED = 3200; // 速度 = 1 时，每秒写多少字体单位（hello 约 3 秒）
  const DOT_COST = 90; // 点一个点相当于写多长
  const VIDEO_FPS = 60;
  // 字体里存的是笔的半径；Apple 开机画面按 1.55 倍画（Macintosh Skeletal Filled 从渲染程序里读出来的）
  const THEMES = {
    ink: { bg: "#ffffff", ink: "#1d1d1f" },
    night: { bg: "#000000", ink: "#f5f5f7" },
    color: { bg: "#ffffff", ink: "url(#hw-gradient)" },
  };
  const GRADIENT = ["#ff9f0a", "#ff375f", "#bf5af2", "#5e5ce6", "#0a84ff", "#30d158"];
  function themeFor(opts) {
    const theme = THEMES[opts.theme];
    return opts.theme === "color" && opts.gradientMode === "dark"
      ? { ...theme, bg: "#000000" }
      : theme;
  }

  const $ = (id) => document.getElementById(id);
  // 分段控件是一组单选按钮：取选中的那个
  const choice = (id) => { const on = $(id).querySelector("input:checked"); return on ? on.value : ""; };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r1 = (n) => Math.round(n * 10) / 10;
  const ease = (x) => 0.5 * x + 0.5 * (0.5 - 0.5 * Math.cos(Math.PI * x));
  function easeInverse(y) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (ease(mid) < y) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const pathD = (segs) => `M${r1(segs[0][0])} ${r1(segs[0][1])}` + segs.map((c) => `C${r1(c[2])} ${r1(c[3])} ${r1(c[4])} ${r1(c[5])} ${r1(c[6])} ${r1(c[7])}`).join("");
  const el = (name, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  const { t } = mwI18n;
  mwI18n.apply();
  $("lang").addEventListener("click", (e) => { e.preventDefault(); mwI18n.setLang(mwI18n.other); });

  const stage = $("stage");
  const svg = el("svg", { xmlns: SVG_NS, role: "img" });

  // ---------- 字体来源 ----------
  if (appleSource.servedFromFile) {
    stage.innerHTML = `<div id="setup">${appleSource.fileHelp()}</div>`;
    return;
  }
  const sources = await appleSource.open();
  function fillSources(prefer) {
    const list = sources.list();
    $("src").innerHTML = list.map((s) => `<option value="${s.id}">${s.label}</option>`).join("");
    $("src").value = prefer && sources.has(prefer) ? prefer : sources.preferred() || "";
    $("src").parentElement.style.display = list.length ? "" : "none";
  }
  fillSources();
  const source = () => sources.get($("src").value);

  function showSetup(error) {
    stage.style.background = "#ffffff";
    stage.innerHTML = `<div id="setup"><h2>${t("setup.title")}</h2>${t("setup.body")}${error ? `<p style="color:#b25000">${error}</p>` : ""}</div>`;
  }

  // ---------- 排字、画字 ----------
  function options() {
    return {
      weight: Number($("weight").value),
      speed: Number($("speed").value),
      center: $("center").checked,
      lineSpacing: Number($("line-spacing").value),
      theme: choice("theme"),
      gradientMode: choice("gradient-mode"),
      oCross: !!choice("ocross"),
      pJoin: !!choice("pjoin"),
    };
  }

  // 书写顺序：笔画按 L.paths 的顺序，i、j 的点插在它们的 after 之后
  function sequence(L) {
    const seq = [];
    L.paths.forEach((p, i) => {
      for (const d of L.dots) if (d.after === i) seq.push({ dot: d });
      seq.push({ path: p });
    });
    for (const d of L.dots) if (d.after >= L.paths.length) seq.push({ dot: d });
    return seq;
  }

  // Shape each line independently so a newline starts a fresh baseline. The
  // font shaper only handles glyph runs, so combining lines after shaping also
  // keeps line breaks out of the missing-character warning.
  function layoutText(text, S, opts) {
    const paths = [], dots = [], shaped = [];
    const lines = text.split("\n");
    const lineHeight = Math.max(700, Math.round((S.glyphs.metrics?.xHeight || 400) * 1.8)) * opts.lineSpacing;
    const entries = [];
    let pathOffset = 0;
    let charOffset = 0;

    lines.forEach((line, lineIndex) => {
      const lineShaped = S.shaper.shape(line, { oCross: opts.oCross, pJoin: opts.pJoin });
      const glyphOffset = shaped.length;
      shaped.push(...lineShaped.map((g) => ({ ...g, cluster: g.cluster + charOffset })));
      const L = S.writer.layout(lineShaped);
      entries.push({ L, dy: lineIndex * lineHeight, glyphOffset, pathOffset });
      pathOffset += L.paths.length;
      charOffset += line.length + (lineIndex < lines.length - 1 ? 1 : 0);
    });

    const drawn = entries.filter(({ L }) => L.paths.length || L.dots.length);
    const contentMinX = drawn.length ? Math.min(...drawn.map(({ L }) => L.bounds.minX)) : 0;
    const contentMaxX = drawn.length ? Math.max(...drawn.map(({ L }) => L.bounds.maxX)) : 0;
    const targetCenter = (contentMinX + contentMaxX) / 2;

    for (const { L, dy, glyphOffset, pathOffset } of entries) {
      const dx = opts.center && (L.paths.length || L.dots.length)
        ? targetCenter - (L.bounds.minX + L.bounds.maxX) / 2
        : 0;

      for (const p of L.paths) {
        paths.push({
          ...p,
          glyphs: p.glyphs?.map((g) => g + glyphOffset),
          joins: p.joins?.map((j) => ({ ...j, glyphs: j.glyphs?.map((g) => g + glyphOffset) })),
          segs: p.segs.map((seg) => seg.map((v, i) => i % 2 ? v + dy : v + dx)),
        });
      }
      for (const d of L.dots) dots.push({ ...d, x: d.x + dx, y: d.y + dy, after: d.after + pathOffset });
    }

    const xs = [], ys = [];
    for (const p of paths) for (const seg of p.segs) for (let i = 0; i < seg.length; i += 2) {
      xs.push(seg[i]);
      ys.push(seg[i + 1]);
    }
    for (const d of dots) {
      xs.push(d.x);
      ys.push(d.y);
    }
    const bounds = xs.length
      ? { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
      : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    return { paths, dots, bounds, shaped };
  }

  // 时间轴：写一笔的时间按长度算，抬笔移动到下一笔的起点也算一点时间
  function timeline(seq, lengths) {
    let t = 0, pen = null;
    const out = seq.map((it, i) => {
      const start = it.dot ? [it.dot.x, it.dot.y] : [it.path.segs[0][0], it.path.segs[0][1]];
      if (pen) {
        const jump = Math.hypot(start[0] - pen[0], start[1] - pen[1]);
        if (jump > 4) t += Math.min(140, 30 + jump * 0.08);
      }
      const cost = it.dot ? DOT_COST : lengths[i];
      const e = { start: t, cost };
      t += cost;
      if (it.dot) pen = start;
      else { const last = it.path.segs[it.path.segs.length - 1]; pen = [last[6], last[7]]; }
      return e;
    });
    for (const e of out) e.total = t;
    return out;
  }

  let state = null, raf = 0;

  function rebuild() {
    cancelAnimationFrame(raf);
    const S = source();
    if (!S) { state = null; showSetup(); return; }
    const opts = options();
    const text = $("text").value;
    const L = layoutText(text, S, opts);
    const shaped = L.shaped;
    const seq = sequence(L);
    const theme = themeFor(opts);
    stage.style.background = theme.bg;
    $("gradient-mode-wrap").hidden = opts.theme !== "color";
    if (!stage.contains(svg)) stage.replaceChildren(svg);
    svg.replaceChildren();
    const b = L.bounds;
    const maxW = Math.max(34, ...L.paths.map((p) => p.width)) * 2 * opts.weight;
    const pad = maxW / 2 + 40;
    svg.setAttribute("viewBox", `${r1(b.minX - pad)} ${r1(b.minY - pad)} ${r1(b.maxX - b.minX + pad * 2)} ${r1(b.maxY - b.minY + pad * 2)}`);
    if (opts.theme === "color") {
      const defs = el("defs");
      const grad = el("linearGradient", { id: "hw-gradient", gradientUnits: "userSpaceOnUse", x1: b.minX, y1: 0, x2: b.maxX, y2: 0 });
      GRADIENT.forEach((c, i) => grad.appendChild(el("stop", { offset: i / (GRADIENT.length - 1), "stop-color": c })));
      defs.appendChild(grad);
      svg.appendChild(defs);
    }
    const nodes = seq.map((it) => {
      const node = it.dot
        ? el("circle", { cx: r1(it.dot.x), cy: r1(it.dot.y), r: 0, fill: theme.ink })
        : el("path", { d: pathD(it.path.segs), fill: "none", stroke: theme.ink, "stroke-width": r1(it.path.width * 2 * opts.weight), "stroke-linecap": "round", "stroke-linejoin": "round" });
      svg.appendChild(node);
      return node;
    });
    const lengths = nodes.map((n, i) => (seq[i].dot ? 0 : n.getTotalLength()));
    state = { seq, nodes, lengths, time: timeline(seq, lengths), opts, shaped, bounds: b };
    showStatus(shaped);
  }

  function setProgress(c) {
    const { seq, nodes, time, lengths, opts } = state;
    nodes.forEach((node, i) => {
      const f = clamp((c - time[i].start) / time[i].cost, 0, 1);
      if (seq[i].dot) node.setAttribute("r", r1(seq[i].dot.r * 2 * opts.weight * f));
      else {
        const len = lengths[i];
        node.style.strokeDasharray = `${len} ${len + 1}`;
        node.style.strokeDashoffset = len * (1 - f);
        node.style.visibility = f > 0 ? "visible" : "hidden";
      }
    });
  }

  function play() {
    if (!state) rebuild();
    if (!state || !state.nodes.length) return;
    cancelAnimationFrame(raf);
    const total = state.time[0].total;
    const duration = (total / (PEN_SPEED * state.opts.speed)) * 1000;
    const t0 = performance.now();
    const tick = (now) => {
      const x = Math.min(1, (now - t0) / duration);
      setProgress(ease(x) * total);
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function showStatus(shaped) {
    const status = $("status");
    status.replaceChildren();
    const text = $("text").value;
    const missing = [...new Set(shaped.filter((g) => g.glyph === ".notdef").map((g) => String.fromCodePoint(text.codePointAt(g.cluster) || 63)))];
    if (missing.length) {
      const warn = document.createElement("span");
      warn.className = "warn";
      warn.textContent = t("status.missing", { chars: missing.join(" ") });
      status.append(warn, " ");
    }
  }

  // ---------- 导出带动画的 SVG ----------
  function animatedSvg() {
    if (!state || !state.nodes.length) return null;
    const { seq, lengths, time, opts } = state;
    const total = time[0].total;
    const duration = total / (PEN_SPEED * opts.speed);
    const pct = (c) => (easeInverse(clamp(c / total, 0, 1)) * 100).toFixed(3);
    const theme = themeFor(opts);
    const css = [], shapes = [];
    seq.forEach((it, i) => {
      const a = pct(time[i].start);
      const a2 = Math.min(100, Number(a) + 0.01).toFixed(3);
      const z = pct(time[i].start + time[i].cost);
      if (it.dot) {
        const r = r1(it.dot.r * 2 * opts.weight);
        css.push(`@keyframes k${i}{0%,${a}%{r:0px}${z}%,100%{r:${r}px}}`);
        shapes.push(`<circle cx="${r1(it.dot.x)}" cy="${r1(it.dot.y)}" r="${r}" fill="${theme.ink}" style="animation:k${i} ${duration.toFixed(2)}s linear both"/>`);
      } else {
        const len = r1(lengths[i]);
        css.push(`@keyframes k${i}{0%,${a}%{opacity:0;stroke-dashoffset:${len}}${a2}%{opacity:1;stroke-dashoffset:${len}}${z}%,100%{opacity:1;stroke-dashoffset:0}}`);
        shapes.push(`<path d="${pathD(it.path.segs)}" fill="none" stroke="${theme.ink}" stroke-width="${r1(it.path.width * 2 * opts.weight)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${len} ${r1(len + 1)}" style="animation:k${i} ${duration.toFixed(2)}s linear both"/>`);
      }
    });
    const vb = svg.getAttribute("viewBox");
    const [vx, vy, vw, vh] = vb.split(" ");
    const defs = opts.theme === "color"
      ? `<defs><linearGradient id="hw-gradient" gradientUnits="userSpaceOnUse" x1="${vx}" y1="0" x2="${Number(vx) + Number(vw)}" y2="0">${GRADIENT.map((c, i) => `<stop offset="${i / (GRADIENT.length - 1)}" stop-color="${c}"/>`).join("")}</linearGradient></defs>`
      : "";
    const bg = (opts.theme === "night" || (opts.theme === "color" && opts.gradientMode === "dark"))
      ? `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${theme.bg}"/>`
      : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">\n${defs}<style>${css.join("\n")}</style>\n${bg}${shapes.join("\n")}\n</svg>\n`;
  }

  function exportSvg() {
    const file = animatedSvg();
    if (!file) return;
    const name = ($("text").value.trim().replace(/[^\p{L}\p{N}]+/gu, "-") || "hello") + ".svg";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([file], { type: "image/svg+xml" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function cubicPoint(c, t) {
    const u = 1 - t;
    return [
      u * u * u * c[0] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
      u * u * u * c[1] + 3 * u * u * t * c[3] + 3 * u * t * t * c[5] + t * t * t * c[7],
    ];
  }

  function samplePath(segs) {
    const points = [];
    let length = 0;
    let previous = null;
    for (const seg of segs) {
      for (let i = 0; i <= 48; i++) {
        const point = cubicPoint(seg, i / 48);
        if (previous) length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
        points.push(point);
        previous = point;
      }
    }
    return { points, length };
  }

  function drawCanvasPath(ctx, sample, progress) {
    if (!sample.points.length) return;
    const target = sample.length * clamp(progress, 0, 1);
    ctx.beginPath();
    ctx.moveTo(sample.points[0][0], sample.points[0][1]);
    let traveled = 0;
    for (let i = 1; i < sample.points.length; i++) {
      const a = sample.points[i - 1], b = sample.points[i];
      const segment = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (traveled + segment <= target) {
        ctx.lineTo(b[0], b[1]);
        traveled += segment;
        continue;
      }
      const fraction = segment ? (target - traveled) / segment : 0;
      ctx.lineTo(a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction);
      break;
    }
    ctx.stroke();
  }

  function videoDimensions() {
    return choice("video-ratio") === "9:16" ? [720, 1280] : [1280, 720];
  }

  function canvasRenderer(currentState, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const { seq, time, opts, bounds } = currentState;
    const samples = seq.map((it) => it.path ? samplePath(it.path.segs) : null);
    const maxW = Math.max(34, ...seq.filter((it) => it.path).map((it) => it.path.width)) * 2 * opts.weight;
    const pad = maxW / 2 + 40;
    const vx = bounds.minX - pad, vy = bounds.minY - pad;
    const vw = bounds.maxX - bounds.minX + pad * 2, vh = bounds.maxY - bounds.minY + pad * 2;
    const scale = Math.min(width / vw, height / vh);
    const theme = themeFor(opts);
    const ink = opts.theme === "color" ? ctx.createLinearGradient(bounds.minX, 0, bounds.maxX, 0) : theme.ink;
    if (opts.theme === "color") GRADIENT.forEach((color, i) => ink.addColorStop(i / (GRADIENT.length - 1), color));
    const drawFrame = (progress) => {
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate((width - vw * scale) / 2, (height - vh * scale) / 2);
      ctx.scale(scale, scale);
      ctx.translate(-vx, -vy);
      ctx.strokeStyle = ink;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const current = progress * time[0].total;
      seq.forEach((it, i) => {
        const f = clamp((current - time[i].start) / time[i].cost, 0, 1);
        if (it.dot) {
          ctx.beginPath();
          ctx.fillStyle = ink;
          ctx.arc(it.dot.x, it.dot.y, it.dot.r * 2 * opts.weight * f, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.lineWidth = it.path.width * 2 * opts.weight;
          drawCanvasPath(ctx, samples[i], f);
        }
      });
      ctx.restore();
    };
    return { canvas, drawFrame };
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function exportStatic() {
    if (!state || !state.nodes.length) return;
    const [width, height] = videoDimensions();
    const { canvas, drawFrame } = canvasRenderer(state, width, height);
    drawFrame(1);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const ratio = choice("video-ratio");
    const name = $("text").value.trim().replace(/[^\p{L}\p{N}]+/gu, "-") || "hello";
    downloadBlob(blob, `${name}-${ratio.replace(":", "x")}.png`);
    $("status").textContent = t("status.staticReady");
  }

  async function exportVideo() {
    if (!state || !state.nodes.length) return;
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      $("status").textContent = t("status.videoUnsupported");
      return;
    }
    const ratio = choice("video-ratio");
    const [width, height] = videoDimensions();
    const candidates = [
      ["video/mp4", "mp4"],
      ["video/webm;codecs=vp9", "webm"],
      ["video/webm;codecs=vp8", "webm"],
      ["video/webm", "webm"],
    ];
    const format = candidates.find(([mime]) => MediaRecorder.isTypeSupported(mime));
    if (!format) {
      $("status").textContent = t("status.videoUnsupported");
      return;
    }

    const { canvas, drawFrame } = canvasRenderer(state, width, height);
    const { time, opts } = state;

    $("status").textContent = t("status.videoExporting");
    const stream = canvas.captureStream(VIDEO_FPS);
    const recorder = new MediaRecorder(stream, { mimeType: format[0] });
    const chunks = [];
    const stopped = new Promise((resolve, reject) => {
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => reject(recorder.error || new Error("MediaRecorder failed"));
      recorder.onstop = () => resolve(new Blob(chunks, { type: format[0] }));
    });
    const duration = time[0].total / (PEN_SPEED * opts.speed);
    const frames = Math.max(1, Math.ceil(duration * VIDEO_FPS));
    recorder.start();
    for (let frame = 0; frame <= frames; frame++) {
      drawFrame(frame / frames);
      await new Promise((resolve) => setTimeout(resolve, 1000 / VIDEO_FPS));
    }
    recorder.stop();
    let blob = await stopped;
    let extension = format[1];
    // Some browsers report an MP4 MIME type while writing VP9 into the
    // container. Always use the local converter so the downloaded MP4 is
    // H.264/yuv420p and stays compatible with QuickTime.
    if (format[1] === "webm" || format[1] === "mp4") {
      $("status").textContent = t("status.videoConverting");
      try {
        const response = await fetch("/convert/mp4", {
          method: "POST",
          headers: { "Content-Type": format[0] },
          body: blob,
        });
        if (response.ok) {
          const converted = await response.blob();
          if (converted.size) {
            blob = converted;
            extension = "mp4";
          }
        }
      } catch {
        // Keep the WebM recording when the optional local converter is unavailable.
      }
    }
    stream.getTracks().forEach((track) => track.stop());
    const name = ($("text").value.trim().replace(/[^\p{L}\p{N}]+/gu, "-") || "hello");
    downloadBlob(blob, `${name}-${ratio.replace(":", "x")}.${extension}`);
    $("status").textContent = t(extension === "webm" ? "status.videoFallback" : "status.videoReady");
  }

  // 调试 / 其他页面用
  window.mcintoshWriter = { animatedSvg, rebuild, play };

  // ---------- 事件 ----------
  const replay = () => { rebuild(); play(); };
  let typing = 0;
  $("text").addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(replay, 350);
  });
  // Enter 换行；Command-Return（其他系统 Ctrl-Enter）重播
  $("text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); replay(); }
  });
  $("play").addEventListener("click", replay);
  stage.addEventListener("click", (e) => { if (state) replay(); });
  for (const id of ["weight", "theme", "gradient-mode", "ocross", "pjoin", "center", "line-spacing"]) {
    const refresh = () => {
      $("weightval").textContent = `${Number($("weight").value).toFixed(2)}×`;
      $("line-spacing-val").textContent = `${Number($("line-spacing").value).toFixed(2)}×`;
      rebuild();
      if (state) setProgress(Infinity);
    };
    $(id).addEventListener("input", refresh);
    if (["theme", "gradient-mode", "ocross", "pjoin"].includes(id)) $(id).addEventListener("change", refresh);
  }
  $("speed").addEventListener("input", () => {
    $("speedval").textContent = `${Number($("speed").value).toFixed(1)}×`;
    if (state) state.opts.speed = Number($("speed").value);
  });
  $("export").addEventListener("click", exportSvg);
  $("static-export").addEventListener("click", exportStatic);
  $("video-export").addEventListener("click", exportVideo);
  $("src").addEventListener("change", () => { sources.remember($("src").value); replay(); });
  $("file").addEventListener("change", async (e) => {
    try {
      const id = await sources.addFiles(e.target.files);
      if (id) { sources.remember(id); fillSources(id); replay(); }
    } catch (err) {
      showSetup(err.code === "not-skeletal" ? t("error.notSkeletal") : t("error.load", { reason: err.message }));
    }
    e.target.value = "";
  });

  replay();
})();
