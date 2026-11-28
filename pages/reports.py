"""Analysis reports (markdown) with their figures."""
import re
from pathlib import Path

import streamlit as st

REP = Path(__file__).resolve().parents[1] / "reports"
TITLES = {
    "heat_priority_proposal": "제안: 지난해 신고 기록으로 난방 선제 점검 목록 만들기",
    "false_report_feasibility_review": "타당성 검토: 허위·오류 가능 신고 검토 업무",
    "events_report": "행사와 신고 증가: 지역·시간별 비교",
    "eda_report": "탐색적 데이터 분석(EDA) 보고서",
    "composition_report": "지역별 민원 유형 구성",
    "repeat_address_report": "동일 주소의 반복 신고",
    "resolution_playbook_report": "자치구별 종료 시간: 비슷한 업무끼리 맞춘 비교",
    "monthly_composition_report": "월별 민원 구성의 차이",
    "rereport_report": "종결 후 재접수율과 생존 분석",
    "reclass_check_report": "유형 이름 변경이 심화 분석에 미치는 영향",
    "weather_report": "날씨와 신고 급증",
    "surge_delay_report": "신고가 몰리면 종료가 늦어지는가",
    "heat_record_change_report": "난방·온수 기록 방식 변화 점검",
    "building_report": "건물 규모로 본 난방·온수 신고",
    "poi_report": "신고가 몰린 주소: 주변 장소와 신고 패턴",
    "place_centred_report": "장소 주변의 신고: 무엇이, 언제 더 많은가",
    "repeat_profile_report": "반복 신고 주소의 건물·주변 특성",
    "nycha_report": "공공임대주택(NYCHA)과 311 신고",
    "population_report": "인구 대비 신고: 자치구·세부 지역",
    "revalidation_report": "두 해 비교 재검증",
    "year_dashboard_report": "대시보드 지난해 화면: 같은 방식으로 계산한 지난해 결과",
    "spike_events_review": "급증일의 단서, 행사 카드 검증, 두 해 합쳐 보기",
}
st.set_page_config(page_title="분석 보고서", page_icon="📄", layout="wide")

names = [n for n in TITLES if (REP / f"{n}.md").exists()]
want = st.query_params.get("r", names[0])
idx = names.index(want) if want in names else 0
if want not in names:
    st.warning(f"요청한 보고서({want})를 찾지 못해 첫 보고서를 보여 줍니다.")
name = st.selectbox("보고서", names, index=idx, format_func=lambda n: TITLES[n])
st.query_params["r"] = name

IMG = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$")
CODE = re.compile(r"(`[^`]*`)")


def plain_tilde(line):
    """Ranges such as 1~7 must not become strikethrough (Streamlit markdown strikes text between two ~).
    Escape single ~ outside inline code; the report files themselves are not changed (2026-11-28)."""
    return "".join(part if part.startswith("`") else re.sub(r"(?<![~\\])~(?!~)", r"\\~", part) for part in CODE.split(line))


buf = []
def flush():
    if buf:
        st.markdown("\n".join(buf)); buf.clear()
in_fence = False
for line in (REP / f"{name}.md").read_text(encoding="utf-8").splitlines():
    if line.strip().startswith("```"):
        in_fence = not in_fence
    elif not in_fence:
        line = plain_tilde(line)
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
