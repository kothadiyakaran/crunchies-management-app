// public_form.jsx — 3 variations of the public exhibition order form
// Different audience (one-time customer), different tone — brand-forward
// but still wireframe lo-fi.

const BRAND_HEADER = (
  <div style={{
    background: ACCENT, color: '#fff', padding: '12px 14px',
    display: 'flex', alignItems: 'center', gap: 10,
    borderBottom: `1.4px solid ${INK}`,
  }}>
    <div style={{ width: 36, height: 36, borderRadius: 8,
      background: '#fff', border: `1.4px solid ${INK}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700, color: ACCENT,
      transform: 'rotate(-3deg)' }}>C</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontFamily: FONT_HAND, fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>
        CRUNCHIES
      </div>
      <div style={{ fontFamily: FONT_HAND, fontSize: 10.5, opacity: 0.9, fontStyle: 'italic' }}>
        Crafting sweet moments, one bite at a time
      </div>
    </div>
  </div>
);

const PRODUCTS = [
  { n: 'Chirote',      sub: 'in desi ghee',           sm: ['125g', 120], lg: ['250g', 200] },
  { n: 'Chakli',       sub: 'all purpose winner',     sm: null,           lg: ['250g', 200] },
  { n: 'Wheat Nimki',  sub: 'no onion, no garlic',    sm: null,           lg: ['200g', 120] },
  { n: 'Jowar Papdi',  sub: 'gluten free',            sm: null,           lg: ['200g', 120] },
  { n: 'Mathari',      sub: "chai's best buddy",      sm: null,           lg: ['250g', 120] },
  { n: 'Ragi Cookies', sub: 'with chocolate twist',   sm: ['125g', 120], lg: ['250g', 200] },
  { n: 'Oats & Nuts',  sub: 'nutty oat cookies',      sm: ['125g', 125], lg: ['250g', 250] },
];

// ── A · Long single-scroll form ──────────────────────────
function PublicFormA() {
  return (
    <WScreen bg="#fbf8f1">
      {BRAND_HEADER}

      <div style={{ padding: '14px 16px 6px' }}>
        <div style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>
          Place your order
        </div>
        <div style={{ fontSize: 11.5, color: INK_2, marginTop: 3, fontFamily: FONT_HAND }}>
          Pickup at <strong>Diwali Fair Aundh</strong> · Sat 18 Oct
        </div>
      </div>

      <WInput label="Your name" placeholder="—" small />
      <WInput label="Phone (WhatsApp)" placeholder="98XXX XXXXX" prefix="+91" small />

      <WLabel>Choose products</WLabel>
      <div style={{ margin: '0 14px',
        border: `1.2px solid ${INK}`, borderRadius: 8, background: '#fff' }}>
        {PRODUCTS.map((p, i) => (
          <div key={i} style={{ padding: '10px 12px',
            borderBottom: i < PRODUCTS.length - 1 ? `1px dashed ${INK_3}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{p.n}</div>
                <div style={{ fontSize: 10.5, color: INK_3, fontStyle: 'italic' }}>{p.sub}</div>
              </div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.sm && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 6px', border: `1px solid ${INK_3}`, borderRadius: 6, background: '#fff' }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>{p.sm[0]} · ₹{p.sm[1]}</span>
                  <span style={{ width: 16, textAlign: 'center', fontFamily: FONT_HAND }}>−</span>
                  <span style={{ width: 16, textAlign: 'center', fontFamily: FONT_HAND, fontWeight: 700 }}>{i === 0 ? 1 : 0}</span>
                  <span style={{ width: 16, textAlign: 'center', fontFamily: FONT_HAND }}>+</span>
                </div>
              )}
              {p.lg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 6px', border: `1px solid ${INK_3}`, borderRadius: 6, background: '#fff' }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2 }}>{p.lg[0]} · ₹{p.lg[1]}</span>
                  <span style={{ width: 16, textAlign: 'center', fontFamily: FONT_HAND }}>−</span>
                  <span style={{ width: 16, textAlign: 'center', fontFamily: FONT_HAND, fontWeight: 700 }}>{i === 0 || i === 1 ? 1 : 0}</span>
                  <span style={{ width: 16, textAlign: 'center', fontFamily: FONT_HAND }}>+</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <WInput label="Notes (optional)" placeholder="Any preferences…" small />

      <div style={{ flex: 1 }} />
      <div style={{ margin: '10px 14px',
        padding: '8px 12px', background: '#fff7c2',
        border: `1.2px solid ${INK}`, borderRadius: 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: FONT_HAND, fontSize: 13, color: INK_2 }}>Total</span>
        <span style={{ fontFamily: FONT_HAND, fontSize: 20, fontWeight: 700 }}>₹520</span>
      </div>
      <WBtn>Place order →</WBtn>
    </WScreen>
  );
}

// ── B · Stepper / wizard ────────────────────────────────
function PublicFormB() {
  return (
    <WScreen bg="#fbf8f1">
      {BRAND_HEADER}

      {/* Step indicator */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
        {['Pick', 'Contact', 'Confirm'].map((s, i) => (
          <React.Fragment key={i}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: i <= 1 ? ACCENT : '#fff',
              border: `1.4px solid ${INK}`, color: i <= 1 ? '#fff' : INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FONT_HAND, fontSize: 12, fontWeight: 700,
            }}>{i + 1}</div>
            <div style={{ flex: 1, fontFamily: FONT_HAND, fontSize: 12,
              color: i === 1 ? INK : INK_2, fontWeight: i === 1 ? 700 : 500 }}>{s}</div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ height: 3, background: '#f1ece1', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '66%', background: ACCENT }} />
      </div>

      <div style={{ padding: '14px 16px 4px' }}>
        <div style={{ fontFamily: FONT_HAND, fontSize: 18, fontWeight: 700 }}>Step 2 of 3 — Your contact</div>
        <div style={{ fontSize: 11.5, color: INK_2, marginTop: 3, fontFamily: FONT_HAND }}>
          We'll WhatsApp you for confirmation & pickup.
        </div>
      </div>

      <WInput label="Your name *" value="Rohit Marathe" />
      <WInput label="Phone (WhatsApp) *" value="98123 45678" prefix="+91" />
      <WInput label="Pickup preference" value="Sat morning — 10–12" suffix="▾" small />
      <WInput label="Notes (optional)" placeholder="—" small />

      <WLabel>Your order</WLabel>
      <div style={{ margin: '0 14px', padding: '10px 12px',
        background: '#fff', border: `1.2px solid ${INK}`, borderRadius: 8 }}>
        {[
          ['Chirote (125g)', 1, 120],
          ['Chakli (250g)',  1, 200],
          ['Ragi (250g)',    1, 200],
        ].map(([n, q, p], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
            padding: '4px 0', borderBottom: i < 2 ? `1px dashed ${INK_3}` : 'none',
            fontFamily: FONT_HAND, fontSize: 13 }}>
            <span>{n} <span style={{ color: INK_3 }}>× {q}</span></span>
            <span style={{ fontWeight: 700 }}>₹{p}</span>
          </div>
        ))}
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1.4px solid ${INK}`,
          display: 'flex', justifyContent: 'space-between',
          fontFamily: FONT_HAND, fontSize: 15, fontWeight: 700 }}>
          <span>Total</span><span>₹520</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ margin: '10px 14px', display: 'flex', gap: 8 }}>
        <WBtn primary={false} style={{ margin: 0, flex: 1 }}>← Back</WBtn>
        <WBtn style={{ margin: 0, flex: 2 }}>Next →</WBtn>
      </div>
    </WScreen>
  );
}

// ── C · Menu-card grid with sticky cart ────────────────
function PublicFormC() {
  return (
    <WScreen bg="#fbf8f1">
      {BRAND_HEADER}
      <div style={{ padding: '12px 14px 6px' }}>
        <div style={{ fontFamily: FONT_HAND, fontSize: 17, fontWeight: 700 }}>
          Order for <span style={{ color: ACCENT }}>Diwali Fair Aundh</span>
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK_2, marginTop: 3 }}>
          SAT 18 OCT  ·  PICKUP ON-SITE
        </div>
      </div>

      <div style={{
        margin: '6px 14px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
      }}>
        {PRODUCTS.slice(0, 6).map((p, i) => (
          <div key={i} style={{
            border: `1.4px solid ${INK}`, borderRadius: 10,
            background: '#fff',
            boxShadow: '2px 2px 0 rgba(42,36,31,0.12)',
            overflow: 'hidden',
          }}>
            <WScribble h={56} label="photo" dashed={false} style={{ borderRadius: 0, border: 'none', borderBottom: `1.2px solid ${INK}` }} />
            <div style={{ padding: '6px 8px 8px' }}>
              <div style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700, lineHeight: 1.1 }}>{p.n}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: INK_3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.lg && `₹${p.lg[1]} / ${p.lg[0]}`}
              </div>
              <div style={{ marginTop: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '2px 4px', border: `1.2px solid ${INK}`, borderRadius: 6 }}>
                <span style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 14 }}>−</span>
                <span style={{ fontFamily: FONT_HAND, fontSize: 13, fontWeight: 700 }}>{i < 3 ? 1 : 0}</span>
                <span style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 14 }}>+</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Sticky cart bar */}
      <div style={{
        background: '#fff', borderTop: `1.6px solid ${INK}`,
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 -4px 12px rgba(42,36,31,0.12)',
      }}>
        <div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 12, color: INK_2 }}>3 items</div>
          <div style={{ fontFamily: FONT_HAND, fontSize: 20, fontWeight: 700 }}>₹520</div>
        </div>
        <div style={{ flex: 1 }}>
          <WBtn small style={{ margin: 0, padding: '12px 14px' }}>Continue →</WBtn>
        </div>
      </div>
    </WScreen>
  );
}

Object.assign(window, { PublicFormA, PublicFormB, PublicFormC });
