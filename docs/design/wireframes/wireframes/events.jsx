// events.jsx — Events list + detail

function EventsList() {
  const rows = [
    { n: 'Rakhi 2026',          k: 'Festival',    d: 'Wed 5 Aug – Fri 7 Aug',   when: 'in 2 weeks',  meta: '2 weeks lead · 4 products' },
    { n: 'Diwali Fair Aundh',   k: 'Exhibition',  d: 'Sat 18 Oct',              when: 'in 5 months', meta: '1 week lead · 7 products' },
    { n: 'Ganpati 2026',        k: 'Festival',    d: 'Mon 7 Sep – Fri 18 Sep',  when: 'in 5 weeks',  meta: '3 weeks lead · 6 products' },
    { n: 'Diwali 2026',         k: 'Festival',    d: 'Fri 6 Nov – Sun 8 Nov',   when: 'in 14 weeks', meta: '3 weeks lead · 5 products' },
  ];
  return (
    <WScreen>
      <div style={{ padding: '12px 14px',
        borderBottom: `1.2px dashed ${INK_3}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 18 }}>‹</span>
        <span style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>Events</span>
        <div style={{ padding: '5px 10px', background: ACCENT, color: '#fff',
          border: `1.2px solid ${INK}`, borderRadius: 8,
          fontFamily: FONT_HAND, fontSize: 12, fontWeight: 700 }}>+ Add</div>
      </div>
      <WChipRow chips={['Upcoming', 'Past', 'All']} selectedIdx={0} />
      {rows.map((r, i) => (
        <div key={i} style={{ padding: '10px 14px',
          borderBottom: `1px dashed ${INK_3}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: FONT_HAND, fontSize: 15, fontWeight: 700 }}>{r.n}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>{r.when} ›</span>
          </div>
          <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <WBadge kind={r.k === 'Exhibition' ? 'accent' : 'neutral'}>{r.k}</WBadge>
            <span style={{ fontSize: 11, color: INK_2 }}>{r.d}</span>
          </div>
          <div style={{ fontSize: 11, color: INK_3, marginTop: 3, fontFamily: FONT_MONO }}>{r.meta}</div>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <WTabBar active={3} />
    </WScreen>
  );
}

function EventDetail() {
  const products = [
    { n: 'Laddu',   q: 200, u: 'boxes' },
    { n: 'Chivda',  q: 50,  u: 'kg' },
    { n: 'Mathari', q: 20,  u: 'kg' },
    { n: 'Chakli',  q: 0,   u: 'kg' },
    { n: 'Karanji', q: 80,  u: 'dozen' },
  ];
  return (
    <WScreen>
      <div style={{ padding: '12px 14px',
        borderBottom: `1.2px dashed ${INK_3}`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 18 }}>‹</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>Diwali Fair Aundh</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>EXHIBITION · IN 5 MONTHS</div>
        </div>
      </div>

      <WLabel>Public URL</WLabel>
      <div style={{ margin: '0 14px', padding: '8px 10px',
        background: '#fff', border: `1.2px solid ${INK}`, borderRadius: 6,
        fontFamily: FONT_MONO, fontSize: 10, color: INK_2, wordBreak: 'break-all' }}>
        crunchies.in/order/diwali-fair-aundh-2026
      </div>
      <div style={{ margin: '8px 14px', display: 'flex', gap: 8 }}>
        <WBtn primary={false} small style={{ margin: 0, flex: 1 }}>Copy link</WBtn>
        <WBtn small style={{ margin: 0, flex: 1 }}>Share WhatsApp</WBtn>
      </div>

      <WLabel>Dates & lead time</WLabel>
      <div style={{ margin: '0 14px', display: 'flex', gap: 8 }}>
        <WInput label="Start" value="Sat 18 Oct" small style={{ flex: 1, margin: 0 }} />
        <WInput label="End"   value="Sat 18 Oct" small style={{ flex: 1, margin: 0 }} />
      </div>
      <WInput label="Lead weeks" value="1" suffix="− +" small />

      <WLabel>Expected demand</WLabel>
      <div style={{ margin: '0 14px', border: `1.2px solid ${INK}`, borderRadius: 8, background: '#fff' }}>
        {products.map((p, i) => (
          <div key={i} style={{ padding: '8px 10px',
            borderBottom: i < products.length - 1 ? `1px dashed ${INK_3}` : 'none',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{p.n}</span>
            <div style={{ width: 50, height: 26, border: `1.2px solid ${INK}`, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700,
              color: p.q === 0 ? INK_3 : INK }}>{p.q}</div>
            <span style={{ width: 50, fontFamily: FONT_MONO, fontSize: 10, color: INK_3 }}>{p.u}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <WBtn>Save</WBtn>
      <div style={{ margin: '0 14px 8px', display: 'flex', justifyContent: 'space-between',
        fontFamily: FONT_HAND, fontSize: 12 }}>
        <span style={{ color: ACCENT }}>Duplicate to 2027</span>
        <span style={{ color: '#a04015' }}>Delete event</span>
      </div>
    </WScreen>
  );
}

Object.assign(window, { EventsList, EventDetail });
