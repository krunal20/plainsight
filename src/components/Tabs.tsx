/**
 * Tabs — navigation for Overview / Vendors / Compare / What Changed / Ask.
 * Overview renders the children prop; other tabs render their respective views.
 */
import { tokens } from '../theme/tokens';
import { useStore } from '../state/store';
import type { AppState } from '../state/storeTypes';
import { lazy, Suspense } from 'react';

// Lazy-load the advanced tab views to keep the initial bundle small
const CompareView  = lazy(() => import('./CompareViewWrapper'));
const MoversView   = lazy(() => import('./MoversViewWrapper'));
const VendorTabView = lazy(() => import('./VendorTabView'));
const ReportView   = lazy(() => import('./ReportViewWrapper'));

const TAB_DEFS: { id: AppState['activeTab']; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'vendors',  label: 'Vendors' },
  { id: 'compare',  label: 'Compare' },
  { id: 'changed',  label: 'What Changed' },
  { id: 'ask',      label: 'Ask' },
];

interface TabsProps {
  children?: React.ReactNode; // rendered when activeTab === 'overview'
}

export function Tabs({ children }: TabsProps) {
  const activeTab = useStore(s => s.activeTab);

  function goTo(tab: AppState['activeTab']) {
    useStore.setState(s => {
      // Write to hash inside the store's replaceState logic
      const next = { ...s, activeTab: tab };
      // Encode and write hash (mirrors the store logic)
      if (typeof window !== 'undefined') {
        try {
          const compact = {
            f: next.filters,
            m: next.measure,
            ng: next.netGross,
            n: next.topN,
            dp: next.drillPath.length ? next.drillPath : undefined,
            cmp: next.compare,
            tab: tab !== 'overview' ? tab : undefined,
          };
          const encoded = btoa(encodeURIComponent(JSON.stringify(compact)));
          const newHash = `#${encoded}`;
          if (window.location.hash !== newHash) {
            window.history.replaceState(null, '', newHash);
          }
        } catch {
          // best-effort
        }
      }
      return next;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Tab bar */}
      <nav
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: `1px solid ${tokens.line}`,
          background: tokens.card,
          paddingLeft: 24,
        }}
        role="tablist"
      >
        {TAB_DEFS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              onClick={() => goTo(tab.id)}
              style={{
                padding: '10px 16px',
                border: 'none',
                borderBottom: active ? `2px solid ${tokens.lead}` : '2px solid transparent',
                background: 'transparent',
                fontFamily: tokens.fontSans,
                fontWeight: active ? 600 : 400,
                fontSize: 13,
                color: active ? tokens.lead : tokens.muted,
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div
        role="tabpanel"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        {activeTab === 'overview' && children}
        {activeTab === 'compare'  && (
          <Suspense fallback={<TabLoading />}>
            <CompareView />
          </Suspense>
        )}
        {activeTab === 'changed'  && (
          <Suspense fallback={<TabLoading />}>
            <MoversView />
          </Suspense>
        )}
        {activeTab === 'vendors'  && (
          <Suspense fallback={<TabLoading />}>
            <VendorTabView />
          </Suspense>
        )}
        {activeTab === 'ask'      && (
          <Suspense fallback={<TabLoading />}>
            <ReportView />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function TabLoading() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
        fontFamily: tokens.fontSans,
        fontSize: 13,
        color: tokens.muted,
      }}
    >
      Loading…
    </div>
  );
}
