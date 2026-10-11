import {
  Activity,
  AlertTriangle,
  Biohazard,
  Building2,
  Check,
  Clipboard,
  CloudLightning,
  Flame,
  HeartPulse,
  MapPin,
  Mountain,
  RadioTower,
  ShieldAlert,
  Snowflake,
  ThermometerSun,
  Trash2,
  TriangleAlert,
  Users,
  Waves,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Incident } from "../types/incident";
import { decodeFrameBreakdown } from "../utils/frame";

interface DetailDrawerProps {
  incident: Incident | null;
  onClose: () => void;
  onRemove: (incident: Incident) => Promise<void>;
}

const hazardIcons: Record<string, LucideIcon> = {
  FLOOD: Waves,
  FIRE_SMOKE: Flame,
  STRUCTURAL_COLLAPSE: Building2,
  HAZMAT_GAS: Biohazard,
  ELECTRICAL_POWER: Zap,
  EXTREME_WEATHER: CloudLightning,
  MEDICAL_CRISIS: HeartPulse,
  ACTIVE_VIOLENCE: ShieldAlert,
  TSUNAMI_SURGE: Waves,
  LANDSLIDE: Mountain,
  HYPOTHERMIA_FREEZE: Snowflake,
  HEAT_STROKE: ThermometerSun,
  SINKHOLE_SUBSIDENCE: TriangleAlert,
  CONTAMINATED_WATER: Biohazard,
  OTHER: AlertTriangle,
  NONE: Activity,
};

function localTime(timestamp: number | null): string {
  if (timestamp === null) return "—";
  return new Date(timestamp * 1000).toLocaleString();
}

export function DetailDrawer({
  incident,
  onClose,
  onRemove,
}: DetailDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);
  const breakdown = useMemo(
    () => (incident ? decodeFrameBreakdown(incident.frame_hex, incident) : []),
    [incident],
  );

  useEffect(() => {
    if (!incident) return;
    closeRef.current?.focus();
    setCopied(false);
    setRemoving(false);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (
        event.key === "Delete" &&
        incident.state === "active" &&
        !event.repeat &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        if (window.confirm("Remove this incident pin?")) {
          setRemoving(true);
          void onRemove(incident).finally(() => setRemoving(false));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [incident, onClose, onRemove]);

  if (!incident) return null;

  const HazardIcon = hazardIcons[incident.hazard.name] ?? AlertTriangle;
  const people = incident.adults + incident.children;
  const hasLocation = incident.gps_accuracy.name !== "NO_FIX";

  const copyCoordinates = async () => {
    try {
      await navigator.clipboard.writeText(
        `${incident.lat.toFixed(6)}, ${incident.lon.toFixed(6)}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  const requestRemoval = async () => {
    if (!window.confirm("Remove this incident pin?")) return;
    setRemoving(true);
    try {
      await onRemove(incident);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <aside
        aria-labelledby="drawer-title"
        aria-modal="true"
        className="detail-drawer"
        role="dialog"
      >
        <header className="drawer-header" data-priority={incident.priority.color}>
          <div>
            <span className="drawer-priority">{incident.priority.name}</span>
            <h2 id="drawer-title">
              <HazardIcon size={21} aria-hidden="true" />
              {incident.hazard.name.replaceAll("_", " ")}
            </h2>
          </div>
          <button
            aria-label="Close incident details"
            className="icon-button"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="drawer-scroll">
          {incident.third_party && (
            <div className="warning-banner warning-banner--third-party">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>Third-party report</strong>
                <span>
                  Reporter is not at the scene — GPS shows the reporter, not the
                  incident
                </span>
                <code>{incident.location_type}</code>
              </div>
            </div>
          )}

          {incident.location_discrepancy && !incident.third_party && (
            <div className="warning-banner">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>Reported location may differ from device GPS.</span>
            </div>
          )}

          <section className="drawer-section">
            <h3>Triage summary</h3>
            <div className="detail-grid">
              <div>
                <span>Status</span>
                <strong>{incident.status.name}</strong>
              </div>
              <div>
                <span>Total people</span>
                <strong>
                  <Users size={14} aria-hidden="true" /> {people}
                </strong>
              </div>
              <div>
                <span>Adults</span>
                <strong>{incident.adults}</strong>
              </div>
              <div>
                <span>Children</span>
                <strong>{incident.children}</strong>
              </div>
            </div>
            <div className="medical-flags">
              {incident.medical.length > 0 ? (
                incident.medical.map((flag) => (
                  <span className="medical-flag" key={flag}>
                    {flag.replaceAll("_", " ")}
                  </span>
                ))
              ) : (
                <span className="empty-inline">No medical flags</span>
              )}
            </div>
          </section>

          <section className="drawer-section">
            <div className="section-title-row">
              <h3>Location</h3>
              {hasLocation && (
                <button
                  className="copy-button"
                  onClick={() => void copyCoordinates()}
                  type="button"
                >
                  {copied ? (
                    <Check size={13} aria-hidden="true" />
                  ) : (
                    <Clipboard size={13} aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <div className="location-readout">
              <MapPin size={17} aria-hidden="true" />
              <code>
                {hasLocation
                  ? `${incident.lat.toFixed(6)}, ${incident.lon.toFixed(6)}`
                  : "NO FIX"}
              </code>
            </div>
            <p className="detail-caption">
              GPS accuracy: {incident.gps_accuracy.name}
              {incident.gps_accuracy.meters_max === null
                ? ""
                : ` · within ${incident.gps_accuracy.meters_max} m`}
            </p>
          </section>

          <section className="drawer-section">
            <h3>Radio and timing</h3>
            <div className="detail-grid detail-grid--radio">
              <div>
                <span>RSSI</span>
                <strong>{incident.rssi === null ? "—" : `${incident.rssi} dBm`}</strong>
              </div>
              <div>
                <span>SNR</span>
                <strong>{incident.snr === null ? "—" : `${incident.snr} dB`}</strong>
              </div>
              <div>
                <span>Heard</span>
                <strong>
                  <RadioTower size={14} aria-hidden="true" />
                  {incident.heard_count}×
                </strong>
              </div>
              <div>
                <span>Device</span>
                <strong className="mono">{incident.device_id}</strong>
              </div>
            </div>
            <dl className="timestamp-list">
              <div>
                <dt>Sent</dt>
                <dd>{localTime(incident.sent_at)}</dd>
              </div>
              <div>
                <dt>Received</dt>
                <dd>{localTime(incident.received_at)}</dd>
              </div>
              <div>
                <dt>Last heard</dt>
                <dd>{localTime(incident.last_heard_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="drawer-section frame-section">
            <h3>Compressed message (18-byte radio frame)</h3>
            <code className="frame-hex">{incident.frame_hex}</code>
            <div className="frame-table-wrap">
              <table className="frame-table">
                <thead>
                  <tr>
                    <th>Offset</th>
                    <th>Hex</th>
                    <th>Field</th>
                    <th>Decoded value</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.offset}>
                      <td>
                        <code>{row.offset}</code>
                      </td>
                      <td>
                        <code>{row.hex}</code>
                      </td>
                      <td>{row.field}</td>
                      <td>{row.decoded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="privacy-note">
              Only these 18 bit-packed bytes traveled over the LoRa radio; the
              survivor&apos;s free-text distress message is analyzed and compressed
              on-device into structured triage fields to minimize radio airtime and
              protect privacy.
            </p>
          </section>
        </div>

        <footer className="drawer-actions">
          <span className="shortcut-hint">Esc close · Delete remove</span>
          {incident.state === "active" ? (
            <button
              className="danger-button"
              disabled={removing}
              onClick={() => void requestRemoval()}
              type="button"
            >
              <Trash2 size={16} aria-hidden="true" />
              {removing ? "Removing…" : "Remove pin"}
            </button>
          ) : (
            <span className="removed-badge">Removed</span>
          )}
        </footer>
      </aside>
    </div>
  );
}
