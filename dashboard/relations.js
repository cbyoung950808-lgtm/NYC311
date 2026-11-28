/* "D. 관계 분석" tab: correlation vs causation, Spearman correlations, K-Means, distributions.
   Reads window.RELATIONS_DATA (built by build_relations_data.py). Fixed analysis: the global
   filters do not apply here. */
(function () {
  "use strict";
  const R = window.RELATIONS_DATA;
  if (!R) return;
  const KO = window.PROBLEM_KO || {};
  const PAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  const GRAY = "#b9b8b2";
  const BKO = { "BRONX": "브롱크스", "BROOKLYN": "브루클린", "MANHATTAN": "맨해튼", "QUEENS": "퀸스", "STATEN ISLAND": "스태튼아일랜드" };
  const BORO = Object.keys(BKO);
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = new Intl.NumberFormat("ko-KR");
  const tag = { f: '<span class="tag fact">사실</span>', m: '<span class="tag maybe">가능한 설명</span>', c: '<span class="tag check">추가 확인</span>' };

  const S = { pane: "d1", unit: "problem", focus: "all", k: null, pair: null, feat: "med_log", color: "cluster" };

  // ---------------- data access ----------------
  const rec = () => S.unit === "problem" ? R.problem : R.cb[S.focus];
  const defaultK = () => S.unit === "problem" ? R.problem.kmeans.best_k : R.cb.all.kmeans.best_k;
  const kNow = () => S.k || defaultK();
  const featInfo = id => rec().features.find(f => f.id === id);
  const unitName = i => {
    const r = rec(), n = r.names[i];
    if (S.unit === "problem") return KO[n] ? `${KO[n]} · ${n}` : n;
    const [code, ...b] = n.split(" "); return `${BKO[b.join(" ")] || b.join(" ")} ${+code}번`;
  };
  const unitShort = i => { const n = rec().names[i]; return S.unit === "problem" ? (KO[n] || n) : unitName(i); };
  function clusterOf() {  // unit index -> cluster id (or null when the unit was not clustered)
    const km = rec().kmeans, run = km.runs[String(kNow())], out = new Array(rec().names.length).fill(null);
    km.member_index.forEach((ui, j) => { out[ui] = run.labels[j]; });
    return out;
  }
  function fmtVal(id, v) {
    if (v == null || Number.isNaN(v)) return "-";
    if (id === "med_log") { const h = Math.pow(10, v); return h < 1 ? `${Math.round(h * 60)}분` : h < 48 ? `${h.toFixed(1)}시간` : `${nf.format(Math.round(h))}시간(약 ${(h / 24).toFixed(0)}일)`; }
    if (id === "log_n") return nf.format(Math.round(Math.pow(10, v))) + "건";
    if (id === "speed_idx") return (v >= 0 ? "+" : "") + v.toFixed(2) + ` (×${Math.pow(2, v).toFixed(2)})`;
    if (id.endsWith("_pct")) return v.toFixed(1) + "%";
    if (id === "repeat") return v.toFixed(2) + "건";
    return v.toFixed(3);
  }
  const shortLabel = id => featInfo(id).label.replace(/ %$/, "").replace(/\(로그\)$/, "");

  // ---------------- statistics in the page (checked against the build output) ----------------
  function ranks(a) {
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let t = i; t <= j; t++) r[idx[t][1]] = (i + j) / 2 + 1; i = j + 1; }
    return r;
  }
  function pearson(x, y) { const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sx && sy ? sxy / Math.sqrt(sx * sy) : NaN; }
  function spearman(xs, ys, keep) {
    const x = [], y = []; xs.forEach((v, i) => { if (v != null && ys[i] != null && (!keep || keep(i))) { x.push(v); y.push(ys[i]); } });
    return { rho: x.length > 2 ? pearson(ranks(x), ranks(y)) : NaN, n: x.length };
  }
  function quant(sorted, q) { const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); }
  function stats(vals) {
    const v = vals.filter(x => x != null).sort((a, b) => a - b), n = v.length; if (!n) return null;
    const mean = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const skew = sd ? v.reduce((a, b) => a + ((b - mean) / sd) ** 3, 0) / n : 0;
    return { n, mean, sd, skew, min: v[0], q1: quant(v, 0.25), med: quant(v, 0.5), q3: quant(v, 0.75), max: v[n - 1] };
  }
  const strength = r => { const a = Math.abs(r); return a >= 0.5 ? "강함" : a >= 0.3 ? "중간" : a >= 0.1 ? "약함" : "거의 없음"; };

  // ---------------- colouring ----------------
  function colorInfo() {
    const r = rec(), cl = clusterOf();
    if (S.color === "group") {
      if (S.unit === "cb") return { of: i => PAL[BORO.indexOf(r.borough[i])], legend: BORO.map((b, j) => [PAL[j], BKO[b]]), name: "자치구" };
      const cnt = {}; r.agency.forEach(a => { cnt[a] = (cnt[a] || 0) + 1; });
      const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || (a < b ? -1 : 1)).slice(0, 7);
      return { of: i => top.includes(r.agency[i]) ? PAL[top.indexOf(r.agency[i])] : GRAY, legend: top.map((a, j) => [PAL[j], a]).concat([[GRAY, "기타 기관"]]), name: "담당 기관" };
    }
    const names = clusterNames();
    return { of: i => cl[i] == null ? GRAY : PAL[cl[i]], legend: names.map((nm, j) => [PAL[j], `군집 ${j + 1}`]).concat(cl.includes(null) ? [[GRAY, "군집 제외"]] : []), name: "군집" };
  }
  function clusterNames() {
    const km = rec().kmeans, run = km.runs[String(kNow())];
    return run.centers_z.map(c => {
      const pairs = km.features.map((f, j) => [f, c[j]]);
      const hi = pairs.filter(p => p[1] >= 0.3).sort((a, b) => b[1] - a[1]).slice(0, 2).map(p => shortLabel(p[0]) + " 높음");
      const lo = pairs.filter(p => p[1] <= -0.3).sort((a, b) => a[1] - b[1]).slice(0, 2).map(p => shortLabel(p[0]) + " 낮음");
      const parts = hi.concat(lo);
      return parts.length ? parts.join(" · ") : "모든 지표가 평균 근처";
    });
  }
  const legendHTML = items => `<div class="legend">${items.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join("")}</div>`;

  // ---------------- svg helpers ----------------
  function niceTicks(lo, hi, n = 5) {
    if (lo === hi) { lo -= 1; hi += 1; }
    const step0 = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= step0) || 10 * p;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10)); return out;
  }
  function ticksFor(id, lo, hi) {  // log features get 1-2-5 ticks in real units
    if (id !== "med_log" && id !== "log_n") return niceTicks(lo, hi);
    const base = id === "med_log" ? [1 / 60, 5 / 60, 0.25, 0.5, 1, 2, 5, 12, 24, 48, 120, 168, 336, 720, 2160, 4320, 8760] : [];
    if (!base.length) for (let e = 0; e <= 8; e++) [1, 2, 5].forEach(m => base.push(m * Math.pow(10, e)));
    let t = base.map(Math.log10).filter(v => v >= lo - 1e-9 && v <= hi + 1e-9);
    while (t.length > 6) t = t.filter((_, i) => i % 2 === 0);
    return t.length >= 2 ? t : niceTicks(lo, hi);
  }
  function tickLabel(id, v) {
    if (id === "med_log") { const h = Math.pow(10, v); return h < 1 ? `${Math.round(h * 60)}분` : h < 24 ? `${+h.toFixed(1)}시간` : `${+(h / 24).toFixed(1)}일`; }
    if (id === "log_n") { const n = Math.pow(10, v); return n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(0)}K` : `${Math.round(n)}`; }
    return String(+v.toFixed(2));
  }
  function scatter(el, pts, xId, yId, opt = {}) {
    const W = Math.max(300, $(el).clientWidth), H = opt.h || Math.min(420, Math.max(280, W * 0.6)), L = 58, Rm = 12, T = 12, B = 44;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    if (opt.hline != null) ys.push(opt.hline);
    const xt = ticksFor(xId, Math.min(...xs), Math.max(...xs)), yt = ticksFor(yId, Math.min(...ys), Math.max(...ys));
    const x0 = Math.min(xt[0], ...xs), x1 = Math.max(xt[xt.length - 1], ...xs), y0 = Math.min(yt[0], ...ys), y1 = Math.max(yt[yt.length - 1], ...ys);
    const X = v => L + (v - x0) / (x1 - x0 || 1) * (W - L - Rm), Y = v => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
    let g = "";
    xt.forEach(v => { g += `<line class="gridl" x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${H - B}"/><text x="${X(v)}" y="${H - B + 16}" text-anchor="middle" font-size="11">${esc(tickLabel(xId, v))}</text>`; });
    yt.forEach(v => { g += `<line class="gridl" x1="${L}" x2="${W - Rm}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v)}" text-anchor="end" dominant-baseline="middle" font-size="11">${esc(tickLabel(yId, v))}</text>`; });
    g += `<text x="${(L + W - Rm) / 2}" y="${H - 6}" text-anchor="middle" class="lab" font-weight="600">${esc(opt.xLabel || featInfo(xId).label)} →</text>`;
    g += `<text transform="translate(13 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" class="lab" font-weight="600">${esc(opt.yLabel || featInfo(yId).label)} →</text>`;
    if (opt.hline != null) g += `<line x1="${L}" x2="${W - Rm}" y1="${Y(opt.hline)}" y2="${Y(opt.hline)}" stroke="var(--ink2)" stroke-dasharray="4 4"/>`;
    pts.forEach(p => {
      g += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r || 6}" fill="${p.c}" fill-opacity="0.85" stroke="#fff" stroke-width="1.5" data-tip="${esc(p.tip)}"/>`;
      if (p.label) g += `<text x="${X(p.x) + 8}" y="${Y(p.y) - 8}" font-size="11" class="lab">${esc(p.label)}</text>`;
    });
    $(el).innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
  }
  function divColor(v) {  // -1 .. +1  blue - neutral - red
    const t = Math.max(-1, Math.min(1, v)), a = Math.abs(t);
    const c0 = [240, 239, 236], c1 = t >= 0 ? [199, 58, 58] : [37, 106, 191];
    const m = c0.map((c, i) => Math.round(c + (c1[i] - c) * a));
    return `rgb(${m.join(",")})`;
  }
  function heat(el, rows, cols, val, txt, opt = {}) {
    const W = Math.max(300, $(el).clientWidth), lw = opt.labelW || Math.min(170, W * 0.32), top = opt.top || 100;
    const cw = (W - lw - 4) / cols.length, ch = opt.ch || Math.max(22, Math.min(34, cw)), H = top + rows.length * ch + 4;
    let g = "";
    cols.forEach((c, j) => { const x = lw + j * cw + cw / 2; g += `<text transform="translate(${x} ${top - 6}) rotate(-50)" font-size="11.5" class="lab">${esc(c)}</text>`; });
    rows.forEach((r, i) => {
      const y = top + i * ch;
      g += `<text x="${lw - 6}" y="${y + ch / 2}" text-anchor="end" dominant-baseline="middle" font-size="12" class="lab">${esc(r)}</text>`;
      cols.forEach((c, j) => {
        const v = val(i, j), x = lw + j * cw;
        const fill = v == null ? "#f4f4f1" : divColor(v / (opt.scale || 1));
        const dark = v != null && Math.abs(v / (opt.scale || 1)) > 0.55;
        g += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="${fill}" ${opt.click ? `data-cell="${i},${j}" style="cursor:pointer"` : ""} data-tip="${esc(opt.tip ? opt.tip(i, j) : "")}"/>`;
        if (cw >= 26) g += `<text x="${x + cw / 2}" y="${y + ch / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${cw > 40 ? 11.5 : 10}" style="pointer-events:none;fill:${dark ? "#fff" : "var(--ink)"}">${esc(txt(i, j))}</text>`;
        if (opt.sel && opt.sel(i, j)) g += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="none" stroke="var(--ink)" stroke-width="2.5" style="pointer-events:none"/>`;
      });
    });
    $(el).innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
  }
  function bars(el, items, opt = {}) {  // vertical bars
    const W = Math.max(280, $(el).clientWidth), H = opt.h || 200, L = 44, T = 18, B = 30;
    const max = opt.max || Math.max(...items.map(d => d.v)) * 1.1, step = (W - L - 8) / items.length, bw = Math.min(40, step * 0.6);
    let g = "";
    niceTicks(0, max, 4).forEach(v => { const y = T + (1 - v / max) * (H - T - B); if (y >= T - 1) g += `<line class="gridl" x1="${L}" x2="${W - 8}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="11">${opt.fmt ? opt.fmt(v) : v}</text>`; });
    items.forEach((d, i) => {
      const h = Math.max(0, d.v) / max * (H - T - B), x = L + i * step + (step - bw) / 2, y = T + (H - T - B) - h;
      g += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${d.c}" data-tip="${esc(d.tip)}"/>`;
      g += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="11" class="val">${esc(d.t)}</text>`;
      g += `<text x="${x + bw / 2}" y="${H - B + 16}" text-anchor="middle" font-size="11.5"${d.hl ? ' font-weight="700" class="lab"' : ""}>${esc(d.label)}</text>`;
    });
    $(el).innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
  }

  // ---------------- controls ----------------
  function controls() {
    const ks = R.settings.k_range;
    const showK = S.pane === "d3" || S.pane === "d4" || S.pane === "d2";
    $("d-ctl").innerHTML = S.pane === "d1" ? "" :
      `<label>분석 단위 <select id="d-unit"><option value="problem">민원 유형 ${R.problem.names.length}개</option><option value="cb">지역(커뮤니티 보드) 59개</option></select></label>` +
      (S.unit === "cb" ? `<label>집중 주소 <select id="d-focus"><option value="all">포함</option><option value="no_focus">제외</option></select></label>` : "") +
      (showK ? `<label>군집 수 k <select id="d-k">${ks.map(k => `<option value="${k}">${k}${k === defaultK() ? " (기본)" : ""}</option>`).join("")}</select></label>` : "") +
      (S.pane !== "d3" ? `<label>점 색 기준 <select id="d-color"><option value="cluster">K-Means 군집</option><option value="group">${S.unit === "cb" ? "자치구" : "담당 기관"}</option></select></label>` : "");
    const set = (id, v) => { const e = $(id); if (e) e.value = v; };
    set("d-unit", S.unit); set("d-focus", S.focus); set("d-k", kNow()); set("d-color", S.color);
    const on = (id, f) => { const e = $(id); if (e) e.onchange = ev => { f(ev.target.value); render(); }; };
    on("d-unit", v => { S.unit = v; S.k = null; S.pair = null; if (!featInfo(S.feat)) S.feat = "med_log"; });
    on("d-focus", v => { S.focus = v; });
    on("d-k", v => { S.k = +v; });
    on("d-color", v => { S.color = v; });
  }

  // ---------------- D-1: correlation vs causation ----------------
  function renderD1() {
    const cbA = R.cb.all, iH = cbA.features.findIndex(f => f.id === "hpd_pct");
    const w = R.cb_within.all;
    const p1 = w["hpd_pct|med_log"], p2 = w["hpd_pct|speed_idx"];
    const kmA = R.cb.all.kmeans, kmN = R.cb.no_focus.kmeans, kD = R.cb.all.kmeans.best_k;
    const idx12 = cbA.names.indexOf("12 BRONX");
    const lblA = kmA.runs[kD].labels[kmA.member_index.indexOf(idx12)], lblN = kmN.runs[kD].labels[kmN.member_index.indexOf(idx12)];
    const t23 = R.t23_month_mix;
    $("d-pane").innerHTML = `
      <div class="grid2">
        <div class="card concept"><h3><span class="dot" style="background:var(--s1)"></span>상관관계</h3>
          <p>두 지표가 <b>함께 움직이는 정도</b>입니다. 「A가 큰 곳에서 B도 크다」까지만 말합니다.</p>
          <p class="muted">이 탭의 상관은 순위 기반 <b>스피어만 상관계수 ρ</b>(-1~+1)입니다. |ρ| 0.5 이상 강함, 0.3~0.5 중간, 0.1~0.3 약함.</p></div>
        <div class="card concept"><h3><span class="dot" style="background:var(--s2)"></span>인과관계</h3>
          <p><b>A를 바꾸면 B가 바뀐다</b>는 주장입니다. 상관이 있어도 인과가 아닐 수 있고, 이를 보이려면 실험이나 비교 설계가 필요합니다.</p>
          <p class="muted">이 데이터는 신고 기록(관찰 데이터)이라 <b>인과를 직접 확인할 수 없습니다.</b> 이 탭의 모든 관계는 상관입니다.</p></div>
      </div>
      <div class="card"><h3 class="ch">이 데이터에서 상관을 인과로 읽으면 안 되는 이유</h3>
        <div class="reasons">
          <div><b>① 교란 요인</b><span>제3의 요인이 둘 다를 움직입니다. 예: 유형 구성(주택 민원 비중), 계절, 인구.</span></div>
          <div><b>② 신고 행동</b><span>신고 수는 문제의 양이 아니라 「신고된 양」입니다. 신고 습관·접수 경로가 다르면 달라집니다.</span></div>
          <div><b>③ 역방향·동시성</b><span>어느 쪽이 먼저인지 알 수 없습니다. 둘 다 같은 날 함께 기록됩니다.</span></div>
          <div><b>④ 집계 단위의 함정</b><span>지역 단위의 상관은 개인에 대해 말해 주지 않습니다(생태학적 오류).</span></div>
          <div><b>⑤ 소수의 극단값</b><span>한 주소·한 지역이 상관이나 군집을 크게 바꿀 수 있습니다.</span></div>
          <div><b>⑥ 두 해 자료</b><span>두 해(2024-11 ~ 2026-10)로 일부 반복을 확인했지만, 두 해만으로 매년 반복되는 패턴이라고 단정할 수 없습니다.</span></div>
        </div></div>

      <h3 class="block-h"><span class="bn">예시 1</span>교란 요인: 「주택 민원이 많은 지역은 처리가 느리다?」</h3>
      <div class="grid2">
        <figure class="card"><figcaption>주택보존개발국(HPD) 비중 vs 처리 시간 중앙값<span class="sub">커뮤니티 보드 59곳 · ρ = ${p1.pooled.toFixed(2)} (${strength(p1.pooled)})</span></figcaption><div id="d1-s1"></div></figure>
        <figure class="card"><figcaption>HPD 비중 vs 유형 보정 처리 시간 지수<span class="sub">같은 유형끼리 비교한 값 · ρ = ${p2.pooled.toFixed(2)} (${strength(p2.pooled)})</span></figcaption><div id="d1-s2"></div></figure>
      </div>
      <div class="card readbox">
        <p>${tag.f}주택 민원(HPD) 비중이 높은 지역일수록 처리 시간 중앙값이 깁니다(ρ = ${p1.pooled.toFixed(2)}). 그런데 각 신고를 <b>같은 유형의 뉴욕시 전체 중앙값과 비교</b>한 지수로 바꾸면 상관이 거의 사라집니다(ρ = ${p2.pooled.toFixed(2)}).</p>
        <p>${tag.m}지역이 느려서가 아니라, HPD 민원(난방·수리 등) 자체가 오래 걸리는 유형이라 그런 유형이 많은 지역의 중앙값이 길어 보이는 것입니다. 「유형 구성」이 교란 요인입니다.</p>
        <p>${tag.c}보정 지수도 같은 유형 안의 차이(세부유형, 건물 상태 등)를 다 설명하지 못합니다. 자치구별로 나눠 보면 방향이 다른 곳도 있습니다: ${Object.entries(p2.by_borough).map(([b, [n, r]]) => `${BKO[b]} ${r.toFixed(2)}(${n}곳)`).join(", ")}. 지역 수가 적어 불안정합니다.</p>
      </div>

      <h3 class="block-h"><span class="bn">예시 2</span>교란 요인(시간): 「1월에 처리가 가장 느렸다?」</h3>
      <div class="grid2">
        <figure class="card"><figcaption>월별 HPD 비중 vs 전체 처리 시간 중앙값<span class="sub">12개월 · ${window.YEAR && window.YEAR.key !== "cur" ? (window.YEAR.key === "both" ? "두 해 자료로 같은 방식 계산(24개월)" : "지난해 자료로 같은 방식 계산") : "탐색 분석 보고서의 월별 표"} · 점선 = NYPD 중앙값 평균</span></figcaption><div id="d1-s3"></div></figure>
        <div class="card readbox">
          <p>${tag.f}HPD 비중이 높은 달일수록 전체 중앙값이 깁니다(ρ = ${spearman(t23.map(r => +r.hpd_share_pct), t23.map(r => +r.med_all)).rho.toFixed(2)}). 같은 기간 NYPD 중앙값은 매달 ${Math.min(...t23.map(r => +r.med_nypd))}~${Math.max(...t23.map(r => +r.med_nypd))}시간으로 거의 같습니다.</p>
          ${window.YEAR && window.YEAR.key !== "cur" ? "" : `<p>${tag.f}월별 유형 구성을 연간 구성으로 고정하면 월별 중앙값의 차이가 4.93배에서 1.23배로 줄어듭니다(<a href="../reports/eda_report.md" target="_blank">탐색 분석 보고서</a>).</p>`}
          <p>${tag.m}「1월에 처리가 느려졌다」기보다 「1월에 오래 걸리는 유형이 많이 들어왔다」에 가깝습니다. 다만 처리 속도가 전혀 변하지 않았다는 증명은 아닙니다.</p>
        </div>
      </div>

      <h3 class="block-h"><span class="bn">예시 3</span>극단값: 주소 한 곳이 지역의 군집을 바꿉니다</h3>
      <div class="card readbox">
        <p>${tag.f}브롱크스 12번 커뮤니티 보드는 집중 주소(655 EAST 230 STREET)를 포함하면 <b>군집 ${lblA + 1}</b>(${esc(namesFor(R.cb.all, kD)[lblA])}), 제외하면 <b>군집 ${lblN + 1}</b>(${esc(namesFor(R.cb.no_focus, kD)[lblN])})에 들어갑니다(k = ${kD}).</p>
        <p>${tag.f}이 지역에서 최다 주소 비중은 포함 시 ${cbA.values.top_addr_pct[idx12].toFixed(1)}%, 제외 시 ${R.cb.no_focus.values.top_addr_pct[idx12].toFixed(1)}%입니다.</p>
        <p>${tag.c}군집이나 상관을 볼 때는 극단값을 넣고 뺀 결과를 함께 봐야 합니다. 「③ 군집」에서 집중 주소 포함·제외를 바꿔 직접 확인할 수 있습니다.</p>
        <p class="note">주의: 군집 번호는 이름표일 뿐입니다. 지역 군집은 구조가 약해(${window.YEAR && window.YEAR.key !== "cur" ? "올해 기준 " : ""}실루엣 약 0.26) 경계 근처의 지역은 작은 변화에도 다른 묶음으로 갑니다. 군집이 바뀌었다는 사실만으로 그 지역의 특성이 바뀌었다고 말할 수 없고, 위의 최다 주소 비중처럼 실제로 달라진 지표를 함께 봐야 합니다.</p>
      </div>

      <div class="card"><h3 class="ch">인과에 가까이 가려면 필요한 것</h3>
        <ul class="tight">
          <li><b>같은 조건끼리 비교</b>: 같은 유형·같은 시기 안에서 비교합니다(예시 1의 보정 지수, 3-4절의 구성 고정).</li>
          <li><b>외부 자료</b>: 기상(눈·한파), 인구·주택 자료를 붙여 교란 요인을 직접 통제합니다.</li>
          <li><b>시간 순서</b>: 정책·사건 전후로 같은 대상을 비교합니다(전후 비교, 이중차분).</li>
          <li><b>미리 정한 가설</b>: 데이터를 보고 고른 상관은 우연일 수 있으므로, 가설을 먼저 정하고 다른 기간 자료로 확인합니다.</li>
        </ul></div>`;
    // scatter plots
    const cbPts = (rr, yId) => rr.names.map((n, i) => ({ x: rr.values.hpd_pct[i], y: rr.values[yId][i], c: PAL[BORO.indexOf(rr.borough[i])], r: 6,
      tip: `<b>${esc(cbLabel(n))}</b><br>HPD 비중 ${rr.values.hpd_pct[i].toFixed(1)}%<br>${esc(featLabel(rr, yId))}: ${esc(fmtValFor(yId, rr.values[yId][i]))}` }));
    const leg = legendHTML(BORO.map((b, j) => [PAL[j], BKO[b]]));
    scatter("d1-s1", cbPts(cbA, "med_log"), "hpd_pct", "med_log", { xLabel: "HPD 비중 %", yLabel: "처리 시간 중앙값", h: 300 });
    $("d1-s1").insertAdjacentHTML("afterbegin", leg);
    scatter("d1-s2", cbPts(cbA, "speed_idx"), "hpd_pct", "speed_idx", { xLabel: "HPD 비중 %", yLabel: "유형 보정 지수 (0 = 유형 평균)", h: 300, hline: 0 });
    $("d1-s2").insertAdjacentHTML("afterbegin", leg);
    const mPts = t23.map(r => ({ x: +r.hpd_share_pct, y: Math.log10(+r.med_all), c: "var(--s1)", r: 7, label: `${+r.month.slice(5, 7)}월`,
      tip: `<b>${r.month.slice(0, 7)}</b><br>HPD 비중 ${r.hpd_share_pct}% · 전체 중앙값 ${r.med_all}시간<br>NYPD ${r.med_nypd}시간 · HPD ${r.med_hpd}시간` }));
    const nypdMean = t23.reduce((a, r) => a + +r.med_nypd, 0) / t23.length;
    scatter("d1-s3", mPts, "hpd_pct", "med_log", { xLabel: "그달 신고 중 HPD 비중 %", yLabel: "전체 처리 시간 중앙값", h: 300, hline: Math.log10(nypdMean) });
    void iH;
  }
  const cbLabel = n => { const [code, ...b] = n.split(" "); return `${BKO[b.join(" ")]} ${+code}번`; };
  const featLabel = (rr, id) => rr.features.find(f => f.id === id).label;
  const fmtValFor = (id, v) => fmtVal(id, v);
  function namesFor(rr, k) { const saveU = S.unit, saveF = S.focus, saveK = S.k; S.unit = "cb"; S.focus = rr === R.cb.all ? "all" : "no_focus"; S.k = k; const n = clusterNames(); S.unit = saveU; S.focus = saveF; S.k = saveK; return n; }

  // ---------------- D-2: correlations ----------------
  function renderD2() {
    const r = rec(), F = r.features, ids = F.map(f => f.id), rho = r.spearman.rho, nn = r.spearman.n;
    if (!S.pair || !ids.includes(S.pair[0]) || !ids.includes(S.pair[1])) {
      let best = [0, 1], bv = -1; ids.forEach((a, i) => ids.forEach((b, j) => { if (j > i && rho[i][j] != null && Math.abs(rho[i][j]) > bv) { bv = Math.abs(rho[i][j]); best = [i, j]; } }));
      S.pair = [ids[best[0]], ids[best[1]]];
    }
    const pairs = []; ids.forEach((a, i) => ids.forEach((b, j) => { if (j > i && rho[i][j] != null) pairs.push([i, j, rho[i][j]]); }));
    pairs.sort((x, y) => Math.abs(y[2]) - Math.abs(x[2]));
    const compo = id => /^(nypd|hpd|dsny|dot|dep|dpr)_pct$/.test(id);
    $("d-pane").innerHTML = `
      <div class="grid2 wide-left">
        <figure class="card"><figcaption>스피어만 상관 행렬<span class="sub">${S.unit === "problem" ? `민원 유형 ${r.names.length}개` : "커뮤니티 보드 59곳"} · 칸을 누르면 오른쪽에 산점도 · 빨강 = 함께 증가, 파랑 = 반대로 움직임</span></figcaption><div id="d2-heat"></div></figure>
        <figure class="card"><figcaption id="d2-sc-title"></figcaption><div id="d2-sc"></div><div id="d2-sc-note" class="note"></div></figure>
      </div>
      <div class="card"><h3 class="ch">상관이 큰 지표 쌍 (상위 8개)</h3><div id="d2-top"></div>
        <p class="note">상관은 함께 움직인다는 뜻일 뿐입니다. 표의 「먼저 의심할 것」은 인과로 읽기 전에 확인할 교란·구조적 이유입니다.</p></div>
      <details class="explain"><summary>지표 설명</summary><ul>${F.map(f => `<li><b>${esc(f.label)}</b>: ${esc(f.desc || "")}</li>`).join("")}</ul></details>`;
    heat("d2-heat", F.map(f => shortLabel(f.id)), F.map(f => shortLabel(f.id)), (i, j) => i === j ? null : rho[i][j], (i, j) => i === j ? "" : rho[i][j] == null ? "" : (Math.abs(rho[i][j]) < 0.005 ? 0 : rho[i][j]).toFixed(2), {
      click: true, top: 118, tip: (i, j) => i === j ? esc(F[i].label) : `<b>${esc(F[i].label)}</b> × <b>${esc(F[j].label)}</b><br>ρ = ${rho[i][j] == null ? "-" : rho[i][j].toFixed(3)} (${strength(rho[i][j] || 0)}) · n = ${nn[i][j]}`,
      sel: (i, j) => (ids[i] === S.pair[0] && ids[j] === S.pair[1]) || (ids[i] === S.pair[1] && ids[j] === S.pair[0]) });
    $("d2-heat").onclick = e => { const c = e.target.closest("[data-cell]"); if (!c) return; const [i, j] = c.dataset.cell.split(",").map(Number); if (i !== j) { S.pair = [ids[i], ids[j]]; renderD2(); } };
    // scatter for the selected pair
    const [a, b] = S.pair, col = colorInfo(), sp = spearman(r.values[a], r.values[b]);
    const pts = r.names.map((n, i) => ({ x: r.values[a][i], y: r.values[b][i], c: col.of(i), r: S.unit === "problem" ? 3 + Math.min(6, (r.values.log_n[i] - 3) * 2.2) : 6,
      tip: `<b>${esc(unitName(i))}</b><br>${esc(featInfo(a).label)}: ${esc(fmtVal(a, r.values[a][i]))}<br>${esc(featInfo(b).label)}: ${esc(fmtVal(b, r.values[b][i]))}<br>신고 ${nf.format(r.n[i])}건` })).filter(p => p.x != null && p.y != null);
    $("d2-sc-title").innerHTML = `${esc(featInfo(a).label)} × ${esc(featInfo(b).label)}<span class="sub">ρ = ${sp.rho.toFixed(2)} (${strength(sp.rho)}) · n = ${sp.n} · 색 = ${col.name}${S.unit === "problem" ? " · 점 크기 = 신고 수" : ""}</span>`;
    scatter("d2-sc", pts, a, b);
    $("d2-sc").insertAdjacentHTML("afterbegin", legendHTML(col.legend));
    let note = "";
    if (S.unit === "cb") {
      const byB = BORO.map(bo => { const s = spearman(r.values[a], r.values[b], i => r.borough[i] === bo); return `${BKO[bo]} ${Number.isNaN(s.rho) ? "-" : s.rho.toFixed(2)}(${s.n})`; });
      note = `<b>자치구 안에서만 본 ρ</b>: ${byB.join(" · ")}. 전체 ρ와 방향·크기가 다르면 자치구 차이가 상관을 만들었을 수 있습니다(지역 수가 적어 불안정).`;
    }
    $("d2-sc-note").innerHTML = note;
    $("d2-top").innerHTML = `<div class="tscroll"><table><thead><tr><th>지표 A</th><th>지표 B</th><th class="num">ρ</th><th>강도</th><th>먼저 의심할 것</th></tr></thead><tbody>` +
      pairs.slice(0, 8).map(([i, j, v]) => {
        let why = "공통 요인(유형 구성·담당 기관·지역)이 둘 다를 움직이는지";
        if (compo(ids[i]) && compo(ids[j])) why = "구성비는 합이 100%라 한쪽이 크면 다른 쪽이 작아지는 구조적 상관";
        else if ((ids[i] === "med_log" && ids[j] === "open_pct") || (ids[j] === "med_log" && ids[i] === "open_pct")) why = "오래 걸리는 유형일수록 관측 시점에 아직 안 끝난 건이 많아지는 구조(같은 원인의 두 측면)";
        else if ([ids[i], ids[j]].includes("night_pct") && [ids[i], ids[j]].includes("weekend_pct")) why = "소음처럼 밤과 주말에 함께 몰리는 유형의 구성 효과";
        else if ([ids[i], ids[j]].includes("repeat") && [ids[i], ids[j]].includes("top_addr_pct")) why = "한 주소에 몰린 반복 신고가 두 지표를 동시에 키움(같은 현상의 두 측정)";
        else if ([ids[i], ids[j]].some(x => /_pct$/.test(x) && compo(x)) && [ids[i], ids[j]].includes("med_log")) why = "담당 기관마다 처리하는 유형과 종료 기록 방식이 달라 생기는 구성 효과(예시 1)";
        return `<tr data-pair="${ids[i]},${ids[j]}" style="cursor:pointer"><td>${esc(F[i].label)}</td><td>${esc(F[j].label)}</td><td class="num">${v.toFixed(2)}</td><td>${strength(v)} · ${v > 0 ? "같은 방향" : "반대 방향"}</td><td>${esc(why)}</td></tr>`;
      }).join("") + `</tbody></table></div>`;
    $("d2-top").onclick = e => { const t = e.target.closest("[data-pair]"); if (t) { S.pair = t.dataset.pair.split(","); renderD2(); $("d2-sc").scrollIntoView({ behavior: "smooth", block: "center" }); } };
  }

  // ---------------- D-3: K-Means ----------------
  function renderD3() {
    const r = rec(), km = r.kmeans, k = kNow(), run = km.runs[String(k)], names = clusterNames(), cl = clusterOf();
    const feats = km.features.map(id => featInfo(id));
    const totalN = c => r.n.reduce((t, n, i) => t + (cl[i] === c ? n : 0), 0);
    const res = S.unit === "problem" ? km.cluster_resolution[String(k)] : null;
    $("d-pane").innerHTML = `
      <div class="card readbox"><p><b>K-Means</b>는 지표가 비슷한 것끼리 k개 묶음으로 나누는 방법입니다. 지표는 표준화(z점수)한 뒤 ±${km.z_clip}에서 잘랐습니다(극단값 ${km.clipped_cells}칸). 군집 이름은 전체 평균보다 0.3 표준편차 이상 높거나 낮은 지표(최대 4개)로 자동으로 붙였습니다.
        군집은 <b>비슷한 것끼리의 묶음</b>일 뿐, 같은 원인을 가진다는 뜻이 아닙니다.${km.excluded.length ? ` 처리 시간을 계산할 종료 건이 ${R.settings.min_resolved}건 미만이라 빠진 유형: ${km.excluded.map(esc).join(", ")}.` : ""}</p></div>
      ${S.unit === "problem" && R.same_work ? `<div class="caution">이름이 바뀐 것으로 보이는 유형 3쌍(상수도, 하수, 유해 물질 — 2026-07-28~29, 공식 확인 전)은 합쳐서 계산했습니다. 합치지 않으면 몇 달만 있는 유형처럼 보여 「월별 변동」이 부풀려집니다. 합치기 전과 비교하면 k = 3에서 다른 유형 5개의 묶음이 바뀌었습니다. 경계 근처의 유형은 입력이 조금만 달라져도 옮겨 가므로, 묶음 번호보다 각 지표 값을 함께 보세요(reclass_check_report).</div>` : ""}
      ${run.silhouette < 0.3 ? `<div class="caution">k = ${k}의 실루엣 점수가 ${run.silhouette.toFixed(2)}로 낮습니다. 군집 사이 경계가 뚜렷하지 않으므로, 군집은 「비슷한 것끼리의 대략적인 묶음」으로만 읽어 주세요. 경계 근처의 ${S.unit === "problem" ? "유형" : "지역"}은 k나 설정이 조금만 바뀌어도 다른 군집으로 갈 수 있습니다.</div>` : ""}
      <div class="grid2">
        <figure class="card"><figcaption>k별 실루엣 점수<span class="sub">높을수록 군집이 잘 나뉨 · 0.25 미만 약함, 0.25~0.5 보통, 0.5 이상 뚜렷함 · 기본 k = 3~6 중 최고</span></figcaption><div id="d3-sil"></div></figure>
        <figure class="card"><figcaption>군집 지도 (주성분 분석 2차원)<span class="sub">가로 ${(km.pca.explained[0] * 100).toFixed(0)}% · 세로 ${(km.pca.explained[1] * 100).toFixed(0)}% 설명 · 가까울수록 지표가 비슷</span></figcaption><div id="d3-pca"></div><p class="note" id="d3-pca-note"></p></figure>
      </div>
      <figure class="card"><figcaption>군집별 지표 프로필<span class="sub">색 = 전체 평균과의 차이(z점수, 빨강 높음 · 파랑 낮음) · 숫자 = 군집 평균의 실제 값</span></figcaption><div id="d3-prof"></div></figure>
      <div class="cgrid" id="d3-cards"></div>
      ${S.unit === "problem" ? `<figure class="card"><figcaption>군집별 처리 시간 분포<span class="sub">종료 건(RESOLVED)의 처리 시간 · 로그 눈금 · 각 군집 안에서의 비율</span></figcaption><div id="d3-hist"></div></figure>` : ""}`;
    bars("d3-sil", km.features && R.settings.k_range.map(kk => ({ label: `k=${kk}`, v: km.runs[kk].silhouette, t: km.runs[kk].silhouette.toFixed(2), c: kk === k ? "var(--s1)" : "#9ec5f4", hl: kk === k,
      tip: `k=${kk}: 실루엣 ${km.runs[kk].silhouette.toFixed(3)} · 군집 크기 ${km.runs[kk].sizes.join(", ")}` })), { h: 190, max: Math.max(0.6, ...Object.values(km.runs).map(x => x.silhouette)) * 1.05, fmt: v => v.toFixed(1) });
    const pts = km.member_index.map((ui, j) => ({ x: km.pca.xy[j][0], y: km.pca.xy[j][1], c: PAL[run.labels[j]], r: 6,
      label: (S.unit === "cb" && r.names[ui] === "12 BRONX") ? "브롱크스 12번" : "",
      tip: `<b>${esc(unitName(ui))}</b><br>군집 ${run.labels[j] + 1}: ${esc(names[run.labels[j]])}<br>실루엣 ${run.silhouette_each[j].toFixed(2)}` }));
    scatter("d3-pca", pts, "pc1", "pc2", { xLabel: "주성분 1", yLabel: "주성분 2", h: 300 });
    $("d3-pca").insertAdjacentHTML("afterbegin", legendHTML(names.map((nm, j) => [PAL[j], `군집 ${j + 1}`])));
    const load = (pc) => km.features.map((f, j) => [f, km.pca.loadings[pc][j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([f, v]) => `${shortLabel(f)}(${v > 0 ? "+" : "−"})`).join(", ");
    $("d3-pca-note").textContent = `주성분 1에 크게 기여: ${load(0)} · 주성분 2: ${load(1)}. 축 자체에는 단위가 없습니다.`;
    heat("d3-prof", names.map((nm, j) => `군집 ${j + 1} (${run.sizes[j]})`), feats.map(f => shortLabel(f.id)), (i, j) => run.centers_z[i][j],
      (i, j) => fmtShort(km.features[j], run.means_raw[i][j]), { scale: 2, top: 118, ch: 34, labelW: 110,
        tip: (i, j) => `<b>군집 ${i + 1}</b> · ${esc(feats[j].label)}<br>평균 ${esc(fmtVal(km.features[j], run.means_raw[i][j]))} · z = ${run.centers_z[i][j].toFixed(2)}<br>전체 평균 ${esc(fmtVal(km.features[j], km.mean[j]))}` });
    $("d3-cards").innerHTML = names.map((nm, j) => {
      const mem = r.names.map((n, i) => i).filter(i => cl[i] === j).sort((a, b) => r.n[b] - r.n[a]);
      const resTxt = res && res[j] ? `<div class="kv"><span>처리 시간 중앙값 / 90백분위수</span><b>${fmtVal("med_log", Math.log10(res[j][1]))} / ${fmtVal("med_log", Math.log10(res[j][2]))}</b></div>` : "";
      const extra = S.unit === "cb" ? `<div class="kv"><span>자치구 구성</span><b>${BORO.map(b => [b, mem.filter(i => r.borough[i] === b).length]).filter(x => x[1]).map(([b, c]) => `${BKO[b]} ${c}`).join(", ")}</b></div>` : "";
      return `<div class="ccard" style="border-top-color:${PAL[j]}"><div class="chead"><span class="cdot" style="background:${PAL[j]}"></span>군집 ${j + 1}<small>${mem.length}${S.unit === "problem" ? "개 유형" : "곳"} · 신고 ${nf.format(totalN(j))}건</small></div>
        <div class="cname">${esc(nm)}</div>${resTxt}${extra}
        <div class="cmem">${mem.slice(0, 8).map(i => `<span>${esc(unitShort(i))}</span>`).join("")}${mem.length > 8 ? `<details><summary>나머지 ${mem.length - 8}개</summary>${mem.slice(8).map(i => `<span>${esc(unitShort(i))}</span>`).join("")}</details>` : ""}</div></div>`;
    }).join("");
    if (S.unit === "problem") renderResHist(run, names);
  }
  function fmtShort(id, v) {
    if (v == null) return "";
    if (id === "med_log") { const h = Math.pow(10, v); return h < 1 ? `${Math.round(h * 60)}분` : h < 48 ? `${h.toFixed(0)}h` : `${(h / 24).toFixed(0)}일`; }
    if (id.endsWith("_pct")) return v.toFixed(0);
    if (id === "speed_idx") return (v >= 0 ? "+" : "") + v.toFixed(1);
    return v.toFixed(2);
  }
  function renderResHist(run, names) {
    const r = R.problem, km = r.kmeans, H = r.resolution_hist, edges = H.edges_log10_hours, k = run.sizes.length;
    const sums = Array.from({ length: k }, () => new Array(edges.length - 1).fill(0));
    km.member_index.forEach((ui, j) => { const c = run.labels[j]; H.counts[ui].forEach((v, b) => { sums[c][b] += v; }); });
    const W = Math.max(300, $("d3-hist").clientWidth), rowH = 70, L = 120, T = 22, Hh = T + k * rowH + 26, bw = (W - L - 10) / (edges.length - 1);
    let g = "";
    [[1 / 60, "1분"], [1, "1시간"], [24, "1일"], [168, "1주"], [720, "30일"], [8760, "1년"]].forEach(([h, t]) => {
      const x = L + (Math.log10(h) - edges[0]) / (edges[edges.length - 1] - edges[0]) * (W - L - 10);
      g += `<line class="gridl" x1="${x}" x2="${x}" y1="${T - 4}" y2="${Hh - 22}"/><text x="${x}" y="${Hh - 8}" text-anchor="middle" font-size="11">${t}</text>`;
    });
    sums.forEach((s, c) => {
      const tot = s.reduce((a, b) => a + b, 0), mx = Math.max(...s) / tot, y0 = T + c * rowH;
      g += `<text x="${L - 8}" y="${y0 + rowH / 2}" text-anchor="end" dominant-baseline="middle" class="lab" font-weight="600">군집 ${c + 1}</text>`;
      s.forEach((v, b) => { const h = tot ? v / tot / mx * (rowH - 14) : 0; g += `<rect x="${L + b * bw + 0.5}" y="${y0 + rowH - 6 - h}" width="${Math.max(1, bw - 1)}" height="${h}" fill="${PAL[c]}" data-tip="${esc(`군집 ${c + 1}: ${(v / tot * 100).toFixed(1)}% (${nf.format(v)}건)<br>${fmtVal("med_log", edges[b])} ~ ${fmtVal("med_log", edges[b + 1])}`)}"/>`; });
      g += `<line x1="${L}" x2="${W - 10}" y1="${y0 + rowH - 6}" y2="${y0 + rowH - 6}" stroke="var(--line)"/>`;
    });
    $("d3-hist").innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img">${g}</svg>`;
  }

  // ---------------- D-4: distributions ----------------
  function renderD4() {
    const r = rec(), F = r.features; if (!F.find(f => f.id === S.feat)) S.feat = "med_log";
    const id = S.feat, vals = r.values[id], st = stats(vals), col = colorInfo();
    $("d-pane").innerHTML = `
      <div class="featpick">${F.map(f => `<button type="button" class="fbtn${f.id === id ? " on" : ""}" data-f="${f.id}">${esc(shortLabel(f.id))}</button>`).join("")}</div>
      <p class="note">${esc(featInfo(id).label)}: ${esc(featInfo(id).desc || "")}</p>
      <div class="grid2">
        <figure class="card"><figcaption>히스토그램<span class="sub">${S.unit === "problem" ? "민원 유형" : "커뮤니티 보드"} ${st.n}개 · 막대 색 = ${col.name}</span></figcaption><div id="d4-hist"></div></figure>
        <figure class="card"><figcaption>${col.name}별 상자 그림<span class="sub">상자 = 중간 50%, 선 = 중앙값, 점 = 각 ${S.unit === "problem" ? "유형" : "지역"}</span></figcaption><div id="d4-box"></div></figure>
      </div>
      <div class="kpis" id="d4-stats"></div>
      <div class="card"><h3 class="ch">이상값 (사분위 범위 1.5배 밖)</h3><div id="d4-out"></div></div>`;
    document.querySelectorAll(".fbtn").forEach(b => b.onclick = () => { S.feat = b.dataset.f; renderD4(); });
    // histogram stacked by colour group
    const v = vals.map((x, i) => [x, i]).filter(p => p[0] != null), lo = st.min, hi = st.max, nb = 14, bwv = (hi - lo) / nb || 1;
    const groups = col.legend.map(l => l[0]);
    const binCnt = Array.from({ length: nb }, () => groups.map(() => 0));
    v.forEach(([x, i]) => { const b = Math.min(nb - 1, Math.floor((x - lo) / bwv)); const gi = groups.indexOf(col.of(i)); binCnt[b][gi >= 0 ? gi : groups.length - 1]++; });
    const W = Math.max(300, $("d4-hist").clientWidth), H = 250, L = 36, T = 10, B = 40, maxC = Math.max(...binCnt.map(b => b.reduce((a, c) => a + c, 0)));
    const xb = b => L + b / nb * (W - L - 10), yv = c => T + (1 - c / maxC) * (H - T - B);
    let g = "";
    niceTicks(0, maxC, 4).forEach(c => { g += `<line class="gridl" x1="${L}" x2="${W - 10}" y1="${yv(c)}" y2="${yv(c)}"/><text x="${L - 6}" y="${yv(c)}" text-anchor="end" dominant-baseline="middle" font-size="11">${c}</text>`; });
    binCnt.forEach((cnts, b) => {
      let acc = 0; cnts.forEach((c, gi) => { if (!c) return; g += `<rect x="${xb(b) + 1}" y="${yv(acc + c)}" width="${(W - L - 10) / nb - 2}" height="${yv(acc) - yv(acc + c)}" fill="${groups[gi]}" data-tip="${esc(`${fmtVal(id, lo + b * bwv)} ~ ${fmtVal(id, lo + (b + 1) * bwv)}<br>${col.legend[gi][1]}: ${c}개`)}"/>`; acc += c; });
    });
    for (let b = 0; b <= nb; b += Math.ceil(nb / 5)) g += `<text x="${xb(b)}" y="${H - B + 16}" text-anchor="middle" font-size="11">${esc(tickLabel(id, lo + b * bwv))}</text>`;
    g += `<text x="${(L + W) / 2}" y="${H - 6}" text-anchor="middle" class="lab" font-weight="600">${esc(featInfo(id).label)} →</text>`;
    $("d4-hist").innerHTML = legendHTML(col.legend) + `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
    // box plot per colour group
    const gl = col.legend.map(([c, t]) => ({ c, t, vals: v.filter(([x, i]) => col.of(i) === c).map(p => p[0]), idx: v.filter(([x, i]) => col.of(i) === c).map(p => p[1]) })).filter(gr => gr.vals.length);
    const W2 = Math.max(300, $("d4-box").clientWidth), rowH = 34, L2 = 110, H2 = 14 + gl.length * rowH + 30, X = x => L2 + (x - lo) / (hi - lo || 1) * (W2 - L2 - 14);
    let g2 = "";
    ticksFor(id, lo, hi).forEach(t => { if (t >= lo && t <= hi) g2 += `<line class="gridl" x1="${X(t)}" x2="${X(t)}" y1="8" y2="${H2 - 26}"/><text x="${X(t)}" y="${H2 - 10}" text-anchor="middle" font-size="11">${esc(tickLabel(id, t))}</text>`; });
    gl.forEach((gr, k) => {
      const s = stats(gr.vals), y = 14 + k * rowH + rowH / 2;
      g2 += `<text x="${L2 - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="12" class="lab">${esc(gr.t)} (${s.n})</text>`;
      g2 += `<line x1="${X(s.min)}" x2="${X(s.max)}" y1="${y}" y2="${y}" stroke="${gr.c}" stroke-width="1.5"/>`;
      g2 += `<rect x="${X(s.q1)}" y="${y - 9}" width="${Math.max(2, X(s.q3) - X(s.q1))}" height="18" fill="${gr.c}" fill-opacity="0.25" stroke="${gr.c}" rx="3" data-tip="${esc(`${gr.t}: 중앙값 ${fmtVal(id, s.med)}<br>사분위 ${fmtVal(id, s.q1)} ~ ${fmtVal(id, s.q3)}`)}"/>`;
      g2 += `<line x1="${X(s.med)}" x2="${X(s.med)}" y1="${y - 9}" y2="${y + 9}" stroke="${gr.c}" stroke-width="3"/>`;
      gr.vals.forEach((x, q) => { g2 += `<circle cx="${X(x)}" cy="${y + ((q * 7) % 11) - 5}" r="2.6" fill="${gr.c}" fill-opacity="0.7" data-tip="${esc(`${unitName(gr.idx[q])}: ${fmtVal(id, x)}`)}"/>`; });
    });
    $("d4-box").innerHTML = `<svg class="chart" viewBox="0 0 ${W2} ${H2}" role="img">${g2}</svg>`;
    const skewTxt = Math.abs(st.skew) < 0.5 ? "거의 대칭" : st.skew > 0 ? "오른쪽으로 긴 꼬리" : "왼쪽으로 긴 꼬리";
    $("d4-stats").innerHTML = [["개수", `${st.n}`, S.unit === "problem" ? "민원 유형" : "커뮤니티 보드"], ["중앙값", fmtVal(id, st.med), `${/^(med_log|log_n)$/.test(id) ? "기하평균" : "평균"} ${fmtVal(id, st.mean)}`],
      ["사분위 범위", `${fmtVal(id, st.q1)} ~ ${fmtVal(id, st.q3)}`, `최소 ${fmtVal(id, st.min)} · 최대 ${fmtVal(id, st.max)}`], ["모양", skewTxt, `왜도 ${st.skew.toFixed(2)}${/^(med_log|log_n)$/.test(id) ? " (로그 값 기준)" : ""} · 표준편차 ${st.sd.toFixed(3)}`]]
      .map(([l, val, s]) => `<div class="kpi"><div class="lab">${l}</div><div class="val" style="font-size:20px">${esc(val)}</div><div class="sub">${esc(s)}</div></div>`).join("");
    const iqr = st.q3 - st.q1, outs = v.filter(([x]) => x < st.q1 - 1.5 * iqr || x > st.q3 + 1.5 * iqr).sort((a, b) => b[0] - a[0]);
    $("d4-out").innerHTML = outs.length ? `<div class="cmem">${outs.map(([x, i]) => `<span>${esc(unitShort(i))} <b>${esc(fmtVal(id, x))}</b></span>`).join("")}</div>
      <p class="note">이상값은 오류가 아니라 「다른 것들과 크게 다른 값」입니다. 상관과 군집에 큰 영향을 줄 수 있어 따로 확인합니다.</p>` : `<p class="note">이상값이 없습니다.</p>`;
  }

  // ---------------- frame ----------------
  function render() {
    document.querySelectorAll("#d-subnav button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.pane === S.pane)));
    controls();
    ({ d1: renderD1, d2: renderD2, d3: renderD3, d4: renderD4 })[S.pane]();
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("#d-subnav [data-pane]");
    if (b) { S.pane = b.dataset.pane; render(); }
  });
  window.RELATIONS = { render, S, spearman, R };
})();
