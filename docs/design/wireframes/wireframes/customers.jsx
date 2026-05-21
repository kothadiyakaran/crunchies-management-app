// customers.jsx — directory, detail, add

function CustomersDir() {
  const rows = [
    { n: 'Sunita Patil',   sub: 'Personal · Large · 12 orders',                   r: 'ordered 3 days ago' },
    { n: 'Anand Despande', sub: 'Personal · — · 5 orders',                        r: 'ordered today' },
    { n: 'Bharati Joshi',  sub: 'Reseller · Large · 28 orders',                   r: 'ordered 6 days ago' },
    { n: 'Pradeep Kale',   sub: 'Personal · Small · 3 orders · quiet 8w',         r: '2 months ago', quiet: true },
    { n: 'Meera Joshi',    sub: 'Personal · — · 4 orders',                        r: 'ordered today' },
    { n: 'Rohit Marathe',  sub: 'Exhibition · — · 1 order · from Diwali Fair',    r: 'ordered 14 days ago' },
    { n: 'Sneha Marathe',  sub: 'Personal · Small · 7 orders · quiet 10w',        r: '10 weeks ago', quiet: true },
    { n: 'Vinod Kale',     sub: 'Reseller · Large · 41 orders',                   r: 'ordered 12 May' },
  ];
  return (
    <WScreen>
      <div style={{ padding: '10px 14px 6px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px dashed ${INK_3}` }}>
        <div style={{ flex: 1, padding: '7px 10px', background: '#fff',
          border: `1.2px solid ${INK}`, borderRadius: 8,
          fontFamily: FONT_HAND, fontSize: 13, color: INK_3 }}>
          🔍 Name or phone
        </div>
        <div style={{ padding: '7px 12px', background: ACCENT, color: '#fff',
          border: `1.2px solid ${INK}`, borderRadius: 8,
          fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>+ Add</div>
      </div>
      <WChipRow chips={['All', 'Resellers', 'Personal', 'Exhibition', 'Large', 'Quiet']} selectedIdx={0} />
      <div style={{ padding: '0 14px 6px',
        display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: INK_3, letterSpacing: 0.5 }}>SORT · RECENT ORDER</span>
        <span style={{ fontFamily: FONT_HAND, fontSize: 11, color: INK_2 }}>32 customers</span>
      </div>
      {rows.map((r, i) => (
        <WRow key={i}
          line1={r.n}
          line2={r.sub}
          right1={r.r}
        />
      ))}
      <div style={{ flex: 1 }} />
      <WTabBar active={2} />
    </WScreen>
  );
}

function CustomerDetail() {
  const orders = [
    { d: '3 days ago', s: '2 chakli, 1 chirote',  v: '₹420', bad: 'unpaid' },
    { d: '12 May',     s: '1 chakli',              v: '₹200', bad: 'paid' },
    { d: '5 May',      s: '3 mathari',             v: '₹360', bad: 'paid' },
    { d: '24 Apr',     s: '2 ragi cookies',        v: '₹240', bad: 'paid' },
  ];
  return (
    <WScreen>
      <div style={{ padding: '12px 14px',
        borderBottom: `1.2px dashed ${INK_3}`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 18 }}>‹</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT_HAND, fontSize: 19, fontWeight: 700 }}>Sunita Patil</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: INK_2 }}>+91 98765 43210</div>
        </div>
        <span style={{ color: INK_3 }}>⋯</span>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 14px' }}>
        <WBadge>Personal</WBadge>
        <WBadge>Large</WBadge>
        <WBadge>Customer since Mar 2024</WBadge>
      </div>

      <div style={{ margin: '4px 14px', padding: '10px 12px',
        background: '#fff', border: `1.2px solid ${INK}`, borderRadius: 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 22, fontWeight: 700 }}>12</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_2, letterSpacing: 0.5 }}>ORDERS</div>
        </div>
        <div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 22, fontWeight: 700, color: '#a04015' }}>₹420</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_2, letterSpacing: 0.5 }}>OUTSTANDING</div>
        </div>
        <div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700, marginTop: 6 }}>3d</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_2, letterSpacing: 0.5 }}>LAST ORDER</div>
        </div>
      </div>

      <WBtn>+ Log new order</WBtn>
      <WBtn primary={false}>Send WhatsApp</WBtn>

      <WLabel>Notes</WLabel>
      <div style={{ margin: '0 14px', padding: '8px 10px',
        border: `1px dashed ${INK_3}`, borderRadius: 6, background: '#fff',
        fontFamily: FONT_HAND, fontSize: 12, color: INK_2, fontStyle: 'italic' }}>
        Prefers chakli + chirote combo. Pays on Fridays.
      </div>

      <WLabel>Order history</WLabel>
      {orders.map((r, i) => (
        <div key={i} style={{ margin: '0 14px', padding: '7px 0',
          borderBottom: `1px dashed ${INK_3}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>{r.d}</div>
            <div style={{ fontSize: 11, color: INK_2 }}>{r.s}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>{r.v}</span>
            <WBadge kind={r.bad === 'paid' ? 'ok' : 'warn'}>{r.bad}</WBadge>
            <span style={{ color: INK_3 }}>›</span>
          </div>
        </div>
      ))}

      <div style={{ flex: 1 }} />
      <WTabBar active={2} />
    </WScreen>
  );
}

function AddCustomer() {
  return (
    <WScreen>
      <div style={{ padding: '12px 14px',
        borderBottom: `1.2px dashed ${INK_3}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 18 }}>×</span>
        <span style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>New customer</span>
        <span style={{ width: 18 }} />
      </div>
      <WInput label="Name *" placeholder="Customer name" />
      <WInput label="Phone *" placeholder="98XXX XXXXX" prefix="+91" />
      <WLabel>Channel *</WLabel>
      <div style={{ margin: '0 14px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <WChip selected>Personal</WChip>
        <WChip>Reseller</WChip>
        <WChip>Exhibition</WChip>
      </div>
      <WLabel>Size tier (optional)</WLabel>
      <div style={{ margin: '0 14px', display: 'flex', gap: 6 }}>
        <WChip>Small</WChip>
        <WChip selected>Large</WChip>
        <WChip dashed>—</WChip>
      </div>
      <WInput label="Source event (optional)" value="—" suffix="▾" small />
      <WInput label="Notes (optional)" placeholder="Preferences, history…" small />

      <div style={{ flex: 1 }} />
      <WBtn>Save customer</WBtn>
    </WScreen>
  );
}

Object.assign(window, { CustomersDir, CustomerDetail, AddCustomer });
