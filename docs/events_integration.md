# 행사 분석 화면과 여러 AI의 작업 충돌 방지

2026-11-26 행사 분석을 기존 대시보드의 2번 화면에 독립 모듈로 추가했다.

## 변경 범위

- 화면: `dashboard/events.js`. `app.js`의 상태·계산·기존 카드에는 의존하지 않는다.
- 데이터: `dashboard/data/events_data.js`. `dashboard/build_events_data.py`로 생성한다.
- 시작점: `dashboard/index.html`에서 기존 `app.js` 뒤에 위 두 파일을 읽는다.
- 보고서: `reports/events_report.md`, 표·그림·검증값: `reports/events/`.
- Streamlit 보고서 선택: `pages/reports.py`의 `events_report` 항목.

## 여러 AI가 같은 프로젝트를 사용할 때

1. 다른 AI가 쓰는 `deploy/streamlit_app`에서 직접 커밋·리셋·전체 재생성하지 않는다.
2. GitHub 최신 main을 별도 checkout으로 복사하고 행사 관련 경로만 반영한다.
3. 공유 파일(index, 배포 빌더)을 편집할 때 읽은 뒤 내용이 바뀌지 않았는지 확인하고, 바뀌었으면 최신 내용에 작은 변경을 다시 적용한다. 이를 모든 AI가 지키지 않으면 파일 동시 쓰기를 완전히 막을 수는 없다.
4. 원격 브랜치가 이동하면 강제 푸시하지 않는다. 최신 변경 위에 다시 통합하고 검증한다.
5. 완성된 변경은 행사 전용 브랜치·PR로 올려 main에 합친다. 관련 없는 데이터·화면·보고서를 함께 업로드하지 않는다.

## 다시 생성할 때

원 프로젝트에서:

```bash
.venv/bin/python scripts/events/fetch_events.py
.venv/bin/python scripts/events/event_analysis.py
.venv/bin/python dashboard/build_events_data.py
```

전체 배포 빌더는 `events.bundle_events.copy_event_assets`를 호출해 필요한 행사 결과만 포함한다.
다른 배포 파일을 건드리지 않고 독립 checkout에 복사하려면:

```bash
.venv/bin/python scripts/events/bundle_events.py /path/to/isolated-checkout
```

원본 행사 JSON 약 62MB, 행별 허가 목록, 311 원본·Parquet은 배포하지 않는다. 검토한 보고서, 집계표, 출처·수집 manifest, 그림만 포함한다.

## 해석과 필터

- 행사 카드는 전체 참고 결과다. 상단 지역·기관·유형·기간 필터를 적용하지 않는다. 카드 안에서 행사와 시간 구간만 선택한다.
- 허가 자체는 실제 개최·관객 수나 소음의 원인을 입증하지 않는다.
- 연결 단위는 자치구+커뮤니티 보드다. 행사 경로 바로 앞의 신고가 아니다.
- 날씨를 맞춘 비교일이 3개 미만이면 요일·시간만 맞춘 비교값을 쓰고 경고한다.
- `app.js`가 화면을 다시 그리면 독립 모듈이 자신의 카드만 복구한다. 이를 없애려면 index의 행사 스크립트 2개만 제거하면 된다.
