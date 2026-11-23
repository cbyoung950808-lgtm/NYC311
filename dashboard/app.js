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
    when: { cd: ["part", "세부 지역은 월별 그래프만"], a: ["part", "일별 그래프는 기관 조건 미지원"], p: ["part", "일별 그래프는 신고가 많은 15개 유형만"], m: ["part", "월별 그래프는 12개월을 모두 보여 주고 선택한 달을 강조"], x: ["part", "일별 그래프는 집중 주소 제외 미지원"] },
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
        lim: "다시 신고됐다는 것이 해결 실패나 재발이라는 뜻은 아닙니다. 세대(호실) 정보가 없어 큰 건물의 여러 세대 신고도 같은 주소로 셉니다." },
      { v: "when", s: { p: P.indexOf("HEAT/HOT WATER") }, t: "계절과 특정 날짜에 따라 신고가 크게 달라집니다",
        fact: "난방·온수 신고는 겨울(11~2월)에 몰립니다. 하루 신고가 가장 많았던 2026-02-24에는 22,793건이 들어왔고, 그중 눈·얼음이 11,370건입니다.",
        lim: "1년 자료라 매년 반복되는 계절성인지 알 수 없고, 날씨와 대조하지 않아 급증 원인은 확정하지 않았습니다." },
      { v: "time", s: {}, t: pbOK ? "처리 시간의 자치구 차이는 대부분 「어떤 업무가 많은가」의 차이입니다" : "처리 시간 비교는 같은 업무끼리 해야 합니다",
        fact: pbOK ? (() => { const g = Object.fromEntries(L1.map(x => [x.borough, x]));
          const f = (b) => `${BKO[b]}은 단순 비교에서 ${g[b].raw_t.toFixed(1)}시간 vs 나머지 네 곳 ${g[b].raw_o.toFixed(1)}시간이지만, 비슷한 업무끼리 맞추면 ${g[b].adj_t_main.toFixed(1)} vs ${g[b].adj_o_main.toFixed(1)}시간입니다`;
          return `절반의 신고가 종료 기록에 도달한 시간을 비교했습니다. ${f("BRONX")}. ${f("MANHATTAN")}. 민원 유형·세부 유형·접수 월·기관이 같은 업무끼리 맞추면 차이가 크게 줄거나 방향이 바뀝니다.`; })()
          : "자치구마다 맡는 민원이 달라, 전체 값만 비교하면 업무 구성 차이가 섞입니다.",
        lim: "맞춘 비교도 지역의 순수한 영향이나 기관의 성과를 뜻하지 않습니다. 「종료 기록」은 실제 해결·수리 완료의 증거가 아닙니다." },
    ];
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
    $("where-body").innerHTML = c1 + c2 + c3;
  }

  // ======================= 2. WHEN =======================
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
    $("when-body").innerHTML = c1 + c2 + (c3 || "") + c4;
  }

  // ======================= 3. PLACES =======================
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
    $("places-body").innerHTML = c1 + c2 + c3;
  }

  // ======================= 4. TIME =======================
  function delaySum(s) { return DL.filter(r => (s.m < 0 || r[0] === s.m) && (s.b < 0 || r[1] === s.b) && (s.a < 0 || r[2] === s.a) && (s.p < 0 || r[3] === s.p) && (!s.x || r[4] === 0))
    .reduce((t, r) => [t[0] + r[5], t[1] + r[6], t[2] + r[7], t[3] + r[8]], [0, 0, 0, 0]); }
  function renderTime() {
    $("time-applies").innerHTML = appliesBar("time");
    const s = Object.assign({}, st, { cd: -1 });
    const rows = cRows(s), N = sum(rows), q = qGet(s.m, s.b, s.a, s.p, s.x), dl = delaySum(s);
    const selName = [st.b >= 0 ? bLabel(st.b) : "뉴욕시 전체", st.p >= 0 ? pShort(st.p) : "모든 유형", st.a >= 0 ? aName(st.a) : "", st.m >= 0 ? mLabel(st.m) : "12개월"].filter(Boolean).join(" · ");
    const agencies = (() => { const m = new Map(); rows.forEach(r => m.set(r[2], (m.get(r[2]) || 0) + r[8])); return [...m.entries()].sort((x, y) => y[1] - x[1]); })();
    const agLine = st.p >= 0 && agencies.length ? `<div class="agline">담당 기관: ${agencies.slice(0, 2).map(([a, n]) => `<b>${esc(aLabel(a))}</b> — ${esc(aMission(a))} <button class="hbtn" data-help="agency:${A[a]}">기관 설명</button>`).join("<br>")}</div>` : "";
    const kp = [
      [`절반이 종료 기록에 도달한 시간 ${help("median")}`, q ? fmtH(q[6]) : "-", q ? `중앙값 · 계산 대상: 종료 기록이 있는 신고 ${fmtN(q[5])}건 (현재 조건 ${fmtN(N)}건 중 ${pct(q[5], N)})` : NO_DATA],
      [`90%가 종료 기록에 도달한 시간 ${help("p90")}`, q ? fmtH(q[7]) : "-", q ? "같은 계산 대상 중 나머지 10%는 이보다 오래 걸림. 전체 신고의 90%가 해결됐다는 뜻이 아님" : NO_DATA],
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
    $("time-body").innerHTML = c1 + c2 + c3;
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
    $("ag-mission").innerHTML = `<b>${esc(aLabel(a))}</b> — ${esc(aMission(a))} <button class="hbtn" data-help="agency:${A[a]}">기관 설명·출처</button>`;
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
    ["corr", "두 지표가 함께 움직이는 정도", "상관관계 (스피어만 ρ)", "-1~1. 크다고 한쪽이 다른 쪽의 원인이라는 뜻이 아님."],
    ["cluster", "비슷한 특징끼리 묶어 보기", "군집 (K-Means)", "지표가 비슷한 지역·유형끼리 묶은 결과. 묶음의 구조가 약하면(실루엣 0.3 미만) 대략적인 구분으로만 읽음. 군집 번호는 이름표일 뿐 의미가 없음."],
    ["focus", "집중 주소", "focus address", "브롱크스 655 EAST 230 STREET(신고 47,105건, 대부분 주거 소음). 「제외」를 고르면 이 주소의 모든 신고를 뺌."],
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
        ["처리 시간 (절반·90%)", "Closed, 처리 시간 > 0, 상태·종료일 불일치 아님 (기존 EDA 기준). 조건마다 원자료에서 정확히 계산", `${fmtN(r.resolved_rows)}건`],
        ["7일·30일 종료 기록 없음", "관찰 마감 가정 2026-11-11 00:00 전 종료 시각 유무로 판단(상태 값 무관), 종료 시각이 접수보다 빠른 기록 제외, 그 기간을 지켜볼 수 있었던 접수만 분모", `7일 ${fmtN(pb.elig7)}건 / 30일 ${fmtN(pb.elig30)}건`],
        ["두 종료 기준의 차이", "EDA 기준은 「상태가 Closed이고 시간이 양수인 정상 종료 기록」을 측정, 새 기준은 「마감 전에 종료 시각이 기록됐는가」를 측정. 어느 한쪽이 정답이 아님. 같은 지표로 섞어 쓰지 않음", `상태는 Closed가 아닌데 종료 시각이 있는 신고 ${fmtN(pb.status_not_closed_but_close_time)}건`],
        ["주소", "자치구 + address_key(공백·대소문자만 통일). 약어는 합치지 않음. 주소 없는 신고는 한 장소로 보지 않음", "-"],
        ["세부 지역", "표준 커뮤니티 보드 59곳(코드 01~18)", `${fmtN(CBC.reduce((t, x) => t + x[6], 0))}건`],
        ["집중 주소", "BRONX + 655 EAST 230 STREET", "47,105건"],
      ]) + `<h4>지원하지 않는 것</h4><ul><li>여러 달을 묶은 기간 선택(백분위수를 정확히 합칠 수 없음)</li><li>주소 순위에서 유형+기간 동시 선택, 세부 지역 단위 주소 순위·처리 시간·요일/시간대</li><li>인구 대비 비율(별도 보고서 참고), 지도, 실시간 자료</li></ul>
        <p class="note">보고서: <a href="../reports/eda_report.md" target="_blank">EDA</a> · <a href="../reports/composition_report.md" target="_blank">지역별 구성</a> · <a href="../reports/repeat_address_report.md" target="_blank">반복 주소</a> · <a href="../reports/resolution_playbook_report.md" target="_blank">종료 시간 비교</a></p>`;
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
  window.addEventListener("hashchange", () => { const v0 = st.v; fromHash(); if (st.v !== v0) show(st.v); else render(); });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 200); });
  fromHash(); fillAgCtl();
  show(st.v);
  window.__dash = { st, render, show, cRows, cbRows, gRows, qGet, delaySum, sum, D, X, openHelp };
})();
