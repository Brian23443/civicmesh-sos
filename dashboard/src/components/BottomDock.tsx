import {
  Clock3,
  MapPinned,
  Radio,
  RadioTower,
  RotateCw,
  Users,
  Wifi,
} from "lucide-react";

import type { BridgeConnectionState } from "../hooks/useBridgeSocket";
import type { BridgeHealth } from "../services/api";
import type { Incident, PriorityColor } from "../types/incident";
import type { PriorityFilter } from "./TopBar";

export interface BottomDockProps {
  incidents: Incident[];
  counts: Record<PriorityColor, number>;
  filter: PriorityFilter;
  onSelectFilter: (filter: PriorityFilter) => void;
  health: BridgeHealth | null;
  connectionState: BridgeConnectionState;
  retryCount: number;
}

function frameAge(timestamp: number | null | undefined): string {
  if (timestamp == null) return "No frames";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function BottomDock({
  incidents,
  counts,
  filter,
  onSelectFilter,
  health,
  connectionState,
  retryCount,
}: BottomDockProps) {
  const connected = connectionState === "connected";
  const websocketLabel = connected
    ? "WS connected"
    : connectionState === "reconnecting"
      ? `Reconnecting…${retryCount > 0 ? ` (${retryCount})` : ""}`
      : "WS connecting";

  const locatedCount = incidents.filter(
    (item) => item.lat !== null && item.lon !== null && item.state === "active",
  ).length;

  const activeIncidents = incidents.filter((i) => i.state === "active");
  const peopleCount = activeIncidents.reduce(
    (sum, i) => sum + i.adults + i.children,
    0,
  );
  const averageRssi = activeIncidents.filter((i) => i.rssi !== null);
  const signalLabel = averageRssi.length
    ? `${Math.round(
        averageRssi.reduce((sum, i) => sum + (i.rssi ?? 0), 0) /
          averageRssi.length,
      )} dBm`
    : "No telemetry";

  return (
    <footer
      aria-label="Operational status and telemetry"
      className="floating-summary-dock"
    >
      {/* 3 Telemetry Pills moved to the bottom left */}
      <div aria-label="Connection telemetry" className="system-status-pills">
        <span className="status-pill">
          {connected ? (
            <Wifi aria-hidden="true" size={14} />
          ) : (
            <RotateCw aria-hidden="true" className="spin-icon" size={14} />
          )}
          <i
            className={
              connected
                ? "status-dot status-dot--online"
                : "status-dot status-dot--reconnecting"
            }
          />
          {websocketLabel}
        </span>

        <span className="status-pill status-pill--serial">
          <Radio aria-hidden="true" size={14} />
          <i
            className={
              health?.serial_connected
                ? "status-dot status-dot--online"
                : "status-dot status-dot--standby"
            }
          />
          {health?.serial_connected
            ? `Serial ${health.port ? health.port.replace(/^\/dev\/(cu\.)?/, "") : "connected"}`
            : "Serial standby"}
        </span>

        <span className="status-pill status-pill--muted">
          <Clock3 aria-hidden="true" size={14} />
          {frameAge(health?.last_frame_at)}
        </span>
      </div>

      <div aria-hidden="true" className="dock-divider" />

      {/* Clickable Operational Summary Metrics */}
      <div
        aria-label="Filter incidents by priority"
        className="dock-metrics"
        role="toolbar"
      >
        <button
          aria-label="Show all located incidents"
          aria-pressed={filter === "all"}
          className={`metric-chip metric-chip--button ${filter === "all" ? "is-active" : ""}`}
          onClick={() => onSelectFilter("all")}
          title="Click to show all incidents"
          type="button"
        >
          <MapPinned aria-hidden="true" size={13} />
          <span>
            <strong>{locatedCount}</strong> located
          </span>
        </button>

        <button
          aria-label="Filter by Immediate (Red) priority"
          aria-pressed={filter === "red"}
          className={`metric-chip metric-chip--button metric-chip--critical ${filter === "red" ? "is-active" : ""}`}
          onClick={() => onSelectFilter(filter === "red" ? "all" : "red")}
          title={
            filter === "red"
              ? "Click to clear red filter"
              : "Click to filter immediate (Red)"
          }
          type="button"
        >
          <span aria-hidden="true" className="dot-immediate" />
          <span>
            <strong>{counts.red}</strong> immediate
          </span>
        </button>

        {(counts.yellow > 0 || filter === "yellow") && (
          <button
            aria-label="Filter by Delayed (Yellow) priority"
            aria-pressed={filter === "yellow"}
            className={`metric-chip metric-chip--button metric-chip--yellow ${filter === "yellow" ? "is-active" : ""}`}
            onClick={() =>
              onSelectFilter(filter === "yellow" ? "all" : "yellow")
            }
            title={
              filter === "yellow"
                ? "Click to clear yellow filter"
                : "Click to filter delayed (Yellow)"
            }
            type="button"
          >
            <span aria-hidden="true" className="dot-delayed" />
            <span>
              <strong>{counts.yellow}</strong> delayed
            </span>
          </button>
        )}

        {(counts.green > 0 || filter === "green") && (
          <button
            aria-label="Filter by Minor (Green) priority"
            aria-pressed={filter === "green"}
            className={`metric-chip metric-chip--button metric-chip--green ${filter === "green" ? "is-active" : ""}`}
            onClick={() =>
              onSelectFilter(filter === "green" ? "all" : "green")
            }
            title={
              filter === "green"
                ? "Click to clear green filter"
                : "Click to filter minor (Green)"
            }
            type="button"
          >
            <span aria-hidden="true" className="dot-minor" />
            <span>
              <strong>{counts.green}</strong> minor
            </span>
          </button>
        )}

        {(counts.black > 0 || filter === "black") && (
          <button
            aria-label="Filter by Expectant (Black) priority"
            aria-pressed={filter === "black"}
            className={`metric-chip metric-chip--button metric-chip--black ${filter === "black" ? "is-active" : ""}`}
            onClick={() =>
              onSelectFilter(filter === "black" ? "all" : "black")
            }
            title={
              filter === "black"
                ? "Click to clear expectant filter"
                : "Click to filter expectant (Black)"
            }
            type="button"
          >
            <span aria-hidden="true" className="dot-expectant" />
            <span>
              <strong>{counts.black}</strong> expectant
            </span>
          </button>
        )}

        <div
          className="metric-chip"
          title="Total survivors reported across active incidents"
        >
          <Users aria-hidden="true" size={13} />
          <span>
            <strong>{peopleCount}</strong> people
          </span>
        </div>

        <div
          className="metric-chip"
          title="Average LoRa signal strength across active nodes"
        >
          <RadioTower aria-hidden="true" size={13} />
          <span>
            <strong>{signalLabel}</strong>
          </span>
        </div>
      </div>
    </footer>
  );
}
