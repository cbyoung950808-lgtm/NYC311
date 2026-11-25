"""Analysis reports (markdown) with their figures."""
import re
from pathlib import Path

import streamlit as st

REP = Path(__file__).resolve().parents[1] / "reports"
TITLES = {
    "eda_report": "탐색적 데이터 분석(EDA) 보고서",
    "composition_report": "지역별 민원 유형 구성",
    "repeat_address_report": "동일 주소의 반복 신고",
    "resolution_playbook_report": "자치구별 종료 시간: 비슷한 업무끼리 맞춘 비교",
    "monthly_composition_report": "월별 민원 구성의 차이",
    "rereport_report": "종결 후 재접수율과 생존 분석",
    "reclass_check_report": "유형 이름 변경이 심화 분석에 미치는 영향",
    "weather_report": "날씨와 신고 급증",
}
st.set_page_config(page_title="분석 보고서", page_icon="📄", layout="wide")

names = [n for n in TITLES if (REP / f"{n}.md").exists()]
want = st.query_params.get("r", names[0])
idx = names.index(want) if want in names else 0
name = st.selectbox("보고서", names, index=idx, format_func=lambda n: TITLES[n])
st.query_params["r"] = name

IMG = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$")
buf = []
def flush():
    if buf:
        st.markdown("\n".join(buf)); buf.clear()
for line in (REP / f"{name}.md").read_text(encoding="utf-8").splitlines():
    m = IMG.match(line.strip())
    if m:
        flush()
        p = (REP / m.group(2)).resolve()
        if p.exists() and REP in p.parents: st.image(str(p), caption=m.group(1) or None, width="stretch")
        else: st.caption(f"(그림 없음: {m.group(2)})")
    else:
        buf.append(line)
flush()
st.page_link("streamlit_app.py", label="← 대시보드로 돌아가기")
