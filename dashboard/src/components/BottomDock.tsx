import {
  Clock3,
  MapPinned,
  Radio,
  RotateCw,
  Users,
  Wifi,
} from "lucide-react";

import type { BridgeConnectionState } from "../hooks/useBridgeSocket";
import type { BridgeHealth } from "../services/api";
import type { Incident, PriorityColor } from "../types/incident";
import { agoText } from "../utils/responder";
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
  return timestamp == null ? "No frames" : agoText(timestamp);
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
  const lastReport = health?.last_frame_at == null ? "no reports yet" : `last report ${frameAge(health.last_frame_at)}`;
  const link: { tone: "ok" | "warn" | "down"; label: string } = !connected
    ? { tone: "down", label: websocketLabel.replace("WS connecting", "Connecting to bridge…").replace("Reconnecting…", "Reconnecting to bridge…") }
    : !health?.serial_connected
      ? { tone: "warn", label: "Radio not connected" }
      : { tone: "ok", label: `Radio link OK · ${lastReport}` };
  const signalLabel = averageRssi.length
    ? `${Math.round(
        averageRssi.reduce((sum, i) => sum + (i.rssi ?? 0), 0) /
          averageRssi.length,
      )} dBm`
    : "No telemetry";

  const linkDetails = [
    `Dashboard ↔ bridge: ${websocketLabel}`,
    `Radio: ${health?.serial_connected ? `connected on ${health.port ?? "serial"}` : "not connected"}`,
    `Last frame: ${frameAge(health?.last_frame_at)}`,
    `Average signal: ${signalLabel}`,
  ].join("\n");

  return (
    <footer
      aria-label="Operational status and telemetry"
      className="floating-summary-dock"
    >
      {/* One link indicator; the technical detail is in its tooltip */}
      <div aria-label="Connection telemetry" className="system-status-pills">
        <span
          className={`status-pill link-pill link-pill--${link.tone}`}
          title={linkDetails}
        >
          {link.tone === "ok" ? (
            <Wifi aria-hidden="true" size={14} />
          ) : link.tone === "down" ? (
            <RotateCw aria-hidden="true" className="spin-icon" size={14} />
          ) : (
            <Radio aria-hidden="true" size={14} />
          )}
          <i
            className={
              link.tone === "ok"
                ? "status-dot status-dot--online"
                : link.tone === "down"
                  ? "status-dot status-dot--reconnecting"
                  : "status-dot status-dot--standby"
            }
          />
          {link.label}
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
            aria-label="Filter by Deceased (Black) priority"
            aria-pressed={filter === "black"}
            className={`metric-chip metric-chip--button metric-chip--black ${filter === "black" ? "is-active" : ""}`}
            onClick={() =>
              onSelectFilter(filter === "black" ? "all" : "black")
            }
            title={
              filter === "black"
                ? "Click to clear deceased filter"
                : "Click to filter deceased (Black)"
            }
            type="button"
          >
            <span aria-hidden="true" className="dot-expectant" />
            <span>
              <strong>{counts.black}</strong> deceased
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

      </div>
    </footer>
  );
}
