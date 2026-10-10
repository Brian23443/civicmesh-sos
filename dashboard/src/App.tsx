import { useMemo, useState } from "react";

import { IncidentSidebar } from "./components/IncidentSidebar";
import { OperationsMap } from "./components/OperationsMap";
import { TopBar } from "./components/TopBar";
import { mockIncidents } from "./mocks/incidents";
import type { PriorityColor } from "./types/incident";

function App() {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const counts = useMemo(() => {
    const result: Record<PriorityColor, number> = {
      red: 0,
      yellow: 0,
      green: 0,
      black: 0,
    };
    for (const incident of mockIncidents) {
      if (incident.state === "active") {
        result[incident.priority.color] += 1;
      }
    }
    return result;
  }, []);

  return (
    <div className="app-shell">
      <TopBar
        counts={counts}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((enabled) => !enabled)}
      />
      <main className="workspace">
        <OperationsMap incidents={mockIncidents} />
        <IncidentSidebar incidents={mockIncidents} />
      </main>
      <footer className="app-footer">
        <span>Mock stream · Contract K3</span>
        <code>10 frames loaded</code>
      </footer>
    </div>
  );
}

export default App;
