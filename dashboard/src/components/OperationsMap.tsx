import type {
  Feature,
  FeatureCollection,
  Point,
  Polygon,
} from "geojson";
import {
  AlertTriangle,
  Crosshair,
  Layers3,
  LocateFixed,
  MapPinned,
  RadioTower,
  Users,
} from "lucide-react";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Incident, PriorityColor } from "../types/incident";

interface OperationsMapProps {
  incidents: Incident[];
  selectedId: string | null;
  pulseIncidentId: string | null;
  pendingRemovalId: string | null;
  onSelect: (incident: Incident) => void;
}

type MapMode = "loading" | "ready" | "fallback";
type IncidentProperties = {
  id: string;
  priority: PriorityColor;
  label: string;
  selected: boolean;
  removing: boolean;
  discrepancy: boolean;
};

const CENTER: [number, number] = [-97.7431, 30.2672];
const BASEMAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "openstreetmap-tiles": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "openstreetmap-basemap",
      type: "raster",
      source: "openstreetmap-tiles",
      paint: {
        "raster-saturation": -0.22,
        "raster-contrast": 0.08,
        "raster-brightness-min": 0.08,
        "raster-brightness-max": 0.72,
      },
    },
  ],
};

export const TRIAGE_COLORS: Record<PriorityColor, string> = {
  red: "#FF4D5E",
  yellow: "#F6C344",
  green: "#35C978",
  black: "#111827",
};

function mappable(incident: Incident): boolean {
  return incident.state === "active" && incident.gps_accuracy.name !== "NO_FIX";
}

function fallbackPosition(incident: Incident) {
  const longitudeSpan = 0.06;
  const latitudeSpan = 0.045;
  const left = 50 + ((incident.lon - CENTER[0]) / longitudeSpan) * 50;
  const top = 50 - ((incident.lat - CENTER[1]) / latitudeSpan) * 50;
  return {
    left: `${Math.min(96, Math.max(4, left))}%`,
    top: `${Math.min(94, Math.max(6, top))}%`,
  };
}

function incidentCollection(
  incidents: Incident[],
  selectedId: string | null,
  pendingRemovalId: string | null,
): FeatureCollection<Point, IncidentProperties> {
  return {
    type: "FeatureCollection",
    features: incidents.filter(mappable).map((incident) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [incident.lon, incident.lat],
      },
      properties: {
        id: incident.id,
        priority: incident.priority.color,
        label: incident.hazard.name,
        selected: incident.id === selectedId,
        removing: incident.id === pendingRemovalId,
        discrepancy: incident.location_discrepancy,
      },
    })),
  };
}

function accuracyCollection(
  incident: Incident | undefined,
): FeatureCollection<Polygon> {
  const meters = incident?.gps_accuracy.meters_max;
  if (!incident || incident.state !== "active" || meters == null) {
    return { type: "FeatureCollection", features: [] };
  }

  const points = 64;
  const latitudeScale = meters / 111_320;
  const longitudeScale =
    meters / (111_320 * Math.cos((incident.lat * Math.PI) / 180));
  const coordinates: [number, number][] = [];

  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    coordinates.push([
      incident.lon + Math.cos(angle) * longitudeScale,
      incident.lat + Math.sin(angle) * latitudeScale,
    ]);
  }

  const feature: Feature<Polygon> = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
  return { type: "FeatureCollection", features: [feature] };
}

function FallbackGrid({
  incidents,
  selectedId,
  pendingRemovalId,
  onSelect,
}: {
  incidents: Incident[];
  selectedId: string | null;
  pendingRemovalId: string | null;
  onSelect: (incident: Incident) => void;
}) {
  return (
    <div className="fallback-grid" role="img" aria-label="Dark grid incident map">
      <span className="fallback-axis horizontal" aria-hidden="true" />
      <span className="fallback-axis vertical" aria-hidden="true" />
      {incidents.filter(mappable).map((incident) => (
        <button
          className={[
            "fallback-pin",
            incident.id === selectedId ? "is-selected" : "",
            incident.id === pendingRemovalId ? "is-removing" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-priority={incident.priority.color}
          key={incident.id}
          onClick={() => onSelect(incident)}
          style={fallbackPosition(incident)}
          type="button"
          title={`${incident.priority.name} · ${incident.hazard.name.replaceAll("_", " ")}`}
          aria-label={`${incident.priority.name} ${incident.hazard.name.replaceAll("_", " ")}`}
        >
          {incident.location_discrepancy && (
            <span className="pin-warning" aria-label="Location discrepancy">
              <AlertTriangle size={10} aria-hidden="true" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function OperationsMap({
  incidents,
  selectedId,
  pulseIncidentId,
  pendingRemovalId,
  onSelect,
}: OperationsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const incidentsRef = useRef(incidents);
  const onSelectRef = useRef(onSelect);
  const dataRef = useRef(
    incidentCollection(incidents, selectedId, pendingRemovalId),
  );
  const accuracyRef = useRef(
    accuracyCollection(incidents.find((item) => item.id === selectedId)),
  );
  const pulseRef = useRef(pulseIncidentId);
  const [mode, setMode] = useState<MapMode>("loading");
  const [online, setOnline] = useState(() => navigator.onLine);

  const points = useMemo(() => incidents.filter(mappable), [incidents]);
  const active = useMemo(
    () => incidents.filter((incident) => incident.state === "active"),
    [incidents],
  );
  const immediateCount = active.filter(
    (incident) => incident.priority.color === "red",
  ).length;
  const peopleCount = active.reduce(
    (total, incident) => total + incident.adults + incident.children,
    0,
  );
  const averageRssi = active.filter((incident) => incident.rssi !== null);
  const signalLabel = averageRssi.length
    ? `${Math.round(
        averageRssi.reduce((total, incident) => total + (incident.rssi ?? 0), 0) /
          averageRssi.length,
      )} dBm`
    : "—";

  const recenterMap = () => {
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((incident) => bounds.extend([incident.lon, incident.lat]));
    if (!mapRef.current) return;
    if (points.length > 1) {
      mapRef.current.fitBounds(bounds, {
        padding: { top: 110, right: 70, bottom: 140, left: 70 },
        maxZoom: 14.5,
        duration: 650,
      });
      return;
    }
    mapRef.current.easeTo({ center: CENTER, zoom: 12.2, duration: 500 });
  };

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      if (mapRef.current?.loaded()) setMode("ready");
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    incidentsRef.current = incidents;
    onSelectRef.current = onSelect;
    dataRef.current = incidentCollection(
      incidents,
      selectedId,
      pendingRemovalId,
    );
    accuracyRef.current = accuracyCollection(
      incidents.find((item) => item.id === selectedId),
    );
    pulseRef.current = pulseIncidentId;

    const map = mapRef.current;
    if (!map?.loaded()) return;

    (map.getSource("incidents") as maplibregl.GeoJSONSource | undefined)?.setData(
      dataRef.current,
    );
    (map.getSource("accuracy") as maplibregl.GeoJSONSource | undefined)?.setData(
      accuracyRef.current,
    );
    if (map.getLayer("incident-event-pulse")) {
      map.setFilter("incident-event-pulse", [
        "==",
        ["get", "id"],
        pulseIncidentId ?? "",
      ]);
    }

    const selected = incidents.find(
      (item) => item.id === selectedId && mappable(item),
    );
    if (selected) {
      map.easeTo({
        center: [selected.lon, selected.lat],
        duration: 420,
        essential: false,
      });
    }
  }, [incidents, onSelect, pendingRemovalId, pulseIncidentId, selectedId]);

  useEffect(() => {
    if (!containerRef.current) return;

    let map: maplibregl.Map;
    let animationFrame = 0;
    let styleReady = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!styleReady) setMode("fallback");
    }, 10_000);
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        center: CENTER,
        zoom: 12.2,
        attributionControl: false,
        style: BASEMAP_STYLE,
        pitch: 24,
        bearing: -8,
        maxPitch: 60,
      });
    } catch {
      window.clearTimeout(fallbackTimer);
      setMode("fallback");
      return;
    }

    mapRef.current = map;
    const handleError = () => {
      if (!styleReady) setMode("fallback");
    };

    map.on("error", handleError);
    map.on("style.load", () => {
      styleReady = true;
      window.clearTimeout(fallbackTimer);
    });
    map.on("load", () => {
      styleReady = true;
      window.clearTimeout(fallbackTimer);
      map.addSource("incidents", {
        type: "geojson",
        data: dataRef.current,
      });
      map.addSource("accuracy", {
        type: "geojson",
        data: accuracyRef.current,
      });
      map.addLayer({
        id: "accuracy-fill",
        type: "fill",
        source: "accuracy",
        paint: {
          "fill-color": "#58C7E8",
          "fill-opacity": 0.09,
        },
      });
      map.addLayer({
        id: "accuracy-outline",
        type: "line",
        source: "accuracy",
        paint: {
          "line-color": "#58C7E8",
          "line-opacity": 0.7,
          "line-width": 1.5,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "incident-halo",
        type: "circle",
        source: "incidents",
        filter: ["==", ["get", "priority"], "red"],
        paint: {
          "circle-radius": 17,
          "circle-color": TRIAGE_COLORS.red,
          "circle-opacity": 0.14,
        },
      });
      map.addLayer({
        id: "incident-event-pulse",
        type: "circle",
        source: "incidents",
        filter: ["==", ["get", "id"], pulseRef.current ?? ""],
        paint: {
          "circle-radius": 12,
          "circle-color": TRIAGE_COLORS.red,
          "circle-opacity": 0.35,
        },
      });
      map.addLayer({
        id: "incident-pins",
        type: "circle",
        source: "incidents",
        paint: {
          "circle-radius": [
            "match",
            ["get", "priority"],
            "red",
            9,
            "black",
            8,
            7,
          ],
          "circle-color": [
            "match",
            ["get", "priority"],
            "red",
            TRIAGE_COLORS.red,
            "yellow",
            TRIAGE_COLORS.yellow,
            "green",
            TRIAGE_COLORS.green,
            TRIAGE_COLORS.black,
          ],
          "circle-opacity": ["case", ["get", "removing"], 0.18, 1],
          "circle-stroke-width": ["case", ["get", "selected"], 4, 2],
          "circle-stroke-color": [
            "case",
            ["get", "selected"],
            "#F2F6FB",
            ["==", ["get", "priority"], "black"],
            "#94A3B8",
            "#07101D",
          ],
        },
      });

      map.on("mouseenter", "incident-pins", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "incident-pins", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", "incident-pins", (event) => {
        const feature = event.features?.[0];
        const id = String(feature?.properties?.id ?? "");
        const incident = incidentsRef.current.find((item) => item.id === id);
        if (!incident || feature?.geometry.type !== "Point") return;

        onSelectRef.current(incident);
        const popup = document.createElement("div");
        popup.className = "map-popup";
        const label = document.createElement("strong");
        label.textContent = incident.hazard.name.replaceAll("_", " ");
        popup.append(label);
        if (incident.location_discrepancy) {
          const warning = document.createElement("span");
          warning.className = "map-popup-warning";
          warning.textContent = "⚠ Location discrepancy";
          popup.append(warning);
        }
        new maplibregl.Popup({ closeButton: false, offset: 14 })
          .setLngLat([incident.lon, incident.lat])
          .setDOMContent(popup)
          .addTo(map);
      });

      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const animatePulse = (timestamp: number) => {
          if (map.getLayer("incident-event-pulse")) {
            const phase = (Math.sin(timestamp / 260) + 1) / 2;
            map.setPaintProperty(
              "incident-event-pulse",
              "circle-radius",
              12 + phase * 16,
            );
            map.setPaintProperty(
              "incident-event-pulse",
              "circle-opacity",
              0.38 * (1 - phase),
            );
          }
          animationFrame = window.requestAnimationFrame(animatePulse);
        };
        animationFrame = window.requestAnimationFrame(animatePulse);
      }

      setMode("ready");

      if (points.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        points.forEach((incident) => bounds.extend([incident.lon, incident.lat]));
        map.fitBounds(bounds, {
          padding: { top: 110, right: 70, bottom: 140, left: 70 },
          maxZoom: 14.5,
          duration: 0,
        });
      }
    });

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true,
      }),
      "bottom-right",
    );
    map.addControl(new maplibregl.FullscreenControl(), "bottom-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 110, unit: "imperial" }),
      "bottom-left",
    );

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(fallbackTimer);
      map.off("error", handleError);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <section className="map-panel" aria-label="Incident map">
      <div className="map-toolbar">
        <div>
          <p className="eyebrow">Austin operations area</p>
          <h2>Live incident map</h2>
        </div>
        <div className="map-toolbar__actions" aria-label="Map status">
          <span className="map-mode">
            <Layers3 size={14} aria-hidden="true" />
            {mode === "fallback"
              ? "Grid fallback"
              : mode === "ready"
                ? online
                  ? "Street basemap"
                  : "Cached street map"
                : "Loading streets"}
          </span>
          <span className="map-coordinate">
            <Crosshair size={14} aria-hidden="true" />
            {points.length} located · 30.2672, -97.7431
          </span>
        </div>
      </div>

      <div className="map-command-strip" aria-label="Map controls">
        <button
          disabled={mode !== "ready"}
          onClick={recenterMap}
          title={mode === "ready" ? "Recenter map" : "Map is initializing"}
          type="button"
        >
          <LocateFixed size={15} aria-hidden="true" />
          Recenter
        </button>
        <span aria-hidden="true" />
        <div>
          <i className="live-indicator" />
          Live telemetry
        </div>
      </div>

      <div className="map-stage">
        <div
          className={mode === "fallback" ? "map-canvas is-hidden" : "map-canvas"}
          ref={containerRef}
        />
        {mode === "fallback" && (
          <FallbackGrid
            incidents={incidents}
            onSelect={onSelect}
            pendingRemovalId={pendingRemovalId}
            selectedId={selectedId}
          />
        )}
        {mode === "loading" && (
          <div className="map-loading">
            <MapPinned size={24} aria-hidden="true" />
            Loading street map
          </div>
        )}
        <div className="map-legend" aria-label="Triage legend">
          {(["red", "yellow", "green", "black"] as PriorityColor[]).map(
            (color) => (
              <span data-priority={color} key={color}>
                <i />
                {color}
              </span>
            ),
          )}
        </div>
        <div className="map-summary-dock" aria-label="Operational summary">
          <div>
            <span>Located incidents</span>
            <strong><MapPinned size={16} aria-hidden="true" />{points.length}</strong>
          </div>
          <div className="summary-critical">
            <span>Immediate</span>
            <strong>{immediateCount}</strong>
          </div>
          <div>
            <span>People reported</span>
            <strong><Users size={16} aria-hidden="true" />{peopleCount}</strong>
          </div>
          <div>
            <span>Average signal</span>
            <strong><RadioTower size={16} aria-hidden="true" />{signalLabel}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
