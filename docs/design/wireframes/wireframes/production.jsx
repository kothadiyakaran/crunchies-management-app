// production.jsx — Production main (3 variants) + Plan view + product sheet

const WEEK_HEADER = (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', borderBottom: `1px dashed ${INK_3}` }}>
    <span style={{ fontFamily: FONT_HAND, fontSize: 12, color: INK_2 }}>‹</span>
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontFamily: FONT_HAND, fontSize: 15, fontWeight: 700 }}>This week</div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2, letterSpacing: 0.4 }}>
        Mon 20 – Sun 26 May
      </div>
    </div>
    <span style={{ fontFamily: FONT_HAND, fontSize: 12, color: INK_2 }}>›</span>
  </div>
);

const UPCOMING_EVENTS = (
  <>
    <WLabel count="3">Upcoming events</WLabel>
    {[
      { n: 'Rakhi',   t: 'in 2 weeks' },
      { n: 'Ganpati', t: 'in 5 weeks' },
      { n: 'Diwali',  t: 'in 14 weeks' },
    ].map((e, i) => (
      <div key={i} style={{ margin: '0 14px', padding: '8px 0',
        borderBottom: `1px dashed ${INK_3}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{e.n}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>
          {e.t} <span style={{ color: INK_3, fontFamily: FONT_HAND, marginLeft: 4 }}>›</span>
        </span>
      </div>
    ))}
    <div style={{ margin: '8px 14px 0' }}>
      <WBtn primary={false} small dashed style={{ margin: 0 }}>+ Add event</WBtn>
    </div>
  </>
);

const FROM_OTHERS = (
  <>
    <WLabel>From other makers</WLabel>
    <div style={{ margin: '0 14px 14px', padding: '8px 12px',
      border: `1px dashed ${INK_3}`, borderRadius: 8, background: '#f4f0e6' }}>
      {[
        { p: 'Til Chikki', src: 'Sunita Kaki', q: '3 packs' },
        { p: 'Anarse',     src: 'Smita Tai',   q: '1 dozen' },
      ].map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
          padding: '5px 0', borderBottom: i === 0 ? `1px dashed ${INK_3}` : 'none', fontSize: 12 }}>
          <span><strong style={{ fontFamily: FONT_HAND }}>{r.p}</strong>
            <span style={{ color: INK_3, marginLeft: 6, fontSize: 11 }}>· {r.src}</span></span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: INK_2 }}>{r.q}</span>
        </div>
      ))}
    </div>
  </>
);

// ── A · Table-style — plan / suggested / made columns ────────
function ProductionA() {
  const rows = [
    { n: 'Chakli',       plan: 5, sug: 4, made: 1, sub: 'pending orders +2' },
    { n: 'Chirote',      plan: 4, sug: 4, made: 0 },
    { n: 'Ragi Cookies', plan: 2, sug: 1, made: 0, sub: 'ramp-up Rakhi' },
    { n: 'Mathari',      plan: 3, sug: 2, made: 1 },
    { n: 'Wheat Nimki',  plan: 2, sug: 2, made: 0 },
    { n: 'Jowar Papdi',  plan: 1, sug: 1, made: 1, done: true },
  ];
  return (
    <WScreen>
      {WEEK_HEADER}
      {UPCOMING_EVENTS}

      <WLabel action="edit plan →">This week</WLabel>
      <div style={{ margin: '0 14px', border: `1.4px solid ${INK}`, borderRadius: 10, background: '#fff' }}>
        <div style={{ display: 'flex', padding: '6px 10px',
          fontFamily: FONT_MONO, fontSize: 9, color: INK_2,
          textTransform: 'uppercase', letterSpacing: 0.6,
          borderBottom: `1px dashed ${INK_3}` }}>
          <span style={{ flex: 1 }}>Product</span>
          <span style={{ width: 38, textAlign: 'right' }}>Plan</span>
          <span style={{ width: 50, textAlign: 'right' }}>Sugg</span>
          <span style={{ width: 38, textAlign: 'right' }}>Made</span>
        </div>
        {rows.filter(r => !r.done).map((r, i, a) => (
          <div key={i} style={{ padding: '8px 10px',
            borderBottom: i < a.length - 1 ? `1px dashed ${INK_3}` : 'none',
            display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{r.n}</div>
              {r.sub && <div style={{ fontSize: 10, color: INK_3, fontStyle: 'italic' }}>{r.sub}</div>}
            </div>
            <div style={{ width: 38, textAlign: 'right', fontFamily: FONT_HAND, fontSize: 16, fontWeight: 700, color: ACCENT }}>{r.plan}</div>
            <div style={{ width: 50, textAlign: 'right', fontFamily: FONT_MONO, fontSize: 11, color: INK_3 }}>{r.sug}</div>
            <div style={{ width: 38, textAlign: 'right', fontFamily: FONT_HAND, fontSize: 14 }}>{r.made}</div>
          </div>
        ))}
      </div>
      <div style={{ margin: '6px 14px 0', fontFamily: FONT_HAND, fontSize: 12, color: INK_2 }}>
        ✓ Done this week (1)  ▾
      </div>

      {FROM_OTHERS}

      <div style={{ flex: 1 }} />
      <WBtn>+ Log production</WBtn>
      <WTabBar active={3} />
    </WScreen>
  );
}

// ── B · Card-per-product with progress dial ──────────────────
function ProductionB() {
  const rows = [
    { n: 'Chakli',       plan: 5, made: 1, sub: 'incl. pending orders' },
    { n: 'Chirote',      plan: 4, made: 0 },
    { n: 'Ragi Cookies', plan: 2, made: 0, sub: 'ramp-up for Rakhi' },
    { n: 'Mathari',      plan: 3, made: 1 },
  ];
  return (
    <WScreen>
      {WEEK_HEADER}
      {UPCOMING_EVENTS}
      <WLabel action="plan this week →">This week</WLabel>

      {rows.map((r, i) => {
        const pct = Math.min(100, (r.made / r.plan) * 100);
        return (
          <div key={i} style={{ margin: '6px 14px',
            padding: '10px 12px', background: '#fff',
            border: `1.4px solid ${INK}`, borderRadius: 10,
            boxShadow: '2px 2px 0 rgba(42,36,31,0.12)',
            display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
              <svg width="46" height="46" viewBox="0 0 46 46">
                <circle cx="23" cy="23" r="19" fill="none" stroke={INK_3} strokeWidth="2" strokeDasharray="3 3" />
                <circle cx="23" cy="23" r="19" fill="none" stroke={ACCENT} strokeWidth="3"
                  strokeDasharray={`${(pct / 100) * 119} 119`}
                  transform="rotate(-90 23 23)" strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>
                {r.made}/{r.plan}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 16, fontWeight: 700 }}>{r.n}</div>
              <div style={{ fontSize: 11, color: INK_2 }}>
                Plan {r.plan} · Made {r.made} {r.sub && <span style={{ color: INK_3, fontStyle: 'italic' }}>· {r.sub}</span>}
              </div>
            </div>
            <span style={{ color: INK_3, fontSize: 16 }}>›</span>
          </div>
        );
      })}

      {FROM_OTHERS}
      <div style={{ flex: 1 }} />
      <WBtn>+ Log production</WBtn>
      <WTabBar active={3} />
    </WScreen>
  );
}

// ── C · Compact list + visible weekly progress bars ─────────
function ProductionC() {
  const rows = [
    { n: 'Chakli',       plan: 5, made: 1 },
    { n: 'Chirote',      plan: 4, made: 0 },
    { n: 'Ragi Cookies', plan: 2, made: 0 },
    { n: 'Mathari',      plan: 3, made: 1 },
    { n: 'Wheat Nimki',  plan: 2, made: 0 },
    { n: 'Jowar Papdi',  plan: 1, made: 1, done: true },
  ];
  const totalPlan = rows.reduce((s, r) => s + r.plan, 0);
  const totalMade = rows.reduce((s, r) => s + r.made, 0);
  return (
    <WScreen>
      {WEEK_HEADER}

      {/* Hero summary */}
      <div style={{ margin: '10px 14px', padding: '12px',
        border: `1.6px solid ${INK}`, borderRadius: 10, background: '#fff',
        boxShadow: '3px 3px 0 rgba(42,36,31,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: FONT_HAND, fontSize: 13, color: INK_2 }}>This week's total</span>
          <span style={{ fontFamily: FONT_HAND, fontSize: 22, fontWeight: 700 }}>
            {totalMade} <span style={{ color: INK_3, fontSize: 16 }}>/ {totalPlan}</span>
          </span>
        </div>
        <div style={{ height: 8, marginTop: 8, border: `1.2px solid ${INK}`, borderRadius: 4 }}>
          <div style={{ height: '100%', width: `${(totalMade / totalPlan) * 100}%`, background: ACCENT }} />
        </div>
        <div style={{ marginTop: 4, fontFamily: FONT_MONO, fontSize: 9.5, color: INK_3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          5 days left
        </div>
      </div>

      {UPCOMING_EVENTS}

      <WLabel action="plan →">By product</WLabel>
      <div style={{ margin: '0 14px' }}>
        {rows.filter(r => !r.done).map((r, i, a) => {
          const pct = (r.made / r.plan) * 100;
          return (
            <div key={i} style={{ padding: '8px 0',
              borderBottom: i < a.length - 1 ? `1px dashed ${INK_3}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{r.n}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: INK_2 }}>{r.made}/{r.plan}</span>
              </div>
              <div style={{ height: 5, marginTop: 4, border: `1px solid ${INK}`, borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#3e7a48' : ACCENT }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ margin: '6px 14px 0', fontFamily: FONT_HAND, fontSize: 12, color: INK_2 }}>
        ✓ Done (1)  ▾
      </div>

      {FROM_OTHERS}
      <div style={{ flex: 1 }} />
      <WBtn>+ Log production</WBtn>
      <WTabBar active={3} />
    </WScreen>
  );
}

// ── Plan this week — full screen form ───────────────────────
function PlanWeek() {
  const rows = [
    { n: 'Chakli',       sug: 4, plan: 5 },
    { n: 'Chirote',      sug: 4, plan: 4 },
    { n: 'Mathari',      sug: 1, plan: 0 },
    { n: 'Ragi Cookies', sug: 1, plan: 2 },
    { n: 'Wheat Nimki',  sug: 2, plan: 2 },
    { n: 'Jowar Papdi',  sug: 1, plan: 1 },
    { n: 'Oats & Nuts',  sug: 1, plan: 1 },
  ];
  return (
    <WScreen>
      <div style={{
        padding: '12px 14px', borderBottom: `1.2px dashed ${INK_3}`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 18 }}>‹</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>Plan this week</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>Mon 20 May – Sun 26 May</div>
        </div>
      </div>

      <div style={{ padding: '10px 14px', fontSize: 11.5, color: INK_2, fontFamily: FONT_HAND }}>
        Suggestions based on your last 4 weeks + upcoming events.
      </div>

      <div style={{ margin: '0 14px', border: `1.4px solid ${INK}`, borderRadius: 10, background: '#fff' }}>
        {rows.map((r, i) => (
          <div key={i} style={{ padding: '10px 12px',
            borderBottom: i < rows.length - 1 ? `1px dashed ${INK_3}` : 'none',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{r.n}</div>
              <div style={{ fontSize: 10.5, color: INK_3, fontFamily: FONT_MONO }}>suggested {r.sug}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 22, height: 22, border: `1.2px solid ${INK}`, borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HAND, fontWeight: 700 }}>−</div>
              <div style={{ width: 44, height: 28, border: `1.4px solid ${INK}`, borderRadius: 6, background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FONT_HAND, fontSize: 18, fontWeight: 700, color: r.plan === 0 ? INK_3 : INK }}>{r.plan}</div>
              <div style={{ width: 22, height: 22, border: `1.2px solid ${INK}`, borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HAND, fontWeight: 700 }}>+</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <WBtn>Save plan</WBtn>
      <WBtn primary={false} style={{ marginTop: 0 }}>Cancel</WBtn>
    </WScreen>
  );
}

// ── Product detail bottom sheet (Chakli) ───────────────────
function ProductSheet() {
  return (
    <WScreen bg="rgba(42,36,31,0.45)">
      {/* dim the screen */}
      <div style={{ flex: 1 }} />
      <div style={{
        background: PAPER, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        border: `1.4px solid ${INK}`, padding: '14px 0 10px',
        boxShadow: '0 -6px 18px rgba(42,36,31,0.25)',
      }}>
        <div style={{ width: 36, height: 4, background: INK_3, borderRadius: 2, margin: '0 auto 12px' }} />
        <div style={{ padding: '0 18px 8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: FONT_HAND, fontSize: 20, fontWeight: 700 }}>Chakli</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>THIS WEEK</span>
        </div>
        <div style={{ padding: '0 18px',
          display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontFamily: FONT_HAND, fontSize: 22, fontWeight: 700, color: ACCENT }}>5</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_2, letterSpacing: 0.5, textTransform: 'uppercase' }}>plan</div>
          </div>
          <div>
            <div style={{ fontFamily: FONT_HAND, fontSize: 22, fontWeight: 700, color: INK_3 }}>4</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_2, letterSpacing: 0.5, textTransform: 'uppercase' }}>suggested</div>
          </div>
          <div>
            <div style={{ fontFamily: FONT_HAND, fontSize: 22, fontWeight: 700 }}>1</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_2, letterSpacing: 0.5, textTransform: 'uppercase' }}>made</div>
          </div>
        </div>
        <div style={{ padding: '12px 14px 6px' }}>
          <WBtn style={{ margin: 0 }}>+ Log new batch</WBtn>
        </div>
        <WLabel>This week's logs</WLabel>
        <div style={{ margin: '0 18px 4px', padding: '6px 0',
          borderTop: `1px dashed ${INK_3}`, borderBottom: `1px dashed ${INK_3}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONT_HAND, fontSize: 13 }}>Mon 20 May · 1 box</span>
          <span style={{ color: INK_3 }}>⋯</span>
        </div>
      </div>
    </WScreen>
  );
}

Object.assign(window, { ProductionA, ProductionB, ProductionC, PlanWeek, ProductSheet });
