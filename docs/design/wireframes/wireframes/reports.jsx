// reports.jsx — Reports Week tab, 2 calibration treatments + Trends preview

const REPORTS_TABS = (
  <div style={{ display: 'flex', borderBottom: `1.4px solid ${INK}` }}>
    {['Week', 'Month', 'Trends'].map((t, i) => (
      <div key={t} style={{ flex: 1, padding: '10px 0', textAlign: 'center',
        fontFamily: FONT_HAND, fontSize: 14, fontWeight: i === 0 ? 700 : 500,
        color: i === 0 ? ACCENT : INK_2,
        borderBottom: i === 0 ? `2.5px solid ${ACCENT}` : 'none',
        marginBottom: -1.4 }}>{t}</div>
    ))}
  </div>
);

const PERIOD_SELECTOR = (
  <div style={{ padding: '10px 14px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#f1ece1' }}>
    <span style={{ fontFamily: FONT_HAND, fontSize: 13 }}>‹</span>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>Mon 13 – Sun 19 May</div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_3 }}>LAST COMPLETED WEEK</div>
    </div>
    <span style={{ fontFamily: FONT_HAND, fontSize: 13 }}>›</span>
  </div>
);

// ── A · Three-bar mini chart ──────────────────────────────
function ReportsWeekA() {
  const products = [
    { n: 'Chakli',       plan: 5, made: 4, demand: 6, v: '+2 (+33%)' },
    { n: 'Chirote',      plan: 4, made: 5, demand: 4, v: '−1 (−20%)' },
    { n: 'Mathari',      plan: 3, made: 2, demand: 3, v: '+1 (+33%)' },
    { n: 'Ragi Cookies', plan: 2, made: 2, demand: 3, v: '+1 (+50%)' },
  ];
  return (
    <WScreen>
      {REPORTS_TABS}
      {PERIOD_SELECTOR}

      <WLabel>Plan vs. made vs. demand</WLabel>
      <div style={{ margin: '0 14px' }}>
        {products.map((p, i) => (
          <div key={i} style={{ padding: '10px 0',
            borderBottom: i < products.length - 1 ? `1px dashed ${INK_3}` : 'none' }}>
            <WCalibrationBars {...p} label={p.n} variance={p.v} />
          </div>
        ))}
      </div>

      <WLabel>Order summary</WLabel>
      <div style={{ margin: '0 14px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[
          ['Orders', '18'],
          ['Value', '₹8,420'],
          ['Fulfilled', '17 / 18 (94%)'],
          ['Outstanding', '₹620 (2 unpaid)'],
        ].map(([l, v], i) => (
          <div key={i} style={{ padding: '8px 10px', background: '#fff',
            border: `1.2px solid ${INK_3}`, borderRadius: 6 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_3, letterSpacing: 0.5,
              textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>

      <WLabel>New customers this week</WLabel>
      <div style={{ margin: '0 14px 6px', fontFamily: FONT_HAND, fontSize: 13 }}>
        <strong>4 new</strong> — 1 personal, 3 exhibition <span style={{ color: ACCENT }}>→</span>
      </div>

      <WLabel>Top products</WLabel>
      {[
        ['Chakli',  '5 kg · ₹2,000'],
        ['Chirote', '4 boxes · ₹1,600'],
        ['Mathari', '3 kg · ₹720'],
      ].map(([n, v], i) => (
        <div key={i} style={{ margin: '0 14px', padding: '5px 0',
          borderBottom: `1px dashed ${INK_3}`,
          display: 'flex', justifyContent: 'space-between',
          fontFamily: FONT_HAND, fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>{n}</span>
          <span style={{ color: INK_2, fontFamily: FONT_MONO, fontSize: 11 }}>{v}</span>
        </div>
      ))}

      <div style={{ flex: 1 }} />
      <WTabBar active={4} />
    </WScreen>
  );
}

// ── B · Single bar with pip markers (plan-tick + demand-tick on made bar) ─
function CalibrationPip({ plan, made, demand, label, max }) {
  const m = max ?? Math.max(plan, made, demand) * 1.15;
  const pct = v => (v / m) * 100;
  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{label}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>
          plan {plan} · made {made} · demand {demand}
        </span>
      </div>
      <div style={{ position: 'relative', height: 22, border: `1.4px solid ${INK}`, borderRadius: 4, background: '#fff' }}>
        {/* made bar */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct(made)}%`, background: ACCENT_SOFT, borderRight: `1.5px solid ${ACCENT}`,
        }} />
        {/* plan tick (dashed) */}
        <div style={{
          position: 'absolute', left: `${pct(plan)}%`, top: -4, bottom: -4, width: 0,
          borderLeft: `2px dashed ${INK}`,
        }} />
        <div style={{
          position: 'absolute', left: `${pct(plan)}%`, top: -18, transform: 'translateX(-50%)',
          fontFamily: FONT_MONO, fontSize: 9, color: INK_2, letterSpacing: 0.4,
        }}>plan</div>
        {/* demand tick */}
        <div style={{
          position: 'absolute', left: `${pct(demand)}%`, top: -4, bottom: -4, width: 0,
          borderLeft: `3px solid ${INK}`,
        }} />
        <div style={{
          position: 'absolute', left: `${pct(demand)}%`, bottom: -16, transform: 'translateX(-50%)',
          fontFamily: FONT_MONO, fontSize: 9, color: INK, letterSpacing: 0.4, fontWeight: 700,
        }}>demand</div>
      </div>
    </div>
  );
}

function ReportsWeekB() {
  const products = [
    { n: 'Chakli',       plan: 5, made: 4, demand: 6 },
    { n: 'Chirote',      plan: 4, made: 5, demand: 4 },
    { n: 'Mathari',      plan: 3, made: 2, demand: 3 },
    { n: 'Ragi Cookies', plan: 2, made: 2, demand: 3 },
  ];
  const max = Math.max(...products.flatMap(p => [p.plan, p.made, p.demand])) * 1.2;
  return (
    <WScreen>
      {REPORTS_TABS}
      {PERIOD_SELECTOR}

      <WLabel>Calibration</WLabel>
      <div style={{ margin: '6px 14px 0', padding: '4px 12px 12px',
        background: '#fff', border: `1.2px solid ${INK_3}`, borderRadius: 8 }}>
        {products.map((p, i) => (
          <div key={i} style={{ borderBottom: i < products.length - 1 ? `1px dashed ${INK_3}` : 'none' }}>
            <CalibrationPip {...p} label={p.n} max={max} />
          </div>
        ))}
      </div>
      <div style={{ margin: '8px 14px 0', fontSize: 11, color: INK_3, fontFamily: FONT_MONO, letterSpacing: 0.3 }}>
        BAR = MADE  ·  DASH = PLAN  ·  SOLID = DEMAND
      </div>

      <WLabel>Order summary</WLabel>
      <div style={{ margin: '0 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[
          ['Orders', '18'],
          ['Value', '₹8,420'],
          ['Fulfilled', '94%'],
          ['Outstanding', '₹620'],
        ].map(([l, v], i) => (
          <div key={i} style={{ padding: '8px 10px', background: '#fff',
            border: `1.2px solid ${INK_3}`, borderRadius: 6 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_3, letterSpacing: 0.5,
              textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>

      <WLabel>New this week</WLabel>
      <div style={{ margin: '0 14px 6px', fontFamily: FONT_HAND, fontSize: 13 }}>
        <strong>4 new</strong> — 1 personal, 3 exhibition <span style={{ color: ACCENT }}>→</span>
      </div>

      <div style={{ flex: 1 }} />
      <WTabBar active={4} />
    </WScreen>
  );
}

// ── Trends tab preview ────────────────────────────────────
function ReportsTrends() {
  // Faux variance bars: pos = over-made, neg = under-made; null = no plan
  const weeks = [-22, null, -10, +8, -5, null, +3, -8];
  return (
    <WScreen>
      <div style={{ display: 'flex', borderBottom: `1.4px solid ${INK}` }}>
        {['Week', 'Month', 'Trends'].map((t, i) => (
          <div key={t} style={{ flex: 1, padding: '10px 0', textAlign: 'center',
            fontFamily: FONT_HAND, fontSize: 14, fontWeight: i === 2 ? 700 : 500,
            color: i === 2 ? ACCENT : INK_2,
            borderBottom: i === 2 ? `2.5px solid ${ACCENT}` : 'none',
            marginBottom: -1.4 }}>{t}</div>
        ))}
      </div>

      <WLabel>Plan accuracy — last 8 weeks</WLabel>
      <div style={{ margin: '6px 14px', padding: '14px 10px 26px',
        background: '#fff', border: `1.2px solid ${INK_3}`, borderRadius: 8,
        position: 'relative' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, 1fr)`,
          alignItems: 'end', height: 110, gap: 4, position: 'relative',
        }}>
          {/* zero line */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%',
            borderTop: `1.2px solid ${INK}` }} />
          {weeks.map((v, i) => {
            if (v === null) return (
              <div key={i} style={{ height: '100%', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontFamily: FONT_MONO, fontSize: 9, color: INK_3 }}>—</div>
              </div>
            );
            const above = v > 0;
            const h = Math.min(50, Math.abs(v) * 1.6);
            return (
              <div key={i} style={{ height: '100%', display: 'flex',
                flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                {above && <div style={{ width: '60%', height: h, background: ACCENT_SOFT, border: `1px solid ${ACCENT}`, marginBottom: 'auto' }} />}
                {!above && <div style={{ marginTop: 'auto', width: '60%', height: h, background: '#cfd6d2', border: `1px solid ${INK}` }} />}
              </div>
            );
          })}
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, 1fr)`,
          marginTop: 4, gap: 4,
        }}>
          {weeks.map((_, i) => (
            <div key={i} style={{ textAlign: 'center', fontFamily: FONT_MONO,
              fontSize: 8.5, color: INK_3 }}>w{i + 1}</div>
          ))}
        </div>
      </div>
      <div style={{ margin: '0 14px', fontFamily: FONT_MONO, fontSize: 10, color: INK_3, letterSpacing: 0.4 }}>
        6 OF LAST 8 WEEKS PLANNED.  ABOVE LINE = OVER-MADE.  BELOW = UNDER-MADE.
      </div>

      <WLabel>Past events</WLabel>
      {[
        { n: 'Diwali 2025',   d: '6–8 Nov',  v: 'Expected 245 → Actual 277  +13%' },
        { n: 'Ganpati 2025',  d: '7–18 Sep', v: 'Expected 180 → Actual 144  −20%' },
        { n: 'Rakhi 2025',    d: '9 Aug',    v: 'Expected 60  → Actual 72   +20%' },
      ].map((r, i) => (
        <div key={i} style={{ margin: '0 14px', padding: '7px 0',
          borderBottom: `1px dashed ${INK_3}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>{r.n}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_3 }}>{r.d}</span>
          </div>
          <div style={{ fontSize: 11, color: INK_2, fontFamily: FONT_MONO }}>{r.v}</div>
        </div>
      ))}

      <div style={{ flex: 1 }} />
      <WTabBar active={4} />
    </WScreen>
  );
}

Object.assign(window, { ReportsWeekA, ReportsWeekB, ReportsTrends });
