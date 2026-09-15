import fs from 'node:fs';
import path from 'node:path';

const webRoot = path.resolve(import.meta.dirname, '..');
const output = path.resolve(webRoot, '../../docs/qa');
const inputs = process.argv.slice(2);
const directories = inputs.length ? inputs : ['playwright-report'];
const runs = directories.map(name => path.resolve(webRoot, name, 'results.json'))
  .filter(file => fs.existsSync(file))
  .map(file => ({ file, data: JSON.parse(fs.readFileSync(file, 'utf8')) }))
  .sort((a, b) => a.data.stats.startTime.localeCompare(b.data.stats.startTime));
if (!runs.length) throw new Error('No completed mock browser reports found.');

const cases = new Map();
for (const run of runs) {
  function visit(suite, parents = []) {
    const ancestry = [...parents, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const key = [test.projectName, spec.file, ...ancestry, spec.title].join('|');
        const result = test.results.at(-1);
        const previous = cases.get(key);
        const screenshots = (result?.attachments ?? [])
          .filter(a => a.contentType === 'image/png' && a.path && fs.existsSync(a.path))
          .map(a => ({ label: a.name, path: path.relative(output, a.path).replaceAll('\\', '/') }));
        cases.set(key, {
          file: spec.file, title: spec.title, project: test.projectName,
          status: test.status, durationMs: result?.duration ?? 0,
          sourceReport: path.relative(output, path.dirname(run.file)).replaceAll('\\', '/'),
          errors: (result?.errors ?? []).map(e => (e.message ?? '').replace(/\u001b\[[0-9;]*m/g, '')),
          screenshots,
          history: [...(previous?.history ?? []), { startTime: run.data.stats.startTime, status: test.status }],
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child, ancestry);
  }
  for (const suite of run.data.suites) visit(suite);
}
const all = [...cases.values()];
const count = status => all.filter(c => c.status === status).length;
const summary = {
  generatedAt: new Date().toISOString(),
  scope: 'Local production build, deterministic mocked API; live account tests excluded.',
  totals: { cases: all.length, passed: count('expected'), failed: count('unexpected'), skipped: count('skipped'), flaky: count('flaky') },
  runs: runs.map(r => ({ report: path.relative(output, r.file).replaceAll('\\', '/'), ...r.data.stats })),
  cases: all,
};
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'run-summary.json'), JSON.stringify(summary, null, 2));

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const labels = { expected: '통과', unexpected: '실패', skipped: '중복 조합 제외', flaky: '불안정' };
const rows = all.map(c => `<article data-status="${escape(c.status)}" data-project="${escape(c.project)}">
  <div class="case-head"><span class="badge ${escape(c.status)}">${escape(labels[c.status] ?? c.status)}</span><small>${escape(c.project)} · ${escape(c.file)}</small></div>
  <h3>${escape(c.title)}</h3>
  ${c.history.length > 1 ? `<p class="subtle">재검사 포함 ${c.history.length}회 실행 · 가장 최근 결과 표시</p>` : ''}
  ${c.errors.length ? `<details><summary>실패 원인</summary><pre>${escape(c.errors.join('\n\n'))}</pre></details>` : ''}
  ${c.screenshots.length ? `<details><summary>스크린샷 ${c.screenshots.length}개</summary><div class="images">${c.screenshots.map(s => `<figure><a href="${escape(s.path)}" target="_blank"><img src="${escape(s.path)}" alt="${escape(c.title + ' — ' + s.label)}" loading="lazy"></a><figcaption>${escape(s.label)}</figcaption></figure>`).join('')}</div></details>` : ''}
  <p class="subtle">${(c.durationMs / 1000).toFixed(1)}초 · <a href="${escape(c.sourceReport)}/index.html">해당 실행의 원본 보고서</a></p>
</article>`).join('\n');

fs.writeFileSync(path.join(output, 'report.html'), `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Flowra QA 결과</title>
<style>
:root{font-family:"Segoe UI",system-ui,sans-serif;color:#172033;background:#f5f7fb}body{max-width:1160px;margin:0 auto;padding:36px 20px}h1{margin:0 0 12px}p{line-height:1.65}a{color:#5135b5}.cards{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.card{background:white;border:1px solid #dce1eb;border-radius:12px;padding:16px 24px;min-width:110px}.card strong{display:block;font-size:30px}.filters{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}input,select{font:inherit;border:1px solid #bac3d4;border-radius:8px;padding:10px;max-width:100%}input{flex:1;min-width:160px}article{background:white;padding:20px;border:1px solid #dce1eb;border-radius:12px;margin:12px 0}article[hidden]{display:none}.case-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}h3{margin:12px 0;font-size:17px}.badge{padding:4px 9px;border-radius:6px;font-size:13px;background:#edf0f5}.expected{background:#dcf5e8;color:#125a35}.unexpected{background:#fee5e5;color:#9b2020}.skipped{background:#fff1cf;color:#765619}.subtle,small{color:#596579;font-size:13px}summary{cursor:pointer;padding:10px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#f5f7fb;padding:14px}.images{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;max-width:100%}img{max-width:100%;width:auto;max-height:500px;border:1px solid #dce1eb}figcaption{font-size:13px;margin-top:5px}.notice{padding:16px;border-left:4px solid #7754cf;background:#eeebfb}
</style><h1>Flowra QA 결과</h1><p>고정된 가상 데이터로 실행한 브라우저 검사입니다. 재검사한 항목은 마지막 결과를 표시합니다. 실제 서비스 계정 검증 결과와 구분됩니다.</p>
<p class="notice"><a href="README.md">다시 실행하는 방법</a><br>실패 횟수는 서로 다른 버그 개수가 아닙니다. 같은 문제가 여러 화면·크기에서 반복 검출될 수 있습니다.</p>
<div class="cards"><div class="card">전체<strong>${summary.totals.cases}</strong></div><div class="card">통과<strong>${summary.totals.passed}</strong></div><div class="card">실패<strong>${summary.totals.failed}</strong></div><div class="card">중복 조합 제외<strong>${summary.totals.skipped}</strong></div></div>
<div class="filters"><label>결과 <select id="status"><option value="">전체</option><option value="unexpected">실패</option><option value="expected">통과</option><option value="skipped">제외</option></select></label><label>환경 <select id="project"><option value="">전체</option>${[...new Set(all.map(c => c.project))].map(p => `<option>${escape(p)}</option>`).join('')}</select></label><input id="search" aria-label="검사 이름 검색" placeholder="화면이나 검사 이름 검색"></div><p id="visible" class="subtle"></p>${rows}
<script>const statusFilter=document.getElementById('status'),projectFilter=document.getElementById('project'),search=document.getElementById('search');function filter(){let n=0;document.querySelectorAll('article').forEach(e=>{const show=(!statusFilter.value||e.dataset.status===statusFilter.value)&&(!projectFilter.value||e.dataset.project===projectFilter.value)&&e.textContent.toLowerCase().includes(search.value.toLowerCase());e.hidden=!show;if(show)n++});document.getElementById('visible').textContent=n+'개 항목 표시'}[statusFilter,projectFilter,search].forEach(e=>e.addEventListener('input',filter));filter();</script></html>`);
console.log(JSON.stringify(summary.totals));
