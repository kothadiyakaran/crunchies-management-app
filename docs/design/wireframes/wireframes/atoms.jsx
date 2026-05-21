// atoms.jsx — sketchy wireframe building blocks
// Hand-drawn-ish vibe: paper bg, ink strokes, one orange accent.
// All components are deliberately low-fi: structure over polish.

const INK = '#2a241f';
const INK_2 = '#5a5048';
const INK_3 = '#8a8079';
const PAPER = '#fbf8f1';
const PAPER_2 = '#f1ece1';
const ACCENT = '#d96b1a';      // brochure orange — selected / primary only
const ACCENT_SOFT = '#fde2c8';
const HATCH = 'rgba(42,36,31,0.06)';

// Fonts: Patrick Hand for headings/hand vibe, Kalam for accents,
// system sans for body, JetBrains Mono for section labels.
const FONT_HAND = '"Patrick Hand", "Kalam", "Marker Felt", system-ui, sans-serif';
const FONT_MONO = '"JetBrains Mono", "Roboto Mono", ui-monospace, monospace';
const FONT_BODY = '"Inter", system-ui, -apple-system, sans-serif';

// Slight handmade jitter — alternating tiny rotations to break ruler-straight feel
const jitter = (i = 0) => ({ transform: `rotate(${((i * 31) % 7 - 3) * 0.08}deg)` });

// ── Phone screen container ────────────────────────────────────
function WScreen({ children, bg = PAPER, pad = 0 }) {
  return (
    <div style={{
      background: bg, minHeight: '100%', height: '100%',
      fontFamily: FONT_BODY, color: INK, padding: pad,
      display: 'flex', flexDirection: 'column',
    }}>{children}</div>
  );
}

// ── Page header (date / title row inside an Android screen) ───
function WHeader({ left, right, sub }) {
  return (
    <div style={{
      padding: '14px 18px 8px',
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      borderBottom: `1.2px dashed ${INK_3}`,
      fontFamily: FONT_HAND,
    }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.2 }}>{left}</div>
        {sub && <div style={{ fontSize: 12, color: INK_2, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 13, color: INK_2 }}>{right}</div>
    </div>
  );
}

// ── Section label (mono all-caps tiny) ────────────────────────
function WLabel({ children, count, action, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '14px 18px 6px', fontFamily: FONT_MONO,
      fontSize: 10.5, letterSpacing: 1.2, color: INK_2,
      textTransform: 'uppercase', ...style,
    }}>
      <span>{children}{count != null && <span style={{ marginLeft: 6, color: INK_3 }}>({count})</span>}</span>
      {action && <span style={{ color: ACCENT, textTransform: 'none', letterSpacing: 0 }}>{action}</span>}
    </div>
  );
}

// ── Hand-drawn-ish card / box ─────────────────────────────────
function WCard({ children, style, accent = false, dashed = false, pad = '12px 14px', onClick }) {
  return (
    <div onClick={onClick} style={{
      margin: '6px 14px',
      background: accent ? ACCENT_SOFT : '#fff',
      border: `${accent ? 1.8 : 1.4}px ${dashed ? 'dashed' : 'solid'} ${accent ? ACCENT : INK}`,
      borderRadius: 10,
      padding: pad,
      boxShadow: accent ? 'none' : '2px 2px 0 rgba(42,36,31,0.12)',
      ...style,
    }}>{children}</div>
  );
}

// ── Sketchy chip ──────────────────────────────────────────────
function WChip({ children, selected, dashed, mono, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '4px 10px', borderRadius: 999,
      border: `1.2px ${dashed ? 'dashed' : 'solid'} ${selected ? ACCENT : INK}`,
      background: selected ? ACCENT : '#fff',
      color: selected ? '#fff' : INK,
      fontFamily: mono ? FONT_MONO : FONT_HAND,
      fontSize: mono ? 10 : 13, letterSpacing: mono ? 0.5 : 0,
      whiteSpace: 'nowrap',
      ...style,
    }}>{children}</span>
  );
}

// ── Horizontal scrolling chip row ─────────────────────────────
function WChipRow({ chips, selectedIdx = 0, style }) {
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '8px 14px',
      overflowX: 'hidden', flexWrap: 'nowrap',
      ...style,
    }}>
      {chips.map((c, i) => (
        <WChip key={i} selected={i === selectedIdx}>{c}</WChip>
      ))}
    </div>
  );
}

// ── Primary CTA (full-width pill) ─────────────────────────────
function WBtn({ children, primary = true, style, dashed, small }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: small ? '8px 14px' : '14px 16px',
      margin: small ? 0 : '10px 14px',
      borderRadius: small ? 8 : 12,
      border: `${primary ? 2 : 1.4}px ${dashed ? 'dashed' : 'solid'} ${INK}`,
      background: primary ? ACCENT : '#fff',
      color: primary ? '#fff' : INK,
      fontFamily: FONT_HAND, fontSize: small ? 13 : 16, fontWeight: 700,
      letterSpacing: 0.2, whiteSpace: 'nowrap',
      boxShadow: primary ? '3px 3px 0 rgba(42,36,31,0.25)' : '2px 2px 0 rgba(42,36,31,0.12)',
      ...style,
    }}>{children}</div>
  );
}

// ── Two-line list row (most lists use this) ──────────────────
function WRow({ line1, line2, right1, right2, status, divider = true, badges, onClick, accent }) {
  return (
    <div onClick={onClick} style={{
      padding: '10px 18px',
      borderBottom: divider ? `1px dashed ${INK_3}` : 'none',
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: accent ? ACCENT_SOFT : 'transparent',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: FONT_HAND, fontSize: 15, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line1}</span>
          {right1 && <span style={{ fontSize: 12, color: INK_2, fontFamily: FONT_BODY, fontWeight: 500, flexShrink: 0 }}>{right1}</span>}
        </div>
        <div style={{
          fontSize: 12, color: INK_2, marginTop: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{line2}</span>
          {right2 && <span style={{ flexShrink: 0 }}>{right2}</span>}
        </div>
        {badges && <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{badges}</div>}
      </div>
      <span style={{ color: INK_3, fontSize: 18, lineHeight: '20px', marginTop: 4 }}>›</span>
    </div>
  );
}

// ── Status badge (Pending / Paid / Quiet etc) ─────────────────
function WBadge({ children, kind = 'neutral' }) {
  const palettes = {
    neutral: { bg: '#fff', border: INK_3, color: INK_2 },
    warn:    { bg: '#fff5e8', border: '#a36a1d', color: '#7a4b10' },
    ok:      { bg: '#eef6ee', border: '#3e7a48', color: '#2c5733' },
    accent:  { bg: ACCENT_SOFT, border: ACCENT, color: '#8a3f0d' },
    quiet:   { bg: '#f0eee9', border: INK_3, color: INK_2 },
  }[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '1.5px 7px',
      border: `1px solid ${palettes.border}`, background: palettes.bg, color: palettes.color,
      borderRadius: 4, fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: 0.5,
      textTransform: 'uppercase', fontWeight: 500,
    }}>{children}</span>
  );
}

// ── Bottom tab bar (5 tabs) ──────────────────────────────────
function WTabBar({ active = 0 }) {
  const tabs = ['Today', 'Orders', 'Customers', 'Production', 'Reports'];
  return (
    <div style={{
      borderTop: `1.5px solid ${INK}`, background: '#fff',
      display: 'flex', padding: '6px 4px 8px',
    }}>
      {tabs.map((t, i) => (
        <div key={t} style={{
          flex: 1, textAlign: 'center', padding: '6px 0',
          fontFamily: FONT_HAND, fontSize: 12, fontWeight: i === active ? 700 : 500,
          color: i === active ? ACCENT : INK_2,
          borderTop: i === active ? `2.5px solid ${ACCENT}` : '2.5px solid transparent',
          marginTop: -7, paddingTop: 11,
        }}>{t}</div>
      ))}
    </div>
  );
}

// ── Text input placeholder ────────────────────────────────────
function WInput({ label, value, placeholder, hint, suffix, prefix, small, style }) {
  return (
    <div style={{ margin: '8px 14px', ...style }}>
      {label && <div style={{
        fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: 1, color: INK_2,
        textTransform: 'uppercase', marginBottom: 4,
      }}>{label}</div>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: small ? '6px 10px' : '10px 12px',
        border: `1.4px solid ${INK}`, borderRadius: 8, background: '#fff',
        fontFamily: FONT_HAND, fontSize: small ? 13 : 15,
        color: value ? INK : INK_3,
      }}>
        {prefix && <span style={{ color: INK_2 }}>{prefix}</span>}
        <span style={{ flex: 1 }}>{value || placeholder || '\u00A0'}</span>
        {suffix && <span style={{ color: INK_3, fontSize: 12 }}>{suffix}</span>}
      </div>
      {hint && <div style={{ fontSize: 11, color: INK_3, marginTop: 4, fontFamily: FONT_BODY }}>{hint}</div>}
    </div>
  );
}

// ── A "scribble" placeholder block (for images/charts/etc) ────
function WScribble({ h = 60, label, dashed = true, style }) {
  return (
    <div style={{
      height: h,
      border: `1.2px ${dashed ? 'dashed' : 'solid'} ${INK_3}`,
      borderRadius: 6, background: `repeating-linear-gradient(135deg, transparent 0 8px, ${HATCH} 8px 9px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT_MONO, fontSize: 10, color: INK_3, letterSpacing: 0.5,
      textTransform: 'uppercase',
      ...style,
    }}>{label}</div>
  );
}

// ── Sketchy "three-bar" plan/made/demand mini chart ───────────
function WCalibrationBars({ plan, made, demand, max, label, variance }) {
  const m = max ?? Math.max(plan, made, demand, 1);
  const w = v => `${Math.round((v / m) * 100)}%`;
  const Bar = ({ v, fill, dashed, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <div style={{
        width: 50, fontFamily: FONT_MONO, fontSize: 9, color: INK_2, textTransform: 'uppercase', letterSpacing: 0.4,
      }}>{label}</div>
      <div style={{ flex: 1, height: 12, border: `1px solid ${INK}`, borderRadius: 2, position: 'relative' }}>
        <div style={{
          width: w(v), height: '100%',
          background: dashed ? 'transparent' : fill,
          backgroundImage: dashed ? `repeating-linear-gradient(90deg, ${INK} 0 3px, transparent 3px 6px)` : 'none',
          borderRight: `1px solid ${INK}`,
        }} />
      </div>
      <div style={{ width: 22, fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700, textAlign: 'right' }}>{v}</div>
    </div>
  );
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 4,
      }}>
        <div style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 700 }}>{label}</div>
        {variance && <span style={{
          fontFamily: FONT_MONO, fontSize: 10, color: variance.startsWith('-') ? '#8a3f0d' : INK_2,
          padding: '1px 6px', border: `1px solid ${INK_3}`, borderRadius: 4,
        }}>{variance}</span>}
      </div>
      <Bar v={plan}   fill="transparent"      dashed label="Plan"/>
      <Bar v={made}   fill="#cfd6d2"           label="Made"/>
      <Bar v={demand} fill={ACCENT_SOFT}       label="Demand"/>
    </div>
  );
}

// ── Sketchy phone shell — hand-drawn outline, no chrome polish ──
function WPhone({ children, w = 300, h = 600, label }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        width: w, height: h, background: PAPER, color: INK,
        border: `2.2px solid ${INK}`, borderRadius: 26,
        boxShadow: '4px 4px 0 rgba(42,36,31,0.18)',
        overflow: 'hidden', position: 'relative',
        display: 'flex', flexDirection: 'column',
        fontFamily: FONT_BODY,
      }}>
        {/* Status row */}
        <div style={{
          height: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 14px', fontFamily: FONT_MONO, fontSize: 9, color: INK_2, letterSpacing: 0.5,
          flexShrink: 0,
        }}>
          <span>9:30</span>
          <span style={{ position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)',
            width: 10, height: 10, borderRadius: '50%', background: INK }} />
          <span>○ ▥ █</span>
        </div>
        {/* Inner screen */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
        {/* Gesture bar */}
        <div style={{ height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 90, height: 3, background: INK, opacity: 0.7, borderRadius: 2 }} />
        </div>
      </div>
      {label && <div style={{
        marginTop: 10, fontFamily: FONT_HAND, fontSize: 13, color: INK_2, textAlign: 'center',
      }}>{label}</div>}
    </div>
  );
}

// ── Browser frame (mobile width, for the public order form) ───
function WBrowser({ children, w = 320, h = 600, url = 'crunchies.in/order/...' }) {
  return (
    <div style={{
      width: w, height: h, background: PAPER, color: INK,
      border: `2px solid ${INK}`, borderRadius: 10,
      boxShadow: '4px 4px 0 rgba(42,36,31,0.18)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      fontFamily: FONT_BODY,
    }}>
      <div style={{
        background: '#ece6d8', padding: '6px 10px',
        borderBottom: `1.5px solid ${INK}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: INK_3 }} />
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: INK_3 }} />
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: INK_3 }} />
        </span>
        <div style={{
          flex: 1, background: '#fff', border: `1px solid ${INK_3}`, borderRadius: 12,
          padding: '2px 8px', fontFamily: FONT_MONO, fontSize: 9, color: INK_2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>🔒 {url}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

// ── Paper page (for bill PDF) ────────────────────────────────
function WPaper({ children, w = 480, h = 680 }) {
  return (
    <div style={{
      width: w, height: h, background: '#fff', color: INK,
      border: `1.4px solid ${INK_3}`,
      boxShadow: '6px 6px 0 rgba(42,36,31,0.12), 12px 12px 0 rgba(42,36,31,0.06)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      fontFamily: FONT_BODY,
    }}>{children}</div>
  );
}

// ── Annotated callout ("post-it"-ish note pinned to artboard) ─
function WNote({ children, style }) {
  return (
    <div style={{
      background: '#fff7c2',
      border: `1px solid ${INK}`,
      padding: '8px 10px', fontFamily: FONT_HAND, fontSize: 12,
      color: INK, transform: 'rotate(-1deg)',
      boxShadow: '2px 2px 0 rgba(42,36,31,0.18)',
      maxWidth: 220,
      ...style,
    }}>{children}</div>
  );
}

Object.assign(window, {
  INK, INK_2, INK_3, PAPER, PAPER_2, ACCENT, ACCENT_SOFT, HATCH,
  FONT_HAND, FONT_MONO, FONT_BODY, jitter,
  WScreen, WHeader, WLabel, WCard, WChip, WChipRow, WBtn, WRow, WBadge,
  WTabBar, WInput, WScribble, WCalibrationBars, WNote,
  WPhone, WBrowser, WPaper,
});
