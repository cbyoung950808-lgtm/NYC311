"""Analysis reports (markdown) with their figures.

2026-11-28: a contents page (proposals -> feasibility review -> evidence, one-line conclusion and last update per report)
and work records folded away: how-to-rerun lines (scripts, result folders, backups, run commands) and change-log
sections are moved out of the body into folded boxes at the end. The report files themselves are not changed by this.
"""
import json
import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

REP = Path(__file__).resolve().parents[1] / "reports"
TITLES = {
    "heat_priority_proposal": "제안 1: 지난 신고 기록으로 난방 시즌 전 선제 점검 목록 만들기",
    "no_access_revisit_proposal": "제안 2: 「출입 실패」로 닫힌 난방 신고를 확인 전화와 예약 재방문으로 마무리하기",
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
# reading order: proposals -> feasibility review -> evidence (grouped by question)
GROUPS = [
    ("1. 제안", "데이터 분석으로 바로 시범해 볼 수 있는 개선안", [
        ("heat_priority_proposal", "시즌 전 신고 이력으로 만든 필지 1,000곳 목록이 다음 시즌 난방 신고일의 18.6%를 미리 짚었습니다(무작위 2.4%, 세대 수 많은 순 5.0%)."),
        ("no_access_revisit_proposal", "들어가지 못해 닫힌 난방 신고는 다시 신고되는 일이 오히려 적고 복구 확인까지 수개월이 걸려, 확인 전화와 예약 재방문을 제안합니다."),
    ]),
    ("2. 타당성 검토", "해 볼 만한지 자료로 먼저 따져 본 아이디어", [
        ("false_report_feasibility_review", "허위 신고 판별은 신고자·현장 결과가 없어 할 수 없고, 같은 사안의 중복·연속 접수를 묶어 보여 주는 검토 보조가 현실적입니다."),
    ]),
    ("3. 근거 보고서", "제안의 바탕이 된 분석 (질문별)", []),
]
EVIDENCE = [
    ("데이터 전체의 모습", [
        ("eda_report", "기간·유형·지역·처리 시간의 전체 모습과, 한 주소·폭설일 같은 큰 이상치를 정리했습니다."),
        ("population_report", "건수는 브루클린이 가장 많지만, 주민 1,000명당 신고는 브롱크스(566건)가 가장 높습니다."),
        ("composition_report", "지역마다 민원 구성이 다르고, 일부 지역·유형 조합은 도시 평균의 2배 이상입니다."),
        ("monthly_composition_report", "하루 신고 수는 달마다 비슷하지만(약 1만~1.2만 건) 구성이 크게 바뀝니다."),
    ]),
    ("주소·건물·장소", [
        ("repeat_address_report", "신고의 90% 이상이 2건 이상 신고된 주소에서 나오고, 상위 1% 주소가 약 30%를 차지합니다."),
        ("repeat_profile_report", "100세대 이상·엘리베이터 아파트일수록 같은 유형이 반복되는 주소가 되기 쉽습니다(두 해 같은 방향)."),
        ("building_report", "세대 수로 나눠도 브롱크스의 난방 신고가 가장 많고, 오래 반복된 필지일수록 위반 기록이 많습니다."),
        ("nycha_report", "공공임대주택의 난방 문제는 311에 거의 없어(35만 건 중 70건), 311 난방 지표는 사실상 민간 건물만 봅니다."),
        ("poi_report", "주변 장소로는 신고가 몰리는 주소를 설명하기 어렵고, 신고가 들어오는 방식이 일반 주소와 다릅니다."),
        ("place_centred_report", "술집 옆 상업시설 소음 약 4배, 역 옆 노숙인 지원 약 5배처럼 장소 성격에 맞는 신고가 맞는 시간대에 몰립니다."),
    ]),
    ("시간·날씨·행사", [
        ("weather_report", "눈 온 뒤 눈·얼음 신고 약 14배, 혹한 때 난방 1.9배, 큰비 때 하수·침수 3.2배였습니다."),
        ("surge_delay_report", "신고가 몰릴 때 종료가 늦어지는지는 업무마다 달랐습니다(나무는 오히려 빨리 닫힘)."),
        ("events_report", "허가 행사가 있던 날, 행사 전체로는 신고가 늘지 않았습니다."),
        ("spike_events_review", "급증일의 대부분은 날씨와 겹쳤고, 행사 카드의 사례는 결과를 본 뒤 고른 것이라는 약점을 밝혔습니다."),
    ]),
    ("종료 기록과 재접수", [
        ("resolution_playbook_report", "올해 자치구 처리 시간 차이는 대부분 업무 구성 차이입니다(브롱크스 11.3 vs 7.2시간 → 맞추면 8.6 vs 8.3시간). 지난해 절반 시점은 맞춘 뒤에도 차이가 남았습니다."),
        ("rereport_report", "종결 뒤 7일 안에 약 3분의 1이 다시 접수되고, 중복 종결 뒤에 가장 많습니다(난방 출입 실패 결론은 2026-11-28 철회)."),
        ("heat_record_change_report", "2026-01-24부터 HPD가 난방 신고 일부를 열어 두는 기록이 다시 많아져, 7일 지표가 그 시점에 바뀌었습니다."),
    ]),
    ("두 해 검증과 기록 점검", [
        ("revalidation_report", "대부분의 결론이 지난해에도 나타났고, 처리 시간의 자치구 차이는 지표에 따라 반만 반복됐습니다."),
        ("year_dashboard_report", "지난해 화면을 같은 방식으로 계산했고, 지난해 브롱크스 경찰 신고와 2024-11 납 검사 키트 급증을 들여다봤습니다."),
        ("reclass_check_report", "2026-07 유형 이름 변경을 합치면 계절 변동 이상값이 사라지고, 다른 결과는 거의 같습니다."),
    ]),
]
st.set_page_config(page_title="분석 보고서", page_icon="📄", layout="wide")
# the host page Streamlit builds says lang="en"; mark it Korean where the browser allows it (2026-11-28)
components.html("<script>try{window.parent.document.documentElement.lang='ko'}catch(e){}</script>", height=0)
# short names for the contents buttons (button text does not wrap); the full title shows on hover
SHORT = {
    "heat_priority_proposal": "제안 1: 선제 점검", "no_access_revisit_proposal": "제안 2: 출입 실패 마무리",
    "false_report_feasibility_review": "허위·오류 신고 검토", "eda_report": "탐색적 분석(EDA)", "population_report": "인구 대비 신고",
    "composition_report": "지역별 유형 구성", "monthly_composition_report": "월별 유형 구성", "repeat_address_report": "같은 주소 반복",
    "repeat_profile_report": "반복 주소의 특성", "building_report": "건물 규모와 난방", "nycha_report": "공공임대주택(NYCHA)",
    "poi_report": "신고가 몰린 주소", "place_centred_report": "장소 바로 옆 신고", "weather_report": "날씨와 신고",
    "surge_delay_report": "몰릴 때 종료 지연", "events_report": "행사와 신고", "spike_events_review": "급증일·행사 검증",
    "resolution_playbook_report": "자치구별 종료 시간", "rereport_report": "종결 후 재접수", "heat_record_change_report": "난방 기록 방식 변화",
    "revalidation_report": "두 해 비교 재검증", "year_dashboard_report": "지난해 화면", "reclass_check_report": "유형 이름 변경 영향",
}

try:
    UPDATED = json.loads((REP / "_updated.json").read_text(encoding="utf-8"))
except Exception:
    UPDATED = {}
ORDER = [n for _, _, items in GROUPS for n, _ in items] + [n for _, items in EVIDENCE for n, _ in items]
names = ["index"] + [n for n in ORDER if (REP / f"{n}.md").exists()] + [n for n in TITLES if n not in ORDER and (REP / f"{n}.md").exists()]
label = lambda n: "목차: 보고서 한눈에 보기" if n == "index" else TITLES.get(n, n)
want = st.query_params.get("r", "index")
if want not in names:
    st.warning(f"요청한 보고서({want})를 찾지 못해 목차를 보여 줍니다.")
    want = "index"
# the selection lives in session state; buttons change it through a callback (links cannot move the page on the
# hosted app: a link in markdown opens a new tab, and a same-tab link is blocked by the hosting frame)
if "rep" not in st.session_state or st.session_state.get("_seen") != want:   # first visit, or a new ?r= link
    st.session_state["rep"] = want


def go(n):
    st.session_state["rep"] = n


name = st.selectbox("보고서", names, key="rep", format_func=label)
st.query_params["r"] = name
st.session_state["_seen"] = name


if name == "index":
    st.title("분석 보고서")
    st.markdown("뉴욕시 311 신고 두 해치(2024-11 ~ 2026-10)를 분석한 보고서입니다. **제안 → 타당성 검토 → 근거** 순서로 읽으면 됩니다. "
                "보고서 이름을 누르면 열립니다. 각 보고서의 실행 방법과 수정 이력은 본문 끝 접힌 칸에 있습니다.")
    W = [3, 5.8, 1.2]

    def table_rows(items):
        h = st.columns(W)
        for c, t in zip(h, ["보고서", "한 줄 결론", "최종 갱신"]):
            c.caption(f"**{t}**")
        for n, line in items:
            c1, c2, c3 = st.columns(W)
            c1.button(SHORT.get(n, TITLES.get(n, n)), key=f"go-{n}", on_click=go, args=(n,), type="tertiary", help=TITLES.get(n, n))
            c2.markdown(line)
            c3.caption(UPDATED.get(n, ""))
        st.divider()
    for title, sub, items in GROUPS:
        st.subheader(title)
        st.caption(sub)
        if items:
            table_rows(items)
    for title, items in EVIDENCE:
        st.markdown(f"**{title}**")
        table_rows(items)
    st.caption("신고는 실제 사건이 아니라 접수된 기록입니다. 종료 기록은 해결의 증거가 아니고, 재접수는 해결 실패가 아닙니다.")
    st.page_link("streamlit_app.py", label="← 대시보드로 돌아가기")
    st.stop()

IMG = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$")
CODE = re.compile(r"(`[^`]*`)")


def plain_tilde(line):
    """Ranges such as 1~7 must not become strikethrough (Streamlit markdown strikes text between two ~).
    Escape single ~ outside inline code; the report files themselves are not changed (2026-11-28)."""
    return "".join(part if part.startswith("`") else re.sub(r"(?<![~\\])~(?!~)", r"\\~", part) for part in CODE.split(line))


BOLD = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*")


def html_bold(line):
    """**x** next to Korean text or punctuation (e.g. **14.4%**의, **「x」**) is not bold in CommonMark and shows the
    asterisks. Turn it into <strong> outside inline code; the page renders with HTML on (2026-11-28)."""
    return "".join(part if part.startswith("`") else BOLD.sub(r"<strong>\1</strong>", part) for part in CODE.split(line))


# work records: folded away, never deleted (2026-11-28)
REPRO_LINE = re.compile(r"^\s*[-*] \*\*(스크립트|코드|결과 파일|보존|v1 보관본|재현)\*\*|^\s*[-*] 다시 만들기:|\.venv/bin/python|backup/|^재현[:：]")
LOG_HEAD = re.compile(r"^(#{2,4}) .*(수정 기록|수정 이력|바뀐 점|대시보드 반영|재현 정보)")


def split_work(lines):
    """Body lines, how-to-rerun lines and change-log sections. Table rows stay in the body; a moved bullet takes its
    indented continuation lines with it; a change-log section runs to the next heading of the same or higher level."""
    body, repro, log = [], [], []
    i, in_fence = 0, False
    while i < len(lines):
        ln = lines[i]
        if ln.strip().startswith("```"):
            in_fence = not in_fence
        if not in_fence:
            m = LOG_HEAD.match(ln)
            if m:
                lvl = len(m.group(1)); log.append("#" * min(lvl + 1, 4) + ln[lvl:]); i += 1
                while i < len(lines) and not re.match(r"^#{1,%d} " % lvl, lines[i]):
                    log.append(lines[i]); i += 1
                continue
            if not ln.startswith("|") and REPRO_LINE.search(ln):
                repro.append(ln.lstrip()); i += 1
                while i < len(lines) and lines[i].startswith(("  ", "\t")) and lines[i].strip():
                    repro.append(lines[i]); i += 1
                continue
        body.append(ln); i += 1
    return body, repro, log


def render(lines):
    buf = []

    def flush():
        if buf:
            st.markdown("\n".join(buf), unsafe_allow_html=True); buf.clear()
    in_fence = False
    for line in lines:
        if line.strip().startswith("```"):
            in_fence = not in_fence
        elif not in_fence:
            line = html_bold(plain_tilde(line))
        m = IMG.match(line.strip())
        if m:
            flush()
            p = (REP / m.group(2)).resolve()
            if p.exists() and REP in p.parents: st.image(str(p), caption=m.group(1) or None, width="stretch")
            else: st.caption(f"(그림 없음: {m.group(2)})")
        else:
            buf.append(line)
    flush()


body, repro, log = split_work((REP / f"{name}.md").read_text(encoding="utf-8").splitlines())
st.button("← 목차로", key="to-index", on_click=go, args=("index",), type="tertiary")
if UPDATED.get(name):
    st.caption(f"최종 갱신 {UPDATED[name]}")
render(body)
if repro:
    with st.expander("재현 정보 (스크립트·결과 파일·실행 방법)"):
        render(repro)
if log:
    with st.expander("수정 이력·작업 메모"):
        render(log)
st.page_link("streamlit_app.py", label="← 대시보드로 돌아가기")
