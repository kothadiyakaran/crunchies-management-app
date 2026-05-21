// v2.jsx — second-round wireframes for unresolved items
// Today B (compact), Production B (events nav), Trends redesign, Order confirmation.

// ── Today B v2 — compact, ensures CTA + tab bar fit ──────────
function TodayBv2() {
  const days = [
    { d: 'M', n: 20, cur: true, dot: 3 },
    { d: 'T', n: 21, dot: 1 },
    { d: 'W', n: 22, dot: 2 },
    { d: 'T', n: 23, dot: 0 },
    { d: 'F', n: 24, dot: 4 },
    { d: 'S', n: 25, dot: 0 },
    { d: 'S', n: 26, dot: 1 },
  ];
  const tighterLabel = { padding: '10px 18px 4px', fontFamily: FONT_MONO,
    fontSize: 10.5, letterSpacing: 1.2, color: INK_2,
    textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' };
  return (
    <WScreen>
      {/* Compact header */}
      <div style={{ padding: '10px 16px 6px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        borderBottom: `1px dashed ${INK_3}` }}>
        <div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 16, fontWeight: 700 }}>Today</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: INK_2, letterSpacing: 0.5 }}>WEEK OF 20 MAY</div>
        </div>
        <span style={{ color: INK_2, fontSize: 14 }}>⚙</span>
      </div>

      {/* Week strip — tighter */}
      <div style={{ display: 'flex', padding: '8px 8px 4px', gap: 3 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', padding: '4px 0',
            border: `1.2px ${d.cur ? 'solid' : 'dashed'} ${d.cur ? INK : INK_3}`,
            borderRadius: 6, background: d.cur ? '#fff' : 'transparent' }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 8.5, color: INK_2 }}>{d.d}</div>
            <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>{d.n}</div>
            <div style={{ height: 4, marginTop: 1 }}>
              {d.dot > 0 && <span style={{ display: 'inline-block', width: 3, height: 3,
                borderRadius: '50%', background: ACCENT }} />}
            </div>
          </div>
        ))}
      </div>

      {/* Monday retrospective banner — compact, one line */}
      <div style={{ margin: '4px 14px 0', padding: '6px 10px',
        background: '#fff7c2', border: `1.2px solid ${INK}`, borderRadius: 6,
        fontFamily: FONT_HAND, fontSize: 11.5, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <strong>Last week</strong> · 18 plan / 14 made / 22 demand <span style={{ color: ACCENT }}>→</span>
        </span>
        <span style={{ color: INK_3, flexShrink: 0 }}>×</span>
      </div>

      <div style={tighterLabel}><span>Due today / overdue (3)</span></div>
      <div style={{ margin: '0 14px', border: `1.4px solid ${INK}`, borderRadius: 8, background: '#fff' }}>
        {[
          { n: 'Sunita Patil',  s: '2 chakli, 1 chirote', d: '−2d', warn: true },
          { n: 'Meera Joshi',   s: '1 ragi cookies',       d: 'today' },
          { n: 'Rakesh Sharma', s: '3 mathari, 2 chakli',  d: 'today' },
        ].map((r, i) => (
          <div key={i} style={{ padding: '6px 10px',
            borderBottom: i < 2 ? `1px dashed ${INK_3}` : 'none',
            display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700, lineHeight: 1.1 }}>{r.n}</div>
              <div style={{ fontSize: 10.5, color: INK_2 }}>{r.s}</div>
            </div>
            <span style={{
              padding: '1.5px 6px', borderRadius: 4,
              fontFamily: FONT_MONO, fontSize: 9,
              color: r.warn ? '#7a3508' : INK_2,
              background: r.warn ? '#fde2c8' : 'transparent',
              border: r.warn ? `1px solid ${ACCENT}` : `1px solid ${INK_3}`,
            }}>{r.d}</span>
          </div>
        ))}
      </div>

      <div style={tighterLabel}><span>This week, make</span></div>
      <div style={{ margin: '0 14px' }}>
        {[
          { n: 'Chakli',  plan: 5, made: 1 },
          { n: 'Chirote', plan: 4, made: 0 },
          { n: 'Mathari', plan: 3, made: 1 },
        ].map((p, i, a) => (
          <div key={i} style={{ padding: '5px 0',
            borderBottom: i < a.length - 1 ? `1px dashed ${INK_3}` : 'none',
            display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{p.n}</div>
              <div style={{ height: 4, marginTop: 3, border: `1px solid ${INK}`, borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${(p.made / p.plan) * 100}%`, background: ACCENT }} />
              </div>
            </div>
            <div style={{ marginLeft: 8, fontFamily: FONT_MONO, fontSize: 10 }}>{p.made}/{p.plan}</div>
          </div>
        ))}
      </div>

      <div style={tighterLabel}><span>Quiet (2)</span></div>
      <div style={{ margin: '0 14px', fontSize: 11, color: INK_2, fontFamily: FONT_HAND }}>
        Pradeep Kale · 8w &nbsp;·&nbsp; Sneha Marathe · 10w
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ margin: '8px 14px 4px' }}>
        <WBtn style={{ margin: 0 }}>+ Log new order</WBtn>
      </div>
      <WTabBar active={0} />
    </WScreen>
  );
}

// ── Production B v2 — explicit Events navigation ──────────
function ProductionBv2() {
  const rows = [
    { n: 'Chakli',       plan: 5, made: 1, sub: 'incl. pending orders' },
    { n: 'Chirote',      plan: 4, made: 0 },
    { n: 'Ragi Cookies', plan: 2, made: 0, sub: 'ramp-up for Rakhi' },
    { n: 'Mathari',      plan: 3, made: 1 },
  ];
  return (
    <WScreen>
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

      {/* Events block with explicit nav */}
      <div style={{
        margin: '10px 14px 4px', padding: '10px 12px',
        background: '#fff', border: `1.4px solid ${INK}`, borderRadius: 10,
        boxShadow: '2px 2px 0 rgba(42,36,31,0.12)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 6,
        }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, letterSpacing: 1.2,
            color: INK_2, textTransform: 'uppercase' }}>Upcoming events (3)</span>
          <span style={{ fontFamily: FONT_HAND, fontSize: 12, color: ACCENT, fontWeight: 700 }}>
            All events →
          </span>
        </div>
        {[
          { n: 'Rakhi',   t: 'in 2 weeks' },
          { n: 'Ganpati', t: 'in 5 weeks' },
          { n: 'Diwali',  t: 'in 14 weeks' },
        ].map((e, i, a) => (
          <div key={i} style={{ padding: '6px 0',
            borderBottom: i < a.length - 1 ? `1px dashed ${INK_3}` : 'none',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{e.n}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>
              {e.t} <span style={{ color: INK_3, fontFamily: FONT_HAND, marginLeft: 4 }}>›</span>
            </span>
          </div>
        ))}
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, padding: '6px 10px', background: '#fff',
            border: `1.2px dashed ${INK}`, borderRadius: 6,
            textAlign: 'center', fontFamily: FONT_HAND, fontSize: 12, fontWeight: 700 }}>
            + Add event
          </div>
          <div style={{ padding: '6px 10px', background: '#fff',
            border: `1.2px solid ${INK}`, borderRadius: 6,
            fontFamily: FONT_HAND, fontSize: 12, fontWeight: 700 }}>
            See all (8)
          </div>
        </div>
      </div>

      <WLabel action="plan this week →">This week, make</WLabel>
      {rows.map((r, i) => {
        const pct = Math.min(100, (r.made / r.plan) * 100);
        return (
          <div key={i} style={{ margin: '3px 14px',
            padding: '7px 11px', background: '#fff',
            border: `1.4px solid ${INK}`, borderRadius: 10,
            boxShadow: '2px 2px 0 rgba(42,36,31,0.12)',
            display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
              <svg width="36" height="36" viewBox="0 0 42 42">
                <circle cx="21" cy="21" r="17" fill="none" stroke={INK_3} strokeWidth="2" strokeDasharray="3 3" />
                <circle cx="21" cy="21" r="17" fill="none" stroke={ACCENT} strokeWidth="3"
                  strokeDasharray={`${(pct / 100) * 107} 107`}
                  transform="rotate(-90 21 21)" strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: FONT_HAND, fontSize: 11, fontWeight: 700 }}>
                {r.made}/{r.plan}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>{r.n}</div>
              <div style={{ fontSize: 10.5, color: INK_2 }}>
                Plan {r.plan} · Made {r.made} {r.sub && <span style={{ color: INK_3, fontStyle: 'italic' }}>· {r.sub}</span>}
              </div>
            </div>
            <span style={{ color: INK_3, fontSize: 14 }}>›</span>
          </div>
        );
      })}

      <div style={{ flex: 1 }} />
      <WBtn>+ Log production</WBtn>
      <WTabBar active={3} />
    </WScreen>
  );
}

// ── Trends v2 — answer "am I getting better?" plainly ────
// Big headline + simple line going down (smaller miss = better) +
// per-product row with sparkline of weekly variance.
function ReportsTrendsV2() {
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

      {/* Big headline */}
      <div style={{ padding: '14px 16px 8px' }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: INK_2, letterSpacing: 0.6,
          textTransform: 'uppercase' }}>This month — plan accuracy</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
          <span style={{ fontFamily: FONT_HAND, fontSize: 38, fontWeight: 700, color: ACCENT, lineHeight: 1 }}>84%</span>
          <span style={{ fontFamily: FONT_HAND, fontSize: 13, color: INK_2 }}>
            up from <strong>71%</strong> last month
          </span>
        </div>
        <div style={{ fontSize: 12, color: INK_3, marginTop: 4, fontFamily: FONT_HAND, fontStyle: 'italic' }}>
          The closer to 100%, the better your weekly plans match real demand.
        </div>
      </div>

      {/* Line chart — accuracy over last 8 weeks (higher = better) */}
      <div style={{ margin: '8px 14px',
        background: '#fff', border: `1.2px solid ${INK_3}`, borderRadius: 8,
        padding: '14px 12px 18px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          fontFamily: FONT_MONO, fontSize: 9, color: INK_3, letterSpacing: 0.4, marginBottom: 6 }}>
          <span>WEEKLY ACCURACY · LAST 8 WEEKS</span>
          <span>100%</span>
        </div>
        <svg viewBox="0 0 280 120" width="100%" height="120" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
          {/* horizontal guides */}
          {[20, 60, 100].map(y => (
            <line key={y} x1="0" x2="280" y1={y} y2={y} stroke={INK_3} strokeOpacity="0.4" strokeDasharray="2 4" />
          ))}
          {/* line going up (rising accuracy) */}
          <polyline
            fill="none"
            stroke={ACCENT}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            points="20,90 60,98 100,72 140,80 180,55 220,48 250,30 280,20"
          />
          {/* points */}
          {[[20,90,'58%'],[60,98,'52%'],[100,72,'68%'],[140,80,'63%'],[180,55,'76%'],[220,48,'80%'],[250,30,'88%'],[280,20,'92%']].map(([x,y,l],i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="3.2" fill="#fff" stroke={INK} strokeWidth="1.3" />
            </g>
          ))}
          {/* missing week — explicit dotted gap */}
          <text x="60" y="115" fontSize="8" fontFamily="JetBrains Mono" fill={INK_3} textAnchor="middle">·</text>
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          fontFamily: FONT_MONO, fontSize: 8.5, color: INK_3, marginTop: 2 }}>
          {['w-7','w-6','w-5','w-4','w-3','w-2','w-1','this'].map(w => <span key={w}>{w}</span>)}
        </div>
        <div style={{ marginTop: 6, fontSize: 10.5, color: INK_3, fontFamily: FONT_HAND, fontStyle: 'italic' }}>
          Line going up = your plans matching reality more closely.
        </div>
      </div>

      {/* Per-product sparklines */}
      <WLabel>By product</WLabel>
      <div style={{ margin: '0 14px',
        background: '#fff', border: `1.2px solid ${INK_3}`, borderRadius: 8 }}>
        {[
          { n: 'Chakli',       trend: [55, 60, 68, 70, 78, 82, 86, 90], delta: '+12pp', biggest: 'Mar w3 · −40%' },
          { n: 'Chirote',      trend: [62, 58, 70, 65, 80, 82, 88, 92], delta: '+10pp', biggest: 'Apr w2 · +25%' },
          { n: 'Mathari',      trend: [48, 50, 58, 62, 60, 70, 72, 78], delta: '+18pp', biggest: 'Mar w1 · −50%' },
          { n: 'Ragi Cookies', trend: [70, 72, 75, 78, 80, 85, 88, 90], delta: '+6pp',  biggest: 'May w1 · +14%' },
        ].map((p, i, a) => {
          const max = 100, min = 30;
          const pts = p.trend.map((v, j) => {
            const x = (j / (p.trend.length - 1)) * 60;
            const y = 20 - ((v - min) / (max - min)) * 20;
            return `${x},${y}`;
          }).join(' ');
          return (
            <div key={i} style={{ padding: '10px 12px',
              borderBottom: i < a.length - 1 ? `1px dashed ${INK_3}` : 'none',
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{p.n}</div>
                <div style={{ fontSize: 10.5, color: INK_3, fontFamily: FONT_MONO }}>biggest miss: {p.biggest}</div>
              </div>
              <svg width="60" height="22" viewBox="0 0 60 22">
                <polyline fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" points={pts}/>
                <circle cx="60" cy={20 - ((p.trend[p.trend.length-1] - min) / (max - min)) * 20} r="1.8" fill={ACCENT}/>
              </svg>
              <span style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700, color: '#2c5733', minWidth: 36, textAlign: 'right' }}>{p.delta}</span>
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />
      <WTabBar active={4} />
    </WScreen>
  );
}

// ── Order confirmation (post-submit, public form) ─────────
function OrderConfirmation() {
  return (
    <WScreen bg="#fbf8f1">
      {/* Brand bar */}
      <div style={{
        background: ACCENT, color: '#fff', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1.4px solid ${INK}`,
      }}>
        <div style={{ width: 32, height: 32, borderRadius: 8,
          background: '#fff', border: `1.4px solid ${INK}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700, color: ACCENT,
          transform: 'rotate(-3deg)' }}>C</div>
        <div style={{ fontFamily: FONT_HAND, fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>
          CRUNCHIES
        </div>
      </div>

      {/* Success card */}
      <div style={{
        margin: '16px 14px 0', padding: '18px 16px',
        background: '#fff', border: `1.6px solid ${INK}`, borderRadius: 12,
        boxShadow: '3px 3px 0 rgba(42,36,31,0.18)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto',
          background: ACCENT_SOFT, border: `1.8px solid ${ACCENT}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT_HAND, fontSize: 28, fontWeight: 700, color: ACCENT,
        }}>✓</div>
        <div style={{ fontFamily: FONT_HAND, fontSize: 20, fontWeight: 700, marginTop: 12 }}>
          Order placed.
        </div>
        <div style={{ fontFamily: FONT_HAND, fontSize: 13, color: INK_2, marginTop: 4 }}>
          Thank you, Rohit. We'll WhatsApp you to confirm.
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: INK_3, marginTop: 8, letterSpacing: 0.4 }}>
          ORDER #2026-0184
        </div>
      </div>

      {/* Pickup details */}
      <WLabel>Pickup</WLabel>
      <div style={{ margin: '0 14px', padding: '10px 12px',
        background: '#fff7c2', border: `1.2px solid ${INK}`, borderRadius: 8 }}>
        <div style={{ fontFamily: FONT_HAND, fontSize: 15, fontWeight: 700 }}>Diwali Fair Aundh</div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: INK_2, letterSpacing: 0.3, marginTop: 2 }}>
          SAT 18 OCT  ·  10am – 12pm
        </div>
        <div style={{ fontSize: 11.5, color: INK_2, marginTop: 4, fontFamily: FONT_HAND }}>
          Stall 14 · Aundh Cultural Hall
        </div>
      </div>

      {/* Order summary */}
      <WLabel>Your order</WLabel>
      <div style={{ margin: '0 14px', padding: '10px 12px',
        background: '#fff', border: `1.2px solid ${INK}`, borderRadius: 8 }}>
        {[
          ['Chirote (125g)', 1, 120],
          ['Chakli (250g)',  1, 200],
          ['Ragi (250g)',    1, 200],
        ].map(([n, q, p], i, a) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
            padding: '4px 0', borderBottom: i < a.length - 1 ? `1px dashed ${INK_3}` : 'none',
            fontFamily: FONT_HAND, fontSize: 13 }}>
            <span>{n} <span style={{ color: INK_3 }}>× {q}</span></span>
            <span style={{ fontWeight: 700, fontFamily: FONT_MONO }}>₹{p}</span>
          </div>
        ))}
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1.5px solid ${INK}`,
          display: 'flex', justifyContent: 'space-between',
          fontFamily: FONT_HAND, fontSize: 15, fontWeight: 700 }}>
          <span>Total · pay at pickup</span><span>₹520</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ margin: '14px 14px 0' }}>
        <WBtn style={{ margin: 0 }}>Save to WhatsApp</WBtn>
      </div>
      <div style={{ margin: '8px 14px 0', textAlign: 'center',
        fontFamily: FONT_HAND, fontSize: 13, color: ACCENT, fontWeight: 700 }}>
        Place another order →
      </div>
      <div style={{ margin: '10px 14px 14px', textAlign: 'center',
        fontFamily: FONT_HAND, fontSize: 11.5, color: INK_3, fontStyle: 'italic' }}>
        Questions? WhatsApp Archana on +91 73508 25521.
      </div>
    </WScreen>
  );
}

Object.assign(window, { TodayBv2, ProductionBv2, ReportsTrendsV2, OrderConfirmation });
