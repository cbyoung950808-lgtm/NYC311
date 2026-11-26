# 뉴욕시 과거 허가 행사 자료

- 자료명: NYC Permitted Event Information - Historical
- 제공: NYC Open Data / Office of Citywide Event Coordination and Management
- 공식 데이터: https://data.cityofnewyork.us/d/bkfu-528j
- 공식 메타데이터: https://data.cityofnewyork.us/api/views/bkfu-528j.json
- API: https://data.cityofnewyork.us/resource/bkfu-528j.json
- 받은 날짜: 2026-11-26 (한국 시간)
- 조건: 시작 시각이 2026-11-01보다 이르고, 종료 시각이 2025-11-01 이상인 허가
- 원문: `events_20251101_20261031.json`, `_page2.json`, `_page3.json`, `_page4.json`
- 페이지 크기: 50,000행. 마지막 페이지까지 수집. URL·건수·SHA-256은 `download_manifest.json`.
- 원문 컬럼 설명: `metadata.json`. 내려받은 JSON은 수정하지 않음.

## 중요한 해석 기준

- 승인된 신청/허가 정보다. 실제 개최, 취소 여부, 관객 수나 현장 소음을 증명하지 않는다.
- 한 행은 행사 한 개와 같지 않다. 같은 ID가 여러 장소·도로 구간·일시에 나타난다.
- 스포츠 정기 이용·시설 사용·준비·우천 예비 일정도 있다. 분석용 선정 기준은 `scripts/events/event_analysis.py`에 별도로 정의했다.
- 주최 측 기록·보도와 달리 일부 시위·비공식 모임은 누락될 수 있다.
- 촬영 허가는 메타데이터상 하나 이상의 도로에 5일 이상 영향을 주는 경우만 포함한다.
- `community_board`의 공원 등 비표준 번호(55·64 등)를 표준 주거지역으로 추정 배정하지 않는다.
- 날짜·시간에는 시간대 표시가 없다. 기존 311 자료와 동일하게 현지 벽시계 시각으로 비교했으며 UTC 변환은 하지 않았다.
- API는 갱신되는 자료다. 추후 재수집하면 허가 기록이 달라질 수 있다. 수집은 페이지 단위이며 단일 트랜잭션 스냅샷은 아니다.

## 같이 사용한 프로젝트 자료

- 311: `data/processed/311_requests_clean.parquet` (기존 BASE, 중복 의심 제외)
- 날씨: NOAA 센트럴파크 자료를 연결한 `reports/weather/tables/daily_series.csv`
- 휴일 날짜: https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
- 2026-07-04 실제 기념일과 07-03 연방 대체휴무일을 각각 제외일로 지정했다.
- 종교·문화 기념일을 모두 포괄한 공휴일 달력은 아니다.
