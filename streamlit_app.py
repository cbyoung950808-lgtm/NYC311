"""NYC 311 dashboard on Streamlit.

The dashboard itself is a static HTML/JS page (dashboard/). This wrapper inlines its CSS, scripts and
pre-aggregated data into one page and shows it with st.components.v1.html. No raw data is included.
Conditions are kept in the browser address (?s=...), so a copied link reopens the same view.
"""
import hashlib
import json
import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

HERE = Path(__file__).parent
DASH = HERE / "dashboard"

st.set_page_config(page_title="NYC 311 신고 살펴보기", page_icon="📊", layout="wide", initial_sidebar_state="collapsed")
st.markdown("""<style>
  .block-container {padding-top: 0.6rem; padding-bottom: 0; padding-left: 0.6rem; padding-right: 0.6rem; max-width: 100%;}
  header[data-testid="stHeader"] {height: 0; min-height: 0;}
  iframe {border: 0;}
</style>""", unsafe_allow_html=True)


def files_stamp() -> str:
    """Fingerprint of the dashboard files, so the cached page is rebuilt whenever a file changes
    (Streamlit Cloud pulls new commits without restarting the process, and st.cache_data would keep the old page)."""
    h = hashlib.sha1()
    for p in sorted(DASH.rglob("*")):
        if p.is_file():
            st_ = p.stat(); h.update(f"{p.relative_to(DASH)}|{st_.st_size}|{st_.st_mtime_ns}".encode())
    return h.hexdigest()


@st.cache_data(show_spinner="대시보드를 불러오는 중…", max_entries=2)
def build_page(stamp: str) -> str:
    html = (DASH / "index.html").read_text(encoding="utf-8")
    css = (DASH / "style.css").read_text(encoding="utf-8")
    html = re.sub(r'<link rel="stylesheet" href="style\.css[^"]*">', lambda m: f"<style>{css}</style>", html)

    def inline(m):
        src = m.group(1).split("?")[0]
        code = (DASH / src).read_text(encoding="utf-8").replace("</script", "<\\/script")
        return f"<script>{code}</script>"
    return re.sub(r'<script src="([^"]+)"></script>', inline, html)


page = build_page(files_stamp())
state = st.query_params.get("s", "")
boot = f"<script>window.STREAMLIT_EMBED = true; window.INITIAL_STATE = {json.dumps(state)};</script>"
page = page.replace("<head>", "<head>" + boot, 1)
components.html(page, height=1180, scrolling=True)
st.caption("데이터: NYC Open Data 311 Service Requests (2025-11 ~ 2026-10) 집계본 · 원자료는 포함하지 않습니다 · "
           "[분석 보고서 보기](reports)")
