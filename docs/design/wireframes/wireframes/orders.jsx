// orders.jsx — Orders browse (2 variants), Batch, Add x2, Detail

const ORDERS_TOPBAR = (
  <div style={{ padding: '10px 14px 6px',
    display: 'flex', alignItems: 'center', gap: 8,
    borderBottom: `1px dashed ${INK_3}` }}>
    <div style={{ flex: 1, padding: '7px 10px', background: '#fff',
      border: `1.2px solid ${INK}`, borderRadius: 8,
      fontFamily: FONT_HAND, fontSize: 13, color: INK_3 }}>
      🔍 Search by customer
    </div>
    <div style={{ padding: '7px 12px', background: ACCENT, color: '#fff',
      border: `1.2px solid ${INK}`, borderRadius: 8,
      fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>+ Log</div>
  </div>
);

const ORDERS_CHIPS = (
  <WChipRow chips={['All', 'Pending', 'Unpaid', 'This week', 'This month']} selectedIdx={0} />
);

// ── A · Flat list, reverse chronological ───────────────────
function OrdersA() {
  const rows = [
    { n: 'Sunita Patil',     d: 'today',      v: '₹420', s: '2 chakli, 1 chirote',                badges: ['pending', 'unpaid'] },
    { n: 'Meera Joshi',      d: 'today',      v: '₹180', s: '1 ragi cookies',                     badges: ['pending', 'paid'] },
    { n: 'Rakesh Sharma',    d: 'today',      v: '₹520', s: '3 mathari, 2 chakli',                badges: ['pending', 'unpaid'] },
    { n: 'Pooja Kulkarni',   d: 'yesterday',  v: '₹350', s: '2 chirote, 1 nimki',                 badges: ['fulfilled', 'paid'] },
    { n: 'Anand Despande',   d: '3 days ago', v: '₹620', s: '4 jowar papdi, 2 oats',              badges: ['fulfilled', 'unpaid'] },
    { n: 'Sneha Marathe',    d: '4 days ago', v: '₹250', s: '1 chakli, 1 mathari',                badges: ['fulfilled', 'paid'] },
    { n: 'Vinod Kale',       d: '12 May',     v: '₹980', s: '5 chirote, 2 ragi, 1 nimki',         badges: ['fulfilled', 'paid'] },
    { n: 'Sneha Marathe',    d: '10 May',     v: '₹150', s: '1 oats & nuts',                      badges: ['fulfilled', 'paid'] },
  ];
  return (
    <WScreen>
      {ORDERS_TOPBAR}
      {ORDERS_CHIPS}
      <div style={{ padding: '0 14px 6px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: INK_3, letterSpacing: 0.5 }}>SORT · NEWEST</span>
        <span style={{ fontFamily: FONT_HAND, fontSize: 12, color: INK_2 }}>Browse · Batch</span>
      </div>
      {rows.map((r, i) => (
        <WRow key={i}
          line1={r.n}
          line2={r.s}
          right1={`${r.d} · ${r.v}`}
          badges={r.badges.map((b, j) => <WBadge key={j} kind={
            b === 'paid' ? 'ok' : b === 'unpaid' ? 'warn' : b === 'fulfilled' ? 'ok' : 'neutral'
          }>{b}</WBadge>)}
        />
      ))}
      <div style={{ flex: 1 }} />
      <WTabBar active={1} />
    </WScreen>
  );
}

// ── B · Grouped by day ────────────────────────────────────
function OrdersB() {
  const groups = [
    { day: 'Today · Mon 20 May', rows: [
      { n: 'Sunita Patil',  v: '₹420', s: '2 chakli, 1 chirote',  bad: 'unpaid' },
      { n: 'Meera Joshi',   v: '₹180', s: '1 ragi cookies',        bad: 'paid' },
      { n: 'Rakesh Sharma', v: '₹520', s: '3 mathari, 2 chakli',   bad: 'unpaid' },
    ]},
    { day: 'Yesterday', rows: [
      { n: 'Pooja Kulkarni', v: '₹350', s: '2 chirote, 1 nimki',   bad: 'paid', done: true },
    ]},
    { day: 'Sat 17 May', rows: [
      { n: 'Anand Despande', v: '₹620', s: '4 jowar, 2 oats',      bad: 'unpaid', done: true },
      { n: 'Sneha Marathe',  v: '₹250', s: '1 chakli, 1 mathari',  bad: 'paid', done: true },
    ]},
  ];
  return (
    <WScreen>
      {ORDERS_TOPBAR}
      {ORDERS_CHIPS}
      <div style={{ padding: '4px 14px 8px',
        display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: INK_3, letterSpacing: 0.5 }}>GROUPED · BY DAY</span>
        <span style={{ fontFamily: FONT_HAND, fontSize: 12, color: INK_2 }}>Browse · Batch</span>
      </div>
      {groups.map((g, i) => (
        <div key={i}>
          <div style={{ padding: '8px 14px', background: '#f1ece1',
            borderTop: `1px solid ${INK_3}`, borderBottom: `1px solid ${INK_3}`,
            fontFamily: FONT_HAND, fontSize: 12, fontWeight: 700, color: INK_2 }}>
            {g.day}
          </div>
          {g.rows.map((r, j) => (
            <div key={j} style={{ padding: '8px 14px',
              borderBottom: `1px dashed ${INK_3}`,
              display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{r.n}</div>
                <div style={{ fontSize: 11, color: INK_2 }}>{r.s}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{r.v}</div>
                <div style={{ marginTop: 3 }}>
                  <WBadge kind={r.bad === 'paid' ? 'ok' : 'warn'}>{r.bad}</WBadge>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <WTabBar active={1} />
    </WScreen>
  );
}

// ── Batch entry ──────────────────────────────────────────
function OrdersBatch() {
  return (
    <WScreen>
      <div style={{ padding: '12px 14px',
        borderBottom: `1.2px dashed ${INK_3}`, background: '#fff7c2',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 16, fontWeight: 700 }}>Batch entry</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>3 SAVED · TAP TO EDIT</div>
        </div>
        <span style={{ fontFamily: FONT_HAND, fontSize: 14, color: ACCENT, fontWeight: 700 }}>Done</span>
      </div>

      <WInput label="Customer" placeholder="Type 2 letters…" />
      <WInput label="Items" value="Chakli × 2  ·  Chirote × 1" />
      <div style={{ margin: '0 14px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <WChip selected>Chakli</WChip>
        <WChip>Chirote</WChip>
        <WChip>Mathari</WChip>
        <WChip>Ragi</WChip>
        <WChip>+ More…</WChip>
      </div>
      <WInput label="Payment" value="Unpaid" suffix="▾" small />
      <WInput label="Notes (optional)" placeholder="…" small />

      <div style={{ margin: '10px 14px' }}>
        <WBtn style={{ margin: 0 }}>Save & next</WBtn>
      </div>

      <WLabel count="3">Saved this session</WLabel>
      <div style={{ margin: '0 14px 8px', border: `1px dashed ${INK_3}`,
        borderRadius: 8, background: '#fff' }}>
        {[
          { n: 'Sunita Patil',  s: '2 chakli, 1 chirote',  v: '₹420' },
          { n: 'Meera Joshi',   s: '1 ragi cookies',        v: '₹180' },
          { n: 'Rakesh Sharma', s: '3 mathari',             v: '₹360' },
        ].map((r, i, a) => (
          <div key={i} style={{ padding: '6px 10px',
            borderBottom: i < a.length - 1 ? `1px dashed ${INK_3}` : 'none',
            display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>{r.n}</div>
              <div style={{ fontSize: 10.5, color: INK_2 }}>{r.s}</div>
            </div>
            <span style={{ fontFamily: FONT_HAND, fontSize: 13 }}>{r.v}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />
    </WScreen>
  );
}

// ── Add Order — single long form (A) ────────────────────────
function AddOrderA() {
  return (
    <WScreen>
      <div style={{ padding: '12px 14px',
        borderBottom: `1.2px dashed ${INK_3}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 18 }}>×</span>
        <span style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>New order</span>
        <span style={{ width: 18 }} />
      </div>
      <WInput label="Customer" value="Sunita Patil" suffix="✓" />
      <WInput label="Source" value="WhatsApp" suffix="▾" small />
      <WInput label="Order date" value="Mon 20 May 2026" suffix="📅" small />
      <WInput label="Target fulfilment date *" value="Fri 24 May 2026" suffix="📅" small />

      <WLabel>Items</WLabel>
      <div style={{ margin: '0 14px', padding: '8px 10px',
        background: '#fff', border: `1.2px solid ${INK}`, borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <WChip selected>Chakli</WChip>
          <WChip selected>Chirote</WChip>
          <WChip>Mathari</WChip>
          <WChip>Ragi</WChip>
          <WChip>Nimki</WChip>
        </div>
        <div style={{ padding: '6px 0', borderTop: `1px dashed ${INK_3}`,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>Chakli</span>
          <div style={{ width: 36, padding: '2px 4px', border: `1.2px solid ${INK}`, borderRadius: 4,
            fontFamily: FONT_HAND, fontSize: 13, textAlign: 'center' }}>2</div>
          <span style={{ color: INK_3, fontFamily: FONT_MONO, fontSize: 11 }}>× ₹200</span>
          <span style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>₹400</span>
        </div>
        <div style={{ padding: '6px 0', borderTop: `1px dashed ${INK_3}`,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>Chirote (125g)</span>
          <div style={{ width: 36, padding: '2px 4px', border: `1.2px solid ${INK}`, borderRadius: 4,
            fontFamily: FONT_HAND, fontSize: 13, textAlign: 'center' }}>1</div>
          <span style={{ color: INK_3, fontFamily: FONT_MONO, fontSize: 11 }}>× ₹120</span>
          <span style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>₹120</span>
        </div>
        <div style={{ marginTop: 8, fontFamily: FONT_HAND, fontSize: 12, color: ACCENT }}>+ Add another item</div>
      </div>

      <WInput label="Payment" value="Unpaid" suffix="▾" small />
      <WInput label="Notes" placeholder="e.g. deliver after 4pm" small />

      <div style={{ flex: 1 }} />
      <div style={{ margin: '10px 14px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: '#fff', border: `1.2px solid ${INK}`, borderRadius: 8 }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 13, color: INK_2 }}>Total</span>
        <span style={{ fontFamily: FONT_HAND, fontSize: 20, fontWeight: 700 }}>₹520</span>
      </div>
      <WBtn>Save order</WBtn>
    </WScreen>
  );
}

// ── Add Order — accordion / progressive (B) ────────────────
function AddOrderB() {
  const Step = ({ n, label, value, open, complete }) => (
    <div style={{ margin: '8px 14px',
      border: `1.4px solid ${open ? INK : INK_3}`, borderRadius: 10,
      background: open ? '#fff' : '#fbf8f1' }}>
      <div style={{ padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%',
          border: `1.4px solid ${INK}`,
          background: complete ? ACCENT : '#fff', color: complete ? '#fff' : INK,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT_HAND, fontSize: 12, fontWeight: 700 }}>{complete ? '✓' : n}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>{label}</div>
          {value && <div style={{ fontSize: 11, color: INK_2 }}>{value}</div>}
        </div>
        <span style={{ color: INK_3 }}>{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          <WInput placeholder="Type 2 letters…" small style={{ margin: '0' }} />
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <WChip>Recent · Sunita Patil</WChip>
            <WChip>Recent · Meera Joshi</WChip>
            <WChip dashed>+ New customer</WChip>
          </div>
        </div>
      )}
    </div>
  );
  return (
    <WScreen>
      <div style={{ padding: '12px 14px',
        borderBottom: `1.2px dashed ${INK_3}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 18 }}>×</span>
        <span style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>New order</span>
        <span style={{ width: 18 }} />
      </div>
      <div style={{ padding: '8px 14px 0', fontSize: 11.5, color: INK_2, fontFamily: FONT_HAND }}>
        Step by step — 30 seconds.
      </div>
      <Step n="1" label="Customer" complete value="Sunita Patil · Personal" />
      <Step n="2" label="Items"    open    value="Pick from chips or search" />
      <Step n="3" label="Fulfilment date" value="—" />
      <Step n="4" label="Payment" value="Unpaid (default)" />
      <Step n="5" label="Notes (optional)" value="—" />

      <div style={{ flex: 1 }} />
      <WBtn>Save order</WBtn>
    </WScreen>
  );
}

// ── Order detail ─────────────────────────────────────────
function OrderDetail() {
  return (
    <WScreen>
      <div style={{ padding: '12px 14px',
        borderBottom: `1.2px dashed ${INK_3}`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 18 }}>‹</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT_HAND, fontSize: 18, fontWeight: 700 }}>Sunita Patil</div>
          <div style={{ fontSize: 11, color: INK_2 }}>Mon 20 May 2026, 11:30am · WhatsApp</div>
        </div>
        <span style={{ color: INK_3 }}>⋯</span>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 14px' }}>
        <WBadge kind="warn">Pending</WBadge>
        <WBadge kind="warn">Unpaid</WBadge>
        <WBadge>WhatsApp</WBadge>
      </div>

      <div style={{ margin: '4px 14px', padding: '8px 12px',
        background: '#fff7c2', border: `1px solid ${INK}`, borderRadius: 6, fontSize: 12 }}>
        <span style={{ fontFamily: FONT_HAND, fontWeight: 700 }}>Due by Fri 24 May</span>
        <span style={{ color: INK_2 }}> · 4 days from today</span>
      </div>

      <WLabel>Items</WLabel>
      <div style={{ margin: '0 14px', padding: '8px 12px',
        background: '#fff', border: `1.2px solid ${INK}`, borderRadius: 8 }}>
        {[
          { p: 'Chakli',          q: 2, u: '₹200', t: '₹400' },
          { p: 'Chirote (125 g)', q: 1, u: '₹120', t: '₹120' },
        ].map((r, i, a) => (
          <div key={i} style={{ padding: '4px 0',
            borderBottom: i < a.length - 1 ? `1px dashed ${INK_3}` : 'none',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontFamily: FONT_HAND, fontSize: 14 }}>{r.p}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: INK_2 }}>{r.q} × {r.u}</span>
            <span style={{ width: 50, textAlign: 'right', fontFamily: FONT_HAND, fontWeight: 700 }}>{r.t}</span>
          </div>
        ))}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1.4px solid ${INK}`,
          display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: FONT_HAND, fontSize: 13, color: INK_2 }}>Subtotal</span>
          <span style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>₹520</span>
        </div>
      </div>

      <WLabel>Notes</WLabel>
      <div style={{ margin: '0 14px', padding: '6px 0',
        fontFamily: FONT_HAND, fontSize: 13, color: INK_2, fontStyle: 'italic' }}>
        Deliver after 4pm. Cash on delivery.
      </div>

      <WBtn>Mark fulfilled</WBtn>
      <WBtn>Mark paid</WBtn>
      <WBtn primary={false}>Generate bill</WBtn>
      <WBtn primary={false}>Log complaint</WBtn>

      <div style={{ margin: '10px 14px 0', display: 'flex', justifyContent: 'space-between',
        fontFamily: FONT_HAND, fontSize: 12 }}>
        <span style={{ color: ACCENT }}>Edit order</span>
        <span style={{ color: '#a04015' }}>Delete</span>
      </div>

      <div style={{ flex: 1 }} />
      <WTabBar active={1} />
    </WScreen>
  );
}

Object.assign(window, { OrdersA, OrdersB, OrdersBatch, AddOrderA, AddOrderB, OrderDetail });
