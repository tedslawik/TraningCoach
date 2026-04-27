function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.az-section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('section-' + name).classList.add('active');
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}

function runAnalysis() {
  const swimTime = +document.getElementById('swim-time').value || 0;
  const bikeTime = +document.getElementById('bike-time').value || 0;
  const runTime  = +document.getElementById('run-time').value  || 0;
  const swimDist = +document.getElementById('swim-dist').value || 0;
  const bikeDist = +document.getElementById('bike-dist').value || 0;
  const runDist  = +document.getElementById('run-dist').value  || 0;
  const swimSess = +document.getElementById('swim-sessions').value || 0;
  const bikeSess = +document.getElementById('bike-sessions').value || 0;
  const runSess  = +document.getElementById('run-sessions').value  || 0;
  const raceDate = document.getElementById('race-date').value;
  const raceType = document.getElementById('race-type').value;
  const totalTime = swimTime + bikeTime + runTime;

  const swimPct = totalTime ? Math.round(swimTime / totalTime * 100) : 0;
  const bikePct = totalTime ? Math.round(bikeTime / totalTime * 100) : 0;
  const runPct  = totalTime ? Math.round(runTime  / totalTime * 100) : 0;

  const targets = {
    half:    { swim: 20, bike: 45, run: 35 },
    full:    { swim: 18, bike: 50, run: 32 },
    olympic: { swim: 18, bike: 42, run: 40 },
    sprint:  { swim: 15, bike: 45, run: 40 }
  };
  const target = targets[raceType];
  const days = daysUntil(raceDate);
  const totalSess = swimSess + bikeSess + runSess;

  document.getElementById('metrics-row').innerHTML = `
    <div class="metric"><div class="metric-val">${Math.round(totalTime)}</div><div class="metric-lbl">min łącznie</div></div>
    <div class="metric"><div class="metric-val">${totalSess}</div><div class="metric-lbl">sesji razem</div></div>
    <div class="metric"><div class="metric-val">${days !== null ? days : '—'}</div><div class="metric-lbl">dni do wyścigu</div></div>
  `;

  document.getElementById('bar-chart').innerHTML = ['swim','bike','run'].map((d, i) => {
    const pct  = [swimPct, bikePct, runPct][i];
    const tgt  = [target.swim, target.bike, target.run][i];
    const name = ['Pływanie','Rower','Bieg'][i];
    return `
      <div class="bar-row">
        <div class="bar-name">${name}</div>
        <div class="bar-track"><div class="bar-fill bar-${d}" style="width:${pct}%;min-width:${pct>0?'28px':'0'}">${pct}%</div></div>
        <div class="bar-target">cel ${tgt}%</div>
      </div>`;
  }).join('');

  const alerts = [];
  if (swimPct < target.swim - 5)
    alerts.push({ t:'warn', m:`Za mało pływania — masz ${swimPct}%, cel to ${target.swim}%. Dodaj 1 sesję w basenie w kolejnym tygodniu.` });
  else
    alerts.push({ t:'ok', m:`Pływanie na właściwym poziomie (${swimPct}%).` });

  if (bikePct < target.bike - 5)
    alerts.push({ t:'warn', m:`Rower niedostateczny (${bikePct}%, cel ${target.bike}%). Rozważ dłuższą jazdę w weekend.` });
  else if (bikePct > target.bike + 10)
    alerts.push({ t:'warn', m:`Dominacja roweru (${bikePct}%) — może kosztem biegu i pływania. Zbalansuj.` });
  else
    alerts.push({ t:'ok', m:`Rower w normie (${bikePct}%).` });

  if (runPct < target.run - 5)
    alerts.push({ t:'warn', m:`Bieg zaniedbany (${runPct}%, cel ${target.run}%). Dołóż jeden łatwy bieg 5–8 km.` });
  else
    alerts.push({ t:'ok', m:`Bieg w dobrej proporcji (${runPct}%).` });

  document.getElementById('alerts-container').innerHTML =
    alerts.map(a => `<div class="alert alert-${a.t}">${a.m}</div>`).join('');

  const paceRows = [];
  if (swimDist > 0 && swimTime > 0) {
    const p = swimTime / swimDist;
    const m = Math.floor(p), s = Math.round((p - m) * 60);
    paceRows.push(`<div class="pace-row"><span class="pace-label">Pływanie tempo</span><strong>${m}:${String(s).padStart(2,'0')} /100m</strong></div>`);
  }
  if (bikeDist > 0 && bikeTime > 0) {
    const spd = (bikeDist / bikeTime * 60).toFixed(1);
    paceRows.push(`<div class="pace-row"><span class="pace-label">Rower prędkość</span><strong>${spd} km/h</strong></div>`);
  }
  if (runDist > 0 && runTime > 0) {
    const p = runTime / runDist;
    const m = Math.floor(p), s = Math.round((p - m) * 60);
    paceRows.push(`<div class="pace-row"><span class="pace-label">Bieg tempo</span><strong>${m}:${String(s).padStart(2,'0')} /km</strong></div>`);
  }
  document.getElementById('pace-container').innerHTML =
    paceRows.length ? paceRows.join('') : '<p style="font-size:13px;color:var(--text-secondary)">Uzupełnij dystans i czas, aby wyliczyć tempo.</p>';

  const needMoreSwim = swimPct < target.swim - 3;
  const needMoreBike = bikePct < target.bike - 5;
  const needMoreRun  = runPct  < target.run  - 3;
  const isTaper = days !== null && days < 14;
  const isPeak  = days === null || days > 60;

  const planDays = [
    { name: 'Poniedziałek', type: 'rest',  desc: 'Odpoczynek lub lekka regeneracja — spacer, rozciąganie, rolowanie.' },
    { name: 'Wtorek',       type: 'swim',  desc: needMoreSwim
        ? 'Pływanie skupione na technice: 2.5 km z foką, praca nad high elbow catch. Kluczowy priorytet tygodnia.'
        : 'Pływanie aerobowe 2.0 km — stałe tempo, interwały 4×400m.' },
    { name: 'Środa',        type: 'run',   desc: needMoreRun
        ? 'Bieg łatwy 7–9 km w strefie 2 tętna. Celem jest objętość, nie prędkość.'
        : isTaper ? 'Bieg 4–5 km bardzo lekki — utrzymanie czucia nóg.'
        : 'Bieg tempo 6 km: 2 km rozgrzewki + 3 km w tempie wyścigowym + 1 km spokojnie.' },
    { name: 'Czwartek',     type: 'swim',  desc: 'Pływanie techniczne — oddech i rotacja bioder. 1.5–2 km. Można użyć foki do dryli.' },
    { name: 'Piątek',       type: 'rest',  desc: 'Odpoczynek aktywny lub joga. Przygotowanie na intensywny weekend.' },
    { name: 'Sobota',       type: needMoreBike ? 'bike' : 'brick', desc: needMoreBike
        ? 'Długa jazda rowerem 80–100 km w strefie 2–3. Ćwicz odżywianie i nawodnienie na trasie.'
        : 'Brick: rower 60 km + bieg 5 km od razu po zjeździe. Trenuj przejście T2 i uczucie cegły w nogach.' },
    { name: 'Niedziela',    type: 'run',   desc: isPeak
        ? 'Długi bieg 14–16 km bardzo spokojnie. Budowanie bazy tlenowej na finiszowy bieg wyścigu.'
        : isTaper ? 'Bieg 8 km spokojnie — ostatnia dłuższa sesja przed wyścigiem.'
        : 'Bieg 10–12 km w spokojnym tempie. Uzupełnij elektrolity po treningu.' }
  ];

  const typeClass = { swim:'swim-day', bike:'bike-day', run:'run-day', rest:'rest-day', brick:'brick-day' };
  document.getElementById('plan-container').innerHTML =
    planDays.map(d => `<div class="plan-day ${typeClass[d.type]}"><div class="day-name">${d.name}</div><div class="day-desc">${d.desc}</div></div>`).join('');

  const tips = [];
  if (needMoreSwim) tips.push('Pływanie to Twój priorytet — masz za mały udział względem celu wyścigowego. Nie odwołuj sesji w basenie.');
  if (isTaper) tips.push('Jesteś blisko wyścigu — redukuj objętość, nie intensywność. Śpij dużo, jedz dobrze, zero eksperymentów z jedzeniem.');
  if (!isTaper && !isPeak) tips.push('Jesteś w środkowym bloku budowania. Regularność bije heroizm — 6 tygodni solidnych jest lepsze niż 2 tygodnie ciężkie i 1 kontuzja.');
  tips.push('Brick (rower + bieg pod rząd) to kluczowy trening Half Ironmana — rób go przynajmniej raz na 2 tygodnie.');
  tips.push('Hydratacja: minimum 500 ml/h na rowerze. Zacznij pić 15 minut przed pierwszym pragnieniem — jeśli czujesz pragnienie, już jest za późno.');

  document.getElementById('tips-container').innerHTML =
    tips.map(t => `<div class="tip-item">${t}</div>`).join('');

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.az-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab')[1].classList.add('active');
  document.getElementById('section-analysis').classList.add('active');
}
