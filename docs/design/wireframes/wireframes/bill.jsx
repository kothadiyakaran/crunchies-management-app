// bill.jsx — Bill PDF, 2 layouts

// ── A · Compact "receipt" style ───────────────────────
function BillA() {
  return (
    <div style={{ width: '100%', height: '100%', padding: '28px 30px',
      fontFamily: FONT_BODY, color: INK, background: '#fff',
      display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', paddingBottom: 14,
        borderBottom: `2px solid ${INK}` }}>
        <div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 30, fontWeight: 700,
            color: ACCENT, letterSpacing: 1, lineHeight: 1 }}>CRUNCHIES</div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 11, fontStyle: 'italic', color: INK_2, marginTop: 2 }}>
            Crafting sweet moments, one bite at a time.
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: INK_2, marginTop: 6, letterSpacing: 0.3 }}>
            ARCHANA KOTHADIYA · +91 73508 25521 · PUNE
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_3, letterSpacing: 0.5 }}>BILL #</div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 18, fontWeight: 700 }}>2026-0184</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_3, marginTop: 6, letterSpacing: 0.5 }}>DATE</div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 13 }}>Mon, 20 May 2026</div>
        </div>
      </div>

      <div style={{ paddingTop: 14, paddingBottom: 10 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_3, letterSpacing: 0.5 }}>BILL TO</div>
        <div style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700, marginTop: 2 }}>Sunita Patil</div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: INK_2 }}>+91 98765 43210</div>
      </div>

      <div style={{ borderTop: `1px dashed ${INK_3}`, borderBottom: `1px dashed ${INK_3}`,
        padding: '8px 0', display: 'flex',
        fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: 0.5, color: INK_2, textTransform: 'uppercase' }}>
        <div style={{ flex: 1 }}>Item</div>
        <div style={{ width: 60, textAlign: 'right' }}>Qty</div>
        <div style={{ width: 80, textAlign: 'right' }}>Rate</div>
        <div style={{ width: 80, textAlign: 'right' }}>Amount</div>
      </div>

      {[
        ['Chakli',          2, '₹200.00', '₹400.00'],
        ['Chirote (125 g)', 1, '₹120.00', '₹120.00'],
        ['Mathari',         1, '₹120.00', '₹120.00'],
      ].map((r, i) => (
        <div key={i} style={{ padding: '10px 0', display: 'flex',
          borderBottom: `1px dashed ${INK_3}`, fontFamily: FONT_BODY }}>
          <div style={{ flex: 1, fontFamily: FONT_HAND, fontSize: 15, fontWeight: 700 }}>{r[0]}</div>
          <div style={{ width: 60, textAlign: 'right', fontFamily: FONT_MONO, fontSize: 12 }}>{r[1]}</div>
          <div style={{ width: 80, textAlign: 'right', fontFamily: FONT_MONO, fontSize: 12 }}>{r[2]}</div>
          <div style={{ width: 80, textAlign: 'right', fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{r[3]}</div>
        </div>
      ))}

      <div style={{ marginTop: 14, marginLeft: 'auto', width: 240 }}>
        <Row label="Subtotal" v="₹640.00" />
        <Row label="Already paid" v="—" />
        <div style={{ borderTop: `2px solid ${INK}`, marginTop: 6, paddingTop: 8,
          display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>Total due</span>
          <span style={{ fontFamily: FONT_HAND, fontSize: 22, fontWeight: 700, color: ACCENT }}>₹640.00</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px dashed ${INK_3}`, paddingTop: 12,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: FONT_HAND, fontSize: 12, color: INK_2, fontStyle: 'italic' }}>
          Thank you. — Archana
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_3, letterSpacing: 0.5 }}>UPI · CASH · BANK</div>
      </div>
    </div>
  );
}

function Row({ label, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0',
      fontFamily: FONT_BODY, fontSize: 13, color: INK_2 }}>
      <span>{label}</span>
      <span style={{ fontFamily: FONT_MONO }}>{v}</span>
    </div>
  );
}

// ── B · Traditional invoice ──────────────────────────
function BillB() {
  return (
    <div style={{ width: '100%', height: '100%', padding: '24px 28px',
      fontFamily: FONT_BODY, color: INK, background: '#fff',
      display: 'flex', flexDirection: 'column',
      border: `4px double ${INK}`, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14,
        paddingBottom: 12, marginBottom: 12 }}>
        <div style={{ width: 60, height: 60, borderRadius: 12,
          background: ACCENT, border: `2px solid ${INK}`, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT_HAND, fontSize: 30, fontWeight: 700,
          transform: 'rotate(-4deg)' }}>C</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT_HAND, fontSize: 26, fontWeight: 700, color: ACCENT, letterSpacing: 0.5, lineHeight: 1 }}>
            CRUNCHIES
          </div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 11, fontStyle: 'italic', color: INK_2 }}>
            Crafting sweet moments, one bite at a time.
          </div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: FONT_MONO, fontSize: 9, color: INK_2, letterSpacing: 0.3 }}>
          ARCHANA KOTHADIYA<br/>
          +91 73508 25521<br/>
          PUNE
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '8px 0',
        background: '#f1ece1', border: `1.2px solid ${INK}`,
        fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700, letterSpacing: 2 }}>
        INVOICE
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 14, marginBottom: 14 }}>
        <div style={{ flex: 1, border: `1.2px dashed ${INK_3}`,
          padding: '8px 10px', borderRadius: 4 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_3, letterSpacing: 0.5 }}>BILL TO</div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 16, fontWeight: 700, marginTop: 4 }}>Sunita Patil</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: INK_2 }}>+91 98765 43210</div>
        </div>
        <div style={{ width: 160, border: `1.2px dashed ${INK_3}`,
          padding: '8px 10px', borderRadius: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>
            <span>BILL #</span><span style={{ fontWeight: 700 }}>2026-0184</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontFamily: FONT_MONO, fontSize: 10, color: INK_2, marginTop: 4 }}>
            <span>DATE</span><span style={{ fontWeight: 700 }}>20 May 2026</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontFamily: FONT_MONO, fontSize: 10, color: INK_2, marginTop: 4 }}>
            <span>DUE</span><span style={{ fontWeight: 700 }}>24 May 2026</span>
          </div>
        </div>
      </div>

      <div style={{ border: `1.4px solid ${INK}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ display: 'flex', padding: '8px 10px', background: ACCENT, color: '#fff',
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>
          <div style={{ flex: 1 }}>Item</div>
          <div style={{ width: 50, textAlign: 'right' }}>Qty</div>
          <div style={{ width: 80, textAlign: 'right' }}>Rate</div>
          <div style={{ width: 80, textAlign: 'right' }}>Amount</div>
        </div>
        {[
          ['Chakli',          '250g', 2, '200.00', '400.00'],
          ['Chirote',         '125g', 1, '120.00', '120.00'],
          ['Mathari',         '250g', 1, '120.00', '120.00'],
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', padding: '10px',
            borderTop: `1px dashed ${INK_3}`, alignItems: 'baseline' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 15, fontWeight: 700 }}>{r[0]}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: INK_3 }}>{r[1]}</div>
            </div>
            <div style={{ width: 50, textAlign: 'right', fontFamily: FONT_MONO, fontSize: 13 }}>{r[2]}</div>
            <div style={{ width: 80, textAlign: 'right', fontFamily: FONT_MONO, fontSize: 13 }}>₹{r[3]}</div>
            <div style={{ width: 80, textAlign: 'right', fontFamily: FONT_HAND, fontSize: 15, fontWeight: 700 }}>₹{r[4]}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, marginLeft: 'auto', width: 240,
        padding: '10px 12px', background: '#fff7c2', border: `1.4px solid ${INK}`, borderRadius: 6 }}>
        <Row label="Subtotal" v="₹640.00" />
        <Row label="Already paid" v="—" />
        <div style={{ borderTop: `1.5px solid ${INK}`, marginTop: 6, paddingTop: 6,
          display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: FONT_HAND, fontSize: 16, fontWeight: 700 }}>TOTAL DUE</span>
          <span style={{ fontFamily: FONT_HAND, fontSize: 22, fontWeight: 700, color: ACCENT }}>₹640</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px dashed ${INK_3}`, marginTop: 14, paddingTop: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_3, letterSpacing: 0.5 }}>PAYMENT</div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 13, marginTop: 2 }}>
            UPI: <span style={{ fontFamily: FONT_MONO }}>crunchies@okhdfc</span>
          </div>
        </div>
        <div style={{ fontFamily: FONT_HAND, fontSize: 13, fontStyle: 'italic', color: INK_2 }}>
          Thank you! — Archana
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BillA, BillB });
