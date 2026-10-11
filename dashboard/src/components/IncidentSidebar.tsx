import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
  MapPinOff,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { Incident, PriorityColor } from "../types/incident";
import {
  MEDICAL_NEEDS,
  agoText,
  hazardLabel,
  locationNote,
  medicalLabel,
  peopleText,
  priorityLabel,
  statusLabel,
  supplyTotals,
} from "../utils/responder";
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
  const medical = incident.medical.filter((flag) => MEDICAL_NEEDS[flag]);
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
            <span className="priority-label">{priorityLabel(incident)}</span>
            <strong className="hazard-name">{hazardLabel(incident)}</strong>
          </div>
          <time
            dateTime={new Date(incident.sent_at * 1000).toISOString()}
            title="Time since the survivor sent it"
          >
            {agoText(incident.sent_at)}
          </time>
        </div>

        <div className="incident-meta">
          <span>
            <Users size={13} aria-hidden="true" />
            {peopleText(incident)}
          </span>
          <span>{statusLabel(incident)}</span>
        </div>

        {(medical.length > 0 || locationNote(incident)) && (
          <div className="incident-tags">
            {medical.map((flag) => (
              <span className="tag-pill tag-pill--need" key={flag}>
                {medicalLabel(flag)}
              </span>
            ))}
            {locationNote(incident) && (
              <span className="tag-pill warning-tag">
                <AlertTriangle size={11} aria-hidden="true" />
                {incident.third_party ? "Third-party" : "Check location"}
              </span>
            )}
          </div>
        )}
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
  const supplies = useMemo(() => supplyTotals(incidents), [incidents]);

  const sorted = useMemo(
    () =>
      [...incidents].sort(
        (left, right) =>
          priorityOrder[left.priority.color] -
            priorityOrder[right.priority.color] ||
          left.sent_at - right.sent_at,
      ),
    [incidents],
  );

  const filtered = useMemo(() => {
    return sorted.filter((incident) => {
      if (filter !== "all" && incident.priority.color !== filter) return false;
      if (!normalizedQuery) return true;

      const hazard = `${incident.hazard.name.replaceAll("_", " ")} ${hazardLabel(incident)}`.toLowerCase();
      const id = incident.id.toLowerCase();
      const status = statusLabel(incident).toLowerCase();
      const seq = String(incident.seq);
      const medical = `${incident.medical.join(" ")} ${incident.medical.map(medicalLabel).join(" ")}`
        .toLowerCase()
        .replaceAll("_", " ");

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
      {supplies.length > 0 && (
        <div aria-label="Reported needs across active incidents" className="supplies-summary">
          <span className="supplies-summary__title">Needs across active incidents</span>
          <div>
            {supplies.map((item) => (
              <span className="supply-chip" key={item.key}>
                <strong>{item.count}</strong> {item.label}
              </span>
            ))}
          </div>
        </div>
      )}

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
