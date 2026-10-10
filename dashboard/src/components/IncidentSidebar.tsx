import {
  AlertTriangle,
  MapPin,
  MapPinOff,
  RadioTower,
  Users,
} from "lucide-react";

import type { Incident, PriorityColor } from "../types/incident";

interface IncidentSidebarProps {
  incidents: Incident[];
}

const priorityOrder: Record<PriorityColor, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  black: 3,
};

function ageLabel(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return seconds + "s ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  return Math.floor(seconds / 3600) + "h ago";
}

function IncidentCard({ incident }: { incident: Incident }) {
  const people = incident.adults + incident.children;
  return (
    <article className="incident-card" data-priority={incident.priority.color}>
      <div className="incident-card__bar" aria-hidden="true" />
      <div className="incident-card__body">
        <div className="incident-card__heading">
          <div>
            <span className="priority-label">
              {incident.priority.name}
            </span>
            <h3>{incident.hazard.name.replaceAll("_", " ")}</h3>
          </div>
          <time dateTime={new Date(incident.received_at * 1000).toISOString()}>
            {ageLabel(incident.received_at)}
          </time>
        </div>

        <div className="incident-meta">
          <span>
            <Users size={14} aria-hidden="true" />
            {people} {people === 1 ? "person" : "people"}
          </span>
          <span>
            <RadioTower size={14} aria-hidden="true" />
            seq {incident.seq} · {incident.rssi ?? "—"} dBm
          </span>
        </div>

        <div className="incident-tags">
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
        </div>

        <code>{incident.frame_hex.slice(0, 12)}…</code>
      </div>
    </article>
  );
}

export function IncidentSidebar({ incidents }: IncidentSidebarProps) {
  const sorted = [...incidents]
    .filter((incident) => incident.state === "active")
    .sort(
      (left, right) =>
        priorityOrder[left.priority.color] -
          priorityOrder[right.priority.color] ||
        right.received_at - left.received_at,
    );
  const located = sorted.filter(
    (incident) => incident.gps_accuracy.name !== "NO_FIX",
  );
  const noLocation = sorted.filter(
    (incident) => incident.gps_accuracy.name === "NO_FIX",
  );
  const removed = incidents.filter((incident) => incident.state === "removed");

  return (
    <aside className="sidebar" aria-label="Incident queue">
      <div className="sidebar__header">
        <div>
          <p className="eyebrow">Live queue</p>
          <h2>Active incidents</h2>
        </div>
        <span className="queue-count">{sorted.length}</span>
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
            {located.map((incident) => (
              <IncidentCard incident={incident} key={incident.id} />
            ))}
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
            {noLocation.map((incident) => (
              <IncidentCard incident={incident} key={incident.id} />
            ))}
          </div>
        </section>

        <section className="removed-summary" aria-label="Removed incidents">
          <span>Removed from map</span>
          <strong>{removed.length}</strong>
        </section>
      </div>
    </aside>
  );
}
