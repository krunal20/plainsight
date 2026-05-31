/**
 * AppHeader — top navigation bar with logo, AskBar, and filter pills.
 */
import { tokens } from '../theme/tokens';
import { AskBar } from './AskBar';
import { useStore } from '../state/store';

// ── Logo mark ────────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        textDecoration: 'none',
        cursor: 'default',
      }}
    >
      {/* Small neutral square with orange accent dot */}
      <div
        style={{
          width: 28,
          height: 28,
          background: tokens.ink,
          borderRadius: 4,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            width: 8,
            height: 8,
            borderRadius: 2,
            background: tokens.lead,
          }}
        />
      </div>
      <span
        style={{
          fontFamily: tokens.fontSans,
          fontWeight: 700,
          fontSize: 18,
          color: tokens.ink,
          letterSpacing: '-0.02em',
        }}
      >
        Plainsight
      </span>
    </div>
  );
}

// ── FY pills ─────────────────────────────────────────────────────────────────

function FyPills() {
  const filters = useStore(s => s.filters);
  const setFilters = useStore(s => s.setFilters);

  const activeFy = filters.fy;

  const options: { label: string; value: (2022 | 2023)[] | undefined }[] = [
    { label: 'FY22', value: [2022] },
    { label: 'FY23', value: [2023] },
    { label: 'Both', value: undefined },
  ];

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {options.map(opt => {
        const isActive =
          opt.value === undefined
            ? !activeFy || activeFy.length === 0
            : activeFy?.length === 1 && activeFy[0] === opt.value?.[0];

        return (
          <button
            key={opt.label}
            onClick={() => setFilters({ ...filters, fy: opt.value })}
            style={{
              padding: '4px 10px',
              borderRadius: 12,
              border: `1px solid ${isActive ? tokens.lead : tokens.line}`,
              background: isActive ? tokens.lead : 'transparent',
              color: isActive ? '#fff' : tokens.muted,
              fontFamily: tokens.fontSans,
              fontWeight: 500,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Gross/Net pill ────────────────────────────────────────────────────────────

function NetGrossPill() {
  const netGross = useStore(s => s.netGross);
  const setNetGross = useStore(s => s.setNetGross);

  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        background: tokens.line,
        borderRadius: 12,
        padding: 2,
        alignItems: 'center',
      }}
    >
      {(['net', 'gross'] as const).map(opt => (
        <button
          key={opt}
          onClick={() => setNetGross(opt)}
          style={{
            padding: '3px 10px',
            borderRadius: 10,
            border: 'none',
            background: netGross === opt ? tokens.card : 'transparent',
            color: netGross === opt ? tokens.ink : tokens.muted,
            fontFamily: tokens.fontSans,
            fontWeight: 500,
            fontSize: 12,
            cursor: 'pointer',
            boxShadow: netGross === opt ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ── AppHeader ─────────────────────────────────────────────────────────────────

export function AppHeader() {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 24px',
        background: tokens.card,
        borderBottom: `1px solid ${tokens.line}`,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <LogoMark />

      {/* AskBar takes the remaining space */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <AskBar />
      </div>

      {/* FY pills */}
      <FyPills />

      {/* Net/Gross toggle */}
      <NetGrossPill />
    </header>
  );
}
