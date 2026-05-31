/**
 * Breadcrumb — shows the current drill path (Agency > Category > SubCategory)
 * and allows clicking a crumb to drillUp to that index.
 */
import { useStore } from '../state/store';
import { tokens } from '../theme/tokens';

export function Breadcrumb() {
  const drillPath = useStore(s => s.drillPath);
  const drillUp   = useStore(s => s.drillUp);

  if (drillPath.length === 0) return null;

  return (
    <nav
      aria-label="Drill path"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 24px',
        background: `${tokens.lead}0d`,
        borderBottom: `1px solid ${tokens.line}`,
        fontFamily: tokens.fontSans,
        fontSize: 12,
      }}
    >
      {/* Root crumb */}
      <button
        onClick={() => drillUp(0)}
        style={crumbStyle(false)}
        aria-label="All"
      >
        All
      </button>

      {drillPath.map((step, idx) => {
        const isLast = idx === drillPath.length - 1;
        return (
          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: tokens.muted }}>/</span>
            <button
              onClick={() => !isLast && drillUp(idx + 1)}
              style={crumbStyle(isLast)}
              aria-current={isLast ? 'page' : undefined}
              aria-label={`${step.dimension}: ${step.value}`}
            >
              {step.value}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

function crumbStyle(isActive: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    padding: '2px 4px',
    borderRadius: 4,
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: isActive ? 600 : 400,
    color: isActive ? tokens.lead : tokens.ink,
    cursor: isActive ? 'default' : 'pointer',
    textDecoration: isActive ? 'none' : 'underline',
  };
}
