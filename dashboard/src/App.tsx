import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BottomDock } from "./components/BottomDock";
import { DetailDrawer } from "./components/DetailDrawer";
import { IncidentSidebar } from "./components/IncidentSidebar";
import { OperationsMap, type BasemapTheme } from "./components/OperationsMap";
import { ToastRegion, type DashboardToast } from "./components/ToastRegion";
import { TopBar, type PriorityFilter } from "./components/TopBar";
import { useBridgeSocket } from "./hooks/useBridgeSocket";
import { mockIncidents } from "./mocks/incidents";
import {
  fetchHealth,
  fetchIncidents,
  removeIncident,
  restoreIncident,
  type BridgeHealth,
} from "./services/api";
import { playAlertChime, primeAlertAudio } from "./services/audio";
import type { Incident, PriorityColor } from "./types/incident";

type IncidentEventType =
  | "incident.new"
  | "incident.updated"
  | "incident.removed"
  | "incident.restored";

function upsertIncident(current: Incident[], incoming: Incident): Incident[] {
  const index = current.findIndex((incident) => incident.id === incoming.id);
  if (index < 0) return [incoming, ...current];
  return current.map((incident) =>
    incident.id === incoming.id ? incoming : incident,
  );
}

const THEME_KEY = "civicmesh-dashboard-theme";

/** The operator's last choice, else the system's light/dark setting. */
function initialTheme(): BasemapTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage unavailable: fall through to the system setting.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function App() {
  const [incidents, setIncidents] = useState<Incident[]>(mockIncidents);
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pulseIncidentId, setPulseIncidentId] = useState<string | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [theme, setTheme] = useState<BasemapTheme>(initialTheme);
  const [filter, setFilter] = useState<PriorityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [toast, setToast] = useState<DashboardToast | null>(null);
  const toastId = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const showToast = useCallback(
    (
      kind: DashboardToast["kind"],
      message: string,
      incidentId?: string,
    ) => {
      toastId.current += 1;
      setToast({ id: toastId.current, kind, message, incidentId });
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    void fetchIncidents("all")
      .then((rows) => {
        if (!disposed) setIncidents(rows);
      })
      .catch(() => {
        // The checked-in mock set remains available when the bridge is offline.
      });
    void fetchHealth()
      .then((nextHealth) => {
        if (!disposed) setHealth(nextHealth);
      })
      .catch(() => {
        // WebSocket health events will fill this when the bridge reconnects.
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const duration = toast.kind === "undo" ? 10_000 : 5_000;
    const timer = window.setTimeout(() => setToast(null), duration);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!pulseIncidentId) return;
    const timer = window.setTimeout(() => setPulseIncidentId(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [pulseIncidentId]);

  const handleIncidentEvent = useCallback(
    (type: IncidentEventType, incident: Incident) => {
      setIncidents((current) => upsertIncident(current, incident));

      if (type === "incident.new") {
        setPulseIncidentId(incident.id);
        if (incident.priority.color === "red") {
          const people = incident.adults + incident.children;
          showToast(
            "alert",
            `New RED · ${incident.hazard.name.replaceAll("_", " ")} · ${people} ${people === 1 ? "person" : "people"}`,
          );
          if (soundEnabled) void playAlertChime().catch(() => undefined);
        }
      }
    },
    [showToast, soundEnabled],
  );

  const { connectionState, retryCount } = useBridgeSocket({
    onIncident: handleIncidentEvent,
    onHealth: setHealth,
  });

  const counts = useMemo(() => {
    const result: Record<PriorityColor, number> = {
      red: 0,
      yellow: 0,
      green: 0,
      black: 0,
    };
    for (const incident of incidents) {
      if (incident.state === "active") {
        result[incident.priority.color] += 1;
      }
    }
    return result;
  }, [incidents]);

  const selectedIncident =
    incidents.find((incident) => incident.id === selectedId) ?? null;

  const handleSelect = useCallback((incident: Incident) => {
    setSelectedId(incident.id);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleRemove = useCallback(
    async (incident: Incident) => {
      setPendingRemovalId(incident.id);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      try {
        const removed = await removeIncident(incident.id);
        setIncidents((current) => upsertIncident(current, removed));
        setSelectedId(null);
        showToast("undo", "Incident removed from the map", incident.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Bridge request failed";
        showToast("error", `Could not remove incident · ${message}`);
      } finally {
        setPendingRemovalId(null);
      }
    },
    [showToast],
  );

  const handleUndo = useCallback(
    (incidentId: string) => {
      void restoreIncident(incidentId)
        .then((restored) => {
          setIncidents((current) => upsertIncident(current, restored));
          setPulseIncidentId(restored.id);
          setToast(null);
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Bridge request failed";
          showToast("error", `Could not restore incident · ${message}`);
        });
    },
    [showToast],
  );

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((enabled) => {
      if (!enabled) void primeAlertAudio().catch(() => undefined);
      return !enabled;
    });
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Storage unavailable (private window): the choice lasts for this session only.
      }
      return next;
    });
  }, []);

  return (
    <div className="app-shell" data-theme={theme}>
      {/* Permanent Edge-to-Edge Full-Screen Map */}
      <main className="map-fullscreen-container">
        <OperationsMap
          filterPriority={filter}
          incidents={incidents}
          onSelect={handleSelect}
          pendingRemovalId={pendingRemovalId}
          pulseIncidentId={pulseIncidentId}
          selectedId={selectedId}
          theme={theme}
        />
      </main>

      {/* Floating Modern UI Overlays (Google / Apple Maps Aesthetic) */}
      <div className="floating-ui-layer">
        <TopBar
          isSidebarOpen={isSidebarOpen}
          onSearchChange={setSearchQuery}
          onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
          onToggleSound={handleToggleSound}
          onToggleTheme={handleToggleTheme}
          searchQuery={searchQuery}
          soundEnabled={soundEnabled}
          theme={theme}
        />

        {isSidebarOpen && (
          <IncidentSidebar
            filter={filter}
            incidents={incidents}
            onSelect={handleSelect}
            pendingRemovalId={pendingRemovalId}
            searchQuery={searchQuery}
            selectedId={selectedId}
          />
        )}

        <BottomDock
          connectionState={connectionState}
          counts={counts}
          filter={filter}
          health={health}
          incidents={incidents}
          onSelectFilter={setFilter}
          retryCount={retryCount}
        />
      </div>

      <DetailDrawer
        incident={selectedIncident}
        onClose={handleCloseDrawer}
        onRemove={handleRemove}
      />
      <ToastRegion
        onDismiss={() => setToast(null)}
        onUndo={handleUndo}
        toast={toast}
      />
    </div>
  );
}

export default App;
