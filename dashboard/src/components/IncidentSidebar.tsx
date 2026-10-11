import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
  MapPinOff,
  RadioTower,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { Incident, PriorityColor } from "../types/incident";
import type { PriorityFilter } from "./TopBar";

interface IncidentSidebarProps {
  incidents: Incident[];
  selectedId: string | null;
  pendingRemovalId: string | null;
  onSelect: (incident: Incident) => void;
  filter?: PriorityFilter;
  searchQuery?: string;
}

const priorityOrder: Record<PriorityColor, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  black: 3,
};

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
      <div className="incident-card__body">
        <div className="incident-card__heading">
          <div>
            <span className="priority-label">{incident.priority.name}</span>
            <strong className="hazard-name">
              {incident.hazard.name.replaceAll("_", " ")}
            </strong>
          </div>
          <time dateTime={new Date(incident.received_at * 1000).toISOString()}>
            {ageLabel(incident.received_at)}
          </time>
        </div>

        <div className="incident-meta">
          <span>
            <Users size={13} aria-hidden="true" />
            {people} {people === 1 ? "person" : "people"}
          </span>
          <span>
            <RadioTower size={13} aria-hidden="true" />
            seq {incident.seq} · {incident.rssi ?? "—"} dBm
          </span>
        </div>

        <div className="incident-tags">
          <span className="tag-pill">{incident.status.name}</span>
          {incident.third_party && <span className="tag-pill">Third-party</span>}
          {incident.location_discrepancy && (
            <span className="tag-pill warning-tag">
              <AlertTriangle size={11} aria-hidden="true" />
              Check location
            </span>
          )}
          {incident.medical.map((flag) => (
            <span className="tag-pill" key={flag}>
              {flag.replaceAll("_", " ")}
            </span>
          ))}
        </div>

        <code className="frame-preview">
          {incident.frame_hex.slice(0, 14)}…
        </code>
      </div>
    </button>
  );
}

export function IncidentSidebar({
  incidents,
  selectedId,
  pendingRemovalId,
  onSelect,
  filter = "all",
  searchQuery = "",
}: IncidentSidebarProps) {
  const [showRemoved, setShowRemoved] = useState(false);
  const [isLocatedCollapsed, setIsLocatedCollapsed] = useState(false);
  const [isNoLocationCollapsed, setIsNoLocationCollapsed] = useState(false);

  const normalizedQuery = searchQuery.trim().toLowerCase();

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

  const filtered = useMemo(() => {
    return sorted.filter((incident) => {
      if (filter !== "all" && incident.priority.color !== filter) return false;
      if (!normalizedQuery) return true;

      const hazard = incident.hazard.name.toLowerCase().replaceAll("_", " ");
      const id = incident.id.toLowerCase();
      const status = incident.status.name.toLowerCase();
      const seq = String(incident.seq);
      const medical = incident.medical.join(" ").toLowerCase();

      return (
        hazard.includes(normalizedQuery) ||
        id.includes(normalizedQuery) ||
        status.includes(normalizedQuery) ||
        seq.includes(normalizedQuery) ||
        medical.includes(normalizedQuery)
      );
    });
  }, [sorted, filter, normalizedQuery]);

  const active = filtered.filter((incident) => incident.state === "active");
  const located = active.filter(
    (incident) => incident.gps_accuracy.name !== "NO_FIX",
  );
  const noLocation = active.filter(
    (incident) => incident.gps_accuracy.name === "NO_FIX",
  );
  const removed = filtered.filter((incident) => incident.state === "removed");

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
    <aside className="floating-sidebar" aria-label="Incident queue">
      <div className="sidebar-floating-header">
        <div className="sidebar-title-group">
          <h2>Active incidents</h2>
          <span className="queue-count">{active.length}</span>
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

      <div className="sidebar-floating-scroll">
        {/* Located Section */}
        <section className="incident-section" aria-labelledby="located-title">
          <button
            className="section-heading-btn"
            onClick={() => setIsLocatedCollapsed((prev) => !prev)}
            type="button"
          >
            <h3 id="located-title">
              <MapPin size={14} aria-hidden="true" />
              Located
            </h3>
            <div className="section-meta">
              <span className="section-count">{located.length}</span>
              {isLocatedCollapsed ? (
                <ChevronDown size={14} aria-hidden="true" />
              ) : (
                <ChevronUp size={14} aria-hidden="true" />
              )}
            </div>
          </button>
          {!isLocatedCollapsed && (
            <div className="incident-list">
              {located.length > 0 ? (
                cards(located)
              ) : (
                <div className="empty-state">
                  {normalizedQuery
                    ? `No located incidents match "${searchQuery}"`
                    : "No matching located incidents"}
                </div>
              )}
            </div>
          )}
        </section>

        {/* No Location Section */}
        <section className="incident-section" aria-labelledby="no-location-title">
          <button
            className="section-heading-btn"
            onClick={() => setIsNoLocationCollapsed((prev) => !prev)}
            type="button"
          >
            <h3 id="no-location-title">
              <MapPinOff size={14} aria-hidden="true" />
              No location
            </h3>
            <div className="section-meta">
              <span className="section-count">{noLocation.length}</span>
              {isNoLocationCollapsed ? (
                <ChevronDown size={14} aria-hidden="true" />
              ) : (
                <ChevronUp size={14} aria-hidden="true" />
              )}
            </div>
          </button>
          {!isNoLocationCollapsed && (
            <div className="incident-list">
              {noLocation.length > 0 ? (
                cards(noLocation)
              ) : (
                <div className="empty-state">
                  {normalizedQuery
                    ? `No unlocated incidents match "${searchQuery}"`
                    : "No matching locationless incidents"}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Removed Section */}
        {showRemoved && (
          <section className="incident-section" aria-labelledby="removed-title">
            <div className="section-heading-static">
              <h3 id="removed-title">Removed</h3>
              <span className="section-count">{removed.length}</span>
            </div>
            <div className="incident-list">
              {removed.length > 0 ? (
                cards(removed)
              ) : (
                <div className="empty-state">No removed incidents</div>
              )}
            </div>
          </section>
        )}

        {!showRemoved && removed.length > 0 && (
          <div className="removed-summary" aria-label="Removed incidents">
            <span>Removed from map</span>
            <strong>{removed.length}</strong>
          </div>
        )}
      </div>
    </aside>
  );
}
