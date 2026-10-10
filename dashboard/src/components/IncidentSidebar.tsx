import {
  AlertTriangle,
  MapPin,
  MapPinOff,
  RadioTower,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { Incident, PriorityColor } from "../types/incident";

interface IncidentSidebarProps {
  incidents: Incident[];
  selectedId: string | null;
  pendingRemovalId: string | null;
  onSelect: (incident: Incident) => void;
}

type PriorityFilter = "all" | PriorityColor;

const priorityOrder: Record<PriorityColor, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  black: 3,
};

const filters: Array<{ value: PriorityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "red", label: "Red" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "black", label: "Black" },
];

function ageLabel(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function IncidentCard({
  incident,
  selected,
  removing,
  onSelect,
}: {
  incident: Incident;
  selected: boolean;
  removing: boolean;
  onSelect: () => void;
}) {
  const people = incident.adults + incident.children;
  return (
    <button
      aria-pressed={selected}
      className={[
        "incident-card",
        selected ? "is-selected" : "",
        removing ? "is-removing" : "",
        incident.state === "removed" ? "is-removed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-priority={incident.priority.color}
      onClick={onSelect}
      type="button"
    >
      <span className="incident-card__bar" aria-hidden="true" />
      <span className="incident-card__body">
        <span className="incident-card__heading">
          <span>
            <span className="priority-label">{incident.priority.name}</span>
            <strong>{incident.hazard.name.replaceAll("_", " ")}</strong>
          </span>
          <time dateTime={new Date(incident.received_at * 1000).toISOString()}>
            {ageLabel(incident.received_at)}
          </time>
        </span>

        <span className="incident-meta">
          <span>
            <Users size={14} aria-hidden="true" />
            {people} {people === 1 ? "person" : "people"}
          </span>
          <span>
            <RadioTower size={14} aria-hidden="true" />
            seq {incident.seq} · {incident.rssi ?? "—"} dBm
          </span>
        </span>

        <span className="incident-tags">
          <span>{incident.status.name}</span>
          {incident.third_party && <span>Third-party</span>}
          {incident.location_discrepancy && (
            <span className="warning-tag">
              <AlertTriangle size={12} aria-hidden="true" />
              Check location
            </span>
          )}
          {incident.medical.map((flag) => (
            <span key={flag}>{flag.replaceAll("_", " ")}</span>
          ))}
        </span>

        <code>{incident.frame_hex.slice(0, 12)}…</code>
      </span>
    </button>
  );
}

export function IncidentSidebar({
  incidents,
  selectedId,
  pendingRemovalId,
  onSelect,
}: IncidentSidebarProps) {
  const [filter, setFilter] = useState<PriorityFilter>("all");
  const [showRemoved, setShowRemoved] = useState(false);

  const sorted = useMemo(
    () =>
      [...incidents].sort(
        (left, right) =>
          priorityOrder[left.priority.color] -
            priorityOrder[right.priority.color] ||
          right.received_at - left.received_at,
      ),
    [incidents],
  );
  const matchesFilter = (incident: Incident) =>
    filter === "all" || incident.priority.color === filter;
  const active = sorted.filter(
    (incident) => incident.state === "active" && matchesFilter(incident),
  );
  const located = active.filter(
    (incident) => incident.gps_accuracy.name !== "NO_FIX",
  );
  const noLocation = active.filter(
    (incident) => incident.gps_accuracy.name === "NO_FIX",
  );
  const removed = sorted.filter(
    (incident) => incident.state === "removed" && matchesFilter(incident),
  );

  const cards = (items: Incident[]) =>
    items.map((incident) => (
      <IncidentCard
        incident={incident}
        key={incident.id}
        onSelect={() => onSelect(incident)}
        removing={pendingRemovalId === incident.id}
        selected={selectedId === incident.id}
      />
    ));

  return (
    <aside className="sidebar" aria-label="Incident queue">
      <div className="sidebar__header">
        <div>
          <p className="eyebrow">Live queue</p>
          <h2>Active incidents</h2>
        </div>
        <span className="queue-count">{active.length}</span>
      </div>

      <div className="sidebar-controls">
        <div aria-label="Filter incidents by priority" className="filter-chips">
          {filters.map((item) => (
            <button
              aria-pressed={filter === item.value}
              data-priority={item.value}
              key={item.value}
              onClick={() => setFilter(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="removed-toggle">
          <input
            checked={showRemoved}
            onChange={(event) => setShowRemoved(event.target.checked)}
            type="checkbox"
          />
          <span>Show removed</span>
        </label>
      </div>

      <div className="sidebar__scroll">
        <section className="incident-section" aria-labelledby="located-title">
          <div className="section-heading">
            <h3 id="located-title">
              <MapPin size={15} aria-hidden="true" />
              Located
            </h3>
            <span>{located.length}</span>
          </div>
          <div className="incident-list">
            {located.length > 0 ? cards(located) : (
              <div className="empty-state">No matching located incidents</div>
            )}
          </div>
        </section>

        <section className="incident-section" aria-labelledby="no-location-title">
          <div className="section-heading">
            <h3 id="no-location-title">
              <MapPinOff size={15} aria-hidden="true" />
              No location
            </h3>
            <span>{noLocation.length}</span>
          </div>
          <div className="incident-list">
            {noLocation.length > 0 ? cards(noLocation) : (
              <div className="empty-state">No matching locationless incidents</div>
            )}
          </div>
        </section>

        {showRemoved && (
          <section className="incident-section" aria-labelledby="removed-title">
            <div className="section-heading">
              <h3 id="removed-title">Removed</h3>
              <span>{removed.length}</span>
            </div>
            <div className="incident-list">
              {removed.length > 0 ? cards(removed) : (
                <div className="empty-state">No removed incidents</div>
              )}
            </div>
          </section>
        )}

        {!showRemoved && (
          <div className="removed-summary" aria-label="Removed incidents">
            <span>Removed from map</span>
            <strong>{removed.length}</strong>
          </div>
        )}
      </div>
    </aside>
  );
}
