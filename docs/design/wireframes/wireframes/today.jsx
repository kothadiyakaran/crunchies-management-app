// today.jsx — 3 variations of the Today screen

// ── A · Decision-first — gap-sorted production hero ─────────
function TodayA() {
  return (
    <WScreen>
      <WHeader left="Mon, 20 May 2026" right="⚙" />

      {/* Monday retrospective banner */}
      <div style={{ margin: '10px 14px 0', padding: '10px 12px',
        background: '#fff7c2', border: `1.2px solid ${INK}`, borderRadius: 8,
        fontFamily: FONT_HAND, fontSize: 12, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Last week — planned 18, made 14, demand 22. <span style={{ color: ACCENT, fontWeight: 700 }}>See details →</span></span>
        <span style={{ color: INK_3, marginLeft: 8 }}>×</span>
      </div>

      <WLabel>This week, make</WLabel>
      <div style={{ margin: '0 14px', border: `1.4px solid ${INK}`, borderRadius: 10, background: '#fff' }}>
        {[
          { n: 'Chakli',       plan: 5, made: 1, sub: 'pending orders +2' },
          { n: 'Chirote',      plan: 4, made: 0, sub: null },
          { n: 'Mathari',      plan: 3, made: 1, sub: null },
          { n: 'Ragi Cookies', plan: 2, made: 0, sub: 'ramp-up for Rakhi' },
        ].map((p, i) => (
          <div key={i} style={{ padding: '10px 12px',
            borderBottom: i < 3 ? `1px dashed ${INK_3}` : 'none',
            display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 16, fontWeight: 700 }}>{p.n}</div>
              {p.sub && <div style={{ fontSize: 10.5, color: INK_3, fontStyle: 'italic' }}>{p.sub}</div>}
            </div>
            <div style={{ textAlign: 'right', minWidth: 72 }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{p.plan}</div>
              <div style={{ fontSize: 10, color: INK_2, fontFamily: FONT_MONO, letterSpacing: 0.4 }}>made {p.made} of {p.plan}</div>
            </div>
            <span style={{ color: INK_3, fontSize: 16 }}>›</span>
          </div>
        ))}
      </div>
      <div style={{ margin: '6px 14px 0', fontFamily: FONT_HAND, fontSize: 12, color: INK_2 }}>
        Done this week (1)  ▾
      </div>

      <WLabel count="3">Pending today</WLabel>
      <div style={{ margin: '0 14px' }}>
        {[
          { n: 'Sunita Patil',  s: '2 chakli, 1 chirote',  d: 'overdue 2 days', warn: true },
          { n: 'Meera Joshi',   s: '1 ragi cookies',        d: 'due today' },
          { n: 'Rakesh Sharma', s: '3 mathari, 2 chakli',   d: 'due today' },
        ].map((r, i) => (
          <div key={i} style={{ padding: '8px 0',
            borderBottom: i < 2 ? `1px dashed ${INK_3}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{r.n}</span>
              <span style={{ fontSize: 11, color: r.warn ? '#a04015' : INK_2, fontFamily: FONT_MONO }}>{r.d}</span>
            </div>
            <div style={{ fontSize: 11, color: INK_2 }}>{r.s}</div>
          </div>
        ))}
        <div style={{ marginTop: 6, fontSize: 11.5, color: ACCENT, fontFamily: FONT_HAND }}>see all →</div>
      </div>

      <WLabel count="2">Quiet customers</WLabel>
      <div style={{ margin: '0 14px 14px', padding: '8px 10px',
        border: `1px dashed ${INK_3}`, borderRadius: 8, background: '#f4f0e6' }}>
        {[
          { n: 'Pradeep Kale',   s: 'Personal · quiet 8w' },
          { n: 'Sneha Marathe', s: 'Personal · quiet 10w' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
            padding: '5px 0', borderBottom: i === 0 ? `1px dashed ${INK_3}` : 'none' }}>
            <div>
              <div style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700, color: INK_2 }}>{r.n}</div>
              <div style={{ fontSize: 10.5, color: INK_3, fontFamily: FONT_MONO }}>{r.s}</div>
            </div>
            <span style={{ color: INK_3, fontSize: 14, lineHeight: '20px' }}>×</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <WBtn>+ Log new order</WBtn>
      <WTabBar active={0} />
    </WScreen>
  );
}

// ── B · Calendar-anchored — week strip, then pending, then make ─
function TodayB() {
  const days = [
    { d: 'M', n: 20, cur: true, dot: 3 },
    { d: 'T', n: 21, dot: 1 },
    { d: 'W', n: 22, dot: 2 },
    { d: 'T', n: 23, dot: 0 },
    { d: 'F', n: 24, dot: 4 },
    { d: 'S', n: 25, dot: 0 },
    { d: 'S', n: 26, dot: 1 },
  ];
  return (
    <WScreen>
      <WHeader left="Today" sub="Week of 20 May" right="⚙" />

      {/* Week strip */}
      <div style={{ display: 'flex', padding: '10px 10px 6px', gap: 4 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', padding: '6px 0',
            border: `1.2px ${d.cur ? 'solid' : 'dashed'} ${d.cur ? INK : INK_3}`,
            borderRadius: 8, background: d.cur ? '#fff' : 'transparent' }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_2, letterSpacing: 0.5 }}>{d.d}</div>
            <div style={{ fontFamily: FONT_HAND, fontSize: 16, fontWeight: 700 }}>{d.n}</div>
            <div style={{ height: 6, marginTop: 2 }}>
              {d.dot > 0 && <span style={{ display: 'inline-block', width: 4, height: 4,
                borderRadius: '50%', background: ACCENT }} />}
            </div>
          </div>
        ))}
      </div>

      <div style={{ margin: '6px 14px 0', padding: '10px 12px',
        background: '#fff7c2', border: `1.2px solid ${INK}`, borderRadius: 8,
        fontFamily: FONT_HAND, fontSize: 12 }}>
        <strong>Last week.</strong> Planned 18 · Made 14 · Demand 22 <span style={{ color: ACCENT }}>→</span>
      </div>

      <WLabel count="3">Due today / overdue</WLabel>
      <div style={{ margin: '0 14px', border: `1.4px solid ${INK}`, borderRadius: 10, background: '#fff' }}>
        {[
          { n: 'Sunita Patil',  s: '2 chakli, 1 chirote',  d: '−2d', warn: true },
          { n: 'Meera Joshi',   s: '1 ragi cookies',        d: 'today' },
          { n: 'Rakesh Sharma', s: '3 mathari, 2 chakli',   d: 'today' },
        ].map((r, i) => (
          <div key={i} style={{ padding: '10px 12px',
            borderBottom: i < 2 ? `1px dashed ${INK_3}` : 'none',
            display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{r.n}</div>
              <div style={{ fontSize: 11, color: INK_2 }}>{r.s}</div>
            </div>
            <span style={{
              padding: '2px 7px', borderRadius: 4,
              fontFamily: FONT_MONO, fontSize: 9.5,
              color: r.warn ? '#7a3508' : INK_2,
              background: r.warn ? '#fde2c8' : 'transparent',
              border: r.warn ? `1px solid ${ACCENT}` : `1px solid ${INK_3}`,
            }}>{r.d}</span>
          </div>
        ))}
      </div>

      <WLabel>This week, make</WLabel>
      {[
        { n: 'Chakli',  plan: 5, made: 1 },
        { n: 'Chirote', plan: 4, made: 0 },
        { n: 'Mathari', plan: 3, made: 1 },
      ].map((p, i) => (
        <div key={i} style={{ margin: '0 14px', padding: '8px 0',
          borderBottom: `1px dashed ${INK_3}`,
          display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{p.n}</div>
            <div style={{ height: 5, marginTop: 4, border: `1px solid ${INK}`, borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${(p.made / p.plan) * 100}%`, background: ACCENT }} />
            </div>
          </div>
          <div style={{ marginLeft: 10, fontFamily: FONT_MONO, fontSize: 11 }}>{p.made}/{p.plan}</div>
        </div>
      ))}

      <WLabel count="2">Quiet</WLabel>
      <div style={{ margin: '0 14px', fontSize: 11.5, color: INK_2, fontFamily: FONT_HAND }}>
        Pradeep Kale · quiet 8w &nbsp;·&nbsp; Sneha Marathe · quiet 10w
      </div>

      <div style={{ flex: 1 }} />
      <WBtn>+ Log new order</WBtn>
      <WTabBar active={0} />
    </WScreen>
  );
}

// ── C · Triage list — one merged action list ─────────────────
function TodayC() {
  const items = [
    { kind: 'order', t: 'OVERDUE', tWarn: true, head: 'Sunita Patil · 2d late', sub: '2 chakli, 1 chirote · ₹420' },
    { kind: 'make',  t: 'MAKE',                head: 'Chakli — 4 more this week',       sub: 'plan 5 · made 1' },
    { kind: 'order', t: 'TODAY',              head: 'Meera Joshi',                       sub: '1 ragi cookies' },
    { kind: 'order', t: 'TODAY',              head: 'Rakesh Sharma',                     sub: '3 mathari, 2 chakli' },
    { kind: 'make',  t: 'MAKE',               head: 'Chirote — 4 this week',             sub: 'plan 4 · made 0' },
    { kind: 'make',  t: 'MAKE',               head: 'Ragi Cookies — 2 this week',        sub: 'ramp-up for Rakhi' },
    { kind: 'make',  t: 'MAKE',               head: 'Mathari — 2 more this week',        sub: 'plan 3 · made 1' },
    { kind: 'quiet', t: 'QUIET',              head: 'Pradeep Kale',                      sub: 'Personal · 8w since last touch' },
    { kind: 'quiet', t: 'QUIET',              head: 'Sneha Marathe',                     sub: 'Personal · 10w' },
  ];
  return (
    <WScreen>
      <WHeader left="Mon, 20 May" sub="9 things on your plate today" right="⚙" />

      {/* Monday banner inline */}
      <div style={{ margin: '8px 14px 4px', padding: '8px 10px',
        background: '#fff7c2', border: `1px solid ${INK}`, borderRadius: 6,
        fontFamily: FONT_HAND, fontSize: 11.5 }}>
        <strong>Last week:</strong> 18 planned · 14 made · 22 demand · <span style={{ color: ACCENT }}>see →</span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', margin: '8px 0 0' }}>
        {items.map((it, i) => {
          const tagColor = it.tWarn ? '#a04015' : it.kind === 'make' ? ACCENT : it.kind === 'quiet' ? INK_3 : INK_2;
          const tagBg = it.tWarn ? '#fde2c8' : it.kind === 'make' ? ACCENT_SOFT : '#f0eee9';
          return (
            <div key={i} style={{ padding: '8px 14px',
              borderTop: `1px dashed ${INK_3}`,
              display: 'flex', alignItems: 'center', gap: 10,
              opacity: it.kind === 'quiet' ? 0.75 : 1 }}>
              <div style={{ width: 60, flexShrink: 0,
                padding: '2px 5px', borderRadius: 3, textAlign: 'center',
                fontFamily: FONT_MONO, fontSize: 8.5, fontWeight: 600,
                color: tagColor, background: tagBg,
                border: `1px solid ${tagColor === INK_3 ? INK_3 : tagColor}` }}>{it.t}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.head}</div>
                <div style={{ fontSize: 10.5, color: INK_2 }}>{it.sub}</div>
              </div>
              <span style={{ color: INK_3 }}>›</span>
            </div>
          );
        })}
      </div>

      <WBtn>+ Log new order</WBtn>
      <WTabBar active={0} />
    </WScreen>
  );
}

Object.assign(window, { TodayA, TodayB, TodayC });
