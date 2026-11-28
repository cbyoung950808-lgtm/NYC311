/* Independent event-analysis card. No changes to app.js state or calculations.
   2026-11-28: wording follows reports/spike_events_review.md 1-2 (cases picked after seeing results, small and
   contaminated comparison days) -> overall result first, case verdict lowered to "hard to judge". Data unchanged. */
(() => {
  'use strict';
  const data = window.EVENTS_DATA;
  const host = document.getElementById('when-body');
  if (!data || !host || document.getElementById('events-addon-style')) return;
  const style = document.createElement('style');
  style.id = 'events-addon-style';
  style.textContent = `
    #when-events {font-size:16px;line-height:1.65}
    #when-events .evt-intro {max-width:78ch}
    #when-events .evt-controls {display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}
    #when-events label {font-size:14px;display:flex;flex-direction:column;gap:4px}
    #when-events select {font:inherit;padding:8px;max-width:100%}
    #when-events .evt-chart {margin:16px 0;display:grid;gap:12px}
    #when-events .evt-bar-row {display:grid;grid-template-columns:minmax(120px,180px) 1fr 72px;gap:12px;align-items:center;font-size:14px}
    #when-events .evt-track {height:24px;background:var(--rule-2,#eee);border-radius:4px;overflow:hidden}
    #when-events .evt-fill {height:100%;min-width:2px;border-radius:4px}
    #when-events .evt-value {text-align:right;font-weight:700}
    #when-events .evt-note {font-size:14px;margin:12px 0}
    #when-events .evt-warning {border-left:3px solid #c27d13;padding:8px 12px;margin:12px 0;font-size:14px}
    #when-events summary {cursor:pointer;font-size:15px;margin:14px 0}
    #when-events .evt-table-wrap {overflow-x:auto}
    #when-events table {border-collapse:collapse;width:100%;font-size:14px}
    #when-events th,#when-events td {padding:8px;text-align:left;border-bottom:1px solid var(--rule,#ddd)}
    #when-events .evt-links {display:flex;gap:20px;flex-wrap:wrap;font-size:14px;margin-top:16px}
    @media(max-width:560px){#when-events .evt-bar-row{grid-template-columns:112px 1fr 55px;gap:6px}}
  `;
  document.head.appendChild(style);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number(value).toLocaleString('ko-KR', {maximumFractionDigits:1});
  let selected = data.cases[0].id;
  let windowKey = 'permit_hours';
  function reportURL() {
    if (!window.STREAMLIT_EMBED) return '../reports/events_report.md';
    try {
      const p = window.parent.location;
      return p.origin + p.pathname.replace(/\/[^/]*$/, '') + '/reports?r=events_report';
    } catch (_) { return '/reports?r=events_report'; }
  }
  function render(card) {
    const item = data.cases.find(c => c.id === selected);
    const values = item.windows[windowKey];
    const matched = values.weather_baseline !== null && values.weather_controls >= 3;
    const baseline = matched ? values.weather_baseline : values.baseline;
    const controls = matched ? values.weather_controls : values.controls;
    const max = Math.max(1, values.actual, baseline);
    const rows = [['행사 관련 지역의 신고', values.actual, '#2a78d6'],
      [matched ? '비슷한 날씨의 비교일' : '같은 요일·시간 비교일', baseline, '#eb6834']];
    const timing = windowKey === 'permit_hours' ? item.hours : '허가 종료 후~다음 날 오전 6시';
    const summary = data.summary.map(r => `<tr><td>${esc(r.label)}</td><td>${r.ratio.toFixed(2)}배</td><td>${num(r.district_days)}개</td></tr>`).join('');
    const coverage = 100 * data.inputs.weather_comparable_district_days / data.inputs.district_days;
    const rs = data.summary.map(r => r.ratio), lo = Math.min(...rs), hi = Math.max(...rs);
    const ratio = baseline > 0 ? values.actual / baseline : null;
    const why = [`비교일 ${num(controls)}개뿐`];
    if (values.actual < 100) why.push(`건수가 작음(${num(values.actual)}건 vs ${num(baseline)}건)`);
    if (!matched) why.push('날씨까지 맞는 비교일 부족');
    const CASE_NOTE = { bronx_dominican: '이 행사의 비교일 8개 중 5개에는 같은 지역에 다른 선정 행사(주로 광장 설치물 허가)가 있었고, 07-05는 독립기념일 연휴 다음 날입니다.' };
    const verdict = `비교일 중앙값의 ${ratio === null ? '-' : ratio.toFixed(1) + '배'}입니다. 다만 근거가 약합니다(${why.join(' · ')}). 이 사례는 결과를 본 뒤 눈에 띄는 행사를 고른 것이라 <b>「차이 판단 어려움」</b>으로 봅니다.${CASE_NOTE[item.id] ? ' ' + CASE_NOTE[item.id] : ''}`;
    card.innerHTML = `
      <h3 class="ch">행사가 있던 날, 신고가 늘었나요?</h3>
      <p class="evt-note"><span class="fixtag">전체 참고 결과 · 위의 지역·기관·유형·기간 필터는 적용되지 않습니다</span></p>
      <p class="evt-intro"><b>행사 전체로 보면 신고가 늘지 않았습니다.</b> 공식 허가 행사와 같은 지역·요일·시간의 신고를 날씨까지 맞춰 비교하면, 아래 5개 유형 모두 비교일의 ${lo.toFixed(2)}~${hi.toFixed(2)}배였습니다.</p>
      <div class="evt-table-wrap"><table><thead><tr><th>민원 유형</th><th>비교일 대비</th><th>비교 지역·날짜 수</th></tr></thead><tbody>${summary}</tbody></table></div>
      <p class="evt-warning">아래 행사 3개는 <b>결과를 본 뒤 눈에 띄는 사례를 고른 것</b>입니다. 「행사 때 신고가 늘어난다」는 근거로 쓰지 마세요(보고서 「급증일의 단서, 행사 카드 검증」 1-2절).</p>
      <div class="evt-controls">
        <label>확인할 행사<select id="evt-case">${data.cases.map(c => `<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.label)}</option>`).join('')}</select></label>
        <label>비교할 시간<select id="evt-window"><option value="permit_hours" ${windowKey==='permit_hours'?'selected':''}>행사 허가 시간 중</option><option value="after_until_06" ${windowKey==='after_until_06'?'selected':''}>종료 후~다음 날 오전 6시</option></select></label>
      </div>
      <p><b>${esc(item.date)} · ${esc(item.scope)}</b><br>${esc(timing)} · 거리·보도 소음 신고</p>
      <div class="evt-chart" role="img" aria-label="${esc(item.label)}: 실제 ${num(values.actual)}건, 비교일 중앙값 ${num(baseline)}건">
        ${rows.map(([label,value,color]) => `<div class="evt-bar-row"><span>${label}</span><div class="evt-track"><div class="evt-fill" style="width:${100*value/max}%;background:${color}"></div></div><span class="evt-value">${num(value)}건</span></div>`).join('')}
      </div>
      <p class="evt-note">비교값은 전후 4주 안에서 같은 요일·같은 지역·같은 시간 구간의 <b>${num(controls)}개 비교일 중앙값</b>입니다.${matched ? ' 최고기온 차이 5°C 이내, 비·눈 여부도 맞췄습니다.' : ''} 비교일에도 다른 행사가 있었을 수 있습니다.</p>
      <p><b>읽어낼 내용</b> ${verdict}</p>
      ${!matched ? `<p class="evt-warning">이 구간은 날씨까지 맞는 비교일이 ${num(values.weather_controls)}개뿐입니다. 날씨 영향을 충분히 구분하지 못해, 같은 요일·시간만 맞춘 값을 보여 줍니다.</p>` : ''}
      ${windowKey==='after_until_06' ? `<p class="evt-note">반복을 묶은 신고 그룹 수: 실제 ${num(values.group_actual)}개 / 같은 요일·시간 비교일 중앙값 ${num(values.group_baseline)}개. 실제 사건 수는 아닙니다.</p>` : ''}
      <details><summary>행사 전체 표 읽는 법과 분석 범위</summary>
        <p class="evt-note">1배는 비슷한 수준입니다. 표의 배율은 각 지역·날짜 배율의 기하평균이며, 신고 건수 합계의 배율과 다릅니다. 희소 건수에는 +1 보정을 적용했습니다. 같은 조건 신고 그룹으로 세거나 집중 주소를 빼도 주요 전체 결과는 비슷합니다.</p>
        <p class="evt-note">표준 세부 지역에 연결한 행사 ${num(data.inputs.selected_with_standard_board)}회차. 날씨까지 맞춰 비교할 수 있었던 것은 ${num(data.inputs.district_days)}개 지역·날짜 중 ${num(data.inputs.weather_comparable_district_days)}개(${coverage.toFixed(1)}%)입니다. 공원 소음·불꽃놀이·교통은 비교 표본이 적어 이 표에서 제외했습니다.</p>
      </details>
      <p class="evt-warning">허가는 실제 개최·관객 수를 증명하지 않으며, 비공식 모임·일부 시위는 빠질 수 있습니다. 신고는 행사장 바로 앞이 아닌 관련 커뮤니티 보드 전체에서 셌습니다. 관찰된 차이를 행사가 일으킨 피해나 원인으로 단정하지 마세요.</p>
      <div class="evt-links"><a href="${esc(reportURL())}" target="_blank" rel="noopener">행사 분석 보고서</a><a href="${esc(data.source)}" target="_blank" rel="noopener">뉴욕시 공식 행사 자료</a></div>`;
    card.querySelector('#evt-case').addEventListener('change', e => { selected=e.target.value; render(card); });
    card.querySelector('#evt-window').addEventListener('change', e => { windowKey=e.target.value; render(card); });
  }
  function mount() {
    if (host.querySelector('#when-events')) return;
    const card = document.createElement('article');
    card.id = 'when-events';card.className = 'card fixed';
    render(card);host.appendChild(card);
  }
  // app.js replaces when-body when filters change. Restore only this independent card.
  const observer = new MutationObserver(mount);
  observer.observe(host, {childList:true});
  mount();
})();
