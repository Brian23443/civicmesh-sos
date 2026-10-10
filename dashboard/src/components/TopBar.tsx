import {
  Clock3,
  Radio,
  RotateCw,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";

import type { BridgeConnectionState } from "../hooks/useBridgeSocket";
import type { BridgeHealth } from "../services/api";
import type { PriorityColor } from "../types/incident";

interface TopBarProps {
  counts: Record<PriorityColor, number>;
  health: BridgeHealth | null;
  connectionState: BridgeConnectionState;
  retryCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

const priorities: Array<{ color: PriorityColor; label: string }> = [
  { color: "red", label: "Red" },
  { color: "yellow", label: "Yellow" },
  { color: "green", label: "Green" },
  { color: "black", label: "Black" },
];

function frameAge(timestamp: number | null | undefined): string {
  if (timestamp == null) return "No frames";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return `Last frame ${seconds}s ago`;
  return `Last frame ${Math.floor(seconds / 60)}m ago`;
}

export function TopBar({
  counts,
  health,
  connectionState,
  retryCount,
  soundEnabled,
  onToggleSound,
}: TopBarProps) {
  const connected = connectionState === "connected";
  const websocketLabel = connected
    ? "WS connected"
    : connectionState === "reconnecting"
      ? `Reconnecting…${retryCount > 0 ? ` (${retryCount})` : ""}`
      : "WS connecting";

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          CM
        </span>
        <div>
          <p className="eyebrow">Offline incident command</p>
          <h1>CivicMesh-SOS Operator Dashboard</h1>
        </div>
      </div>

      <div className="system-status" aria-label="System status">
        <span className="status-pill">
          {connected ? (
            <Wifi size={14} aria-hidden="true" />
          ) : (
            <RotateCw className="spin-icon" size={14} aria-hidden="true" />
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
        <span className="status-pill">
          <Radio size={14} aria-hidden="true" />
          <i
            className={
              health?.serial_connected
                ? "status-dot status-dot--online"
                : "status-dot status-dot--standby"
            }
          />
          {health?.serial_connected
            ? `Serial ${health.port ?? "connected"}`
            : "Serial unavailable"}
        </span>
        <span className="status-pill status-pill--muted">
          <Clock3 size={14} aria-hidden="true" />
          {frameAge(health?.last_frame_at)}
        </span>
      </div>

      <div className="priority-counters" aria-label="Active incident counts">
        {priorities.map(({ color, label }) => (
          <span className="priority-counter" data-priority={color} key={color}>
            <i aria-hidden="true" />
            <strong>{counts[color]}</strong>
            <span>{label}</span>
          </span>
        ))}
      </div>

      <button
        className="icon-button"
        type="button"
        aria-label={soundEnabled ? "Mute alert sounds" : "Enable alert sounds"}
        aria-pressed={soundEnabled}
        onClick={onToggleSound}
      >
        {soundEnabled ? (
          <Volume2 size={18} aria-hidden="true" />
        ) : (
          <VolumeX size={18} aria-hidden="true" />
        )}
        <span>{soundEnabled ? "Sound on" : "Sound off"}</span>
      </button>
    </header>
  );
}
