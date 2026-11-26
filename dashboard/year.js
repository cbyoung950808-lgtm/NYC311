/* Year switch for the dashboard (added 2026-11-26).
   Loaded after every data file and before relations.js / app.js.
   - Current year (2025-11 ~ 2026-10): the data files set window.DASHBOARD_DATA etc. as before.
   - Previous year (2024-11 ~ 2025-10): dashboard/data/prev/*.js store the same objects under window.YEAR_PREV.
   The year comes from the address (y=2024 in the hash, or in the Streamlit ?s= state). When the previous year is
   chosen, this file swaps the window globals before the screens start, so app.js / relations.js need no other change
   to read the data. Results that exist for one year only (two-year comparison, permitted events) are left as they are. */
(function () {
  "use strict";
  const NAMES = ["DASHBOARD_DATA", "EXPLORE_DATA", "RELATIONS_DATA", "REREPORT_DATA", "WEATHER_DATA", "SURGE_DATA",
    "BUILDING_DATA", "POI_DATA", "PLACE_DATA", "REPEAT_PROFILE_DATA", "NYCHA_DATA"];
  const INFO = {
    cur: { key: "cur", y: "2025", label: "2025-11 ~ 2026-10", short: "올해", long: "올해 (2025-11 ~ 2026-10)",
      start: "2025-11-01", last_day: "2026-10-31", first_full: "2025-11-02", last_full: "2026-10-30", obs: "2026-11-11",
      elig30: "2026-10-12", file_date: "2026-11-12", hpd: ["2025-11-01", "2026-11-10"], partial_edges: true },
    prev: { key: "prev", y: "2024", label: "2024-11 ~ 2025-10", short: "지난해", long: "지난해 (2024-11 ~ 2025-10)",
      start: "2024-11-01", last_day: "2025-10-31", first_full: "2024-11-02", last_full: "2025-10-30", obs: "2025-11-11",
      elig30: "2025-10-12", file_date: "2025-11-12", hpd: ["2024-11-01", "2025-11-10"], partial_edges: false },
  };
  function stateString() {
    let raw = "";
    try { raw = decodeURIComponent(location.hash.slice(1)); } catch (e) { raw = location.hash.slice(1); }
    if (!raw && window.STREAMLIT_EMBED && window.INITIAL_STATE) raw = window.INITIAL_STATE;
    return raw;
  }
  function yearFromState(raw) {
    const q = new URLSearchParams((raw || "").split("?")[1] || "");
    return q.get("y") === "2024" ? "prev" : q.has("y") ? "cur" : null;
  }
  let key = yearFromState(stateString());
  if (key == null && window.STREAMLIT_EMBED) {   // Streamlit: the iframe reload keeps the original state, so remember the choice for this tab
    try { const s = sessionStorage.getItem("nyc311_year"); if (s === "prev" || s === "cur") key = s; } catch (e) { /* storage blocked */ }
  }
  if (key !== "prev") key = "cur";
  const prevData = window.YEAR_PREV || {};
  const available = NAMES.every(n => n === "RELATIONS_DATA" || n in prevData) && !!prevData.DASHBOARD_DATA;
  if (key === "prev" && !available) key = "cur";

  // keep both years (the monthly chart draws the other year as a comparison line)
  const curData = {}; NAMES.forEach(n => { curData[n] = window[n]; });
  if (key === "prev") NAMES.forEach(n => { window[n] = prevData[n]; });

  window.YEAR = Object.assign({}, INFO[key], {
    other: INFO[key === "prev" ? "cur" : "prev"],
    data: { cur: curData, prev: prevData },
    hasPrev: available,
    yearFromState,
    remember(k) { try { sessionStorage.setItem("nyc311_year", k); } catch (e) { /* storage blocked */ } },
  });
})();
