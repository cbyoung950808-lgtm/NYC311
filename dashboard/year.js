/* Year switch for the dashboard (added 2026-11-26; two-year view added the same day).
   Loaded after every data file and before relations.js / app.js.
   - This year (2025-11 ~ 2026-10): the data files set window.DASHBOARD_DATA etc. as before.
   - Last year (2024-11 ~ 2025-10): dashboard/data/prev/*.js store the same objects under window.YEAR_PREV.
   - Two years (2024-11 ~ 2026-10): dashboard/data/both/*.js (counts, closure times, daily series, relations, spike clues)
     under window.YEAR_BOTH. Analysis cards are not pooled; app.js shows the two years side by side (COMPARE_DATA).
   The choice comes from the address (y=2024 / y=both in the hash, or in the Streamlit ?s= state). This file swaps the
   window globals before the screens start. Results for one year only (permitted events) are left as they are. */
(function () {
  "use strict";
  const NAMES = ["DASHBOARD_DATA", "EXPLORE_DATA", "RELATIONS_DATA", "REREPORT_DATA", "WEATHER_DATA", "SURGE_DATA",
    "BUILDING_DATA", "POI_DATA", "PLACE_DATA", "REPEAT_PROFILE_DATA", "NYCHA_DATA", "SPIKE_DATA"];
  const BOTH_NAMES = ["DASHBOARD_DATA", "EXPLORE_DATA", "RELATIONS_DATA", "SPIKE_DATA"];
  const INFO = {
    cur: { key: "cur", y: "2025", label: "2025-11 ~ 2026-10", short: "올해", long: "올해 (2025-11 ~ 2026-10)", span: "1년",
      start: "2025-11-01", last_day: "2026-10-31", first_full: "2025-11-02", last_full: "2026-10-30", obs: "2026-11-11",
      elig30: "2026-10-12", file_date: "2026-11-12", hpd: ["2025-11-01", "2026-11-10"], partial_edges: true,
      full_ranges: [["2025-11-02", "2026-10-30"]], partial_days: ["2025-11-01", "2026-10-31"] },
    prev: { key: "prev", y: "2024", label: "2024-11 ~ 2025-10", short: "지난해", long: "지난해 (2024-11 ~ 2025-10)", span: "1년",
      start: "2024-11-01", last_day: "2025-10-31", first_full: "2024-11-02", last_full: "2025-10-30", obs: "2025-11-11",
      elig30: "2025-10-12", file_date: "2025-11-12", hpd: ["2024-11-01", "2025-11-10"], partial_edges: false,
      full_ranges: [["2024-11-02", "2025-10-30"]], partial_days: [] },
    both: { key: "both", y: "both", label: "2024-11 ~ 2026-10", short: "두 해", long: "두 해 (2024-11 ~ 2026-10)", span: "2년",
      start: "2024-11-01", last_day: "2026-10-31", first_full: "2024-11-02", last_full: "2026-10-30", obs: "각 해의 11-11",
      elig30: "각 해의 10-12", file_date: "", hpd: ["", ""], partial_edges: true,
      full_ranges: [["2024-11-02", "2025-10-30"], ["2025-11-02", "2026-10-30"]], partial_days: ["2025-11-01", "2026-10-31"] },
  };
  function stateString() {
    let raw = "";
    try { raw = decodeURIComponent(location.hash.slice(1)); } catch (e) { raw = location.hash.slice(1); }
    if (!raw && window.STREAMLIT_EMBED && window.INITIAL_STATE) raw = window.INITIAL_STATE;
    return raw;
  }
  function yearFromState(raw) {
    const q = new URLSearchParams((raw || "").split("?")[1] || "");
    const y = q.get("y");
    return y === "2024" ? "prev" : y === "both" ? "both" : q.has("y") ? "cur" : null;
  }
  let key = yearFromState(stateString());
  if (key == null && window.STREAMLIT_EMBED) {   // Streamlit: the iframe reload keeps the original state, so remember the choice for this tab
    try { const s = sessionStorage.getItem("nyc311_year"); if (s === "prev" || s === "cur" || s === "both") key = s; } catch (e) { /* storage blocked */ }
  }
  if (key !== "prev" && key !== "both") key = "cur";
  const prevData = window.YEAR_PREV || {}, bothData = window.YEAR_BOTH || {};
  const hasPrev = NAMES.every(n => n === "RELATIONS_DATA" || n === "SPIKE_DATA" || n in prevData) && !!prevData.DASHBOARD_DATA;
  const hasBoth = !!bothData.DASHBOARD_DATA && !!bothData.EXPLORE_DATA;
  if ((key === "prev" && !hasPrev) || (key === "both" && !hasBoth)) key = "cur";

  // Two-year view: the additive count cubes are not stored twice. They are the exact sum (here: union, since the two
  // years have different months) of the two years' cubes, re-indexed to the two-year dimension order. Quantiles,
  // address rankings, the daily series and the spike clues are pre-computed on the pooled data (not additive).
  function mergeAdditive(bd, bx, Y1, Y2) {
    const dims = bd.dims, ix = arr => { const m = new Map(); arr.forEach((v, i) => m.set(v, i)); return m; };
    const M = ix(dims.months), B = ix(dims.boroughs), A = ix(dims.agencies), P = ix(dims.problems), CB = ix(bx.cbs);
    const out = { counts: [], gba: [], gall: [], cb: [], unl: [], wd: [], hr: [], dl: [], mixed: { groups: 0, rows: 0 } };
    [Y1, Y2].forEach(Y => {
      const d = Y.DASHBOARD_DATA, x = Y.EXPLORE_DATA, dm = d.dims;
      const f = (arr, map) => i => (i < 0 ? -1 : map.get(arr[i]));
      const m = f(dm.months, M), b = f(dm.boroughs, B), a = f(dm.agencies, A), p = f(dm.problems, P), cb = i => CB.get(x.cbs[i]);
      d.counts.rows.forEach(r => out.counts.push([m(r[0]), b(r[1]), a(r[2]), p(r[3])].concat(r.slice(4))));
      d.groups_by_agency.rows.forEach(r => out.gba.push([m(r[0]), b(r[1]), a(r[2]), p(r[3])].concat(r.slice(4))));
      d.groups_all_agency.rows.forEach(r => out.gall.push([m(r[0]), b(r[1]), p(r[2])].concat(r.slice(3))));
      x.cb_cube.rows.forEach(r => out.cb.push([cb(r[0]), a(r[1]), p(r[2]), m(r[3])].concat(r.slice(4))));
      x.unlinked.rows.forEach(r => out.unl.push([b(r[0]), a(r[1]), p(r[2]), m(r[3])].concat(r.slice(4))));
      x.weekday.rows.forEach(r => out.wd.push([b(r[0]), a(r[1]), p(r[2]), m(r[3])].concat(r.slice(4))));
      x.hour.rows.forEach(r => out.hr.push([b(r[0]), a(r[1]), p(r[2]), m(r[3])].concat(r.slice(4))));
      x.delay.rows.forEach(r => out.dl.push([m(r[0]), b(r[1]), a(r[2]), p(r[3])].concat(r.slice(4))));
      out.mixed.groups += d.mixed_agency_groups.groups; out.mixed.rows += d.mixed_agency_groups.rows;
    });
    return out;
  }
  if (bothData.DASHBOARD_DATA && bothData.EXPLORE_DATA && !bothData.DASHBOARD_DATA.counts && hasPrev) {
    const bd = bothData.DASHBOARD_DATA, bx = bothData.EXPLORE_DATA, cur0 = {}, prev0 = prevData;
    NAMES.forEach(n => { cur0[n] = window[n]; });
    const g = mergeAdditive(bd, bx, prev0, cur0);
    bd.counts = { cols: cur0.DASHBOARD_DATA.counts.cols, rc_codes: cur0.DASHBOARD_DATA.counts.rc_codes, rows: g.counts };
    bd.groups_by_agency = { cols: cur0.DASHBOARD_DATA.groups_by_agency.cols, rows: g.gba };
    bd.groups_all_agency = { cols: cur0.DASHBOARD_DATA.groups_all_agency.cols, rows: g.gall };
    bd.mixed_agency_groups = g.mixed;
    bx.cb_cube = { cols: cur0.EXPLORE_DATA.cb_cube.cols, rows: g.cb };
    bx.unlinked = { cols: cur0.EXPLORE_DATA.unlinked.cols, rows: g.unl };
    bx.weekday = { cols: cur0.EXPLORE_DATA.weekday.cols, rows: g.wd, note: "FULL_DAY rows only" };
    bx.hour = { cols: cur0.EXPLORE_DATA.hour.cols, rows: g.hr, note: "FULL_DAY rows only" };
    bx.delay = { cols: cur0.EXPLORE_DATA.delay.cols, rows: g.dl, cutoff: "each year 11-11" };
  }
  window.__mergeAdditive = mergeAdditive;   // used once to check the merge against the pooled build

  // keep every year (the monthly chart draws the other year as a comparison line)
  const curData = {}; NAMES.forEach(n => { curData[n] = window[n]; });
  if (key === "prev") NAMES.forEach(n => { window[n] = prevData[n]; });
  if (key === "both") NAMES.forEach(n => { window[n] = BOTH_NAMES.includes(n) ? bothData[n] : undefined; });

  window.YEAR = Object.assign({}, INFO[key], {
    other: key === "both" ? null : INFO[key === "prev" ? "cur" : "prev"],
    data: { cur: curData, prev: prevData, both: bothData },
    hasPrev, hasBoth,
    yearFromState,
    isFull(d) { return this.full_ranges.some(([a, b]) => d >= a && d <= b); },
    remember(k) { try { sessionStorage.setItem("nyc311_year", k); } catch (e) { /* storage blocked */ } },
  });
})();
