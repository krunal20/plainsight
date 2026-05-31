import { AppHeader } from './components/AppHeader';
import { SlicerRail } from './components/SlicerRail';
import { KpiStripWrapper } from './components/KpiStripWrapper';
import { Tabs } from './components/Tabs';
import { Dashboard } from './pages/Dashboard';
import { tokens } from './theme/tokens';

function App() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: tokens.paper,
        fontFamily: tokens.fontSans,
      }}
    >
      <AppHeader />

      {/* KPI strip below header */}
      <KpiStripWrapper />

      {/* Body: slicer rail + tab content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <SlicerRail />

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Tabs>
            <Dashboard />
          </Tabs>
        </main>
      </div>
    </div>
  );
}

export default App;
