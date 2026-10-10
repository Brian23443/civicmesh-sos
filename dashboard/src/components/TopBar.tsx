import { Clock3, Radio, Volume2, VolumeX, Wifi } from "lucide-react";

import type { PriorityColor } from "../types/incident";

interface TopBarProps {
  counts: Record<PriorityColor, number>;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

const priorities: Array<{
  color: PriorityColor;
  label: string;
}> = [
  { color: "red", label: "Red" },
  { color: "yellow", label: "Yellow" },
  { color: "green", label: "Green" },
  { color: "black", label: "Black" },
];

export function TopBar({
  counts,
  soundEnabled,
  onToggleSound,
}: TopBarProps) {
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
          <Wifi size={14} aria-hidden="true" />
          <i className="status-dot status-dot--online" />
          WS mock
        </span>
        <span className="status-pill">
          <Radio size={14} aria-hidden="true" />
          <i className="status-dot status-dot--online" />
          Serial sim
        </span>
        <span className="status-pill status-pill--muted">
          <Clock3 size={14} aria-hidden="true" />
          Last frame 4s ago
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
