/* NYC 311 dashboard v2 — question-based screens.
   Reads window.DASHBOARD_DATA (build_dashboard_data.py) and window.EXPLORE_DATA (build_explore_data.py).
   Every number is a sum or a lookup of pre-computed exact aggregates. Medians/percentiles are only looked up
   from the exact quantile cube (never averaged or combined). */
(function () {
  "use strict";
  const D = window.DASHBOARD_DATA, X = window.EXPLORE_DATA;
  const KO = window.PROBLEM_KO || {};
  const M = D.dims.months, B = D.dims.boroughs, A = D.dims.agencies, P = D.dims.problems;
  const C = D.counts.rows;                // [m,b,a,p,focus,full_day,rc,no_addr,n]  rc: 0 resolved,1 open,2 closed_excluded
  const GA = D.groups_by_agency.rows;     // [m,b,a,p,focus,n,groups]
  const GALL = D.groups_all_agency.rows;  // [m,b,p,focus,n,groups]
  const CBS = X.cbs, CBB = X.cb_boro, CBC = X.cb_cube.rows;   // [cb,a,p,m,focus,full_day,n]
  const UNL = X.unlinked.rows;            // [b,a,p,m,focus,n]
  const WD = X.weekday.rows, HR = X.hour.rows; // [b,a,p,m,focus,dow|hour,n] FULL_DAY only
  const DL = X.delay.rows;                // [m,b,a,p,focus,elig7,nc7,elig30,nc30]
  const TOPX = X.top_addresses.rows;      // [set,a,m,p,b,key,n,groups,main_p,main_n,days,first,last,r_all,r_b]
  const FOCUS_B = B.indexOf(D.focus.borough), FOCUS_K = D.focus.address_key;
  const AG = {}; D.agencies.agencies.forEach(x => { AG[x.code] = x; });
  const BKO = { "BRONX": "브롱크스", "BROOKLYN": "브루클린", "MANHATTAN": "맨해튼", "QUEENS": "퀸스", "STATEN ISLAND": "스태튼아일랜드", "(미상)": "자치구 미상" };
  const BAB = { "BRONX": "BX", "BROOKLYN": "BK", "MANHATTAN": "MN", "QUEENS": "QN", "STATEN ISLAND": "SI" };
  const UNK = B.indexOf("(미상)");
  const KB = B.map((_, i) => i).filter(i => i !== UNK);       // known boroughs
  const SMALL_N = 100, MIN_CELL = 200;
  const PAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  const GRAY = "#b9b8b2";
  const BCOL = { "BRONX": PAL[0], "BROOKLYN": PAL[1], "MANHATTAN": PAL[2], "QUEENS": PAL[3], "STATEN ISLAND": PAL[4], "(미상)": GRAY };

  // ---------- lookups ----------
  const Q = new Map(); D.quantiles.rows.forEach(r => Q.set(r.slice(0, 5).join("|"), r));
  const qGet = (m, b, a, p, x) => Q.get([m, b, a, p, x ? 0 : -1].join("|"));
  const TOP = new Map(); TOPX.forEach(r => { const k = r.slice(0, 4).join("|"); if (!TOP.has(k)) TOP.set(k, []); TOP.get(k).push(r); });
  const DAYS_MD = {}; X.days_m_dow.forEach(([m, dw, n]) => { DAYS_MD[m + "|" + dw] = n; });

  // ---------- formatting ----------
  const nf = new Intl.NumberFormat("ko-KR");
  const fmtN = n => nf.format(Math.round(n));
  const pct = (a, b, d = 1) => b > 0 ? (a / b * 100).toFixed(d) + "%" : "-";
  const pctF = (a, b) => b > 0 && a > 0 && a / b < 0.001 ? (a / b < 0.0001 ? "<0.01%" : (a / b * 100).toFixed(2) + "%") : pct(a, b);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mLabel = i => { const [y, m] = M[i].split("-"); return `${y}년 ${+m}월`; };
  const mShort = i => { const [y, m] = M[i].split("-"); return `${y.slice(2)}.${m}`; };
  const bLabel = i => BKO[B[i]] || B[i];
  const cbLabel = i => { const c = CBS[i]; return `${BKO[c.slice(3)]} ${+c.slice(0, 2)}`; };
  const cbCode = i => { const c = CBS[i]; return `${BAB[c.slice(3)]}${c.slice(0, 2)}`; };
  const aName = i => { const x = AG[A[i]]; return x && x.name_ko ? `${x.name_ko.replace(/\(.*\)$/, "")}(${A[i]})` : A[i]; };
  const aLabel = i => { const x = AG[A[i]]; return x && x.name_ko ? `${x.name_ko}(${A[i]})` : A[i]; };
  const aShort = aName;
  const aMission = i => { const x = AG[A[i]]; if (!x || !x.mission_ko) return ""; const s = x.mission_ko.split(/(?<=[.다])\s/)[0]; return s; };
  const pLabel = i => KO[P[i]] ? `${KO[P[i]]} (${P[i]})` : P[i];
  const pShort = i => KO[P[i]] || P[i];
  function fmtH(h) {
    if (h == null) return "-";
    if (h < 1) return `${Math.round(h * 60)}분`;
    if (h < 48) return `${h.toFixed(1)}시간`;
    return `${fmtN(h)}시간 <small>(약 ${(h / 24).toFixed(h < 240 ? 1 : 0)}일)</small>`;
  }
  const fmtHtxt = h => fmtH(h).replace(/<[^>]+>/g, "");
  const per100 = (a, b) => b > 0 ? `100건 중 ${(a / b * 100).toFixed(1)}건` : "-";

  // ---------- state + URL ----------
  const VIEWS = ["home", "where", "when", "places", "time", "more"];
  const FILTERED = ["where", "when", "places", "time"];
  const st = { v: "home", b: -1, cd: -1, a: -1, p: -1, m: -1, x: 0 };
  const $ = id => document.getElementById(id);
  function toHash() {
    const q = new URLSearchParams();
    if (st.b >= 0) q.set("b", B[st.b]); if (st.cd >= 0) q.set("cd", CBS[st.cd]); if (st.a >= 0) q.set("a", A[st.a]);
    if (st.p >= 0) q.set("p", P[st.p]); if (st.m >= 0) q.set("m", M[st.m]); if (st.x) q.set("x", "1");
    const s = q.toString(); return "#" + st.v + (s ? "?" + s : "");
  }
  const EMBED = !!window.STREAMLIT_EMBED;   // running inside the Streamlit wrapper (srcdoc iframe)
  function parentBase() { try { const l = window.parent.location; return l.origin + l.pathname.replace(/\/[^/]*$/, ""); } catch (e) { return ""; } }
  function shareUrl() {
    if (!EMBED) return location.href.split("#")[0] + toHash();
    try { const l = window.parent.location; return l.origin + l.pathname + "?s=" + encodeURIComponent(toHash().slice(1)); } catch (e) { return toHash(); }
  }
  function fixLinks(root) {   // report links -> the Streamlit reports page when embedded
    if (!EMBED) return;
    (root || document).querySelectorAll('a[href^="../reports/"]').forEach(a => {
      const name = a.getAttribute("href").replace("../reports/", "").replace(/\.md$/, "");
      a.setAttribute("href", `${parentBase()}/reports?r=${encodeURIComponent(name)}`); a.setAttribute("target", "_blank");
    });
  }
  function fromHash() {
    let raw = location.hash.slice(1);
    if (!raw && EMBED && window.INITIAL_STATE) raw = window.INITIAL_STATE;
    const h = decodeURIComponent(raw); const [v, qs] = h.split("?");
    const q = new URLSearchParams(qs || "");
    const ix = (arr, k) => q.has(k) ? arr.indexOf(q.get(k)) : -1;
    Object.assign(st, { v: VIEWS.includes(v) ? v : "home", b: ix(B, "b"), cd: ix(CBS, "cd"), a: ix(A, "a"), p: ix(P, "p"), m: ix(M, "m"), x: q.get("x") === "1" ? 1 : 0 });
    if (st.cd >= 0) st.b = CBB[st.cd];
  }

  // ---------- aggregation ----------
  const sum = (rows, f) => rows.reduce((t, r) => t + (f ? f(r) : r[8]), 0);
  function cRows(s, skipX) {
    return C.filter(r => (s.m < 0 || r[0] === s.m) && (s.b < 0 || r[1] === s.b) && (s.a < 0 || r[2] === s.a)
      && (s.p < 0 || r[3] === s.p) && (skipX || !s.x || r[4] === 0));
  }
  function cbRows(s) {  // community-board cube with the record filters (a, p, m, x); region applied by caller
    return CBC.filter(r => (s.m < 0 || r[3] === s.m) && (s.a < 0 || r[1] === s.a) && (s.p < 0 || r[2] === s.p) && (!s.x || r[4] === 0));
  }
  function gRows(s) {
    if (s.a >= 0) return GA.filter(r => (s.m < 0 || r[0] === s.m) && (s.b < 0 || r[1] === s.b) && r[2] === s.a
      && (s.p < 0 || r[3] === s.p) && (!s.x || r[4] === 0)).map(r => ({ p: r[3], n: r[5], g: r[6] }));
    return GALL.filter(r => (s.m < 0 || r[0] === s.m) && (s.b < 0 || r[1] === s.b) && (s.p < 0 || r[2] === s.p)
      && (!s.x || r[3] === 0)).map(r => ({ p: r[2], n: r[4], g: r[5] }));
  }
  const fltBAPMX = (s, bI, aI, pI, mI, xI) => r => (s.b < 0 || r[bI] === s.b) && (s.a < 0 || r[aI] === s.a) && (s.p < 0 || r[pI] === s.p) && (s.m < 0 || r[mI] === s.m) && (!s.x || r[xI] === 0);
  const noRegion = s => Object.assign({}, s, { b: -1, cd: -1 });

  // ---------- tooltip ----------
  const tip = $("tip");
  document.addEventListener("mousemove", e => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) { tip.hidden = true; return; }
    tip.innerHTML = t.getAttribute("data-tip"); tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight; let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14; if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });

  // ---------- charts ----------
  let W = 640;
  const setW = opt => { W = Math.max(300, Math.round(opt.w || 640)); };
  const wOf = id => ($(id) && $(id).clientWidth) || 640;
  function textW(s) { let w = 0; for (const ch of s) w += /[ㄱ-힝]/.test(ch) ? 12 : 6.8; return w; }
  function clip(s, px) { if (textW(s) <= px) return s; let o = ""; for (const ch of s) { if (textW(o + ch + "…") > px) break; o += ch; } return o + "…"; }
  const emptyBox = (msg, unsup) => `<div class="empty${unsup ? " unsup" : ""}">${msg}</div>`;
  const NO_DATA = "해당 조건의 데이터 없음";
  function hbars(items, opt) {
    setW(opt);
    const series = opt.series || [{ key: "value", color: "var(--s1)" }];
    const labelW = Math.min(opt.labelW || 210, W * (W < 480 ? 0.34 : 0.42)), valW = Math.min(opt.valW || 120, W * (W < 480 ? 0.26 : 0.32)), barH = 13, gap = 3;
    const rowH = series.length * (barH + gap) + 9, top = 4, H = top + items.length * rowH + 4;
    const max = opt.max || Math.max(1e-9, ...items.flatMap(it => series.map(s => it[s.key] || 0)));
    const plotW = W - labelW - valW; let g = "";
    items.forEach((it, i) => {
      const y0 = top + i * rowH;
      g += `<text class="lab" x="${labelW - 8}" y="${y0 + rowH / 2}" text-anchor="end" dominant-baseline="middle"${it.hl ? ' font-weight="700"' : ""}>${esc(clip(it.label, labelW - 12))}</text>`;
      series.forEach((s, j) => {
        const v = it[s.key] || 0, w = Math.max(v > 0 ? 1.5 : 0, v / max * plotW), y = y0 + 4 + j * (barH + gap);
        g += `<rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="3" fill="${it.dim ? "var(--dim)" : (it.color && j === 0 ? it.color : s.color)}"/>`;
        const t = W < 480 && it[s.key + "Short"] != null ? it[s.key + "Short"] : it[s.key + "Text"] != null ? it[s.key + "Text"] : fmtN(v);
        g += `<text class="val" x="${labelW + w + 5}" y="${y + barH / 2}" dominant-baseline="middle">${esc(clip(String(t), W - labelW - w - 8))}</text>`;
      });
      g += `<rect class="hit" x="0" y="${y0}" width="${W}" height="${rowH}" data-tip="${esc(it.tip || it.label)}"${it.attr || ""}/>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria || "")}">${g}</svg>`;
  }
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; }
  function vbars(items, opt) {
    setW(opt);
    const H = opt.h || 230, left = 52, right = 8, top = 22, bottom = 34, plotW = W - left - right, plotH = H - top - bottom;
    const nice = niceMax(Math.max(1e-9, ...items.map(it => it.value))), step = plotW / Math.max(items.length, 1); let g = "";
    for (let k = 0; k <= 4; k++) { const v = nice * k / 4, y = top + plotH - v / nice * plotH;
      g += `<line class="gridl" x1="${left}" x2="${W - right}" y1="${y}" y2="${y}"/><text x="${left - 6}" y="${y}" text-anchor="end" dominant-baseline="middle">${opt.fmtAxis ? opt.fmtAxis(v) : fmtN(v)}</text>`; }
    const bw = Math.min(34, step * 0.62);
    items.forEach((it, i) => {
      const x = left + i * step + (step - bw) / 2, h = it.value / nice * plotH, y = top + plotH - h;
      g += `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, it.value > 0 ? 1.5 : 0)}" rx="3" fill="${it.color || "var(--s1)"}"/>`;
      if (opt.labels && W / items.length > 34) g += `<text class="val" x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="11">${esc(it.valueText || fmtN(it.value))}</text>`;
      g += `<text x="${x + bw / 2}" y="${H - bottom + 16}" text-anchor="middle">${esc(it.label)}</text>`;
      g += `<rect class="hit" x="${left + i * step}" y="${top}" width="${step}" height="${plotH + bottom}" data-tip="${esc(it.tip)}"/>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria || "")}">${g}</svg>`;
  }
  // multi-line chart: series = [{name,color,values,dash}] ; labels = x labels
  function lines(labels, series, opt) {
    setW(opt);
    const H = opt.h || 220, left = 48, right = 10, top = 14, bottom = 30, plotW = W - left - right, plotH = H - top - bottom;
    const all = series.flatMap(s => s.values.filter(v => v != null));
    const lo = opt.min != null ? opt.min : 0, hi = niceMax(Math.max(...all, opt.minHi || 0));
    const X = i => left + (labels.length === 1 ? plotW / 2 : i / (labels.length - 1) * plotW), Y = v => top + plotH - (v - lo) / (hi - lo) * plotH;
    let g = "";
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v);
      g += `<line class="gridl" x1="${left}" x2="${W - right}" y1="${y}" y2="${y}"/><text x="${left - 6}" y="${y}" text-anchor="end" dominant-baseline="middle">${opt.fmtAxis ? opt.fmtAxis(v) : fmtN(v)}</text>`; }
    if (opt.ref != null) g += `<line x1="${left}" x2="${W - right}" y1="${Y(opt.ref)}" y2="${Y(opt.ref)}" stroke="var(--muted)" stroke-dasharray="3 3"/>`;
    const every = Math.ceil(labels.length / Math.max(2, Math.floor(plotW / 46)));
    labels.forEach((l, i) => { if (i % every === 0) g += `<text x="${X(i)}" y="${H - bottom + 16}" text-anchor="middle">${esc(l)}</text>`; });
    (opt.marks || []).forEach(i => { g += `<rect x="${X(i) - 3}" y="${top}" width="6" height="${plotH}" fill="var(--accent-bg)"/>`; });
    series.forEach(s => {
      const pts = s.values.map((v, i) => v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).filter(Boolean).join(" ");
      g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"${s.dash ? ' stroke-dasharray="5 4"' : ""}/>`;
      if (labels.length <= 31) s.values.forEach((v, i) => { if (v != null) g += `<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="${s.color}"/>`; });
    });
    if (opt.tips) { const sw = plotW / Math.max(1, labels.length - 1);
      labels.forEach((l, i) => { g += `<rect class="hit" x="${X(i) - sw / 2}" y="${top}" width="${sw}" height="${plotH}" data-tip="${esc(opt.tips(i))}"/>`; }); }
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria || "")}">${g}</svg>`;
  }
  function dotLog(items, opt) {
    setW(opt);
    const labelW = Math.min(190, W * 0.3), right = Math.min(215, W * 0.3), top = 26, rowH = 24, H = top + items.length * rowH + 8;
    const lo = 0.1, hi = Math.max(1000, ...items.map(it => it.p90 || 0)) * 1.3, plotW = W - labelW - right;
    const Xs = h => labelW + (Math.log10(Math.max(h, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * plotW; let g = "";
    [[0.1, "6분"], [1, "1시간"], [24, "1일"], [168, "1주"], [720, "30일"], [2400, "100일"], [8760, "1년"]].forEach(([h, t]) => {
      if (h > hi) return; g += `<line class="gridl" x1="${Xs(h)}" x2="${Xs(h)}" y1="${top - 4}" y2="${H - 6}"/><text x="${Xs(h)}" y="${top - 10}" text-anchor="middle" font-size="11">${t}</text>`; });
    items.forEach((it, i) => {
      const y = top + i * rowH + rowH / 2, col = it.small ? "var(--dim)" : "var(--s1)";
      g += `<text class="lab" x="${labelW - 8}" y="${y}" text-anchor="end" dominant-baseline="middle"${it.hl ? ' font-weight="700"' : ""}>${esc(clip(it.label, labelW - 12))}</text>`;
      g += `<line x1="${Xs(it.med)}" x2="${Xs(it.p90)}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="2" opacity="0.45"/>`;
      g += `<line x1="${Xs(it.p90)}" x2="${Xs(it.p90)}" y1="${y - 7}" y2="${y + 7}" stroke="${it.small ? "var(--dim)" : "var(--s2)"}" stroke-width="3" stroke-linecap="round"/>`;
      g += `<circle cx="${Xs(it.med)}" cy="${y}" r="5.5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
      g += `<text class="val" x="${W - right + 8}" y="${y}" dominant-baseline="middle" font-size="11.5">${esc(clip(W < 560 ? it.sideShort : it.side, right - 10))}</text>`;
      g += `<rect class="hit" x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}" data-tip="${esc(it.tip)}"/>`;
    });
    return `<div class="legend"><span><i style="background:var(--s1);border-radius:50%"></i>절반이 종료 기록 (중앙값)</span><span><i style="background:var(--s2);width:4px"></i>90%가 종료 기록 (90백분위수)</span><span><i style="background:var(--dim)"></i>종료 건 ${SMALL_N}건 미만 (참고만)</span><span>가로축: 로그 눈금</span></div>` +
      `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria || "")}">${g}</svg>`;
  }
  function table(head, rows, opt = {}) {
    const num = opt.num || [];
    let h = `<div class="tscroll"><table><thead><tr>${head.map((x, i) => `<th${num.includes(i) ? ' class="num"' : ""}>${x}</th>`).join("")}</tr></thead><tbody>`;
    rows.forEach(r => { const cls = r.cls ? ` class="${r.cls}"` : ""; h += `<tr${cls}${r.attr || ""}>${(r.cells || r).map((x, i) => `<td${num.includes(i) ? ' class="num"' : ""}>${x}</td>`).join("")}</tr>`; });
    return h + "</tbody></table></div>";
  }
  const details = (title, inner, cls = "tbl") => `<details class="${cls}"><summary>${title}</summary>${inner}</details>`;
  const legend = items => `<div class="legend">${items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join("")}</div>`;
  // relative share colour: log2 scale clipped to 0.25..4, blue (lower) - grey - red (higher)
  function lqColor(v) {
    if (v == null || !isFinite(v)) return "#f3f3f0";
    const z = Math.max(-2, Math.min(2, Math.log2(Math.max(v, 1e-6)))) / 2;
    const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
    const c = z >= 0 ? mix([243, 243, 240], [227, 73, 72], z) : mix([243, 243, 240], [42, 120, 214], -z);
    return `rgb(${c.join(",")})`;
  }
  const lqTxt = v => v == null || !isFinite(v) ? "-" : (v >= 10 ? `×${v.toFixed(0)}` : `×${v.toFixed(1)}`);

  // card: question title, one sentence, unit/comparison, condition/denominator, body, reading, criteria
  function card(o) {
    return `<figure class="card${o.cls ? " " + o.cls : ""}"${o.id ? ` id="${o.id}"` : ""}>
      <figcaption><span class="cq">${o.q}</span>${o.what ? `<span class="what">${o.what}</span>` : ""}</figcaption>
      ${o.meta ? `<div class="meta">${o.meta}</div>` : ""}
      <div class="cbody">${o.body}</div>
      ${o.read ? `<div class="read">${o.read}</div>` : ""}
      ${o.more ? details("자세한 기준 보기", `<div class="morebox">${o.more}</div>`, "readmore") : ""}
      ${o.next ? `<div class="next">${o.next}</div>` : ""}</figure>`;
  }
  const meta = (unit, cmp, cond) => [unit && `<span><b>단위</b> ${unit}</span>`, cmp && `<span><b>비교</b> ${cmp}</span>`, cond && `<span><b>대상</b> ${cond}</span>`].filter(Boolean).join("");
  const goBtn = (v, txt) => `<button class="gobtn" data-goto="${v}">${txt} →</button>`;
  const T = { f: '<span class="tag fact">확인된 사실</span>', m: '<span class="tag maybe">가능한 설명</span>', c: '<span class="tag check">추가 확인 필요</span>', w: '<span class="tag warn">주의</span>' };
  const help = (key, txt = "?") => `<button class="hbtn" data-help="${key}" title="용어 설명 보기" aria-label="용어 설명">${txt}</button>`;

  // ---------- filter bar ----------
  function opt(v, t, extra = "") { return `<option value="${v}"${extra}>${esc(t)}</option>`; }
  function fillFilters() {
    $("f-b").innerHTML = opt(-1, "전체 (5개 자치구)") + KB.map(i => opt(i, bLabel(i))).join("");
    const cbs = st.b >= 0 ? CBS.map((_, i) => i).filter(i => CBB[i] === st.b) : [];
    $("f-cd").innerHTML = opt(-1, st.b >= 0 ? `${bLabel(st.b)} 전체` : "자치구를 먼저 고르세요") + cbs.map(i => opt(i, `${cbLabel(i)} (${cbCode(i)})`)).join("");
    $("f-cd").disabled = st.b < 0;
    $("f-a").innerHTML = opt(-1, "전체 기관") + A.map((a, i) => opt(i, aName(i))).join("");
    $("f-m").innerHTML = opt(-1, "전체 12개월") + M.map((m, i) => opt(i, mLabel(i) + (i === 0 || i === M.length - 1 ? " (일부만 수집)" : ""))).join("");
    const allowed = new Map();
    C.forEach(r => { if (st.a < 0 || r[2] === st.a) allowed.set(r[3], (allowed.get(r[3]) || 0) + r[8]); });
    if (st.p >= 0 && !allowed.has(st.p)) st.p = -1;
    const list = [...allowed.keys()].sort((x, y) => allowed.get(y) - allowed.get(x) || (P[x] < P[y] ? -1 : 1));
    $("f-p").innerHTML = opt(-1, `전체 유형 (${list.length}개)`) + list.map(i => opt(i, `${pLabel(i)} · ${fmtN(allowed.get(i))}건`)).join("");
    $("f-b").value = st.b; $("f-cd").value = st.cd; $("f-a").value = st.a; $("f-p").value = st.p; $("f-m").value = st.m; $("f-x").value = st.x;
    ["b", "cd", "a", "p", "m", "x"].forEach(k => $("f-" + k).classList.toggle("set", st[k] !== (k === "x" ? 0 : -1)));
  }
  function stateText() {
    const reg = st.cd >= 0 ? `${cbLabel(st.cd)} (${cbCode(st.cd)})` : st.b >= 0 ? bLabel(st.b) : "뉴욕시 전체";
    return [`지역 <b>${esc(reg)}</b>`, `유형 <b>${st.p < 0 ? "전체" : esc(pShort(st.p))}</b>`, `기관 <b>${st.a < 0 ? "전체" : esc(aName(st.a))}</b>`,
      `기간 <b>${st.m < 0 ? "12개월" : mLabel(st.m)}</b>`, `집중 주소 <b>${st.x ? "제외" : "포함"}</b>`].join(" · ");
  }
  // per-view support: 'ok' | 'part' (with note) | 'no' (with note)
  const SUPPORT = {
    where: { cd: ["ok"], a: ["ok", "기관을 고르면 그 기관 신고만으로 비중을 계산"], p: ["ok", "선택 유형을 강조"], m: ["ok"], x: ["ok"] },
    when: { cd: ["part", "세부 지역은 월별 그래프만"], a: ["part", "일별 그래프는 기관 조건 미지원"], p: ["part", "일별 그래프는 신고가 많은 15개 유형만 · 구성 열지도는 유형 조건 대신 그 유형 행을 강조"], m: ["part", "월별 그래프는 12개월을 모두 보여 주고 선택한 달을 강조"], x: ["part", "일별 그래프는 집중 주소 제외 미지원"] },
    places: { cd: ["no", "세부 지역 단위 주소 순위는 미지원 (자치구 단위로 표시)"], a: ["ok"], p: ["ok"], m: ["part", "주소 순위는 유형과 기간을 함께 고르면 미지원"], x: ["ok"] },
    time: { cd: ["no", "세부 지역 단위 처리 시간은 미지원 (자치구 단위로 표시)"], a: ["ok"], p: ["ok"], m: ["ok"], x: ["ok"] },
  };
  function appliesBar(view) {
    const S = SUPPORT[view]; const names = { cd: "세부 지역", a: "기관", p: "민원 유형", m: "기간", x: "집중 주소" };
    const set = { cd: st.cd >= 0, a: st.a >= 0, p: st.p >= 0, m: st.m >= 0, x: !!st.x };
    const chips = Object.keys(names).map(k => {
      const [lev, note] = S[k]; const cls = lev === "ok" ? "on" : lev === "part" ? "part" : "off";
      return `<span class="chip ${cls}${set[k] ? " active" : ""}" title="${esc(note || "적용됨")}">${lev === "ok" ? "✓" : lev === "part" ? "△" : "✕"} ${names[k]}${note ? `<small>${esc(note)}</small>` : ""}</span>`;
    }).join("");
    const warn = Object.keys(set).filter(k => set[k] && S[k][0] !== "ok").map(k => `<li><b>${names[k]}</b>: ${esc(S[k][1])}</li>`).join("");
    return `<div class="applies"><span class="lead">이 화면에 적용되는 조건</span>${chips}</div>` + (warn ? `<ul class="unsup-list">${warn}</ul>` : "");
  }

  // ======================= HOME =======================
  function renderHome() {
    const o = D.ref.eda_overview, r = D.ref.eda_resolution;
    const nCD = CBC.reduce((t, x) => t + x[6], 0);
    const rep = X.repeat.q1;
    const fNR = (() => { const rr = C.filter(x => x[3] === P.indexOf("Noise - Residential") && x[1] === FOCUS_B); return [sum(rr), sum(rr.filter(x => x[4] === 0))]; })();
    const L1 = X.playbook.L1.filter(x => x.metric === "median_h");
    const pbOK = X.playbook.summary && L1.length === 5;
    const RRo = window.REREPORT_DATA ? window.REREPORT_DATA.overall.find(x => x.unit === "request" && x.scope === "all") : null;
    const WXs = window.WEATHER_DATA ? window.WEATHER_DATA.compare.find(x => x.group === "snow_ice" && x.event === "snow") : null;
    const BDb = window.BUILDING_DATA ? Object.fromEntries(window.BUILDING_DATA.borough.map(x => [x.borough, x.report_days_per_1000_units])) : null;
    $("home-data").innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="lab">기간</div><div class="val">1년</div><div class="sub">접수 ${esc(o.created_min.slice(0, 16))} ~ ${esc(o.created_max.slice(0, 16))}. 첫날·마지막 날은 일부 시간만 들어 있음</div></div>
        <div class="kpi"><div class="lab">기본 분석 대상 신고 ${help("base")}</div><div class="val">${fmtN(o.rows_base)}<small>건</small></div><div class="sub">전체 ${fmtN(o.rows_all)}건 중 중복 의심 ${fmtN(o.system_duplicates_excluded)}건 제외</div></div>
        <div class="kpi"><div class="lab">이 숫자는 무엇인가</div><div class="val" style="font-size:20px">신고 기록</div><div class="sub">사건 수·문제의 양·심각도가 아니라 311에 <b>접수된 기록</b>입니다</div></div>
      </div>
      ${details("화면마다 계산 대상 건수가 다릅니다", table(["무엇을 계산하나", "대상", "건수"], [
        ["신고 수·비중 (자치구)", "자치구가 있는 신고", fmtN(o.rows_base - sum(C.filter(x => x[1] === UNK)))],
        ["세부 지역(커뮤니티 보드) 구성", "표준 커뮤니티 보드 59곳에 연결된 신고", fmtN(nCD)],
        ["처리 시간 (절반·90%가 종료 기록에 도달한 시간)", "종료 기록이 있고 처리 시간이 0보다 큰 신고 (상태·날짜가 맞는 것)", fmtN(r.resolved_rows)],
        ["주소 반복 (전체 참고 결과)", "번지가 있는 주소의 신고", fmtN(rep.reports)]], { num: [2] }), "readmore")}`;
    const F = [
      { v: "where", s: { b: B.indexOf("QUEENS") }, t: "지역마다 많이 들어오는 신고 종류가 다릅니다",
        fact: "퀸스·브루클린은 신고의 19.9%가 불법주차입니다(5개 자치구 전체 15.6%). 브롱크스는 주거 소음 17.3%, 난방·온수 14.3%로 전체(10.5%, 8.9%)보다 높고, 맨해튼은 차고 앞 주차가 0.6%뿐입니다.",
        lim: "비중이 높다고 그 지역에 문제가 더 많거나 심하다는 뜻은 아닙니다. 기록된 신고의 구성입니다." },
      { v: "places", s: { b: FOCUS_B, p: P.indexOf("Noise - Residential") }, t: "한 주소가 지역 결과를 바꿉니다",
        fact: `브롱크스 한 주소(655 EAST 230 STREET)에 신고 47,105건이 들어왔습니다. 브롱크스 주거 소음 ${fmtN(fNR[0])}건 중 ${pct(fNR[0] - fNR[1], fNR[0])}가 이 주소이고, 빼면 ${fmtN(fNR[1])}건으로 줄어 자치구 순위가 바뀝니다.`,
        lim: "신고가 많다는 사실만으로 특정 주민의 행동이나 실제 소음 수준을 판단할 수 없습니다." },
      { v: "places", s: {}, t: "신고는 같은 주소에서 여러 번 들어오는 경우가 대부분입니다",
        fact: `번지가 있는 주소의 신고 중 ${rep.reports_at_ge2_pct.toFixed(1)}%는 1년 동안 2건 이상 신고된 주소에서 나왔습니다. 같은 주소·같은 유형의 반복은 같은 날 하루에 몰리기보다 여러 달에 걸쳐 들어옵니다.`,
        lim: "다시 신고됐다는 것이 해결 실패나 재발이라는 뜻은 아닙니다. 세대(호실) 정보가 없어 큰 건물의 여러 세대 신고도 같은 주소로 셉니다." + (RRo ? ` 종결 뒤 같은 주소·유형으로 다시 접수된 비율은 7일 ${RRo.rate_7d.toFixed(1)}%, 30일 ${RRo.rate_30d.toFixed(1)}%입니다(4번 화면 「종결 뒤 재접수」).` : "") },
      { v: "when", s: { p: P.indexOf("HEAT/HOT WATER") }, t: "계절과 특정 날짜에 따라 신고가 크게 달라집니다",
        fact: "난방·온수 신고는 겨울(11~2월)에 몰립니다. 하루 신고가 가장 많았던 2026-02-24에는 22,793건이 들어왔고, 그중 눈·얼음이 11,370건입니다." +
          (WXs ? ` 센트럴파크 날씨와 대조하면 2/22~23에 눈 50cm가 내린 직후이고, 눈이 온 날부터 2일 동안 눈·얼음 신고는 평소의 약 ${Math.round(WXs.rel_main)}배였습니다(2번 화면 날씨 카드).` : ""),
        lim: "1년 자료라 매년 반복되는 계절성인지 알 수 없습니다. 날씨와 신고가 함께 움직였다는 관찰이며, 관측소 1곳의 날씨로 뉴욕시 전체를 대신했습니다." },
      { v: "time", s: {}, t: pbOK ? "처리 시간의 자치구 차이는 대부분 「어떤 업무가 많은가」의 차이입니다" : "처리 시간 비교는 같은 업무끼리 해야 합니다",
        fact: pbOK ? (() => { const g = Object.fromEntries(L1.map(x => [x.borough, x]));
          const f = (b) => `${BKO[b]}은 단순 비교에서 ${g[b].raw_t.toFixed(1)}시간 vs 나머지 네 곳 ${g[b].raw_o.toFixed(1)}시간이지만, 비슷한 업무끼리 맞추면 ${g[b].adj_t_main.toFixed(1)} vs ${g[b].adj_o_main.toFixed(1)}시간입니다`;
          return `절반의 신고가 종료 기록에 도달한 시간을 비교했습니다. ${f("BRONX")}. ${f("MANHATTAN")}. 민원 유형·세부 유형·접수 월·기관이 같은 업무끼리 맞추면 차이가 크게 줄거나 방향이 바뀝니다.`; })()
          : "자치구마다 맡는 민원이 달라, 전체 값만 비교하면 업무 구성 차이가 섞입니다.",
        lim: "맞춘 비교도 지역의 순수한 영향이나 기관의 성과를 뜻하지 않습니다. 「종료 기록」은 실제 해결·수리 완료의 증거가 아닙니다." },
    ].concat(BDb ? [{ v: "places", s: {}, t: "세대 수로 나눠도 브롱크스의 난방 신고가 가장 많습니다",
        fact: `모든 주거 세대 1,000곳당 난방 신고가 있었던 날은 브롱크스 ${Math.round(BDb.BRONX)}일, 브루클린 ${Math.round(BDb.BROOKLYN)}일, 맨해튼 ${Math.round(BDb.MANHATTAN)}일, 퀸스 ${Math.round(BDb.QUEENS)}일입니다. 20~99세대 건물과 1946년 이전 건물에서 많고, 1년에 10일 이상 신고가 반복된 건물(15%)이 난방 신고의 71%를 차지합니다.`,
        lim: "세대 수는 현재 시점의 건물 정보(PLUTO)입니다. 신고가 많다고 건물 상태가 나쁘다고 확정할 수 없고, 건물주·기관 평가가 아닙니다." }] : []);
    $("home-findings").innerHTML = F.map((f, i) => `<div class="finding"><h3><span class="fnum">${i + 1}</span>${f.t}</h3>
      <p>${T.f}${f.fact}</p><p class="lim">${T.w}${f.lim}</p>
      <button class="gobtn" data-goto="${f.v}" data-preset='${JSON.stringify(f.s)}'>관련 화면에서 직접 확인 →</button></div>`).join("");
  }

  // ======================= 1. WHERE =======================
  function regionInfo() {
    if (st.cd >= 0) return { lvl: "cd", name: `${cbLabel(st.cd)} (${cbCode(st.cd)})`, cmpName: "커뮤니티 보드 59곳 전체" };
    if (st.b >= 0) return { lvl: "b", name: bLabel(st.b), cmpName: "5개 자치구 전체" };
    return { lvl: "all", name: "뉴욕시 전체", cmpName: "" };
  }
  function typeCounts(lvl, regionIdx) {   // Map p -> n for a region under the record filters
    const m = new Map();
    if (lvl === "cd") cbRows(noP()).forEach(r => { if (regionIdx < 0 || r[0] === regionIdx) m.set(r[2], (m.get(r[2]) || 0) + r[6]); });
    else cRows(Object.assign(noP(), { b: -1 })).forEach(r => { if ((regionIdx < 0 ? r[1] !== UNK : r[1] === regionIdx)) m.set(r[3], (m.get(r[3]) || 0) + r[8]); });
    return m;
  }
  const noP = () => Object.assign({}, st, { p: -1 });
  function renderWhere() {
    $("where-applies").innerHTML = appliesBar("where");
    const R = regionInfo();
    const reg = R.lvl === "cd" ? typeCounts("cd", st.cd) : R.lvl === "b" ? typeCounts("b", st.b) : (() => { const m = new Map(); cRows(noP()).forEach(r => m.set(r[3], (m.get(r[3]) || 0) + r[8])); return m; })();
    const cmp = R.lvl === "cd" ? typeCounts("cd", -1) : R.lvl === "b" ? typeCounts("b", -1) : null;
    const tot = m => [...m.values()].reduce((a, b) => a + b, 0);
    const N = tot(reg), NC = cmp ? tot(cmp) : 0;
    const recNote = [st.a >= 0 ? `기관 ${aName(st.a)}의 신고만` : "", st.m >= 0 ? mLabel(st.m) : "12개월", st.x ? "집중 주소 제외" : ""].filter(Boolean).join(" · ");
    // chart 1: composition of the selected region vs comparison
    let body1;
    if (!N) body1 = emptyBox(NO_DATA);
    else {
      let ps = [...reg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(x => x[0]);
      if (st.p >= 0 && !ps.includes(st.p) && reg.has(st.p)) ps.push(st.p);
      const items = ps.map(p => {
        const n = reg.get(p) || 0, s = n / N * 100, c = cmp ? (cmp.get(p) || 0) / NC * 100 : null, lq = cmp && c > 0 ? s / c : null;
        return { label: pShort(p), value: s, valueText: `${s.toFixed(1)}% (${fmtN(n)}건)${lq ? ` · ${lqTxt(lq)}` : ""}`, valueShort: `${s.toFixed(1)}%${lq ? ` ${lqTxt(lq)}` : ""}`, value2: c, value2Text: c != null ? `${c.toFixed(1)}%` : "",
          hl: p === st.p, color: p === st.p ? "var(--s2)" : null, attr: ` data-setp="${p}"`,
          tip: `<b>${esc(pLabel(p))}</b><br>${esc(R.name)}: ${fmtN(n)}건 = 이 지역 신고의 ${s.toFixed(1)}%` + (cmp ? `<br>${esc(R.cmpName)}: ${c.toFixed(1)}%<br>전체보다 비중이 ${lqTxt(lq)}` : "") + "<br><small>누르면 이 유형을 선택</small>" };
      });
      body1 = (cmp ? legend([["var(--s1)", `${esc(R.name)} 안에서의 비중`], ["#c9c8c3", `${esc(R.cmpName)}의 비중`]]) : "") +
        hbars(items, { series: cmp ? [{ key: "value", color: "var(--s1)" }, { key: "value2", color: "#c9c8c3" }] : [{ key: "value", color: "var(--s1)" }], w: wOf("where-body") - 40, labelW: 170, valW: 190, aria: "지역 안의 유형 비중" });
    }
    const c1 = card({ id: "where-c1", q: `${esc(R.name)}에서는 어떤 신고가 많나요?`,
      what: "이 지역에 들어온 신고 중 각 유형이 차지하는 비중입니다(상위 12개). 막대를 누르면 그 유형을 선택합니다.",
      meta: meta("% (이 지역 신고 중 비중)", cmp ? `${R.cmpName}의 같은 유형 비중 (회색 막대). ×값 = 전체보다 비중이 몇 배인가 ${help("lq")}` : "지역을 고르면 전체와 비교합니다", `분모 = 이 지역의 <b>모든 유형</b> 신고 ${fmtN(N)}건 (${esc(recNote)})`),
      body: body1,
      read: cmp ? `${T.w}×2.0은 「이 지역 신고에서 그 유형의 비중이 전체의 2배」라는 뜻입니다. 실제 문제 발생률이나 위험도가 2배라는 뜻이 아닙니다. 그래프에 12개만 보여도 비중의 분모는 모든 유형입니다.`
        : `${T.w}위의 「지역」에서 자치구나 세부 지역을 고르면 그 지역과 전체를 나란히 비교합니다.`,
      more: `자치구 비교의 기준은 자치구가 있는 신고(자치구 미상 제외), 세부 지역 비교의 기준은 표준 커뮤니티 보드 59곳에 연결된 신고입니다(공원·공항 같은 공동 관리 구역과 보드 미기재 제외). 커뮤니티 보드는 311 자료에 적힌 값 그대로입니다(신고 좌표 대조 일치율 약 99.6%).` +
        (R.lvl === "cd" ? `<br>현재 조건에서 보드에 연결되지 않은 신고: ${fmtN(UNL.filter(fltBAPMX(noRegion(noP()), 0, 1, 2, 3, 4)).reduce((t, r) => t + r[5], 0))}건` : "") });
    // chart 2: heatmap of relative share across regions
    const rowsDef = (R.lvl === "all")
      ? KB.map(b => ({ id: b, kind: "b", name: bLabel(b), m: typeCounts("b", b) }))
      : CBS.map((_, i) => i).filter(i => CBB[i] === st.b).map(i => ({ id: i, kind: "cd", name: `${cbLabel(i)} (${cbCode(i)})`, m: typeCounts("cd", i) }));
    const base2 = R.lvl === "all" ? typeCounts("b", -1) : typeCounts("cd", -1), NB2 = tot(base2);
    let cols = [...base2.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(x => x[0]);
    if (st.p >= 0 && !cols.includes(st.p) && base2.has(st.p)) cols.push(st.p);
    let body2;
    if (!NB2) body2 = emptyBox(NO_DATA);
    else {
      let h = `<div class="tscroll"><table class="heat"><thead><tr><th>지역</th>${cols.map(p => `<th class="${p === st.p ? "sel" : ""}" data-setp="${p}" title="${esc(P[p])}">${esc(pShort(p))}</th>`).join("")}<th class="num">신고 수</th></tr></thead><tbody>`;
      rowsDef.forEach(rw => {
        const n = tot(rw.m); const sel = (rw.kind === "b" && rw.id === st.b) || (rw.kind === "cd" && rw.id === st.cd);
        h += `<tr class="${sel ? "sel" : ""}"><th data-set${rw.kind}="${rw.id}" title="누르면 이 지역 선택">${esc(rw.name)}</th>` + cols.map(p => {
          const k = rw.m.get(p) || 0, s = n ? k / n : 0, c = (base2.get(p) || 0) / NB2, lq = c > 0 && n ? s / c : null;
          return `<td style="background:${lqColor(lq)}" class="${k < MIN_CELL ? "small" : ""}" data-tip="${esc(`<b>${rw.name} · ${pShort(p)}</b><br>${fmtN(k)}건 = 지역 신고의 ${(s * 100).toFixed(1)}%<br>전체 비중 ${(c * 100).toFixed(1)}% → ${lqTxt(lq)}${k < MIN_CELL ? "<br>200건 미만: 값이 쉽게 튐" : ""}`)}">${lqTxt(lq)}${k < MIN_CELL ? "*" : ""}</td>`;
        }).join("") + `<td class="num">${fmtN(n)}</td></tr>`;
      });
      body2 = legend([["rgb(42,120,214)", "전체보다 낮음 (0.25배 이하까지)"], ["#f3f3f0", "전체와 같음 (×1)"], ["rgb(227,73,72)", "전체보다 높음 (4배 이상까지)"]]) + h + "</tbody></table></div>";
    }
    const c2 = card({ id: "where-c2", q: R.lvl === "all" ? "자치구끼리 비교하면 어떤 유형의 비중이 다른가요?" : `${esc(bLabel(st.b))}의 세부 지역끼리 비교하면?`,
      what: "각 칸은 「그 지역 안에서 그 유형의 비중」을 「전체의 같은 유형 비중」으로 나눈 값입니다. 행(지역)이나 열(유형) 이름을 누르면 선택됩니다.",
      meta: meta("배수 (×)", R.lvl === "all" ? "5개 자치구 전체의 같은 유형 비중" : "커뮤니티 보드 59곳 전체의 같은 유형 비중", `열 = 전체에서 신고가 많은 10개 유형${st.p >= 0 ? " + 선택 유형" : ""} · ${esc(recNote)}`),
      body: body2,
      read: `${T.w}색은 0.25~4배로 제한한 로그 척도입니다(극단값 때문에 다른 차이가 묻히지 않게). * 표시는 그 칸이 200건 미만이라 값이 쉽게 튀는 경우입니다. 높은 배수는 소수 주소의 반복 신고로 생길 수 있으니 ③ 화면에서 확인하세요.`,
      more: "구성비는 합이 100%라서 한 유형의 비중이 크면 다른 유형의 비중은 자동으로 작아집니다. 비중이 낮다고 건수가 적다는 뜻은 아닙니다." });
    // chart 3: where does the selected type gather?
    let c3;
    if (st.p < 0) {
      const quick = [...(reg.size ? reg : new Map()).entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([p]) => `<button class="chipbtn" data-setp="${p}">${esc(pShort(p))}</button>`).join("");
      c3 = card({ q: "선택한 유형은 어느 지역에 모여 있나요?", what: "「지역 안에서 많은 유형」과 「유형이 많이 모인 지역」은 다른 질문입니다. 유형을 고르면 두 번째 질문에 답합니다.", body: `<div class="prompt">유형을 고르세요: ${quick}</div>` });
    } else {
      const lvlB = st.b < 0;
      const regs = lvlB ? KB.map(b => ({ name: bLabel(b), m: typeCounts("b", b), sel: false, kind: "b", id: b }))
        : CBS.map((_, i) => i).filter(i => CBB[i] === st.b).map(i => ({ name: `${cbLabel(i)} (${cbCode(i)})`, m: typeCounts("cd", i), sel: i === st.cd, kind: "cd", id: i }));
      const allT = (lvlB ? typeCounts("b", -1) : typeCounts("cd", -1)), NT = allT.get(st.p) || 0, NA = tot(allT);
      const items = regs.map(rg => { const k = rg.m.get(st.p) || 0, n = tot(rg.m);
        return { label: rg.name, value: NT ? k / NT * 100 : 0, valueText: `${NT ? (k / NT * 100).toFixed(1) : 0}% (${fmtN(k)}건)`, valueShort: `${NT ? (k / NT * 100).toFixed(1) : 0}%`, value2: NA ? n / NA * 100 : 0, value2Text: `${NA ? (n / NA * 100).toFixed(1) : 0}%`,
          hl: rg.sel, attr: ` data-set${rg.kind}="${rg.id}"`, tip: `<b>${esc(rg.name)}</b><br>${esc(pShort(st.p))} 신고의 ${NT ? (k / NT * 100).toFixed(1) : 0}% (${fmtN(k)}건)<br>모든 신고 중 이 지역 비중 ${NA ? (n / NA * 100).toFixed(1) : 0}%` }; })
        .sort((x, y) => y.value - x.value);
      const shown = lvlB ? items : items;
      c3 = card({ id: "where-c3", q: `${esc(pShort(st.p))} 신고는 어느 지역에 모여 있나요?`,
        what: `${lvlB ? "5개 자치구" : `${bLabel(st.b)}의 세부 지역`}별로, 이 유형 신고 전체 중 몇 %가 그 지역에서 나왔는지 보여 줍니다.`,
        meta: meta("% (이 유형 신고 중 비중)", "회색 = 모든 신고 중 그 지역의 비중. 파란 막대가 회색보다 길면 이 유형이 그 지역에 상대적으로 많이 모였다는 뜻", `분모 = ${lvlB ? "자치구가 있는" : "커뮤니티 보드 59곳에 연결된"} ${esc(pShort(st.p))} 신고 ${fmtN(NT)}건${lvlB ? "" : " (59곳 전체 기준이라 이 자치구 막대의 합은 100%가 아님)"}`),
        body: NT ? legend([["var(--s1)", "이 유형 신고 중 비중"], ["#c9c8c3", "모든 신고 중 비중"]]) + hbars(shown, { series: [{ key: "value", color: "var(--s1)" }, { key: "value2", color: "#c9c8c3" }], w: wOf("where-body") - 40, labelW: 170, valW: 130, aria: "유형의 지역 분포" }) : emptyBox(NO_DATA),
        read: `${T.w}이 그래프는 건수의 분포입니다. 인구·주택 수를 반영하지 않았고, 한 주소의 반복 신고가 큰 몫을 차지할 수 있습니다.`,
        next: goBtn("places", "이 유형이 몇몇 주소에 몰렸는지 보기") + goBtn("when", "언제 늘어나는지 보기") + goBtn("time", "종료 기록까지 걸린 시간 보기") });
    }
    $("where-body").innerHTML = c1 + c2 + c3 + placeCard();
  }

  // ======================= 2. WHEN =======================
  // ---------- monthly composition (screen 2) ----------
  // Optional view-only merge for the apparent 2026-07-29 reclassification (unconfirmed). Never changes the data or other screens.
  let MERGE_WS = false;
  const MERGE = {};
  [["Water System", "상수도·상수도 유지보수 (통합 보기)"], ["Water Maintenance", "상수도·상수도 유지보수 (통합 보기)"],
   ["Sewer", "하수·하수 유지보수 (통합 보기)"], ["Sewer Maintenance", "하수·하수 유지보수 (통합 보기)"]].forEach(([n, lab]) => { const i = P.indexOf(n); if (i >= 0) MERGE[i] = lab; });
  const keyOf = p => (MERGE_WS && MERGE[p]) ? "M:" + MERGE[p] : p;
  const keyLabel = k => typeof k === "string" && k.startsWith("M:") ? k.slice(2) : pShort(k);
  function monthComposition() {
    const cnt = new Map(), tot = new Array(12).fill(0);
    const add = (p, m, n) => { const k = keyOf(p); if (!cnt.has(k)) cnt.set(k, new Array(12).fill(0)); cnt.get(k)[m] += n; tot[m] += n; };
    if (st.cd >= 0) CBC.forEach(r => { if (r[0] === st.cd && (st.a < 0 || r[1] === st.a) && (!st.x || r[4] === 0)) add(r[2], r[3], r[6]); });
    else C.forEach(r => { if ((st.b < 0 || r[1] === st.b) && (st.a < 0 || r[2] === st.a) && (!st.x || r[4] === 0)) add(r[3], r[0], r[8]); });
    return { cnt, tot, N: tot.reduce((a, b) => a + b, 0) };
  }
  function monthCompCard(selName) {
    const { cnt, tot, N } = monthComposition();
    if (!N) return card({ q: "달마다 민원 구성이 어떻게 달라지나요?", body: emptyBox(NO_DATA) });
    const yr = new Map([...cnt.entries()].map(([k, a]) => [k, a.reduce((x, y) => x + y, 0)]));
    let rows = [...yr.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(x => x[0]);
    const selKey = st.p >= 0 ? keyOf(st.p) : null;
    if (selKey != null && !rows.includes(selKey) && yr.has(selKey)) rows.push(selKey);
    const D = M.map((_, m) => tot[m] ? 0.5 * [...cnt.entries()].reduce((t, [k, a]) => t + Math.abs(a[m] / tot[m] - yr.get(k) / N), 0) : null);
    let h = `<div class="tscroll"><table class="heat mheat"><thead><tr><th>유형</th>${M.map((_, m) => `<th class="${m === st.m ? "sel" : ""}">${mShort(m)}</th>`).join("")}<th class="num">1년 비중</th></tr></thead><tbody>`;
    rows.forEach(k => {
      const a = cnt.get(k), ys = yr.get(k) / N, isSel = k === selKey;
      const head = typeof k === "number" ? `<th data-setp="${k}" title="${esc(P[k])} · 누르면 이 유형 선택">${esc(keyLabel(k))}</th>` : `<th title="보기 전용 통합 (확인되지 않은 대응)">${esc(keyLabel(k))}</th>`;
      h += `<tr class="${isSel ? "sel" : ""}">${head}` + a.map((n, m) => {
        if (!n) return `<td class="zero" data-tip="${esc(`<b>${keyLabel(k)} · ${mLabel(m)}</b><br>신고 없음`)}">0건</td>`;
        const s = n / tot[m], lq = s / ys;
        return `<td style="background:${lqColor(lq)}" class="${n < MIN_CELL ? "small" : ""}${m === st.m ? " selc" : ""}" data-tip="${esc(`<b>${keyLabel(k)} · ${mLabel(m)}</b><br>${fmtN(n)}건 = 그 달 신고의 ${(s * 100).toFixed(1)}%<br>1년 비중 ${(ys * 100).toFixed(1)}% → ${lqTxt(lq)}${n < MIN_CELL ? "<br>200건 미만: 값이 쉽게 튐" : ""}`)}">${(s * 100).toFixed(1)}%${n < MIN_CELL ? "*" : ""}</td>`;
      }).join("") + `<td class="num">${(ys * 100).toFixed(1)}%</td></tr>`;
    });
    h += `<tr class="drow"><th title="1년 평균 구성과 같아지려면 그 달 신고의 몇 %가 다른 유형이어야 하는가">구성 차이 D</th>${D.map(v => `<td class="num">${v == null ? "-" : (v * 100).toFixed(0) + "%"}</td>`).join("")}<td></td></tr></tbody></table></div>`;
    // each month's most distinctive type (>=200 reports, >=1% of the month, highest ratio to the yearly share)
    const tops = M.map((_, m) => {
      let best = null;
      cnt.forEach((a, k) => { const n = a[m]; if (n < MIN_CELL || !tot[m] || n / tot[m] < 0.01) return; const lq = (n / tot[m]) / (yr.get(k) / N); if (!best || lq > best.lq) best = { k, n, lq, s: n / tot[m] }; });
      return best;
    });
    const renamed = k => typeof k === "number" && ["Water Maintenance", "Sewer Maintenance", "Water System", "Sewer"].includes(P[k]);
    const topList = tops.map((b, m) => b && b.lq >= 1.5 ? `<li><b>${mLabel(m)}</b> ${esc(keyLabel(b.k))} ${(b.s * 100).toFixed(1)}% (${lqTxt(b.lq)}, ${fmtN(b.n)}건)${renamed(b.k) ? ' <span class="tag warn">이름 변경 영향일 수 있음 — 위 체크 상자로 합쳐 보기</span>' : ""}</li>` : "").join("");
    const dmax = D.reduce((b, v, i) => (v != null && v > (D[b] || 0)) ? i : b, 0), dmin = D.reduce((b, v, i) => (v != null && v < (D[b] == null ? 9 : D[b])) ? i : b, 0);
    const reclassShown = rows.some(k => typeof k === "number" && MERGE[k]) || rows.some(k => typeof k === "string");
    return card({ id: "when-mc", q: "달마다 민원 구성이 어떻게 달라지나요?",
      what: `선택한 지역·기관 조건(${esc(selName)})에서, 각 달 신고 중 각 유형이 차지하는 비중입니다. 색은 그 비중이 1년 평균 비중의 몇 배인지입니다. 유형 이름을 누르면 그 유형을 선택합니다.`,
      meta: meta("% (그 달 신고 중 비중) · 색 = 1년 평균 대비 배수", "같은 조건의 1년 전체 비중", `분모 = 그 달의 모든 유형 신고 (일부 시간만 수집된 첫날·마지막 날 포함) · 1년 ${fmtN(N)}건 · 유형 조건은 이 표에서 행 강조로만 씀`),
      body: `<label class="tgl"><input type="checkbox" id="ws-merge"${MERGE_WS ? " checked" : ""}> 상수도·하수의 이름 변경(2026-07-29) 전후를 합쳐 보기 <small>(이 표에서만, 확인되지 않은 대응)</small></label>` +
        legend([["rgb(42,120,214)", "1년 평균보다 낮음"], ["#f3f3f0", "1년 평균과 같음"], ["rgb(227,73,72)", "1년 평균보다 높음 (색은 0.25~4배로 제한)"]]) + h +
        (topList ? `<h4 class="minih">달마다 가장 두드러진 유형 (200건 이상, 그 달 비중 1% 이상, 1년 대비 1.5배 이상)</h4><ul class="cand">${topList}</ul>` : ""),
      read: `${T.f}구성이 1년 평균과 가장 다른 달은 ${mLabel(dmax)}(D ${(D[dmax] * 100).toFixed(0)}%), 가장 비슷한 달은 ${mLabel(dmin)}(${(D[dmin] * 100).toFixed(0)}%)입니다. ` +
        `${T.w}구성비는 합이 100%라서 한 유형이 늘면 다른 유형의 비중은 자동으로 줄어듭니다(비중이 줄었다고 건수가 준 것은 아님). 특정 달에 크게 튄 칸은 한 주소나 특정 날 때문일 수 있으니 아래 일별 그래프와 3번 화면에서 확인하세요. 1년 자료라 매년 반복되는 계절성인지는 알 수 없습니다.`,
      more: `<b>분류 변경으로 보이는 점</b>: 환경보호국(DEP)의 「상수도(Water System)」와 「하수(Sewer)」는 2026-07-29에 신고가 끝나고, 같은 내용(소화전, 누수, 탁한 물 등)이 「상수도 유지보수(Water Maintenance)」·「하수 유지보수(Sewer Maintenance)」로 이어집니다. 그래서 8~10월의 「유지보수」 비중이 높게 나오는 것은 민원 변화가 아니라 이름 변경의 영향입니다. 공식 공지로 확인하지 않았으므로 기본은 원래 유형으로 보여 주고, 위 체크 상자를 켜면 이 표에서만 합쳐 봅니다. 다른 화면과 원자료는 바뀌지 않습니다.<br>` +
        `구성 차이 D = 0.5 × 합계(|그 달 유형 비중 − 1년 유형 비중|), 모든 유형 사용. 자세한 내용: <a href="../reports/monthly_composition_report.md" target="_blank">월별 구성 보고서</a>` +
        (reclassShown ? "" : "") });
  }
  // ---------- weather vs complaint surges (reports/weather_report.md) ----------
  let WX_G = null;
  const WX_MAP = { "Snow or Ice": "snow_ice", "HEAT/HOT WATER": "heat", "Street Condition": "pothole", "Water System": "hydrant", "Water Maintenance": "hydrant",
    "Sewer": "sewer_flood", "Sewer Maintenance": "sewer_flood", "Damaged Tree": "tree", "Noise - Street/Sidewalk": "noise_street", "Noise - Residential": "noise_res" };
  const WX_COL = { snow: "#9ec5f4", cold: "#c9d3e0", hot: "#f6b98a", heavy_rain: "#a8d5ba", windy: "#e3d3a6" };
  function weatherCard() {
    const W = window.WEATHER_DATA; if (!W) return "";
    const fromSel = st.p >= 0 ? WX_MAP[P[st.p]] : null;
    const g = WX_G || fromSel || "snow_ice", G = W.groups.find(x => x.id === g), D = W.daily;
    const EV = W.inputs.events, evLab = e => EV[e].label;
    const [cnt, usual] = D[g];
    // chart: daily count vs usual level, symlog-ish y, event windows shaded
    const Wd = 900, H = 230, L = 44, Rr = 10, Tp = 10, B = 26, n = D.date.length, pw = Wd - L - Rr, ph = H - Tp - B;
    const tr = v => Math.log10(1 + Math.max(0, v)), maxY = Math.max(...cnt.map(tr), ...usual.map(v => tr(v || 0)), 1);
    const X = i => L + (i + 0.5) / n * pw, Y = v => Tp + ph - tr(v) / maxY * ph;
    let svg = "";
    G.related.forEach(e => D.windows[e].forEach((f, i) => { if (f) svg += `<rect x="${(X(i) - pw / n / 2).toFixed(1)}" y="${Tp}" width="${(pw / n + 0.4).toFixed(1)}" height="${ph}" fill="${WX_COL[e]}" opacity="0.75"/>`; }));
    [1, 10, 100, 1000, 10000, 100000].filter(v => tr(v) <= maxY).forEach(v => { svg += `<line x1="${L}" x2="${Wd - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v >= 10000 ? v / 10000 + "만" : v >= 1000 ? v / 1000 + "천" : v}</text>`; });
    D.date.forEach((d, i) => { if (d.slice(8) === "01" || i === 0) svg += `<text x="${X(i)}" y="${H - 8}" font-size="11" fill="var(--muted)" text-anchor="middle">${+d.slice(5, 7)}월</text>`; });
    const path = arr => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v || 0).toFixed(1)}`).join("");
    svg += `<path d="${path(usual)}" fill="none" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 3"/><path d="${path(cnt)}" fill="none" stroke="var(--s1)" stroke-width="1.6"/>`;
    D.date.forEach((d, i) => { const evs = Object.keys(EV).filter(e => D.events[e][i]).map(evLab);
      svg += `<rect class="hit" x="${(X(i) - pw / n / 2).toFixed(1)}" y="${Tp}" width="${(pw / n).toFixed(2)}" height="${ph}" fill="transparent" data-tip="${esc(`<b>${d}</b><br>신고 ${fmtN(cnt[i])}건 · 평소 ${fmtN(Math.round(usual[i] || 0))}건<br>최고 ${D.tmax[i]}°C · 최저 ${D.tmin[i]}°C · 비 ${D.prcp[i]}mm · 눈 ${D.snow[i]}mm${evs.length ? "<br>" + evs.join(", ") : ""}`)}"/>`; });
    const chart = `<div class="legend"><span><i style="background:var(--s1)"></i>하루 신고 수</span><span><i style="background:var(--muted)"></i>평소 수준 (같은 달·같은 요일 중앙값, 점선)</span>${G.related.map(e => `<span><i style="background:${WX_COL[e]}"></i>${esc(evLab(e))}</span>`).join("")}<span>세로축: 로그 눈금</span></div>` +
      `<svg class="chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="하루 신고 수와 날씨 사건">${svg}</svg>`;
    const cmp = W.compare.filter(r => r.group === g).sort((a, b) => (b.related - a.related) || (b.rel_main - a.rel_main));
    const fx = v => `×${v >= 10 ? v.toFixed(0) : v.toFixed(2)}`;
    const tbl = table(["날씨 사건", "사건 날 수", "평소 대비 (사건 기간 ÷ 같은 달 다른 날)", "가장 큰 하루 제외", "집중 주소 제외", "판정"],
      cmp.map(r => ({ cls: r.related ? "hlrow" : "", cells: [esc(r.event_label) + (r.related ? "" : " <small>(참고)</small>"), fmtN(r.event_days), `<b>${fx(r.rel_main)}</b>`, fx(r.rel_drop_max), fx(r.rel_no_focus), esc(r.status)] })), { num: [1, 2, 3, 4] });
    const clo = W.closure.filter(r => r.group === g);
    const cloT = clo.length ? details("날씨 사건 때 종료 기록이 늦어졌나요? (단순 비교)", table(["날씨 사건", "사건 기간 접수", "7일 안에 종료 기록 없음: 사건 기간", "같은 달 다른 날"],
      clo.map(r => [esc(r.event_label), fmtN(r.n_event), `${r.open7_event_pct.toFixed(1)}%`, `${r.open7_other_pct.toFixed(1)}%`]), { num: [1, 2, 3] }) + `<p class="note">세부 유형·지역을 맞추지 않은 단순 비교입니다. 관찰 마감 2026-11-11 가정.</p>`) : "";
    const top = W.top.filter(r => r.group === g);
    const topT = details("신고가 평소보다 가장 많았던 5일과 그날 날씨", table(["날짜", "신고 (평소)", "눈 (전날)", "쌓인 눈", "비 (전날)", "최고 / 최저", "날씨 사건"],
      top.map(r => [`${r.date} (${r.dow})`, `${fmtN(r.n)} (${fmtN(Math.round(r.usual))})`, `${r.snow_mm} (${r.snow_prev_mm})mm`, `${r.snow_depth_mm ?? "-"}mm`, `${r.prcp_mm} (${r.prcp_prev_mm})mm`, `${r.tmax} / ${r.tmin}°C`, esc(r.events || "-")]), { num: [1] }));
    const sel = `<label class="tgl">민원 묶음 <select id="wx-g">${W.groups.map(x => `<option value="${x.id}"${x.id === g ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>`;
    const READ = {
      snow_ice: `${T.f}눈이 온 날부터 2일 동안 평소의 약 14배, 혹한 때 약 12배였습니다.`,
      heat: `${T.f}최저 -7°C 이하인 날에는 평소의 약 1.9배였습니다. 10월 중순의 급증은 날씨 사건이 아니라 난방 시즌 시작 무렵입니다.`,
      pothole: `${T.f}눈·추위·큰비가 온 날에는 오히려 평소보다 적었습니다(약 0.8배). 가장 많았던 날은 2월 폭설이 녹던 2/26~28입니다. ${T.m}3월 집중은 그날 날씨보다 겨울 뒤 한꺼번에 드러나는 모습에 가까워 보입니다(확인 안 됨).`,
      hydrant: `${T.f}최고 32°C 이상인 날 평소의 약 3.4배였습니다. 단순 비교로는 이때 빨리 종료 기록이 남았지만, 즉시 종결되는 소화전 긴급 신고가 몰린 영향입니다. 세부 유형·자치구·월을 맞추면 신고가 몰릴 때 오히려 조금 늦어졌습니다(+3%p, surge_delay_report).`,
      sewer_flood: `${T.f}비 25mm 이상인 날과 다음 날 평소의 약 2.6배였습니다.`,
      tree: `${T.f}큰비 때 약 2.3배, 바람 센 날 약 2배였습니다. 2026-06-07처럼 센트럴파크에 큰비가 없었던 급증은 국지적 폭풍일 수 있습니다.`,
      noise_street: `${T.f}더운 날에도 차이가 작고(약 1.2배), 비·추위·바람 센 날에는 적었습니다.`,
      noise_res: `${T.f}어느 날씨에서도 평소와 비슷했습니다.`,
      all: `${T.f}전체 신고는 추운 날에만 약 1.3배였고, 다른 날씨에서는 평소와 비슷했습니다.` }[g];
    return card({ id: "when-wx", cls: "fixed", q: "날씨가 궂은 날 관련 민원이 늘어나나요?",
      what: `<span class="fixtag">현재 선택과 무관한 전체 참고 결과 (유형을 고르면 관련 묶음을 먼저 보여 줌)</span> 눈·추위·더위·큰비·강풍이 있던 날의 신고를 「같은 달·같은 요일의 평소 수준」과 비교합니다.`,
      meta: meta("건 (로그 눈금), 배", "사건 기간 vs 같은 달의 다른 날", "뉴욕시 전체 · 하루 전체가 포함된 날 2025-11-02 ~ 2026-10-30 · 날씨: NOAA 센트럴파크 관측소 1곳"),
      body: sel + chart + tbl + cloT + topT,
      read: `${READ} ${T.w}관측소 1곳의 날씨로 뉴욕시 전체를 대신했고, 눈·비·바람·추위가 같은 날 겹친 경우가 많아 어느 날씨 때문인지 나눌 수 없습니다. 함께 움직였다는 관찰이지 원인이 아닙니다.`,
      more: "날씨 사건: 눈 = 새로 내린 눈 25mm 이상(그날~2일 뒤), 큰비 = 강수 25mm 이상(그날~다음 날), 더운 날 = 최고 32°C 이상(그날), 추운 날 = 최저 -7°C 이하(그날~다음 날), 바람 센 날 = 하루 평균 풍속 상위 5%(4.4 m/s 이상, 그날~다음 날). 하루 배율 = (신고+1) ÷ (평소+1), 평소 = 같은 달·같은 요일 중앙값. 판정: 기본·가장 큰 하루 제외·집중 주소 제외 모두 ×1.25 이상이면 「많음 (유지)」, 모두 ×0.8 이하이면 「적음 (유지)」. 「(참고)」 행은 관련이 적은 날씨로, 사건이 겹쳐서 생긴 차이일 수 있습니다. 자세한 내용: reports/weather_report.md" });
  }
  function renderWhen() {
    $("when-applies").innerHTML = appliesBar("when");
    const R = regionInfo();
    const selName = [R.name, st.p >= 0 ? pShort(st.p) : "", st.a >= 0 ? aName(st.a) : ""].filter(Boolean).join(" · ");
    const sAll = { b: -1, a: -1, p: -1, m: -1, x: st.x };
    // monthly per-day average (FULL_DAY days only), all 12 months
    const monthly = s => M.map((_, i) => {
      let full;
      if (st.cd >= 0 && s === "sel") full = cbRows(Object.assign({}, st, { m: -1 })).filter(r => r[0] === st.cd && r[3] === i && r[5] === 1).reduce((t, r) => t + r[6], 0);
      else full = sum(cRows(Object.assign({}, s === "sel" ? st : sAll, { m: i })).filter(r => r[5] === 1));
      const d = D.full_days_per_month[i]; return { full, days: d, v: d ? full / d : 0 };
    });
    const ms = monthly("sel"), ma = monthly("all");
    const avg = arr => { const f = arr.reduce((t, x) => t + x.full, 0), d = arr.reduce((t, x) => t + x.days, 0); return d ? f / d : 0; };
    const as = avg(ms), aa = avg(ma);
    const items = ms.map((x, i) => ({ label: mShort(i), value: x.v, valueText: x.v < 10 ? x.v.toFixed(1) : fmtN(x.v), color: st.m < 0 || st.m === i ? "var(--s1)" : "var(--dim)",
      tip: `<b>${mLabel(i)}</b><br>하루 평균 ${x.v < 10 ? x.v.toFixed(2) : fmtN(x.v)}건 = ${fmtN(x.full)}건 ÷ ${x.days}일` }));
    const idxSel = ms.map(x => as ? x.v / as * 100 : null), idxAll = ma.map(x => aa ? x.v / aa * 100 : null);
    const peak = ms.reduce((b, x, i) => x.v > ms[b].v ? i : b, 0), low = ms.reduce((b, x, i) => x.v < ms[b].v ? i : b, 0);
    const c1 = card({ id: "when-c1", q: "어느 달에 신고가 많았나요?",
      what: `선택한 대상(${esc(selName)})의 월별 하루 평균 신고 수와, 전체 신고와의 모양 비교입니다.`,
      meta: meta("건/일 (하루 평균)", "아래 선 그래프: 각 달의 하루 평균 ÷ 12개월 하루 평균 × 100 (100 = 평소 수준). 실선 = 선택 대상, 점선 = 전체 신고", `하루 전체가 포함된 날만 (2025-11-02 ~ 2026-10-30) · ${st.x ? "집중 주소 제외" : "집중 주소 포함"}`),
      body: (as ? vbars(items, { w: wOf("when-body") - 40, labels: true, aria: "월별 하루 평균" }) +
        lines(M.map((_, i) => mShort(i)), [{ name: "선택", color: "var(--s1)", values: idxSel }, { name: "전체", color: "#8a8984", values: idxAll, dash: true }],
          { w: wOf("when-body") - 40, h: 170, ref: 100, fmtAxis: v => Math.round(v), tips: i => `<b>${mLabel(i)}</b><br>선택 대상 ${idxSel[i] ? Math.round(idxSel[i]) : "-"} · 전체 ${Math.round(idxAll[i])} (100 = 평소)`, aria: "월별 지수" })
        : emptyBox(NO_DATA)),
      read: as ? `${T.f}가장 많은 달은 ${mLabel(peak)}(하루 ${fmtN(ms[peak].v)}건, 평소의 ${Math.round(idxSel[peak])}%), 가장 적은 달은 ${mLabel(low)}(평소의 ${Math.round(idxSel[low])}%)입니다. ${idxSel[peak] >= 250 ? "한두 달에 크게 몰린 경우 몇몇 주소나 특정 사건의 영향일 수 있으니 3번 화면에서 확인하세요. " : ""}${T.w}1년 자료라 매년 반복되는 계절성인지 알 수 없습니다.${st.m >= 0 ? " 기간을 한 달로 골라도 이 그래프는 12개월을 모두 보여 주고 선택한 달을 진하게 표시합니다." : ""}` : "",
      more: "달마다 날 수가 달라 건수 대신 하루 평균으로 비교합니다. 2025년 11월과 2026년 10월은 일부 시간만 수집된 첫날·마지막 날을 빼서 각각 29일·30일 기준입니다." });
    // weekday + hour (FULL_DAY)
    let c2, c3;
    if (st.cd >= 0) {
      c2 = card({ q: "요일·시간대에 따라 달라지나요?", body: emptyBox(`세부 지역(${esc(cbLabel(st.cd))}) 단위의 요일·시간대 집계는 지원하지 않습니다. 자치구 단위로 보려면 세부 지역을 「${esc(bLabel(st.b))} 전체」로 바꾸세요.`, true) });
      c3 = "";
    } else {
      const f = (rows, s) => rows.filter(r => (s.b < 0 || r[0] === s.b) && (s.a < 0 || r[1] === s.a) && (s.p < 0 || r[2] === s.p) && (s.m < 0 || r[3] === s.m) && (!s.x || r[4] === 0));
      const sSel = st, sA = Object.assign({}, sAll, { m: st.m });
      const daysDow = dw => M.reduce((t, _, i) => t + (st.m < 0 || st.m === i ? (DAYS_MD[i + "|" + dw] || 0) : 0), 0);
      const wd = s => [1, 2, 3, 4, 5, 6, 7].map(dw => { const n = f(WD, s).filter(r => r[5] === dw).reduce((t, r) => t + r[6], 0), d = daysDow(dw); return { n, d, v: d ? n / d : 0 }; });
      const ws = wd(sSel), wa = wd(sA), wsm = ws.reduce((t, x) => t + x.v, 0) / 7, wam = wa.reduce((t, x) => t + x.v, 0) / 7;
      const DN = ["월", "화", "수", "목", "금", "토", "일"];
      const wItems = ws.map((x, i) => ({ label: DN[i] + "요일", value: wsm ? x.v / wsm * 100 : 0, valueText: `${wsm ? Math.round(x.v / wsm * 100) : 0} (하루 ${x.v < 10 ? x.v.toFixed(1) : fmtN(x.v)}건)`, valueShort: `${wsm ? Math.round(x.v / wsm * 100) : 0}`,
        value2: wam ? wa[i].v / wam * 100 : 0, value2Text: `${wam ? Math.round(wa[i].v / wam * 100) : 0}`, tip: `<b>${DN[i]}요일</b><br>선택 대상 하루 평균 ${fmtN(x.v)}건 (${fmtN(x.n)}건 ÷ ${x.d}일)<br>전체 하루 평균 ${fmtN(wa[i].v)}건` }));
      c2 = card({ id: "when-c2", q: "어느 요일에 신고가 많나요?", what: "요일별 하루 평균을 그 대상의 7일 평균과 비교한 값입니다(100 = 그 대상의 평소 수준).",
        meta: meta("지수 (100 = 평소)", "회색 = 전체 신고의 같은 지수", `하루 전체가 포함된 날 · ${st.m >= 0 ? mLabel(st.m) : "12개월"}`),
        body: ws.some(x => x.n) ? legend([["var(--s1)", "선택 대상"], ["#c9c8c3", "전체 신고"]]) + hbars(wItems, { series: [{ key: "value", color: "var(--s1)" }, { key: "value2", color: "#c9c8c3" }], w: wOf("when-body") - 40, labelW: 70, valW: 170, aria: "요일" }) : emptyBox(NO_DATA),
        read: `${T.w}요일 차이에는 신고하는 사람의 생활 리듬과 업무 일정이 함께 섞여 있습니다.` });
      const hr = s => { const rr = f(HR, s); const tot = rr.reduce((t, r) => t + r[6], 0); return Array.from({ length: 24 }, (_, h) => { const n = rr.filter(r => r[5] === h).reduce((t, r) => t + r[6], 0); return tot ? n / tot * 100 : null; }); };
      const hs = hr(sSel), ha = hr(sA); const hp = hs.reduce((b, v, i) => (v || 0) > (hs[b] || 0) ? i : b, 0);
      const night = [22, 23, 0, 1, 2, 3].reduce((t, h) => t + (hs[h] || 0), 0), nightA = [22, 23, 0, 1, 2, 3].reduce((t, h) => t + (ha[h] || 0), 0);
      c3 = card({ id: "when-c3", q: "하루 중 언제 신고가 들어오나요?", what: "각 시간대에 접수된 신고가 그 대상 전체의 몇 %인지 보여 줍니다.",
        meta: meta("% (하루 전체 = 100%)", "점선 = 전체 신고", `하루 전체가 포함된 날 · ${st.m >= 0 ? mLabel(st.m) : "12개월"}`),
        body: hs.some(v => v) ? lines(Array.from({ length: 24 }, (_, h) => `${h}시`), [{ color: "var(--s1)", values: hs }, { color: "#8a8984", values: ha, dash: true }],
          { w: wOf("when-body") - 40, h: 200, fmtAxis: v => v.toFixed(0) + "%", tips: i => `<b>${i}시대</b><br>선택 대상 ${(hs[i] || 0).toFixed(1)}% · 전체 ${(ha[i] || 0).toFixed(1)}%`, aria: "시간대" }) : emptyBox(NO_DATA),
        read: hs.some(v => v) ? `${T.f}가장 많은 시간대는 ${hp}시대(${hs[hp].toFixed(1)}%)입니다. 밤 10시~새벽 4시 접수 비중은 ${night.toFixed(1)}%(전체 ${nightA.toFixed(1)}%)입니다.` : "" });
    }
    // daily spikes
    let c4;
    const dly = X.daily, topT = dly.top_types;
    let series = null, why = "";
    if (st.cd >= 0) why = "세부 지역 단위의 일별 집계는 지원하지 않습니다.";
    else if (st.a >= 0) why = "기관 조건이 있으면 일별 집계를 지원하지 않습니다.";
    else if (st.x) why = "집중 주소 제외 조건에서는 일별 집계를 지원하지 않습니다.";
    else if (st.p >= 0 && !topT.includes(st.p)) why = "일별 집계는 신고가 많은 15개 유형만 지원합니다.";
    else series = st.p < 0 ? (st.b < 0 ? dly.all : dly.by_b[st.b]) : (st.b < 0 ? dly.by_p[st.p] : dly.by_bp[`${st.b}|${st.p}`]);
    if (!series && !why) why = NO_DATA;
    if (why) c4 = card({ q: "특정 날짜에 갑자기 늘었나요?", body: emptyBox(why, true) });
    else {
      const dates = dly.dates; let ix = dates.map((_, i) => i);
      if (st.m >= 0) ix = ix.filter(i => dates[i].slice(0, 7) === M[st.m]);
      const vals = ix.map(i => series[i] || 0), full = ix.filter(i => dates[i] >= "2025-11-02" && dates[i] <= "2026-10-30");
      const fv = full.map(i => series[i] || 0).sort((a, b) => a - b), med = fv.length ? fv[Math.floor(fv.length / 2)] : 0, total = vals.reduce((a, b) => a + b, 0);
      const topd = full.map(i => [i, series[i] || 0]).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const marks = topd.map(([i]) => ix.indexOf(i));
      c4 = card({ id: "when-c4", q: "특정 날짜에 갑자기 늘었나요?", what: "하루하루의 신고 수입니다. 파란 띠는 신고가 가장 많았던 5일입니다.",
        meta: meta("건/일", "그 기간 하루 신고 수의 중앙값(보통의 날)", `${esc(selName)} · ${st.m >= 0 ? mLabel(st.m) : "12개월"}`),
        body: total ? lines(ix.map(i => dates[i].slice(5)), [{ color: "var(--s1)", values: vals }], { w: wOf("when-body") - 40, h: 200, marks, ref: med,
          tips: k => `<b>${dates[ix[k]]}</b><br>${fmtN(vals[k])}건${dates[ix[k]] === "2025-11-01" || dates[ix[k]] === "2026-10-31" ? " (일부 시간만 수집된 날)" : ""}`, aria: "일별" }) +
          table(["날짜", "신고 수", "보통의 날 대비", "1년(기간) 신고 중 비중"], topd.map(([i, n]) => [dates[i], fmtN(n), med ? `${(n / med).toFixed(1)}배` : "-", pct(n, total)]), { num: [1, 2, 3] }) : emptyBox(NO_DATA),
        read: total ? `${T.f}가장 많은 날 하루가 이 기간 신고의 ${pct(topd[0][1], total)}입니다. 하루가 큰 몫을 차지하면 「특정 날의 급증」, 막대가 여러 달 고르게 높으면 「이어지는 패턴」입니다. ${T.w}급증 원인(날씨, 행사, 시스템)은 이 자료로 확인하지 않았습니다.` : "",
        more: "보통의 날 = 하루 전체가 포함된 날들의 하루 신고 수 중앙값. 첫날(2025-11-01)과 마지막 날(2026-10-31)은 일부 시간만 들어 있어 급증 목록에서 뺐습니다." });
    }
    $("when-body").innerHTML = c1 + monthCompCard([R.name, st.a >= 0 ? aName(st.a) : ""].filter(Boolean).join(" · ") + (st.x ? " · 집중 주소 제외" : "")) + c2 + (c3 || "") + c4 + weatherCard();
  }

  // ======================= 3. PLACES =======================
  // ---------- requests around places (OSM; reports/place_centred_report.md) ----------
  let PL_C = "bar";
  function placeCard() {
    const PL = window.PLACE_DATA; if (!PL) return "";
    const LBL = { bar: "술집·클럽", station: "지하철·기차역", school: "학교", auto: "자동차 정비·세차", park: "공원·놀이터", hospital: "병원", cemetery: "묘지" };
    const VERDICT = { bar: "장소·시간 모두 맞음", station: "장소는 뚜렷, 시간은 일부", school: "양보다 시간대가 다름", auto: "시간대가 맞음", park: "장소는 맞지만 시간 신호 없음", hospital: "관계 없음", cemetery: "관계 없음" };
    const fx = v => v == null ? "-" : `×${(+v).toFixed(2)}`, pp = v => v == null ? "-" : `${v > 0 ? "+" : ""}${(+v).toFixed(1)}%p`, pc = v => v == null ? "-" : `${(+v).toFixed(1)}%`;
    const pName = n => P.indexOf(n) >= 0 ? pShort(P.indexOf(n)) : (KO[n] || n);
    // summary: one line per place = expected type with the largest composition ratio (n_near >= 300) + main time window for expected types pooled
    // summary picks follow the report (one expected type and one time window per place, fixed before looking at results)
    const PICK = { bar: ["Noise - Commercial", "Noise - Commercial"], station: ["Homeless Person Assistance", "Homeless Person Assistance"], school: ["Illegal Parking", "Illegal Parking"],
      auto: ["Illegal Parking", "Illegal Parking"], park: ["Animal in a Park", "기대 유형"], hospital: ["Illegal Parking", null], cemetery: ["Illegal Dumping", null] };
    const WIN1 = { school: "평일 등하교" };
    const sumRows = Object.keys(LBL).map(c => {
      const cs = PL.comp.find(r => r.cat === c && r.problem === PICK[c][0]);
      const ts = PICK[c][1] && PL.time.find(r => r.cat === c && r.group === PICK[c][1] && (!WIN1[c] || r.window.startsWith(WIN1[c])));
      return { cls: c === PL_C ? "hlrow" : "", attr: ` data-plc="${c}"`, cells: [esc(LBL[c]), cs ? `${esc(pName(cs.problem))} <b>${fx(cs.ratio)}</b> <small>(상위 30 주소 제외 ${fx(cs.ratio_excl)})</small>` : "-",
        ts ? `${esc(ts.group === "기대 유형" ? "기대 유형 합계" : pName(ts.group))} · ${esc(ts.window)} <b>${pp(ts.diff_main)}</b>` : "-", esc(VERDICT[c])] }; });
    const comp = PL.comp.filter(r => r.cat === PL_C);
    const ct = table(["기대 유형", "100m 안 건수", "비중: 100m 안 / 100~400m", "구성 비율", "상대 밀도", "상위 30 주소 제외"],
      comp.map(r => [esc(pName(r.problem)), fmtN(r.n_near), `${pc(r.share_near)} / ${pc(r.share_ring)}`, `<b>${fx(r.ratio)}</b>`, fx(r.dens_main), fx(r.dens_excl)]), { num: [1, 3, 4, 5] });
    const tt = table(["유형", "시간대", "100m 안", "100~400m", "차이", "상위 30 주소 제외"],
      PL.time.filter(r => r.cat === PL_C).map(r => ({ cls: r.group === "그 밖의 유형" ? "small" : "", cells: [esc(r.group === "기대 유형" ? "(기대 유형 합계)" : r.group === "그 밖의 유형" ? "(그 밖의 유형)" : pName(r.group)), esc(r.window), pc(r.win_near), pc(r.win_ring), `<b>${pp(r.diff_main)}</b>`, pp(r.diff_excl)] })), { num: [2, 3, 4, 5] });
    const ex = PL.explore.filter(r => r.cat === PL_C).slice(0, 6);
    const sel = `<label class="tgl">장소 <select id="pl-c">${Object.entries(LBL).map(([k, v]) => `<option value="${k}"${k === PL_C ? " selected" : ""}>${v}</option>`).join("")}</select></label>`;
    return card({ id: "where-place", cls: "fixed", q: "장소 바로 옆에서는 어떤 신고가, 언제 더 많은가요?",
      what: `<span class="fixtag">현재 선택과 무관한 전체 참고 결과</span> 술집·학교·공원·역·병원·자동차 정비소·묘지(OpenStreetMap) <b>100m 안</b>의 신고를 <b>100~400m</b>의 신고와 비교합니다. 같은 동네 안에서 「바로 옆 vs 조금 떨어진 곳」을 비교하므로 지역 차이가 줄어듭니다 ${help("poi")}.`,
      meta: meta("배, %p", "100m 안 vs 100~400m", `좌표가 있는 신고 ${fmtN(PL.meta.requests_with_coordinates)}건 · 장소 종류와 기대 유형·시간대는 결과를 보기 전에 정함`),
      body: table(["장소", "대표 기대 유형: 100m 안 비중 ÷ 100~400m 비중", "장소에 맞는 시간대: 100m 안 − 100~400m", "판단"], sumRows, {}) + `<p class="note">행을 누르거나 아래에서 장소를 고르면 자세한 표가 바뀝니다.</p>` +
        sel + `<h4 class="minih">${esc(LBL[PL_C])}: 기대 유형의 비중</h4>` + ct +
        `<h4 class="minih">${esc(LBL[PL_C])}: 장소에 맞는 시간대인가?</h4>` + tt +
        (ex.length ? details("예상하지 않았지만 바로 옆에서 많은 신고 (탐색용)", table(["유형", "100m 안 건수", "구성 비율"], ex.map(r => [esc(pName(r.problem)), fmtN(r.n_near), fx(r.ratio)]), { num: [1, 2] }) + `<p class="note">결과를 본 뒤 찾은 것이라 「발견」이 아니라 더 확인할 후보입니다.</p>`) : ""),
      read: `${T.f}술집 바로 옆은 상업시설 소음 비중이 약 4배이고 그 소음은 금·토 밤에 더 몰립니다. 역 바로 옆은 노숙인 지원 신고가 약 4.6배입니다. 학교·자동차 정비소 주변 불법 주차는 양은 비슷하지만 등하교·평일 낮에 더 몰립니다. 병원·묘지는 관계가 없습니다. 신고가 가장 많은 30개 주소를 빼도 결론은 같습니다(학교 주변 「교통」만 한 주소의 영향). ${T.w}신고 좌표는 신고된 주소이며 소음·문제의 실제 발생원이 아닙니다. OSM에는 빠진 장소가 있을 수 있고, 장소 종류끼리 겹치는 영향(술집이 많은 곳에 역·식당도 많음)은 떼어 내지 않았습니다. 원인이 아니라 함께 나타나는 관계입니다.`,
      more: "구성 비율 = 그 유형이 100m 안 신고에서 차지하는 비중 ÷ 100~400m에서의 비중. 상대 밀도 = (100m 안 밀도 ÷ 100~400m 밀도)를 그 유형과 모든 신고에 대해 각각 구해 나눈 값(합계 기준). 시간대 차이 = 그 시간대에 들어온 비율의 차이(100m 안 − 100~400m). 「그 밖의 유형」은 비교용. 자세한 내용: reports/place_centred_report.md" });
  }
  // ---------- concentrated addresses: surroundings (OSM) and reporting pattern (reports/poi_report.md) ----------
  function poiCard() {
    const PD = window.POI_DATA; if (!PD) return "";
    const pc = v => v == null ? "-" : `${(+v).toFixed(0)}%`, f1 = v => v == null ? "-" : (+v).toFixed(1);
    const sel = st.b >= 0 ? B[st.b] : null;
    const ch = r => r.mobile_pct >= 90 ? `앱 ${pc(r.mobile_pct)}` : r.online_pct >= 90 ? `온라인 ${pc(r.online_pct)}` : r.phone_pct >= 50 ? `전화 ${pc(r.phone_pct)}` : `온라인 ${pc(r.online_pct)}·앱 ${pc(r.mobile_pct)}`;
    const kind = r => r.within_1min_pct >= 20 ? "몰아서 연속 접수" : r.active_days >= 300 && r.per_active_day >= 10 ? "매일 꾸준히 접수" : "-";
    const rows = PD.top.map(r => ({ cls: sel && r.borough === sel ? "hlrow" : "", cells: [r.rank, `${esc(BKO[r.borough] || r.borough)} · ${esc(r.address_key)}`, `${esc(KO[r.main_type] || r.main_type)} ${f1(r.main_share)}%`, fmtN(r.n),
      `${r.active_days}일`, `<b>${f1(r.within_1min_pct)}%</b> <small>(${f1(r.b_within_1min)}%)</small>`, `${ch(r)} <small>(비교: 온라인 ${pc(r.b_online)}·앱 ${pc(r.b_mobile)})</small>`, esc(kind(r)), esc(r.notably_more_within_250m || "두드러진 장소 없음")] }));
    const sm = table(["장소 (OSM)", "250m 안에 1곳 이상인 집중 주소", "비교 주소보다 두드러진 집중 주소", "백분위 중앙값 (50 = 중간)"],
      PD.summary.map(r => [esc(r.category), `${r.targets_with_any_250m} / ${PD.top.length}`, r.targets_notably_more, (+r.median_pctile).toFixed(0)]), { num: [1, 2, 3] });
    const cats = [["school", "학교"], ["bar", "술집·클럽"], ["park", "공원"], ["worship", "종교시설"], ["station", "역"], ["parking", "주차장"]];
    const ct = table(["묶음 (비교 주소 수)", ...cats.map(c => c[1])], PD.corr.map(r => [`${esc(BKO[r.borough] || r.borough)} ${esc(KO[r.main_type] || r.main_type)} (${fmtN(r.addresses)})`, ...cats.map(([k]) => r[k] == null ? "-" : (+r[k]).toFixed(2))]), { num: [1, 2, 3, 4, 5, 6] });
    const fg = PD.focus_gap.filter(r => r.gap !== "첫 신고"), fgT = fg.reduce((t, r) => t + r.n, 0);
    const order = ["10초 이내", "11~60초", "1~10분", "10~60분", "1시간 초과"];
    const fgt = table(["앞 신고와의 간격", "신고", "비중"], order.map(k => fg.find(r => r.gap === k)).filter(Boolean).map(r => [esc(r.gap), fmtN(r.n), pctF(r.n, fgT)]), { num: [1, 2] });
    return card({ id: "places-poi", cls: "fixed", q: "신고가 몰린 주소: 주변 장소 때문인가요?",
      what: `<span class="fixtag">현재 선택과 무관한 전체 참고 결과 (신고 상위 30개 주소)</span> 집중 주소 반경 250m의 학교·술집·클럽·카지노·묘지·공원·쇼핑몰 등 13종 장소(OpenStreetMap)를, 같은 자치구·같은 유형 신고가 5건 이상인 다른 주소들과 비교하고, 신고가 들어온 방식도 함께 봅니다 ${help("poi")}.`,
      meta: meta("곳, %", "집중 주소 vs 같은 자치구·유형의 다른 주소", `OSM 장소 약 3만 2천 곳 (자료 기준 ${esc(PD.osm_timestamp.slice(0, 10))}) · 번지 주소`),
      body: `<h4 class="minih">주변 장소: 비교 주소 가운데 어디쯤인가?</h4>` + sm +
        details("신고 수와 주변 장소 수의 관계 (순위 상관, 비교 주소 전체)", ct + `<p class="note">0에 가까우면 관계가 없다는 뜻입니다. 주소가 1,000곳 이상인 묶음만 보여 줍니다.</p>`) +
        `<h4 class="minih">신고가 들어온 방식 (상위 30개 주소)</h4>` +
        details("30개 주소 모두 보기", table(["순위", "주소", "주된 유형", "신고", "신고가 있었던 날", "1분 안 연속 (비교)", "접수 경로", "패턴", "250m 안 두드러진 장소"], rows, { num: [0, 3, 4] }), "tbl") +
        details("655 East 230th St: 앞 신고와의 간격", fgt),
      read: `${T.f}집중 주소 주변의 장소 수는 비교 주소들 가운데 대체로 중간이고(백분위 중앙값 37~56), 비교 주소 전체에서도 신고 수와 주변 장소 수의 관계는 거의 없습니다(순위 상관 -0.12~+0.06). 대신 다수가 한 가지 접수 경로로만 들어오고, 「1분 안에 연속 접수」 또는 「1년 300일 이상 매일 접수」 패턴을 보입니다. 메트로폴리탄 미술관 앞 노점 신고처럼 장소 자체가 이유로 보이는 경우는 드뭅니다. ${T.m}적은 수의 신고자가 반복 접수했을 가능성이 있지만, 신고자 정보가 없어 확인할 수 없습니다. ${T.w}특정 주민을 추정하는 근거로 쓰지 마세요. 장소가 가깝다고 원인이라는 뜻이 아니며, OSM은 빠진 장소가 있을 수 있습니다.`,
      more: "장소: OpenStreetMap(© OpenStreetMap contributors, ODbL) 13종. 주소 좌표 = 그 주소 신고들의 위도·경도 중앙값. 두드러짐 = 250m 안의 수가 비교 주소의 90백분위 이상이고 1곳 이상. 1분 안 연속 = 같은 주소의 앞 신고와 60초 이내. 비교 = 같은 자치구·유형의 다른 주소 신고(상위 30곳 제외). 패턴 분류: 1분 안 연속 20% 이상 = 「몰아서 연속 접수」, 300일 이상·하루 10건 이상 = 「매일 꾸준히 접수」. 자세한 내용: reports/poi_report.md" });
  }
  // ---------- which addresses become repeated-request addresses (reports/repeat_profile_report.md) ----------
  let RPT_T = null;
  function repeatProfileCard() {
    const RP = window.REPEAT_PROFILE_DATA; if (!RP) return "";
    const TYPES = RP.coverage.map(r => r.type);
    const fromSel = st.p >= 0 && TYPES.includes(P[st.p]) ? P[st.p] : null;
    const T_ = RPT_T || fromSel || "Noise - Residential";
    const tName = t => P.indexOf(t) >= 0 ? pShort(P.indexOf(t)) : (KO[t] || t);
    const fx = v => v == null ? "-" : `×${(+v).toFixed(2)}`, pc = v => v == null ? "-" : `${(+v).toFixed(1)}%`;
    const POIL = { bar: "술집·클럽", school: "학교", park: "공원·놀이터", station: "역", worship: "종교시설", parking: "주차장", auto: "자동차 정비·세차", liquor: "주류 판매점" };
    const BL = { borough: "자치구", cls: "건물 유형", age: "준공 연도", units: "세대 수" };
    const termLabel = t => { if (t.startsWith("p_")) return POIL[t.slice(2).split(" ")[0]] || t; const [k, v] = t.split("="); return `${BL[k] || k}: ${k === "borough" ? (BKO[v] || v) : v}${k === "units" ? "세대" : ""}`; };
    const M = RP.model.filter(r => r.type === T_);
    const mrow = r => { const sig = r.status === "유지"; return { cls: sig && (r.main >= 1.25 || r.main <= 0.8) ? "hlrow" : "", cells: [esc(termLabel(r.term)), `<b>${fx(r.main)}</b>`, `${fx(r.lo)} ~ ${fx(r.hi)}`, fx(r["10days"]), fx(r.excl_top30), esc(r.status)] }; };
    const head = ["항목", "오즈비", "95% 구간", "10일 기준", "상위 30 주소 제외", "판정"];
    const bld = M.filter(r => /^(cls|units|age)=/.test(r.term)).sort((a, b) => a.term.localeCompare(b.term));
    const poiM = M.filter(r => r.term.startsWith("p_"));
    const boro = M.filter(r => r.term.startsWith("borough="));
    const pr = RP.profile.filter(r => r.type === T_ && r.group !== "전체");
    const prT = table(["묶음", "주소", "준공 연도 중앙값", "세대 수 중앙값", "층수 중앙값", "1~2가구 주택", "엘리베이터 없는 아파트", "엘리베이터 아파트", "주거+상가"],
      pr.map(r => [esc(r.group), fmtN(r.addresses), Math.round(r.median_year), (+r.median_units).toFixed(0), (+r.median_floors).toFixed(1), pc(r["cls_1~2가구 주택"]), pc(r["cls_엘리베이터 없는 아파트"]), pc(r["cls_엘리베이터 아파트"]), pc(r["cls_주거+상가"])]), { num: [1, 2, 3, 4, 5, 6, 7, 8] });
    const rateT = f => { const rr = RP.rates.filter(r => r.type === T_ && r.feature === f && r.addresses >= 30); const mx = Math.max(...rr.map(r => r.rep_rate), 1);
      return table(["구간", "주소", "반복 주소 비율 (5일+)", "", "10일+"], rr.map(r => [esc(r.level), fmtN(r.addresses), `<b>${pc(r.rep_rate)}</b>`, `<span class="hbarc"><i style="width:${(r.rep_rate / mx * 100).toFixed(1)}%;background:var(--s1)"></i></span>`, pc(r.rep10_rate)]), { num: [1, 2, 4] }); };
    const cov = RP.coverage.find(r => r.type === T_);
    const sel = `<label class="tgl">유형 <select id="rpt-t">${TYPES.map(t => `<option value="${esc(t)}"${t === T_ ? " selected" : ""}>${esc(tName(t))}</option>`).join("")}</select></label>`;
    return card({ id: "places-rpt", cls: "fixed", q: "어떤 주소가 「반복 신고 주소」가 되나요? (건물 연식·규모·유형과 주변 시설)",
      what: `<span class="fixtag">유형 조건만 반영 (6개 유형)</span> 그 유형 신고가 1건 이상 있는 주소 가운데 1년에 <b>5일 이상</b> 신고된 주소(반복 주소)를, 건물 정보(PLUTO)와 250m 안 시설(OpenStreetMap)로 비교합니다. 자치구·건물 유형·연식·세대 수·주변 시설을 함께 넣은 모델로 각 특성의 몫을 따로 봅니다 ${help("building")}.`,
      meta: meta("오즈비 (1보다 크면 반복 주소가 되기 쉬움), %", "기준: 브루클린 · 엘리베이터 없는 아파트 · 1920~46년 · 6~19세대 · 시설은 1 표준편차 늘 때", cov ? `${esc(tName(T_))} 신고 주소 ${fmtN(cov.addresses)}곳 중 PLUTO 연결 ${fmtN(cov.in_pluto)}곳 · 반복 주소 ${fmtN(cov.repeated)}곳` : ""),
      body: sel + `<h4 class="minih">반복 주소 vs 1일만 신고된 주소</h4>` + prT +
        `<h4 class="minih">건물 특성 (다른 특성을 함께 맞춘 값)</h4>` + table(head, bld.map(mrow), { num: [1, 2, 3, 4] }) +
        `<h4 class="minih">주변 시설 250m (1 표준편차 늘 때)</h4>` + table(head, poiM.map(mrow), { num: [1, 2, 3, 4] }) +
        details("자치구 (기준: 브루클린)", table(head, boro.map(mrow), { num: [1, 2, 3, 4] })) +
        details("단순 비율: 세대 수별", rateT("units")) + details("단순 비율: 건물 유형별", rateT("cls")) + details("단순 비율: 준공 연도별", rateT("age")),
      read: `${T.f}반복 주소를 가장 잘 가르는 것은 세대 수입니다(주거 소음·난방·비위생 모두 100세대 이상이 6~19세대보다 약 2.9~3.5배). 같은 규모라도 엘리베이터 아파트는 약 1.35배, 1~2가구 주택은 0.5~0.8배이고, 규모를 맞추면 1947년 이후 건물은 난방 반복이 적습니다(0.56~0.66배). 건물 조건을 맞춰도 브롱크스는 1.3~1.5배입니다. 주변 시설은 대부분 0.8~1.15배로 영향이 작고, 술집이 많은 곳은 오히려 주거 관련 반복이 적습니다. 강조 행은 기준을 바꿔도 유지되고 ×1.25 이상 또는 ×0.8 이하인 것입니다. ${T.w}세대가 많으면 신고할 사람도 많아 반복되기 쉬운 구조적 몫이 섞여 있습니다. 이미 신고된 주소 중에서의 비교이며, 소득·관리 상태는 자료에 없습니다. 공공임대주택(NYCHA) 여부를 넣어도 결과는 거의 같았고, 난방·비위생은 NYCHA 신고가 거의 없어 민간 건물에 대한 결과입니다. 건물주·기관 평가가 아닙니다.`,
      more: "모델: 로지스틱 회귀(반복 여부 ~ 자치구 + 건물 유형 9묶음 + 준공 연도 5구간 + 세대 수 7구간 + 250m 안 시설 8종의 log(1+수) 표준화). 판정 「유지」 = 5일 기준·10일 기준·상위 30 주소 제외 모두 같은 방향이고 95% 구간이 1을 포함하지 않음. 드물거나 결과가 한쪽뿐인 범주는 모델에서 제외. 건물 유형: 1~2가구 주택 A·B, 엘리베이터 없는 아파트 C, 엘리베이터 아파트 D, 콘도 R, 주거+상가 S, 상가·사무실 K·O, 차고·주차 G, 공터 V. 자세한 내용: reports/repeat_profile_report.md" });
  }
  // ---------- NYCHA public housing in the 311 data (reports/nycha_report.md) ----------
  function nychaCard() {
    const N = window.NYCHA_DATA; if (!N) return "";
    const S = N.summary, f1 = v => v == null ? "-" : (+v).toFixed(1), pc = v => v == null ? "-" : `${(+v).toFixed(v < 0.1 ? 2 : 1)}%`, fx = v => v == null ? "-" : `×${(+v).toFixed(2)}`;
    const pName = n => P.indexOf(n) >= 0 ? pShort(P.indexOf(n)) : (KO[n] || n);
    const sh = table(["유형 (담당)", "전체", "NYCHA 필지", "비중", `세대 비중(${S.unit_share_pct.toFixed(1)}%) 대비`],
      N.share.filter(r => ["Noise - Residential", "Noise - Street/Sidewalk", "Illegal Parking", "Noise", "HEAT/HOT WATER", "UNSANITARY CONDITION", "PLUMBING", "Blocked Driveway"].includes(r.problem))
        .map(r => ({ cls: r.ratio_to_unit_share >= 1.5 ? "hlrow" : "", cells: [`${esc(pName(r.problem))} <small>(${esc(r.agency)})</small>`, fmtN(r.n), fmtN(r.n_nycha), pc(r.nycha_pct), fx(r.ratio_to_unit_share)] })), { num: [1, 2, 3, 4] });
    const pu = N.per_unit.filter(r => ["Noise - Residential", "Noise - Street/Sidewalk", "Illegal Parking", "HEAT/HOT WATER"].includes(r.problem));
    const BOS = ["(전체)", "BRONX", "BROOKLYN", "MANHATTAN", "QUEENS", "STATEN ISLAND"];
    const put = table(["자치구", ...["Noise - Residential", "Noise - Street/Sidewalk", "Illegal Parking", "HEAT/HOT WATER"].map(t => `${esc(pName(t))}: NYCHA / 그 밖`)],
      BOS.map(bo => ({ cls: st.b >= 0 && B[st.b] === bo ? "hlrow" : "", cells: [bo === "(전체)" ? "뉴욕시 전체" : esc(BKO[bo] || bo), ...["Noise - Residential", "Noise - Street/Sidewalk", "Illegal Parking", "HEAT/HOT WATER"].map(t => { const r = pu.find(x => x.problem === t && x.borough === bo); return r ? `<b>${f1(r.nycha)}</b> / ${f1(r.other)}` : "-"; })] })), { num: [1, 2, 3, 4] });
    const TT = ["Noise - Residential", "Noise - Street/Sidewalk", "Illegal Parking"];
    const mt = table(["유형", "NYCHA (오즈비, 95% 구간)", "브롱크스: 기본 → NYCHA 포함", "엘리베이터 아파트: 기본 → NYCHA 포함", "100세대+: 기본 → NYCHA 포함"],
      TT.map(t => { const g = (term, v) => N.model.find(r => r.type === t && r.term === term && r.variant === v); const ny = g("nycha_flag=예", "with_nycha");
        const pair = term => { const a = g(term, "main"), b = g(term, "with_nycha"); return a && b ? `${fx(a.odds_ratio)} → ${fx(b.odds_ratio)}` : "-"; };
        return [esc(pName(t)), ny ? `<b>${fx(ny.odds_ratio)}</b> <small>(${fx(ny.lo)} ~ ${fx(ny.hi)})</small>` : "-", pair("borough=BRONX"), pair("cls=엘리베이터 아파트"), pair("units=100+")]; }), { num: [] });
    const hb = table(["자치구", "NYCHA 세대 비중", "세대 1,000곳당 난방 신고일 (모든 세대)", "NYCHA 세대 제외"],
      N.heat_borough.map(r => [esc(BKO[r.borough] || r.borough), pc(r.nycha_unit_pct), f1(r.per_1000_all), `<b>${f1(r.per_1000_excl_nycha)}</b>`]), { num: [1, 2, 3] });
    return card({ id: "places-nycha", cls: "fixed", q: "공공임대주택(NYCHA)에서는 어떤 신고가 들어오나요?",
      what: `<span class="fixtag">현재 선택과 무관한 전체 참고 결과</span> NYCHA 주거 건물 필지 ${fmtN(S.nycha_lots)}곳(주거 세대 ${fmtN(S.nycha_units)}곳, 뉴욕시의 ${S.unit_share_pct.toFixed(1)}%)을 건물 번호(BBL)로 신고와 연결했습니다 ${help("nycha")}.`,
      meta: meta("건, %, 세대 1,000곳당 신고일", "NYCHA 필지 vs 그 밖의 주거 필지", "NYC Open Data 「NYCHA Residential Addresses」 · 집중 주소(NYCHA 아님)는 세대 대비 계산에서 제외"),
      body: `<div class="caution">NYCHA 건물의 난방·배관·비위생 같은 주택 관리 신고는 이 데이터에 거의 없습니다(난방·온수 35만 건 중 70건). 그래서 이 대시보드의 난방·비위생 결과는 <b>사실상 NYCHA를 뺀 민간 건물</b>에 대한 것이며, NYCHA 건물에 문제가 없다는 뜻이 아닙니다.</div>` +
        `<h4 class="minih">NYCHA 필지에 들어온 신고</h4>` + sh +
        `<h4 class="minih">세대 1,000곳당 신고일</h4>` + put +
        details("반복 주소 모델에 NYCHA를 넣으면? (오즈비)", mt + `<p class="note">건물 유형·연식·세대 수·자치구·주변 시설을 맞춘 값. 난방·비위생은 NYCHA 주소가 거의 없어 넣지 못했습니다.</p>`) +
        details("세대 대비 난방: NYCHA 세대를 분모에서 빼면?", hb + `<p class="note">세부 지역 순위는 순위 상관 ${S.rank_corr_cb_heat.toFixed(2)}로 거의 같습니다.</p>`),
      read: `${T.f}NYCHA는 주거 세대의 ${S.unit_share_pct.toFixed(1)}%지만 주거 소음 신고의 11.2%를 차지하고(세대 대비 약 2.2배), 불법 주차는 적습니다. 반복 주소 모델에 NYCHA를 넣어도 브롱크스·엘리베이터 아파트·세대 수의 효과는 거의 그대로여서, 그 결과들은 NYCHA 때문이 아닙니다. ${T.m}NYCHA 세입자의 수리 요청은 NYCHA 자체 창구로 처리되어 HPD 311 기록에 남지 않는 것으로 보입니다(확인 안 됨). ${T.w}NYCHA 목록은 현재 시점이며, NYCHA 평가가 아닙니다.`,
      more: "NYCHA 건물 = NYCHA Residential Addresses(2,955개 출입구 주소)의 필지(BBL). 세대 수 = PLUTO 주거 세대. 세대 1,000곳당 신고일 = 필지마다 그 유형 신고가 있었던 날 수의 합 ÷ 세대 수 × 1,000. 자세한 내용: reports/nycha_report.md" });
  }
  // ---------- heat complaints by building size (PLUTO + HPD violations; reports/building_report.md) ----------
  function buildingCard() {
    const BD = window.BUILDING_DATA; if (!BD) return "";
    const f0 = v => v == null ? "-" : Math.round(v).toLocaleString(), pc = v => v == null ? "-" : `${v.toFixed(0)}%`;
    const bar = (v, max, col) => `<span class="hbarc"><i style="width:${Math.max(1, v / max * 100).toFixed(1)}%;background:${col}"></i></span>`;
    const mb = Math.max(...BD.borough.map(r => r.report_days_per_1000_units));
    const bt = table(["자치구", "모든 주거 세대 1,000곳당 신고일", "", "신고 건수 기준"], BD.borough.slice().sort((a, b) => b.report_days_per_1000_units - a.report_days_per_1000_units)
      .map(r => [esc(BKO[r.borough] || r.borough), `<b>${f0(r.report_days_per_1000_units)}</b>`, bar(r.report_days_per_1000_units, mb, "var(--s1)"), f0(r.requests_per_1000_units)]), { num: [1, 3] });
    const ms = Math.max(...BD.size.map(r => r.report_days_per_1000_units_all));
    const st_ = table(["세대 수", "신고가 있었던 건물", "그 규모 건물 중", "모든 세대 1,000곳당 신고일", "", "위반 기록이 있는 비율"], BD.size.map(r => [esc(r.size_band), fmtN(r.buildings), pc(r.pct_buildings_with_complaint), `<b>${f0(r.report_days_per_1000_units_all)}</b>`, bar(r.report_days_per_1000_units_all, ms, "var(--s1)"), pc(r.with_viol_pct)]), { num: [1, 2, 3, 5] });
    const ma = Math.max(...BD.age.map(r => r.report_days_per_1000_units_all));
    const at = table(["준공", "신고가 있었던 건물", "모든 세대 1,000곳당 신고일", ""], BD.age.map(r => [esc(r.age_band), fmtN(r.buildings), `<b>${f0(r.report_days_per_1000_units_all)}</b>`, bar(r.report_days_per_1000_units_all, ma, "var(--s1)")]), { num: [1, 2] });
    const vt = table(["1년 중 신고가 있었던 날", "건물", "난방·온수 위반 기록 있음", "", "HPD가 열어 둔 신고 있음"], BD.viol_by_days.map(r => [esc(r.rd_band), fmtN(r.buildings), `<b>${pc(r.with_viol_pct)}</b>`, bar(r.with_viol_pct, 100, "var(--s2)"), pc(r.with_left_open_pct)]), { num: [1, 2, 4] });
    const lab = c => [c.f_repeat ? "반복" : "", c.f_rate ? "세대 대비 상위" : "", c.f_viol ? "위반" : ""].filter(Boolean).join(" + ") || "셋 다 아님";
    const ct = table(["조건 조합", "건물", "난방 신고 중 비중"], BD.combos.slice().sort((a, b) => b.requests_pct - a.requests_pct).map(c => ({ cls: c.f_repeat && c.f_rate && c.f_viol ? "hlrow" : "", cells: [esc(lab(c)), fmtN(c.buildings), `${c.requests_pct.toFixed(1)}%`] })), { num: [1, 2] });
    const C = BD.concentration, S = BD.screening, fp = (BD.focus.pluto || [])[0];
    const kp = [["난방 신고가 있었던 건물", fmtN(C.buildings), `상위 1%가 신고의 ${C.top1pct_share.toFixed(0)}%, 상위 10%가 ${C.top10pct_share.toFixed(0)}%`],
      ["10일 이상 반복된 건물", `${C.repeated_ge10_pct.toFixed(0)}%`, `이 건물들이 신고의 ${C.requests_in_repeated_pct.toFixed(0)}%`],
      ["세 조건을 모두 만족하는 건물", fmtN(S.all_three), `신고의 ${S.all_three_requests_pct.toFixed(0)}% · 맨해튼 ${S.by_borough.MANHATTAN || 0}, 브롱크스 ${S.by_borough.BRONX || 0}, 브루클린 ${S.by_borough.BROOKLYN || 0}`]];
    return card({ id: "places-bld", cls: "fixed", q: "건물 규모를 감안해도 난방 신고가 많은 곳은?",
      what: `<span class="fixtag">현재 선택과 무관한 전체 참고 결과 (난방·온수)</span> 난방·온수 신고를 건물 번호(BBL)로 묶어, 뉴욕시 건물 정보(PLUTO)의 세대 수와 HPD 난방·온수 위반 기록을 붙였습니다 ${help("building")}.`,
      meta: meta("신고일 (같은 날 여러 건은 1일), %", "모든 주거 세대 대비 · 규모·준공 연도·자치구별", `난방·온수 신고 ${fmtN(BD.coverage.n)}건 중 PLUTO와 연결된 ${fmtN(BD.coverage.with_units)}건 (${(BD.coverage.with_units / BD.coverage.n * 100).toFixed(1)}%)`),
      body: `<div class="kpis">${kp.map(([l, v, s2]) => `<div class="kpi"><div class="lab">${l}</div><div class="val">${v}</div><div class="sub">${s2}</div></div>`).join("")}</div>` +
        `<h4 class="minih">자치구: 세대 수로 나눠도 많은가?</h4>` + bt +
        `<h4 class="minih">건물 규모별</h4>` + st_ +
        (BD.cb ? `<h4 class="minih">세부 지역: 세대 수로 나눠도 많은가?</h4>` + (() => {
          const sel = st.cd >= 0 ? CBS[st.cd] : null, cs = BD.cb_summary, mc = Math.max(...BD.cb.map(r => r.days_per_1000));
          const lab = r => `${BKO[r.borough] || r.borough} ${+r.cb.slice(0, 2)}`;
          const row = r => ({ cls: (st.b >= 0 && B[st.b] === r.borough) || (sel && r.cb === sel) ? "hlrow" : "", cells: [esc(lab(r)), fmtN(r.units), `${r.rank_requests}위`, `<b>${f0(r.days_per_1000)}</b>`, bar(r.days_per_1000, mc, "var(--s1)"), `${r.rank_per_unit}위`, `×${r.city_ratio.toFixed(1)}`] });
          const head = ["지역", "주거 세대", "신고 건수 순위", "세대 1,000곳당 신고일", "", "세대 대비 순위", "뉴욕시 평균 대비"];
          return table(head, BD.cb.slice(0, 10).map(row), { num: [1, 2, 3, 5, 6] }) +
            details(`59곳 모두 보기 (세대 대비 순)`, table(head, BD.cb.map(row), { num: [1, 2, 3, 5, 6] })) +
            `<p class="note">뉴욕시 평균 세대 1,000곳당 ${f0(cs.city_per_1000)}일. 신고 건수 순위와 세대 대비 순위의 순위 상관 ${cs.rank_corr_requests_vs_per_unit.toFixed(2)}. 지역마다 신고일이 가장 많은 건물 1곳을 빼도 상위 5곳은 같습니다. 위에서 고른 자치구·세부 지역은 강조 표시됩니다.</p>`; })() : "") +
        details("준공 연도별", at) +
        details("신고가 오래 반복된 건물일수록 위반 기록이 있나?", vt + `<p class="note">HPD 점검은 대부분 신고로 시작되므로, 신고가 많으면 위반이 발견될 기회도 많습니다(위반 건물의 ${BD.violations.pct_violation_buildings_with_complaint.toFixed(0)}%에 같은 기간 난방 신고가 있음).</p>`) +
        details("더 들여다볼 후보: 세 조건 조합", ct + `<p class="note">반복 = 1년 중 10일 이상 신고. 세대 대비 상위 = 6세대 이상 건물 중 세대 10곳당 신고일 상위 10%(${BD.rate_cut.toFixed(1)}일 이상). 위반 = 난방(§27-2029)·온수(§27-2031) 위반 기록 1건 이상. 순위가 아니며 건물 주소는 보고서 표에만 있습니다.</p>`),
      read: `${T.f}세대 수로 나눠도 브롱크스가 가장 많고(다른 자치구의 약 2배 이상), 세부 지역으로는 브롱크스 7·4·5, 맨해튼 12·10이 뉴욕시 평균의 약 2.7~3.4배입니다. 20~99세대의 중간 규모 건물과 1946년 이전 건물에서 많습니다. 신고는 일부 건물에 몰려 있고, 오래 반복된 건물일수록 위반 기록도 많습니다.${fp ? ` 집중 주소(655 East 230th St, ${fp.unitsres}세대, ${fp.yearbuilt}년)는 난방 신고가 25건뿐이고 위반 기록이 없어, 난방 문제 건물이 아닙니다(신고 대부분이 주거 소음).` : ""} ${T.w}세대 수는 PLUTO 현재값이고, 위반 기록이 없다고 문제가 없었다는 뜻은 아닙니다. 공공임대주택(NYCHA)의 난방 신고는 이 데이터에 거의 없어 사실상 민간 건물에 대한 결과입니다(NYCHA 카드 참고). 건물주·기관 평가가 아닙니다.`,
      more: "자료: 311 난방·온수 신고 2025-11 ~ 2026-10, NYC Open Data PLUTO(세대 수·준공 연도), HPD 주택 위반 기록(점검 2025-11-01 ~ 2026-11-10, §27-2029·§27-2031). 「모든 세대 1,000곳당」의 분모는 신고가 없는 건물을 포함한 PLUTO의 모든 주거 세대입니다. 세부 지역 분모 = 그 지역 PLUTO의 모든 주거 세대(PLUTO 커뮤니티 보드 기준, 311 신고의 지역과 99.999% 일치). 자세한 내용: reports/building_report.md" });
  }
  function renderPlaces() {
    $("places-applies").innerHTML = appliesBar("places");
    const s = Object.assign({}, st);
    const rows = cRows(s), N = sum(rows), noAddr = sum(rows.filter(r => r[7] === 1));
    const selName = [st.b >= 0 ? bLabel(st.b) : "뉴욕시 전체", st.p >= 0 ? pShort(st.p) : "", st.a >= 0 ? aName(st.a) : "", st.m >= 0 ? mLabel(st.m) : ""].filter(Boolean).join(" · ");
    // top addresses
    let list = null, why = "";
    if (st.p >= 0 && st.m >= 0) why = "주소 순위는 「민원 유형」과 「기간」을 함께 고른 조합을 지원하지 않습니다. 둘 중 하나를 「전체」로 바꾸세요.";
    else if (!N) why = NO_DATA;
    else {
      const set = st.p >= 0 ? (st.a >= 0 ? "ap" : "p") : (st.a >= 0 && st.m >= 0 ? "am" : st.a >= 0 ? "a" : st.m >= 0 ? "m" : "");
      const key = [set, set.includes("a") ? st.a : -1, set.includes("m") ? st.m : -1, set.includes("p") ? st.p : -1].join("|");
      list = (TOP.get(key) || []);
      list = st.b >= 0 ? list.filter(r => r[4] === st.b && r[14] > 0).sort((x, y) => x[14] - y[14]) : list.filter(r => r[13] > 0).sort((x, y) => x[13] - y[13]);
      if (st.x) list = list.filter(r => !(r[4] === FOCUS_B && r[5] === FOCUS_K));
      list = list.slice(0, 10);
    }
    const isF = r => r[4] === FOCUS_B && r[5] === FOCUS_K;
    const W0 = wOf("places-body");
    const t1 = list && list.length ? list[0][6] : 0, t10 = list ? list.reduce((t, r) => t + r[6], 0) : 0;
    const gr = gRows(s), totG = gr.reduce((t, r) => t + r.g, 0);
    const kp = [
      ["신고가 가장 많은 주소 1곳의 비중", list && list.length ? pct(t1, N) : "-", list && list.length ? `${esc(list[0][5])} ${fmtN(t1)}건 / 현재 조건 ${fmtN(N)}건` : esc(why)],
      ["상위 10개 주소의 비중", list && list.length ? pct(t10, N) : "-", `분모 = 주소 없는 신고 ${fmtN(noAddr)}건 포함 전체`],
      [`같은 날·장소·유형으로 묶은 신고 ${help("group")}`, totG ? `${fmtN(totG)}<small>묶음</small>` : "-", totG ? `신고 ${fmtN(gr.reduce((t, r) => t + r.n, 0))}건 → 묶음당 평균 ${(gr.reduce((t, r) => t + r.n, 0) / totG).toFixed(2)}건 (실제 사건 수 아님)` : NO_DATA],
    ];
    const kpis = `<div class="kpis">${kp.map(([l, v, s2]) => `<div class="kpi"><div class="lab">${l}</div><div class="val">${v}</div><div class="sub">${s2}</div></div>`).join("")}</div>`;
    let body1;
    if (!list) body1 = emptyBox(why, true);
    else if (!list.length) body1 = emptyBox(NO_DATA + " (주소와 자치구가 모두 있는 신고가 없음)");
    else body1 = legend([["var(--s1)", "신고 수 (괄호 = 현재 조건 신고 중 비중)"], ["var(--s2)", "같은 날·장소·유형 묶음 수"]]) +
      hbars(list.map((r, k) => ({ label: `${k + 1}. ${W0 < 480 ? r[5] : bLabel(r[4]) + " · " + r[5]}`, value: r[6], value2: r[7], valueText: `${fmtN(r[6])} (${pct(r[6], N, 2)})`, valueShort: fmtN(r[6]), value2Text: `${fmtN(r[7])}묶음`, value2Short: fmtN(r[7]), hl: isF(r),
        tip: `<b>${esc(B[r[4]])} · ${esc(r[5])}</b><br>신고 ${fmtN(r[6])}건 · 묶음 ${fmtN(r[7])}개 (묶음당 ${(r[6] / r[7]).toFixed(1)}건)<br>신고가 있던 날 ${r[10]}일 (${r[11]} ~ ${r[12]})<br>가장 많은 유형: ${esc(pShort(r[8]))} ${fmtN(r[9])}건` })),
        { series: [{ key: "value", color: "var(--s1)" }, { key: "value2", color: "var(--s2)" }], w: wOf("places-body") - 40, labelW: 280, valW: 120, aria: "상위 주소" }) +
      table(["순위", "주소 (자치구 · 주소 비교 키)", "신고 수", "비중", "묶음 수", "신고가 있던 날", "처음 ~ 마지막", "가장 많은 유형"],
        list.map((r, k) => ({ cls: isF(r) ? "focus" : "", cells: [k + 1, `${esc(bLabel(r[4]))} · <code>${esc(r[5])}</code>`, fmtN(r[6]), pct(r[6], N, 2), fmtN(r[7]), `${r[10]}일`, `${r[11]} ~ ${r[12]}`, esc(pShort(r[8]))] })), { num: [0, 2, 3, 4, 5] });
    const share10 = N ? t10 / N : 0;
    const c1 = card({ id: "places-c1", q: "신고가 몇몇 주소에 몰려 있나요?",
      what: `현재 조건(${esc(selName)})에서 신고가 가장 많은 주소 10곳입니다. 주소 = 자치구 + 공백·대소문자만 통일한 주소 문자열.`,
      meta: meta("건, %", "같은 날·장소·유형 묶음 수(주황): 하루에 같은 곳에서 여러 번 들어온 신고를 하나로 본 수", `분모 = 현재 조건 신고 ${fmtN(N)}건 (주소 없는 ${fmtN(noAddr)}건 포함)`),
      body: kpis + body1,
      read: list && list.length ? `${T.f}상위 10곳이 ${pct(t10, N)}입니다. ${share10 >= 0.2 ? "몇몇 장소의 반복이 이 조건의 결과를 크게 좌우할 수 있습니다." : "대부분의 신고는 여러 주소에 흩어져 있습니다."} 신고가 있던 날이 많으면 여러 날에 걸친 반복, 적으면 특정 기간에 몰린 신고입니다. ${T.w}신고가 많다는 사실만으로 특정 주민의 행동, 자동 신고, 허위 신고, 실제 문제의 크기를 판단할 수 없습니다.` : "",
      more: "주소 또는 자치구가 없는 신고는 순위에서 빠지고, 이런 신고를 한 장소로 묶지 않습니다. 약어(ST/STREET)가 다르면 다른 주소로 셉니다. 묶음 = 같은 접수일·자치구·주소 비교 키·유형·세부 유형의 신고(데이터의 incident_group_id). 주소가 없으면 각각 1묶음입니다.",
      next: goBtn("when", "이 조건의 날짜별 변화 보기") });
    // include / exclude focus address by borough
    const rAll = cRows(Object.assign({}, s, { b: -1 }), true);
    const inc = B.map((_, i) => sum(rAll.filter(r => r[1] === i))), exc = B.map((_, i) => sum(rAll.filter(r => r[1] === i && r[4] === 0)));
    const rank = arr => { const o = KB.map(i => [arr[i], i]).sort((a, b) => b[0] - a[0]); const r = {}; o.forEach(([v, i], k) => r[i] = k + 1); return r; };
    const rkI = rank(inc), rkE = rank(exc), bi = KB.filter(i => inc[i] > 0).sort((x, y) => inc[y] - inc[x]);
    const changed = inc[FOCUS_B] !== exc[FOCUS_B];
    const c2 = card({ id: "places-c2", q: "한 주소를 빼면 지역 결과가 달라지나요?",
      what: "신고가 가장 많은 주소(브롱크스 655 EAST 230 STREET)를 포함했을 때와 뺐을 때의 자치구별 신고 수입니다.",
      meta: meta("건 (괄호 = 자치구 순위)", "포함(파랑) vs 제외(주황)", `현재 조건에서 자치구·지역 조건을 뺀 신고 · 위 「집중 주소」 선택과 관계없이 둘 다 표시`),
      body: bi.length ? legend([["var(--s1)", "포함"], ["var(--s2)", "제외"]]) + hbars(bi.map(i => ({ label: bLabel(i), value: inc[i], value2: exc[i], hl: i === FOCUS_B && changed,
        valueText: `${fmtN(inc[i])} (${rkI[i]}위)`, value2Text: `${fmtN(exc[i])} (${rkE[i]}위)`, valueShort: fmtN(inc[i]), value2Short: fmtN(exc[i]), tip: `<b>${esc(bLabel(i))}</b><br>포함 ${fmtN(inc[i])} · 제외 ${fmtN(exc[i])}<br>감소 ${pct(inc[i] - exc[i], inc[i])}` })),
        { series: [{ key: "value", color: "var(--s1)" }, { key: "value2", color: "var(--s2)" }], w: wOf("places-body") - 40, labelW: 120, valW: 130, aria: "포함 제외" }) : emptyBox(NO_DATA),
      read: changed ? `${T.f}이 주소를 빼면 브롱크스가 ${fmtN(inc[FOCUS_B])} → ${fmtN(exc[FOCUS_B])}건(${pct(inc[FOCUS_B] - exc[FOCUS_B], inc[FOCUS_B])} 감소)${rkI[FOCUS_B] !== rkE[FOCUS_B] ? `, 순위 ${rkI[FOCUS_B]}위 → ${rkE[FOCUS_B]}위` : ""}입니다. ${T.w}빼고 본 결과가 정답이라는 뜻은 아닙니다. 그 신고도 실제로 접수된 기록입니다.`
        : `${T.f}현재 조건에는 이 주소의 신고가 없어 결과가 같습니다. 이 주소는 주로 주거 소음(2025-11 ~ 2026-04)에 해당합니다.` });
    // fixed reference: repeat at house-numbered addresses
    const RP = X.repeat, q1 = RP.q1;
    const bins = RP.bins.map(b => ({ label: `${b.bin}건`, value: b.addr_pct, value2: b.report_pct, valueText: `주소 ${b.addr_pct.toFixed(1)}%`, value2Text: `신고 ${b.report_pct.toFixed(1)}%`, valueShort: `${b.addr_pct.toFixed(1)}%`, value2Short: `${b.report_pct.toFixed(1)}%`,
      tip: `<b>1년에 ${b.bin}건 신고된 주소</b><br>주소 ${fmtN(b.addresses)}곳 (${b.addr_pct.toFixed(1)}%)<br>신고 ${fmtN(b.reports)}건 (${b.report_pct.toFixed(1)}%)` }));
    const span = RP.span.map(x => ({ label: x.span_bin.slice(2), value: x.report_pct, valueText: `${x.report_pct.toFixed(1)}% (조합 ${fmtN(x.pairs)})`, valueShort: `${x.report_pct.toFixed(1)}%` }));
    const bt = st.p >= 0 ? RP.by_type.find(r => r.problem === P[st.p]) : null;
    const bb = RP.by_borough.map(r => [esc(BKO[r.g]), fmtN(+r.reports), (+r.addr_repeated_pct).toFixed(1) + "%", (+r.reports_at_repeated_addr_pct).toFixed(1) + "%", (+r.same_type_repeat_pct).toFixed(1) + "%"]);
    const c3 = card({ id: "places-c3", cls: "fixed", q: "신고는 여러 주소에 퍼져 있나요, 같은 주소에서 반복되나요?",
      what: `<span class="fixtag">현재 선택과 무관한 전체 참고 결과</span> 번지가 있는 주소의 신고 ${fmtN(q1.reports)}건, 주소 ${fmtN(q1.addresses)}곳 기준입니다.`,
      meta: meta("% (주소 중 비중 / 신고 중 비중)", "", `번지 주소만 (교차로·도로 구간·장소명·주소 없는 신고 ${fmtN(D.ref.eda_overview.rows_base - q1.reports)}건 제외: 한 지점으로 볼 수 없음)`),
      body: legend([["var(--s1)", "주소 중 비중"], ["var(--s2)", "신고 중 비중"]]) +
        hbars(bins, { series: [{ key: "value", color: "var(--s1)" }, { key: "value2", color: "var(--s2)" }], w: wOf("places-body") - 40, labelW: 110, valW: 110, aria: "주소당 신고 수" }) +
        `<h4 class="minih">같은 주소·같은 유형으로 2건 이상인 경우, 첫 신고와 마지막 신고 사이 기간 (신고 중 %)</h4>` +
        hbars(span, { w: wOf("places-body") - 40, labelW: 110, valW: 150, aria: "반복 기간" }) +
        details("자치구별·선택 유형 표 보기", table(["자치구", "신고", "2건 이상 신고된 주소 비중", "그런 주소의 신고 비중", "같은 주소·같은 유형 반복 신고 비중"], bb, { num: [1, 2, 3, 4] }) +
          (bt ? `<p><b>${esc(pShort(st.p))}</b>: 같은 주소에 같은 유형이 2건 이상인 신고 ${(+bt.reports_at_repeated_pct).toFixed(1)}%, 그중 여러 날에 걸친 반복 ${(+bt.reports_at_multi_day_pct).toFixed(1)}%, 상위 1개 주소 비중 ${(+bt.top1_addr_pct).toFixed(1)}%</p>` : "")),
      read: `${T.f}주소의 ${q1.addr_ge2_pct.toFixed(1)}%가 1년 동안 2건 이상 신고됐고, 그 주소들에서 나온 신고가 전체의 ${q1.reports_at_ge2_pct.toFixed(1)}%입니다. ${T.w}같은 주소의 후속 신고를 「재발」이나 「해결 실패」로 읽지 마세요. 세대(호실) 정보가 없어 큰 건물의 여러 세대 신고도 같은 주소의 반복으로 셉니다.`,
      more: `앞 신고가 아직 종료 기록이 없을 때 들어온 같은 주소·같은 유형 신고: ${RP.consecutive.while_prev_open_pct.toFixed(1)}%, 종료 기록 후 들어온 신고: ${RP.consecutive.after_prev_closed_pct.toFixed(1)}%. 자세한 내용: <a href="../reports/repeat_address_report.md" target="_blank">반복 주소 보고서</a>` });
    $("places-body").innerHTML = c1 + c2 + c3 + poiCard() + repeatProfileCard() + nychaCard() + buildingCard();
  }

  // ======================= 4. TIME =======================
  function delaySum(s) { return DL.filter(r => (s.m < 0 || r[0] === s.m) && (s.b < 0 || r[1] === s.b) && (s.a < 0 || r[2] === s.a) && (s.p < 0 || r[3] === s.p) && (!s.x || r[4] === 0))
    .reduce((t, r) => [t[0] + r[5], t[1] + r[6], t[2] + r[7], t[3] + r[8]], [0, 0, 0, 0]); }
  // ---------- re-report after closure, and survival view of closure time (reports/rereport_report.md) ----------
  // ---------- surge vs closure delay (reports/surge_delay_report.md) ----------
  function surgeCard() {
    const SG = window.SURGE_DATA; if (!SG) return "";
    const pp = v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%p`, pc = v => v == null ? "-" : `${v.toFixed(1)}%`;
    const order = ["heat", "hydrant", "tree", "pothole"];
    const sel = st.p >= 0 ? ({ "HEAT/HOT WATER": "heat", "Damaged Tree": "tree", "Street Condition": "pothole", "Water System": "hydrant", "Water Maintenance": "hydrant" })[P[st.p]] : null;
    const rows = [];
    order.forEach(g => ["open7", "open30"].forEach(mt => { const a = SG.assessment.find(r => r.group === g && r.metric === mt && r.compare === "surge vs normal"); if (!a) return;
      rows.push({ cls: g === sel ? "hlrow" : "", cells: [esc(a.label), mt === "open7" ? "7일" : "30일", pc(a.adj_t), pc(a.adj_r), `<b>${pp(a.diff_main)}</b>`, `${pp(a.diff_min)} ~ ${pp(a.diff_max)}`, esc(a.status)] }); }));
    const cats = ["중복", "안내·접수 확인", "위반·문제 없음", "출입·확인 실패", "조치·위반 발부 기록"];
    const wt = table(["업무", ...cats], order.map(g => { const w = SG.wording.filter(r => r.group === g); return [esc(w[0] ? w[0].label : g), ...cats.map(c => { const r = w.find(x => x.category === c); return r && (r.adj_t || r.adj_r) ? pp(r.diff_pp) : "-"; })]; }), { num: [1, 2, 3, 4, 5] });
    const pt = table(["업무", "수준", "신고", "주로 언제", "7일 안에 종료 기록 없음", "30일", "절반 시점 (생존 분석)"],
      SG.plain.map(r => [esc(r.label), { normal: "평소", elevated: "조금 많음 (1.25~2배)", surge: "몰림 (2배 이상)" }[r.level], fmtN(r.n), esc(r.months), pc(r.open7), pc(r.open30), r.km_median_h == null ? "-" : fmtHtxt(r.km_median_h)]), { num: [2, 4, 5, 6] });
    return card({ id: "time-c6", cls: "fixed", q: "신고가 몰리면 종료 기록이 늦어지나요?",
      what: `<span class="fixtag">현재 선택과 무관한 전체 참고 결과 (4개 업무)</span> 같은 자치구·같은 업무에서 접수 직전 7일의 신고가 <b>평소(직전 28일의 보통 수준)의 2배 이상</b>이었을 때 접수된 신고를 평소 신고와 비교합니다. 자치구·세부 유형·접수 월이 같은 신고끼리 맞춘 값입니다 ${help("matched")}.`,
      meta: meta("%, %p", "신고 몰림 vs 평소 (맞춘 비교)", "포트홀·난방·온수·손상된 나무·소화전 · 2025-12-06 ~ 2026-10-31 접수 · 관찰 마감 2026-11-11 가정"),
      body: table(["업무", "이 기간 안에 종료 기록 없음", "몰림", "평소", "차이", "기준을 바꾼 범위", "판정"], rows, { num: [2, 3, 4, 5] }) +
        details("신고가 몰렸을 때 종결 문구 비중의 차이 (몰림 − 평소)", wt + `<p class="note">종결된 신고 중 각 문구로 닫힌 비율의 차이(맞춘 비교). 「-」는 그 업무에서 쓰이지 않는 문구입니다.</p>`) +
        details("단순 비교 (계절·세부 유형이 섞인 값)", pt),
      read: `${T.f}소화전은 신고가 몰릴 때 조금 늦어졌고(+3%p), 손상된 나무는 오히려 빨리 닫혔습니다(-7%p). 난방·온수도 늦어 보이지만(+4%p), 2026-01-24부터 HPD가 일부 난방 신고를 「조건이 아직 남아 있음」으로 열어 둔 기록 방식 변화와 겹친 것이어서, 그 기록을 빼면 +1%p 안팎으로 줄어듭니다. 포트홀은 기준에 따라 방향이 바뀌어 판단을 보류합니다. 소화전은 단순 비교로는 몰릴 때 빨리 닫힌 것처럼 보이지만, 즉시 종결되는 긴급 신고가 몰린 영향입니다. 난방은 몰릴 때 「중복」 종결이 약 8%p 늘었습니다. ${T.w}여기서 업무량은 접수량이며 기관의 인력·출동 기록은 없습니다. 신고가 몰린 때는 날씨·업무 난도도 함께 바뀌므로 원인으로 읽지 마세요.`,
      more: "업무량 = 접수일 직전 7일 동안 같은 자치구·업무의 신고 수. 평소 = 그 값의 직전 28일 중앙값. 몰림 = 2배 이상, 평소 = 1.25배 미만. 처음 35일은 평소 수준을 계산할 수 없어 제외. 기준을 바꾼 4가지: 평소 56일, 몰림 기준 1.5배, 같은 날·장소·유형 묶음당 1건, HPD가 열어 둔 기록 제외. 모든 기준에서 같은 방향이고 2.5%p 이상이면 「유지」. 포트홀은 평소 56일 기준에서 비교 가능한 신고가 12%뿐이라 방향이 바뀝니다. 자세한 내용: reports/surge_delay_report.md" });
  }
  function rereportCards() {
    const RR = window.REREPORT_DATA; if (!RR) return "";
    const pIdx = n => P.indexOf(n), pNm = n => pIdx(n) >= 0 ? pShort(pIdx(n)) : n;
    const f1 = v => v == null ? "-" : `${v.toFixed(1)}%`, fh = v => v == null ? "-" : fmtHtxt(v);
    const name = st.p >= 0 ? P[st.p] : null, tr = name && RR.by_type.find(r => r.problem === name);
    const ov = RR.overall.find(r => r.unit === "request" && r.scope === "all"), og = RR.overall.find(r => r.unit === "group" && r.scope === "all");
    const fixed = `<span class="fixtag">유형 조건만 반영 · 자치구·기관·기간·집중 주소 조건 미적용</span>`;
    const def = `종결된 신고 뒤에 <b>같은 번지 주소·같은 유형</b>으로 새 신고가 들어온 비율입니다 ${help("rereport")}. N일 비율의 분모는 종결 후 N일을 끝까지 지켜볼 수 있었던 종결 건입니다(신규 접수 자료 끝 2026-10-31).`;
    let body, read, q;
    if (!tr) {
      q = "종결 뒤 같은 주소에서 다시 신고가 들어오나요?";
      const rows = RR.by_type.map(r => ({ attr: pIdx(r.problem) >= 0 ? ` data-setp="${pIdx(r.problem)}"` : "",
        cells: [esc(pNm(r.problem)), fmtN(r.closures), f1(r.rate_1d), f1(r.rate_7d), `<b>${f1(r.rate_30d)}</b>`, f1(r.rate_30d_group)] }));
      body = `<div class="kpis">${[["7일 안 재접수", f1(ov.rate_7d), `종결 ${fmtN(ov.n_7d)}건 기준 · 같은 날·장소·유형 묶음 단위 ${f1(og.rate_7d)}`],
        ["30일 안 재접수", f1(ov.rate_30d), `묶음 단위 ${f1(og.rate_30d)}`]].map(([l, v, s2]) => `<div class="kpi"><div class="lab">${l}</div><div class="val">${v}</div><div class="sub">${s2}</div></div>`).join("")}</div>` +
        table(["유형 (종결 많은 15개)", "종결", "1일", "7일", "30일", "30일 (묶음 단위)"], rows, { num: [1, 2, 3, 4, 5] }) +
        `<p class="note">행을 누르면 그 유형을 고르고, 종결 문구별 재접수율을 볼 수 있습니다.</p>`;
      read = `${T.f}종결된 신고의 약 3분의 1이 7일 안에, 절반 가까이가 30일 안에 같은 주소·유형으로 다시 접수됩니다. 소음·난방은 높고 눈·얼음·거리 오염은 낮습니다. ${T.w}재접수는 해결 실패가 아닙니다. 같은 건물의 다른 세대, 새로 생긴 문제, 같은 사람의 재신고를 구분할 수 없습니다.`;
    } else {
      q = `${esc(pNm(name))}: 어떻게 종결된 신고 뒤에 다시 신고가 들어오나요?`;
      const km = Object.fromEntries(RR.km.filter(r => r.problem === name && r.scope === "all").map(r => [r.category, r]));
      const wr = RR.by_wording.filter(r => r.problem === name);
      const mt = Object.fromEntries(RR.matched.filter(r => r.problem === name).map(r => [r.category, r]));
      const REF = "조치·위반 발부 기록";
      const rows = wr.map(r => { const m = mt[r.rcat], k = km[r.rcat];
        return { cls: r.rcat === REF ? "hlrow" : "", cells: [esc(r.rcat) + (r.rcat === REF ? " <small>(비교 기준)</small>" : ""), fmtN(r.closures), f1(r.rate_1d), f1(r.rate_7d), f1(r.rate_30d),
          k && k.median_days != null ? `${k.median_days.toFixed(1)}일` : "-",
          m ? `${m.diff_main > 0 ? "+" : ""}${m.diff_main.toFixed(1)}%p <small>(${m.diff_min.toFixed(1)}~${m.diff_max.toFixed(1)})</small>` : (r.rcat === REF ? "기준" : "-"),
          m ? esc(m.status) : "-"] }; });
      const all = km["(전체)"];
      body = `<div class="kpis">${[["7일 안 재접수", f1(tr.rate_7d), `종결 ${fmtN(tr.n_7d)}건 기준 · 묶음 단위 ${f1(tr.rate_7d_group)}`],
        ["30일 안 재접수", f1(tr.rate_30d), `묶음 단위 ${f1(tr.rate_30d_group)}`],
        ["재접수 절반 시점", all && all.median_days != null ? `${all.median_days.toFixed(1)}일` : "절반 미만", "생존 분석: 추적이 짧은 종결 건도 반영"]].map(([l, v, s2]) => `<div class="kpi"><div class="lab">${l}</div><div class="val">${v}</div><div class="sub">${s2}</div></div>`).join("")}</div>` +
        table(["종결 문구", "종결", "1일", "7일", "30일", "재접수 절반 시점", "맞춘 비교 30일 (조치 대비)", "판정"], rows, { num: [1, 2, 3, 4, 5, 6] }) +
        (name === "HEAT/HOT WATER" ? details("증상별(난방 없음·온수 없음) 30일 재접수율", table(["증상", "종결 문구", "종결", "30일"], RR.heat_symptom.map(r => [esc(r.addl), esc(r.rcat), fmtN(r.closures), f1(r.rate_30d)]), { num: [2, 3] })) : "");
      read = (name === "HEAT/HOT WATER" ? `${T.f}「출입·확인 실패」로 종결된 뒤에는 같은 조건의 「조치」보다 7일 안 재접수가 약 10%p 많고(더 빨리 다시 옴), 30일이면 차이가 약 5%p로 줄어듭니다. 「중복」 종결 뒤 재접수가 가장 많은 것은 이미 여러 세대가 신고 중인 건물이라는 표시로 보입니다. ` : "") +
        `${T.w}종결 문구가 재접수의 원인이라는 뜻이 아닙니다. 어떤 건물·상황에서 그 문구가 나오는지가 함께 작용합니다. 재접수는 해결 실패가 아닙니다.`;
    }
    const c4 = card({ id: "time-c4", cls: "fixed", q, what: fixed + " " + def,
      meta: meta("%, 일", tr ? "각 종결 문구 vs 「조치·위반 발부 기록」(맞춘 비교: 세부 유형·증상·접수 월·자치구가 같은 묶음끼리)" : "", `번지 주소의 종결 신고 ${fmtN(RR.counts.index_closures)}건 (2025-11 ~ 2026-10 접수)`),
      body, read,
      more: "재접수 = 종결 시각 이후 같은 자치구·주소 비교 키·유형으로 처음 들어온 새 신고. 종결 = 종료 시각이 접수 이후이고 2026-11-11 00:00(가정) 전. 묶음 단위 = 같은 날·장소·유형·세부 유형 묶음당 한 번(묶음의 마지막 종결, 열린 신고가 있는 묶음 제외). 판정: 신고·묶음 단위 × 집중 주소 포함·제외 4가지 모두 같은 방향이고 2.5%p 이상이면 「유지」. 재접수 절반 시점은 Kaplan-Meier(생존 분석)로, 자료 끝까지 재접수가 없던 종결도 그 시점까지 반영합니다. 자세한 내용: reports/rereport_report.md" });
    // survival view of closure time
    let c5 = "";
    const ck = RR.closure_km;
    if (name && ck.some(r => r.problem === name)) {
      const rows = ck.filter(r => r.problem === name).map(r => ({ cls: r.borough === "(전체)" ? "hlrow" : "",
        cells: [r.borough === "(전체)" ? "뉴욕시 전체" : esc(BKO[r.borough] || r.borough), fmtN(r.n), `${r.open_pct.toFixed(1)}%`, fh(r.closed_only_median_h), `<b>${fh(r.km_median_h)}</b>`, fh(r.closed_only_p90_h), `<b>${fh(r.km_p90_h)}</b>`] }));
      const bo = RR.borough_order.find(r => r.problem === name);
      c5 = card({ id: "time-c5", cls: "fixed", q: `${esc(pNm(name))}: 아직 열린 신고까지 넣으면 시간이 달라지나요?`,
        what: `<span class="fixtag">유형 조건만 반영</span> 위의 시간 값은 이미 종료 기록이 있는 신고만으로 계산합니다. 생존 분석(Kaplan-Meier) ${help("survival")}은 2026-11-11까지 열려 있던 신고도 「그때까지는 열려 있었다」로 넣어 계산합니다.`,
        meta: meta("시간", "종료 건만 vs 생존 분석", "자치구가 있는 신고 (이 표의 「종료 건만」은 관찰 마감 기준이라 위 KPI의 EDA 기준 값과 조금 다를 수 있음)"),
        body: table(["자치구", "신고", "마감 시 열린 비율", "절반 시점: 종료 건만", "절반 시점: 생존 분석", "90% 시점: 종료 건만", "90% 시점: 생존 분석"], rows, { num: [1, 2, 3, 4, 5, 6] }),
        read: `${T.f}${bo ? (bo.spearman >= 0.99 ? "자치구 순서는 두 방법에서 같습니다." : `자치구 순서 상관 ${bo.spearman.toFixed(1)} — 일부 순서가 바뀌지만 가장 오래 걸리는 자치구는 ${bo.slowest_closed === bo.slowest_km ? "같습니다" : "다릅니다"}.`) : ""} 열린 신고가 많은 유형일수록 「종료 건만」의 값, 특히 90% 시점이 실제보다 짧게 나옵니다.` });
    } else if (!name) {
      const rows = ck.filter(r => r.borough === "(전체)").map(r => ({ attr: pIdx(r.problem) >= 0 ? ` data-setp="${pIdx(r.problem)}"` : "",
        cells: [esc(pNm(r.problem)), `${r.open_pct.toFixed(1)}%`, fh(r.closed_only_median_h), `<b>${fh(r.km_median_h)}</b>`, fh(r.closed_only_p90_h), `<b>${fh(r.km_p90_h)}</b>`] }));
      c5 = card({ id: "time-c5", cls: "fixed", q: "아직 열린 신고까지 넣으면 시간이 달라지나요?",
        what: `<span class="fixtag">현재 선택과 무관한 전체 참고 결과</span> 종료 기록이 있는 신고만으로 계산한 값과, 2026-11-11까지 열려 있던 신고도 넣은 생존 분석(Kaplan-Meier) ${help("survival")} 값을 비교합니다.`,
        meta: meta("시간", "종료 건만 vs 생존 분석", "신고가 많은 15개 유형 · 행을 누르면 자치구별 비교"),
        body: table(["유형", "마감 시 열린 비율", "절반: 종료 건만", "절반: 생존 분석", "90%: 종료 건만", "90%: 생존 분석"], rows, { num: [1, 2, 3, 4, 5] }),
        read: `${T.f}경찰 출동 유형은 열린 신고가 거의 없어 차이가 없습니다. 도로 상태·배관·비위생 상태처럼 오래 걸리는 업무는 「종료 건만」의 값이 짧게 나오고, 특히 90% 시점 차이가 큽니다(도로 상태 270 → 625시간). 15개 유형 중 13개는 자치구 순서가 두 방법에서 완전히 같습니다.` });
    }
    return c4 + c5;
  }
  function renderTime() {
    $("time-applies").innerHTML = appliesBar("time");
    const s = Object.assign({}, st, { cd: -1 });
    const rows = cRows(s), N = sum(rows), q = qGet(s.m, s.b, s.a, s.p, s.x), dl = delaySum(s);
    const selName = [st.b >= 0 ? bLabel(st.b) : "뉴욕시 전체", st.p >= 0 ? pShort(st.p) : "모든 유형", st.a >= 0 ? aName(st.a) : "", st.m >= 0 ? mLabel(st.m) : "12개월"].filter(Boolean).join(" · ");
    const agencies = (() => { const m = new Map(); rows.forEach(r => m.set(r[2], (m.get(r[2]) || 0) + r[8])); return [...m.entries()].sort((x, y) => y[1] - x[1]); })();
    const agLine = st.p >= 0 && agencies.length ? `<div class="agline">담당 기관: ${agencies.slice(0, 2).map(([a, n]) => `<b>${esc(aLabel(a))}</b> — ${esc(aMission(a))} <button class="hbtn" data-help="agency:${A[a]}">기관 설명</button>`).join("<br>")}</div>` : "";
    const kp = [
      [`절반이 종료 기록에 도달한 시간 ${help("median")}`, q ? fmtH(q[6]) : "-", q ? `중앙값 · 계산 대상: 종료 기록이 있는 신고 ${fmtN(q[5])}건 (현재 조건 ${fmtN(N)}건 중 ${pct(q[5], N)})` : NO_DATA],
      [`90%가 종료 기록에 도달한 시간 ${help("p90")}`, q ? fmtH(q[7]) : "-", q ? "같은 계산 대상 중 나머지 10%는 이보다 오래 걸림. 전체 신고의 90%가 해결됐다는 뜻이 아님. 아직 열린 신고가 빠져 있어, 오래 걸리는 업무는 실제보다 짧게 나옴(아래 「아직 열린 신고까지 넣으면」 카드)" : NO_DATA],
      [`7일 안에 종료 기록이 없는 비율 ${help("nonclose")}`, dl[0] ? pctF(dl[1], dl[0]) : "-", dl[0] ? `${per100(dl[1], dl[0])} · 분모: 7일 이상 지켜볼 수 있었던 신고 ${fmtN(dl[0])}건` : NO_DATA],
      [`30일 안에 종료 기록이 없는 비율`, dl[2] ? pctF(dl[3], dl[2]) : "-", dl[2] ? `${per100(dl[3], dl[2])} · 분모: 2026-10-12까지 접수된 신고 ${fmtN(dl[2])}건` : NO_DATA],
    ];
    const kpis = `<div class="kpis">${kp.map(([l, v, s2]) => `<div class="kpi"><div class="lab">${l}</div><div class="val">${v}</div><div class="sub">${s2}</div></div>`).join("")}</div>` +
      (q && q[5] < SMALL_N ? `<p class="warnline">${T.w}종료 기록이 있는 신고가 ${q[5]}건뿐이라 값이 불안정합니다.</p>` : "");
    const c1 = card({ id: "time-c1", q: `${esc(selName)}: 종료 기록까지 얼마나 걸렸나요?`,
      what: "신고 접수부터 종료 기록까지의 시간입니다. 「종료 기록」은 기관이 신고를 닫은 기록이며, 실제 해결이나 수리 완료의 증거가 아닙니다.",
      meta: meta("시간·일, %", "", `현재 조건 신고 ${fmtN(N)}건`), body: agLine + kpis,
      read: `${T.w}위 두 시간 값과 아래 두 비율은 계산 대상이 다릅니다. 시간 값은 이미 종료 기록이 있는 신고만으로 계산하므로, 오래 걸려 아직 열려 있는 신고가 빠져 실제보다 짧게 보일 수 있습니다. 7일·30일 비율은 그만큼 지켜볼 수 있었던 신고 전체가 분모입니다.`,
      more: "시간 값: 상태가 Closed이고, 처리 시간(종료 − 접수)이 0보다 크며, 상태와 종료일이 서로 맞는 신고(기존 EDA 기준). 중앙값 = median, 90% 시점 = quantile_cont(0.9), 조건마다 원자료에서 정확히 계산.<br>" +
        "7일·30일 비율: 관찰 마감을 2026-11-11 00:00으로 가정(원본 파일은 2026-11-12자이지만 기록된 종료 시각이 2026-11-11 03:25에서 끝남). 마감 전 종료 시각이 있으면 종료로 보고, 종료 시각이 접수보다 빠른 기록은 제외. 이 기준은 상태가 Closed가 아니어도 종료 시각이 있으면 종료로 봅니다." });
    // same work compared across boroughs
    let c2;
    if (st.p < 0) {
      const tops = [...rows.reduce((m, r) => m.set(r[3], (m.get(r[3]) || 0) + r[8]), new Map()).entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
      const tbl = tops.map(([p, n]) => { const qp = qGet(s.m, s.b, s.a, p, s.x); return { cls: qp && qp[5] < SMALL_N ? "small" : "", attr: ` data-setp="${p}"`, cells: [esc(pShort(p)), fmtN(n), qp ? fmtHtxt(qp[6]) : "-", qp ? fmtHtxt(qp[7]) : "-", qp ? fmtN(qp[5]) : "0"] }; });
      c2 = card({ id: "time-c2", q: "같은 업무끼리 비교하려면 유형을 고르세요",
        what: "민원 유형마다 걸리는 시간이 크게 다릅니다(예: 경찰 출동 유형은 몇 시간, 주택 수리 유형은 며칠). 그래서 지역·기관 비교는 같은 유형 안에서 하는 것이 해석하기 쉽습니다.",
        meta: meta("시간", "", "현재 조건의 신고가 많은 8개 유형 · 행을 누르면 그 유형을 선택"),
        body: table(["유형", "신고 수", "절반이 종료 기록", "90%가 종료 기록", "계산 대상(종료 건)"], tbl, { num: [1, 2, 3, 4] }),
        read: `${T.w}유형 사이의 시간 차이는 업무의 성격(현장 출동, 점검, 수리) 차이이지 기관의 효율 차이가 아닙니다.` });
    } else {
      const items = [];
      KB.forEach(b => {
        const qb = qGet(s.m, b, s.a, s.p, s.x); const sb = Object.assign({}, s, { b }); const d = delaySum(sb);
        if (!qb) return;
        items.push({ label: bLabel(b), hl: b === st.b, med: qb[6], p90: qb[7], small: qb[5] < SMALL_N,
          side: `7일 내 종료 기록 없음 ${d[0] ? pctF(d[1], d[0]) : "-"}`, sideShort: d[0] ? pctF(d[1], d[0]) : "-",
          tip: `<b>${esc(bLabel(b))} · ${esc(pShort(st.p))}</b><br>절반 ${fmtHtxt(qb[6])} · 90% ${fmtHtxt(qb[7])}<br>계산 대상 ${fmtN(qb[5])}건<br>7일 안에 종료 기록 없음 ${d[0] ? `${fmtN(d[1])} / ${fmtN(d[0])}건` : "-"}` });
      });
      const qa = qGet(s.m, -1, s.a, s.p, s.x);
      c2 = card({ id: "time-c2", q: `같은 유형(${esc(pShort(st.p))})끼리 자치구를 비교하면?`,
        what: "같은 민원 유형만 놓고 자치구마다 종료 기록까지 걸린 시간을 보여 줍니다. 순서는 자치구 고정 순서이며 빠른 순위가 아닙니다.",
        meta: meta("시간 (로그 눈금) · 오른쪽 % = 7일 안에 종료 기록이 없는 비율", qa ? `뉴욕시 전체 같은 유형: 절반 ${fmtHtxt(qa[6])}, 90% ${fmtHtxt(qa[7])}` : "", `${esc(pShort(st.p))}${st.a >= 0 ? " · " + esc(aName(st.a)) : ""} · ${st.m >= 0 ? mLabel(st.m) : "12개월"}`),
        body: items.length ? dotLog(items, { w: wOf("time-body") - 40, aria: "자치구별 처리 시간" }) : emptyBox(NO_DATA),
        read: `${T.w}같은 유형이어도 세부 유형(예: 포트홀 vs 도로 함몰), 접수 시기, 담당 부서가 지역마다 다를 수 있습니다. 차이가 보이면 아래 「비슷한 업무끼리 맞춘 비교」로 확인하세요. 성과 순위로 읽지 마세요.`,
        more: "회색 점은 계산 대상이 100건 미만이라 참고만 하세요. 7일 비율의 분모는 7일 이상 지켜볼 수 있었던 신고입니다." });
    }
    // fixed reference: matched comparison (playbook)
    const PB = X.playbook, L1 = PB.L1;
    const g = met => Object.fromEntries(L1.filter(x => x.metric === met).map(x => [x.borough, x]));
    const gm = g("median_h"), g30 = g("nonclose30");
    const rowsL1 = ["BRONX", "BROOKLYN", "MANHATTAN", "QUEENS", "STATEN ISLAND"].map(b => {
      const x = gm[b], y = g30[b]; if (!x) return null;
      return [esc(BKO[b]), `${x.raw_t.toFixed(1)} / ${x.raw_o.toFixed(1)}`, `<b>${x.adj_t_main.toFixed(1)} / ${x.adj_o_main.toFixed(1)}</b>`,
        y ? `${(y.raw_t * 100).toFixed(1)}% / ${(y.raw_o * 100).toFixed(1)}%` : "-", y ? `<b>${(y.adj_t_main * 100).toFixed(1)}% / ${(y.adj_o_main * 100).toFixed(1)}%</b>` : "-",
        `${(x.incl_t * 100).toFixed(0)}% / ${(x.incl_o * 100).toFixed(0)}%`,
        (x.eff_min >= 0.9 && x.eff_max <= 1.11) ? `차이 작음 (×${x.eff_min.toFixed(2)}~${x.eff_max.toFixed(2)})` : x.same_direction_all_variants ? `같음 (×${x.eff_min.toFixed(2)}~${x.eff_max.toFixed(2)})` : "달라짐"];
    }).filter(Boolean);
    const kept = PB.candidates.filter(c => c.magnitude_kept_all_variants && c.level !== "borough");
    const shaky = PB.candidates.filter(c => !c.magnitude_kept_all_variants && c.level !== "borough");
    const cLabel = c => `${esc(BKO[c.borough])} · ${esc(KO[c.problem] || c.problem)}${c.detail ? " · " + esc(c.detail) : ""}`;
    const cVal = c => (c.metric === "median_h" ? `절반 시점 ${c.adj_t_main.toFixed(1)} / ${c.adj_o_main.toFixed(1)}시간 (×${c.eff_main.toFixed(2)}, 기준에 따라 ×${c.eff_min.toFixed(2)}~${c.eff_max.toFixed(2)})`
      : `${c.metric === "nonclose30" ? "30일" : "7일"} 안에 종료 기록 없음 ${(c.adj_t_main * 100).toFixed(1)}% / ${(c.adj_o_main * 100).toFixed(1)}% (100건 중 ${Math.abs(c.eff_main).toFixed(1)}건 ${c.eff_main > 0 ? "많음" : "적음"})`) +
      (c.problem === "Water System" ? ` <span class="tag warn">종료 기록 방식(즉시·중복 종료)에 따라 크기가 크게 변함 — 기록의 뜻부터 확인</span>` : "");
    const keptT = kept.filter(c => c.level === "borough_type"), keptD = kept.filter(c => c.level === "borough_type_detail");
    const c3 = card({ id: "time-c3", cls: "fixed", q: "비슷한 업무끼리 맞추면 자치구 차이가 남나요?",
      what: `<span class="fixtag">현재 선택과 무관한 전체 참고 결과</span> 각 자치구를 나머지 네 곳과 비교합니다. 「맞춘 비교」는 민원 유형·세부 유형·접수 월·담당 기관이 같은 묶음끼리, 두 쪽이 같은 업무 구성이 되도록 가중한 값입니다 ${help("matched")}.`,
      meta: meta("시간, %", "해당 자치구 / 나머지 네 곳 (자치구마다 비교 상대가 달라 순위로 읽지 않음)", `관찰 마감 가정 2026-11-11 · 시간 값은 이 분석의 종료 기준(마감 전 종료 시각이 있으면 종료, 같은 초 종료 포함)이라 위 카드의 값과 다름`),
      body: table(["자치구", "절반 시점: 단순 (시간)", "절반 시점: 맞춤", "30일 내 종료 기록 없음: 단순", "맞춤", "비교에 포함된 신고", "기준을 바꿔도 방향"], rowsL1, { num: [1, 2, 3, 4, 5] }) +
        `<h4 class="minih">맞춘 뒤에도 차이가 남아 더 조사할 대상 (기준을 바꿔도 크기가 유지된 것만)</h4>` +
        (keptT.length ? `<ul class="cand">${keptT.map(c => `<li><b>${cLabel(c)}</b> — ${cVal(c)}</li>`).join("")}</ul>` : `<p class="note">없음</p>`) +
        (keptD.length ? details(`세부 유형 단위로 본 조사 대상 ${keptD.length}개`, `<ul class="cand">${keptD.map(c => `<li><b>${cLabel(c)}</b> — ${cVal(c)}</li>`).join("")}</ul>`) : "") +
        (shaky.length ? details(`기준에 따라 흔들려 보류한 조합 ${shaky.length}개`, `<ul class="cand">${shaky.map(c => `<li>${cLabel(c)} — ${cVal(c)} · ${esc(c.status)}</li>`).join("")}</ul>`) : ""),
      read: `${T.f}단순 비교에서 4~5시간 나던 자치구 차이가 맞춘 비교에서는 크게 줄거나 방향이 바뀝니다. ${T.m}자치구 차이의 대부분은 「어떤 업무가 많은가」의 차이입니다. ${T.w}맞춘 뒤 남은 차이도 지역의 순수한 영향이나 성과가 아닙니다. 세부 업무, 종료 기록 방식, 현장 조건이 섞여 있을 수 있습니다.`,
      more: "기준을 바꿔도: 접수 시기를 분기로, 같은 초에 닫힌 기록과 「중복」 문구로 닫힌 기록 제외, 기존 EDA의 종료 기준, 같은 날·장소·유형 묶음당 1건만, 작은 묶음(10건 미만) 제외. 조사 대상은 이 모든 기준에서 같은 방향이고, 차이가 1.25배(또는 2.5%p) 이상 남은 경우입니다. 자세한 내용: <a href=\"../reports/resolution_playbook_report.md\" target=\"_blank\">종료 시간 보고서</a>" });
    $("time-body").innerHTML = c1 + c2 + c3 + surgeCard() + rereportCards();
  }

  // ======================= MORE: agency charts =======================
  function donut(sl, o = {}) {
    sl = sl.filter(s => s.n > 0); const tot = sl.reduce((t, s) => t + s.n, 0); if (!tot) return emptyBox(NO_DATA);
    const S = 200, c = S / 2, Rr = c - 3, r = Rr * 0.6; const pt = (a, rad) => `${(c + rad * Math.cos(a)).toFixed(2)} ${(c + rad * Math.sin(a)).toFixed(2)}`;
    let a = -Math.PI / 2, g = "";
    sl.forEach(s => { const f = s.n / tot, a1 = a + f * 2 * Math.PI;
      const d = f > 0.99999 ? `M${c - Rr} ${c}A${Rr} ${Rr} 0 1 1 ${c + Rr} ${c}A${Rr} ${Rr} 0 1 1 ${c - Rr} ${c}ZM${c - r} ${c}A${r} ${r} 0 1 0 ${c + r} ${c}A${r} ${r} 0 1 0 ${c - r} ${c}Z`
        : `M${pt(a, Rr)}A${Rr} ${Rr} 0 ${f > 0.5 ? 1 : 0} 1 ${pt(a1, Rr)}L${pt(a1, r)}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 0 ${pt(a, r)}Z`;
      g += `<path d="${d}" fill="${s.color}" fill-rule="evenodd" stroke="var(--surface)" stroke-width="2" data-tip="${esc(`<b>${s.label}</b><br>${fmtN(s.n)}건 · ${pctF(s.n, tot)}`)}"/>`; a = a1; });
    g += `<text x="${c}" y="${c - 4}" text-anchor="middle" class="dc1">${esc(o.center || fmtN(tot))}</text><text x="${c}" y="${c + 16}" text-anchor="middle" class="dc2">${esc(o.centerSub || "건 = 100%")}</text>`;
    return `<div class="donut"><svg class="dsvg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${g}</svg><ol class="dleg"><li class="dhead"><i></i><span class="dl">${esc(o.head || "")}</span><span class="dn">건수</span><span class="dp">비중</span></li>` +
      sl.map(s => `<li><i style="background:${s.color}"></i><span class="dl">${esc(s.label)}</span><span class="dn">${fmtN(s.n)}</span><span class="dp">${pctF(s.n, tot)}</span></li>`).join("") + `</ol></div>`;
  }
  const AS = { a: 0, m: -1, x: 0 };
  const AG_TOT = A.map((_, i) => sum(C.filter(r => r[2] === i)));
  function fillAgCtl() {
    $("ag-a").innerHTML = A.map((_, i) => i).sort((x, y) => AG_TOT[y] - AG_TOT[x]).map(i => opt(i, `${aName(i)} · ${fmtN(AG_TOT[i])}건`)).join("");
    $("ag-m").innerHTML = opt(-1, "전체 12개월") + M.map((m, i) => opt(i, mLabel(i))).join("");
    $("ag-a").value = AS.a; $("ag-m").value = AS.m; $("ag-x").value = AS.x;
  }
  function renderAgencyCharts() {
    const a = AS.a, rows = cRows({ b: -1, a, p: -1, m: AS.m, x: AS.x }), N = sum(rows);
    const agNote = { NYPD: "노숙 거처(Encampment) 신고는 2026-10부터 노숙인서비스국(DHS)이 받습니다. 10월에 이 유형이 0건인 것은 업무 이관 때문입니다.",
      DHS: "노숙 거처(Encampment) 신고는 2026-10부터 이 기관만 받습니다(그 전에는 경찰청과 나눠 받음). 10월에 늘어난 것은 업무 이관 때문입니다.",
      DEP: "「상수도」·「하수」·「유해 물질」은 2026-07-28~29에 코드 없는 새 이름(유지보수 등)으로 바뀐 것으로 보입니다(공식 확인 전)." }[A[a]];
    $("ag-mission").innerHTML = `<b>${esc(aLabel(a))}</b> — ${esc(aMission(a))} <button class="hbtn" data-help="agency:${A[a]}">기관 설명·출처</button>` +
      (agNote ? `<div class="caution" style="margin-top:6px">${esc(agNote)}</div>` : "");
    if (!N) { ["ag-prob", "ag-boro", "ag-time"].forEach(id => $(id).innerHTML = emptyBox(NO_DATA)); return; }
    const pCnt = new Map(); rows.forEach(r => pCnt.set(r[3], (pCnt.get(r[3]) || 0) + r[8]));
    const keep = [...pCnt.entries()].sort((x, y) => y[1] - x[1]).slice(0, 7).map(x => x[0]);
    const rest = N - keep.reduce((t, p) => t + pCnt.get(p), 0);
    $("ag-prob").innerHTML = donut(keep.map((p, k) => ({ label: pShort(p), n: pCnt.get(p), color: PAL[k] })).concat(rest > 0 ? [{ label: `기타 ${pCnt.size - keep.length}개 유형`, n: rest, color: GRAY }] : []), { head: "민원 유형" });
    $("ag-boro").innerHTML = hbars(KB.map(b => ({ label: bLabel(b), value: sum(rows.filter(r => r[1] === b)), color: BCOL[B[b]] })).map(it => Object.assign(it, { valueText: `${fmtN(it.value)} (${pct(it.value, N)})` })), { w: wOf("ag-boro") - 10, labelW: 120, valW: 130, aria: "자치구" });
    const tItems = [];
    [-1].concat(KB).forEach(b => { const qb = qGet(AS.m, b, a, -1, AS.x); if (!qb) return;
      tItems.push({ label: b < 0 ? "이 기관 전체" : bLabel(b), hl: b < 0, med: qb[6], p90: qb[7], small: qb[5] < SMALL_N, side: `계산 대상 ${fmtN(qb[5])}건`, sideShort: fmtN(qb[5]),
        tip: `<b>${b < 0 ? "이 기관 전체" : esc(bLabel(b))}</b><br>절반 ${fmtHtxt(qb[6])} · 90% ${fmtHtxt(qb[7])}<br>계산 대상 ${fmtN(qb[5])}건` }); });
    $("ag-time").innerHTML = tItems.length ? dotLog(tItems, { w: wOf("ag-time") - 10, aria: "자치구별" }) : emptyBox(NO_DATA);
  }
  ["a", "m", "x"].forEach(k => $("ag-" + k).addEventListener("change", e => { AS[k] = +e.target.value; renderAgencyCharts(); }));

  // ======================= HELP drawer =======================
  const GLOSS = [
    ["base", "기본 분석 대상 신고", "BASE", "전체 3,963,959건에서 요청 번호만 다르고 나머지 값이 모두 같은 1,791건(중복 의심)을 뺀 3,962,168건. 모든 화면의 출발점."],
    ["median", "절반이 이 시간 안에 종료 기록", "중앙값 (median)", "종료 기록이 있는 신고(계산 대상)를 걸린 시간 순으로 줄 세웠을 때 가운데 값. 계산 대상의 절반은 이보다 빨리, 절반은 늦게 종료 기록이 남았다는 뜻. 아직 열린 신고는 포함되지 않음."],
    ["p90", "90%가 이 시간 안에 종료 기록", "90백분위수 (quantile_cont 0.9)", "계산 대상의 90%가 이 시간 안에 종료 기록이 남았고, 나머지 10%는 더 오래 걸렸다는 뜻. 전체 신고의 90%가 해결됐다는 뜻이 아님."],
    ["nonclose", "정한 기간 안에 종료 기록이 없는 비율", "N일 내 미종결률", "접수 후 N일 안에 종료 기록이 없는 신고 ÷ N일 이상 지켜볼 수 있었던 신고. 늦게 닫혔거나 아직 열려 있는 신고가 분자. 「100건 중 몇 건」으로 읽으면 쉬움. 두 비율의 차이는 %p(퍼센트포인트)."],
    ["closed", "종료 기록", "Closed / closed_date", "기관이 신고를 닫은 기록. 실제로 문제가 해결되거나 수리가 끝났다는 증거가 아님(출입 실패, 위반 없음, 중복으로 닫힌 경우 포함)."],
    ["lq", "전체보다 이 유형의 비중이 얼마나 높은가", "상대 비중 (location quotient)", "지역 안에서 그 유형의 비중 ÷ 비교 기준 전체에서 그 유형의 비중. 1이면 같고, 2면 2배. 실제 문제 발생률이나 위험도가 2배라는 뜻이 아님."],
    ["share", "지역 안 비중 vs 유형의 지역 분포", "구성비 / 분포", "「그 지역 신고 중 이 유형이 몇 %」(분모 = 그 지역 모든 신고)와 「이 유형 신고 중 이 지역이 몇 %」(분모 = 그 유형 모든 신고)는 다른 질문."],
    ["group", "같은 날·장소·유형으로 묶은 신고", "동일 조건 신고 그룹 (incident_group_id)", "같은 접수일·자치구·주소 비교 키·유형·세부 유형의 신고를 하나로 묶은 것. 실제 사건 수가 아님. 문제가 여러 날 이어지면 날마다 다른 묶음."],
    ["matched", "비슷한 업무 구성이 되도록 맞춘 비교", "보정·가중 비교 (공통 비중 가중)", "민원 유형·세부 유형·접수 월·담당 기관이 같은 묶음에서, 두 집단의 묶음 비중을 평균 낸 공통 비중으로 가중해 중앙값·비율을 계산. 양쪽에 3건 이상 있는 묶음만 사용."],
    ["sens", "기준을 바꿔도 결과가 같은가", "민감도 분석", "분기 단위, 즉시·중복 종료 제외, 다른 종료 기준, 묶음당 1건, 작은 묶음 제외로 바꿔 다시 계산해 방향과 크기가 유지되는지 확인."],
    ["nycha", "공공임대주택 (NYCHA)", "NYCHA Residential Addresses (NYC Open Data)", "뉴욕시 주택공사(NYCHA)가 운영하는 공공임대주택. 주거 세대의 약 4.3%. NYCHA 세입자의 수리·난방 요청은 NYCHA 자체 창구로 처리되는 것으로 보여, 이 311 데이터에는 NYCHA 건물의 주택 관리 신고가 거의 없음. 소음·주차 같은 경찰청 신고는 들어옴."],
    ["poi", "주변 장소 (지도 자료)", "OpenStreetMap POI (Overpass API)", "자원봉사자가 만드는 공개 지도 OpenStreetMap에서 받은 학교·술집·클럽·카지노·묘지·공원·쇼핑몰·종교시설·병원·공연장·역·주차장·자동차 정비소 위치(2026-07 기준). 빠지거나 위치가 다른 장소가 있을 수 있음. 가까이 있다고 신고의 원인이라는 뜻이 아님."],
    ["building", "건물 규모와 위반 기록", "PLUTO unitsres · HPD Housing Maintenance Code Violations", "PLUTO는 뉴욕시 도시계획국의 필지별 건물 정보(주거 세대 수·준공 연도 등, 현재 시점 값). HPD 위반 기록은 주택보존개발국 점검에서 발부된 위반으로, 여기서는 난방(§27-2029)·온수(§27-2031) 조항만 씀. 점검은 대부분 신고로 시작되므로 신고와 위반은 서로 독립적이지 않음."],
    ["weather", "날씨 사건과 신고", "NOAA GHCN-Daily, Central Park (USW00094728)", "미국 기상청(NOAA NCEI)의 센트럴파크 관측소 일별 기온·강수·적설·풍속. 관측소 1곳으로 뉴욕시 전체를 대신하므로 자치구마다 실제 날씨와 다를 수 있음. 신고와 날씨가 같은 날 함께 움직였다는 관찰이며 원인이 아님."],
    ["rereport", "종결 후 재접수율", "re-report rate after closure", "종결된 신고 뒤 N일 안에 같은 번지 주소·같은 유형으로 새 신고가 들어온 비율. 분모는 종결 후 N일을 끝까지 지켜볼 수 있었던 종결 건(신규 접수 자료 끝 2026-10-31). 같은 건물의 다른 세대·새 문제·같은 사람의 재신고를 구분할 수 없어 「해결 실패율」이 아님."],
    ["survival", "아직 열린 신고까지 넣은 시간 계산", "생존 분석 (Kaplan-Meier)", "관찰 마감까지 종료 기록이 없는 신고를 버리지 않고 「그 시점까지는 열려 있었다」로 반영해 절반·90% 시점을 계산하는 방법. 종료된 건만으로 계산하면 오래 걸리는 신고가 빠져 시간이 짧게 나옴."],
    ["corr", "두 지표가 함께 움직이는 정도", "상관관계 (스피어만 ρ)", "-1~1. 크다고 한쪽이 다른 쪽의 원인이라는 뜻이 아님."],
    ["cluster", "비슷한 특징끼리 묶어 보기", "군집 (K-Means)", "지표가 비슷한 지역·유형끼리 묶은 결과. 묶음의 구조가 약하면(실루엣 0.3 미만) 대략적인 구분으로만 읽음. 군집 번호는 이름표일 뿐 의미가 없음."],
    ["focus", "집중 주소", "focus address", "브롱크스 655 EAST 230 STREET(신고 47,105건, 대부분 주거 소음). 「제외」를 고르면 이 주소의 모든 신고를 뺌."],
    ["reclass", "유형 이름 변경 (2026-07-28~29)", "Water System → Water Maintenance, Sewer → Sewer Maintenance, Hazardous Materials → Hazardous Material", "환경보호국의 「상수도」·「하수」·「유해 물질」 유형이 2026-07-28~29에 끝나고 같은 내용이 코드 없는 새 이름으로 이어짐. 공식 확인 전이라 원래 유형을 그대로 쓰고, 2번 화면의 월별 구성 표(체크 상자)와 「더 자세히」의 관계·묶기 분석에서만 합쳐서 계산함. 1년 합계로 유형을 비교할 때 두 이름이 나뉘어 있다는 점에 주의."],
    ["agencymove", "담당 기관 변경 (노숙 거처, 2026-10)", "Encampment: NYPD → DHS", "노숙 거처(Encampment) 신고는 2026-09-22까지 경찰청(NYPD)과 노숙인서비스국(DHS)이 나눠 받았고, 2026-10부터는 노숙인서비스국만 받음. 기관별 신고 수·구성의 변화는 업무 이관 때문이며 실적 변화가 아님."],
    ["cd", "세부 지역", "커뮤니티 보드 (Community Board)", "뉴욕시 59개 행정 구역. 311 자료의 커뮤니티 보드 값 그대로 사용. 공원·공항 같은 공동 관리 구역과 값이 없는 신고는 세부 지역 화면에서 빠짐."],
  ];
  function renderHelp(tabKey, focusKey) {
    document.querySelectorAll("#help-tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.ht === tabKey)));
    let h = "";
    if (tabKey === "gloss") h = `<p class="note">쉬운 이름 옆에 정확한 정의와 전문 용어를 함께 적었습니다.</p>` + GLOSS.map(([k, easy, tech, def]) => `<div class="gl${k === focusKey ? " hl" : ""}" id="gl-${k}"><h4>${easy}</h4><div class="tech">${tech}</div><p>${def}</p></div>`).join("");
    else if (tabKey === "agency") {
      const totals = {}; C.forEach(r => { totals[r[2]] = (totals[r[2]] || 0) + r[8]; });
      h = `<p class="note">한국어 이름은 이해를 돕기 위한 번역입니다. 「업무」는 공식 자료 요약, 「많이 보인 민원」은 이 데이터에서 센 값입니다.</p>` + A.map((code, i) => { const x = AG[code];
        return `<div class="acard${code === focusKey ? " hl" : ""}" id="agc-${esc(code)}"><h3>${esc(x.name_ko)}(${esc(code)})</h3><div class="en">${esc(x.name_en)}</div>
          <div class="lbl">업무 (공식 자료 요약)</div><div>${esc(x.mission_ko)}</div>
          <div class="lbl">이 데이터에서 많이 보인 민원 (전체 ${fmtN(totals[i])}건)</div><ul>${x.top_problems.map(([p, n, s]) => `<li>${esc(KO[p] || p)} — ${fmtN(n)}건 (${s}%)</li>`).join("")}</ul>
          ${x.status !== "verified" || x.note ? `<div class="unv">${x.status !== "verified" ? "<b>일부 미확인</b> · " : ""}${esc(x.note || "")}</div>` : ""}
          <div class="lbl">출처</div><div class="src">${x.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`).join(" · ")}</div></div>`; }).join("");
    } else {
      const o = D.ref.eda_overview, r = D.ref.eda_resolution, pb = X.playbook.counts;
      h = table(["항목", "기준", "숫자"], [
        ["기본 분석 대상 신고", "중복 의심(요청 번호만 다르고 나머지가 같은 행) 제외", `${fmtN(o.rows_base)}건`],
        ["기간", `접수 ${o.created_min} ~ ${o.created_max}. 하루 전체가 포함된 날 ${o.full_days}일. 월별·요일별 하루 평균은 이 날들만 사용`, "-"],
        ["처리 시간 (절반·90%)", "Closed, 처리 시간 > 0, 상태·종료일 불일치 아님 (기존 EDA 기준). 조건마다 원자료에서 정확히 계산. 아직 열린 신고는 빠지므로 오래 걸리는 업무는 실제보다 짧게 나옴(특히 90% 시점, 예: 도로 상태 270 → 625시간). 생존 분석 값은 4번 화면 「아직 열린 신고까지 넣으면」 카드", `${fmtN(r.resolved_rows)}건`],
        ["7일·30일 종료 기록 없음", "관찰 마감 가정 2026-11-11 00:00 전 종료 시각 유무로 판단(상태 값 무관), 종료 시각이 접수보다 빠른 기록 제외, 그 기간을 지켜볼 수 있었던 접수만 분모", `7일 ${fmtN(pb.elig7)}건 / 30일 ${fmtN(pb.elig30)}건`],
        ["두 종료 기준의 차이", "EDA 기준은 「상태가 Closed이고 시간이 양수인 정상 종료 기록」을 측정, 새 기준은 「마감 전에 종료 시각이 기록됐는가」를 측정. 어느 한쪽이 정답이 아님. 같은 지표로 섞어 쓰지 않음", `상태는 Closed가 아닌데 종료 시각이 있는 신고 ${fmtN(pb.status_not_closed_but_close_time)}건`],
        ["주소", "자치구 + address_key(공백·대소문자만 통일). 약어는 합치지 않음. 주소 없는 신고는 한 장소로 보지 않음", "-"],
        ["세부 지역", "표준 커뮤니티 보드 59곳(코드 01~18)", `${fmtN(CBC.reduce((t, x) => t + x[6], 0))}건`],
        ["집중 주소", "BRONX + 655 EAST 230 STREET", "47,105건"],
        ["유형 이름 변경", "환경보호국 「상수도」·「하수」·「유해 물질」이 2026-07-28~29에 끝나고 코드 없는 새 이름으로 이어짐(공식 확인 전). 원래 유형을 그대로 쓰고, 2번 화면 월별 구성 표(체크 상자)와 「더 자세히」의 관계·묶기 분석에서만 합쳐 계산", "-"],
        ["난방 기록 방식 변화", "2026-01-24 접수분부터 HPD가 난방 신고 일부(월 3~10%)를 「조건이 아직 남아 있음」으로 열어 둠. 난방의 7일·30일 종료 기록 없음 비율은 이 날 전후를 비교하지 않음", "-"],
      ]) + `<h4>날짜 기준 한눈에 보기</h4>` + table(["날짜", "뜻", "쓰는 곳"], [
        ["2025-11-01 21:09 ~ 2026-10-31 21:09", "접수 기간 (자료 범위)", "모든 화면"],
        ["2025-11-02 ~ 2026-10-30", "하루 전체가 포함된 날 (363일)", "월·요일·시간대 하루 평균, 날씨 비교"],
        ["2026-10-31 21:09", "마지막 신규 접수 = 재접수를 지켜볼 수 있는 끝", "종결 후 재접수율"],
        ["2026-11-11 00:00 (가정)", "관찰 마감: 이 전에 종료 시각이 있으면 종료로 봄. 기록된 종료 시각이 2026-11-11 03:25에서 끝나서 정함", "7일·30일 종료 기록 없음, 맞춘 비교, 생존 분석, 급증·지연"],
        ["2026-11-12", "원본 파일 날짜. 반복 주소 보고서는 이 날을 기준으로 씀(11-11과 결과 차이 0.01%p 이내)", "반복 주소 보고서"],
        ["2026-11-10 (점검일 끝)", "HPD 난방·온수 위반 기록을 받은 범위 (2025-11-01부터)", "3번 화면 건물 카드"],
      ]) + `<h4>지원하지 않는 것</h4><ul><li>여러 달을 묶은 기간 선택(백분위수를 정확히 합칠 수 없음)</li><li>주소 순위에서 유형+기간 동시 선택, 세부 지역 단위 주소 순위·처리 시간·요일/시간대</li><li>인구 대비 비율(별도 보고서 참고), 지도, 실시간 자료</li></ul>
        <p class="note">보고서: <a href="../reports/eda_report.md" target="_blank">EDA</a> · <a href="../reports/composition_report.md" target="_blank">지역별 구성</a> · <a href="../reports/repeat_address_report.md" target="_blank">반복 주소</a> · <a href="../reports/resolution_playbook_report.md" target="_blank">종료 시간 비교</a> · <a href="../reports/monthly_composition_report.md" target="_blank">월별 구성</a> · <a href="../reports/reclass_check_report.md" target="_blank">유형 이름 변경</a> · <a href="../reports/rereport_report.md" target="_blank">재접수·생존 분석</a> · <a href="../reports/weather_report.md" target="_blank">날씨</a> · <a href="../reports/surge_delay_report.md" target="_blank">급증과 지연</a> · <a href="../reports/heat_record_change_report.md" target="_blank">난방 기록 변화</a> · <a href="../reports/building_report.md" target="_blank">건물 규모</a></p>`;
    }
    $("help-body").innerHTML = h; fixLinks($("help-body"));
    if (focusKey) { const el = $("gl-" + focusKey) || $("agc-" + focusKey); if (el) el.scrollIntoView({ block: "start" }); } else $("help-body").scrollTop = 0;
  }
  function openHelp(tabKey, focusKey) { $("help").hidden = false; $("help-shade").hidden = false; renderHelp(tabKey, focusKey); }
  function closeHelp() { $("help").hidden = true; $("help-shade").hidden = true; }

  // ======================= frame =======================
  function render() {
    $("fstate").innerHTML = stateText(); fillFilters();
    const fn = { home: renderHome, where: renderWhere, when: renderWhen, places: renderPlaces, time: renderTime, more: () => { if ($("more-rel").hidden === false && window.RELATIONS) window.RELATIONS.render(); else renderAgencyCharts(); } }[st.v];
    fn && fn();
    const h = toHash();
    try { if (location.hash !== h) history.replaceState(null, "", h); } catch (e) { /* srcdoc iframe */ }
    if (EMBED) { try { window.parent.history.replaceState(null, "", shareUrl()); } catch (e) { } }
    fixLinks();
  }
  function show(v, keepScroll) {
    st.v = VIEWS.includes(v) ? v : "home";
    VIEWS.forEach(id => { $("v-" + id).hidden = id !== st.v; });
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === st.v)));
    $("filters").hidden = !FILTERED.includes(st.v);
    render(); if (!keepScroll) window.scrollTo(0, 0);
  }
  // filter events
  $("f-b").addEventListener("change", e => { st.b = +e.target.value; st.cd = -1; render(); });
  $("f-cd").addEventListener("change", e => { st.cd = +e.target.value; render(); });
  $("f-a").addEventListener("change", e => { st.a = +e.target.value; render(); });
  ["p", "m", "x"].forEach(k => $("f-" + k).addEventListener("change", e => { st[k] = +e.target.value; render(); }));
  $("f-reset").addEventListener("click", () => { Object.assign(st, { b: -1, cd: -1, a: -1, p: -1, m: -1, x: 0 }); render(); });
  $("f-copy").addEventListener("click", () => {
    const url = shareUrl();
    const done = () => { $("f-copy").textContent = "링크 복사됨"; setTimeout(() => { $("f-copy").textContent = "이 화면 링크 복사"; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt("링크", url)); else prompt("링크", url);
  });
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-tab],[data-goto],[data-setp],[data-setb],[data-setcd],[data-help],[data-ht],[data-more],#help-close,#help-shade");
    if (!t) return;
    if (t.id === "help-close" || t.id === "help-shade") { closeHelp(); return; }
    if (t.dataset.help) { const [k, f] = t.dataset.help.includes(":") ? t.dataset.help.split(":") : ["gloss", t.dataset.help]; openHelp(k === "agency" ? "agency" : k === "criteria" ? "criteria" : "gloss", f); return; }
    if (t.dataset.ht) { renderHelp(t.dataset.ht); return; }
    if (t.dataset.more) { $("more-rel").hidden = t.dataset.more !== "rel"; $("more-ag").hidden = t.dataset.more !== "ag";
      document.querySelectorAll("#more-nav button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.more === t.dataset.more))); render(); return; }
    if (t.dataset.setp != null) { st.p = +t.dataset.setp; render(); return; }
    if (t.dataset.setb != null) { st.b = +t.dataset.setb; st.cd = -1; render(); return; }
    if (t.dataset.setcd != null) { st.cd = +t.dataset.setcd; st.b = CBB[st.cd]; render(); return; }
    if (t.dataset.goto) { if (t.dataset.preset) { Object.assign(st, { b: -1, cd: -1, a: -1, p: -1, m: -1, x: 0 }, JSON.parse(t.dataset.preset)); } show(t.dataset.goto); return; }
    if (t.dataset.tab) show(t.dataset.tab);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeHelp(); });
  document.addEventListener("change", e => { if (e.target && e.target.id === "rpt-t") { RPT_T = e.target.value; render(); } });
  document.addEventListener("change", e => { if (e.target && e.target.id === "pl-c") { PL_C = e.target.value; render(); } });
  document.addEventListener("click", e => { const tr = e.target.closest && e.target.closest("tr[data-plc]"); if (tr) { PL_C = tr.dataset.plc; render(); } });
  document.addEventListener("change", e => { if (e.target && e.target.id === "wx-g") { WX_G = e.target.value; render(); } });
  document.addEventListener("change", e => { if (e.target && e.target.id === "ws-merge") { MERGE_WS = e.target.checked; render(); } });
  window.addEventListener("hashchange", () => { const v0 = st.v; fromHash(); if (st.v !== v0) show(st.v); else render(); });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 200); });
  fromHash(); fillAgCtl();
  show(st.v);
  window.__dash = { st, render, show, cRows, cbRows, gRows, qGet, delaySum, sum, D, X, openHelp };
})();
