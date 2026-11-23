# NYC 311 신고 살펴보기 (Streamlit)

뉴욕시 311 신고(2025-11 ~ 2026-10)를 질문 순서로 살펴보는 대시보드입니다.
- 실제 사건이 아니라 **접수된 신고 기록**입니다.
- 이 저장소에는 **미리 집계한 결과와 분석 보고서만** 들어 있고, 원자료(CSV·Parquet)는 들어 있지 않습니다.
- 출처: NYC Open Data, 311 Service Requests from 2020 to Present (2026-11-12 추출본).

## 구성

| 경로 | 내용 |
|---|---|
| `streamlit_app.py` | 대시보드 화면 (정적 HTML/JS 대시보드를 한 페이지로 묶어 표시) |
| `pages/reports.py` | 분석 보고서 (EDA, 지역별 구성, 반복 주소, 종료 시간 비교) |
| `dashboard/` | 대시보드 화면 파일과 집계 데이터(`data/*.js`) |
| `reports/` | 보고서 마크다운과 그림 |

화면의 조건은 주소의 `?s=` 값에 저장됩니다. 「이 화면 링크 복사」로 같은 화면을 다시 열 수 있습니다.

## 로컬 실행

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## 갱신 방법

원 프로젝트에서 집계와 보고서를 다시 만든 뒤 `python3 scripts/build_streamlit_bundle.py`를 실행하면 이 폴더의 `dashboard/`와 `reports/`가 다시 채워집니다.
