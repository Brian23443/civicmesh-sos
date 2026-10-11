import type {
  Feature,
  FeatureCollection,
  Point,
  Polygon,
} from "geojson";
import {
  AlertTriangle,
  LocateFixed,
  MapPinned,
  Minus,
  Plus,
} from "lucide-react";
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import { useEffect, useRef, useState } from "react";

import darkStyleJson from "../assets/dark.json";
import lightStyleJson from "../assets/light.json";
import type { Incident, PriorityColor } from "../types/incident";
import type { PriorityFilter } from "./TopBar";

const protocol = new pmtiles.Protocol();
try {
  maplibregl.addProtocol("pmtiles", protocol.tile);
} catch {
  // Protocol handler already registered
}

export type BasemapTheme = "light" | "dark";

/** Fonts and sprites ship in public/basemap so the map makes no internet requests (§ offline basemap). */
export function getProtomapsStyle(
  theme: BasemapTheme,
  pmtilesUrl: string,
): maplibregl.StyleSpecification {
  const raw = (theme === "light" ? lightStyleJson : darkStyleJson) as any;
  const origin = window.location.origin;
  return {
    ...raw,
    version: 8,
    glyphs: `${origin}/basemap/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/basemap/sprites/v4/${theme === "light" ? "white" : "dark"}`,
    sources: {
      ...raw.sources,
      protomaps: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        maxzoom: 15,
        attribution: raw.sources?.protomaps?.attribution,
      },
    },
    layers: raw.layers as maplibregl.LayerSpecification[],
  } as maplibregl.StyleSpecification;
}

interface OperationsMapProps {
  incidents: Incident[];
  selectedId: string | null;
  pulseIncidentId: string | null;
  pendingRemovalId: string | null;
  onSelect: (incident: Incident) => void;
  theme?: BasemapTheme;
  filterPriority?: PriorityFilter;
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

const CENTER: [number, number] = [-74.4594, 40.5234];

const LEGEND: Array<{ color: PriorityColor; label: string }> = [
  { color: "red", label: "Immediate" },
  { color: "yellow", label: "Delayed" },
  { color: "green", label: "Minor" },
  { color: "black", label: "Expectant" },
];

export const TRIAGE_COLORS: Record<PriorityColor, string> = {
  red: "#FF4D5E",
  yellow: "#F6C344",
  green: "#35C978",
  black: "#111827",
};

function mappable(incident: Incident): boolean {
  return incident.state === "active" && incident.gps_accuracy.name !== "NO_FIX";
}

interface Frame { center: [number, number]; lonSpan: number; latSpan: number }

function fallbackFrame(incidents: Incident[]): Frame {
  const points = incidents.filter(mappable);
  if (!points.length) return { center: CENTER, lonSpan: 0.06, latSpan: 0.045 };
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  const [minLon, maxLon, minLat, maxLat] = [
    Math.min(...lons),
    Math.max(...lons),
    Math.min(...lats),
    Math.max(...lats),
  ];
  return {
    center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
    lonSpan: Math.max(0.01, (maxLon - minLon) * 0.65),
    latSpan: Math.max(0.0075, (maxLat - minLat) * 0.65),
  };
}

function fallbackPosition(incident: Incident, frame: Frame) {
  const left = 50 + ((incident.lon - frame.center[0]) / frame.lonSpan) * 50;
  const top = 50 - ((incident.lat - frame.center[1]) / frame.latSpan) * 50;
  return {
    left: `${Math.min(96, Math.max(4, left))}%`,
    top: `${Math.min(94, Math.max(6, top))}%`,
  };
}

function fitToIncidents(map: maplibregl.Map, incidents: Incident[], duration: number) {
  const points = incidents.filter(mappable);
  if (!points.length) {
    map.easeTo({ center: CENTER, zoom: 13.5, duration });
    return;
  }
  if (points.length === 1) {
    map.easeTo({ center: [points[0].lon, points[0].lat], zoom: 14, duration });
    return;
  }
  const bounds = new maplibregl.LngLatBounds(
    [points[0].lon, points[0].lat],
    [points[0].lon, points[0].lat],
  );
  for (const p of points) bounds.extend([p.lon, p.lat]);
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  if (Math.abs(sw.lng - ne.lng) < 2e-4 && Math.abs(sw.lat - ne.lat) < 2e-4) {
    map.easeTo({
      center: [(sw.lng + ne.lng) / 2, (sw.lat + ne.lat) / 2],
      zoom: 14,
      duration,
    });
    return;
  }
  map.fitBounds(bounds, { padding: 90, maxZoom: 15, duration });
}

function incidentCollection(
  incidents: Incident[],
  selectedId: string | null,
  pendingRemovalId: string | null,
  filterPriority: PriorityFilter = "all",
): FeatureCollection<Point, IncidentProperties> {
  const points = incidents.filter(
    (item) =>
      mappable(item) &&
      (filterPriority === "all" || item.priority.color === filterPriority),
  );
  return {
    type: "FeatureCollection",
    features: points.map((incident) => ({
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

/** GeoJSON sources for the incident overlay; re-added on every basemap swap. */
function incidentSources(
  incidents: FeatureCollection<Point, IncidentProperties>,
  accuracy: FeatureCollection<Polygon>,
): Record<string, maplibregl.GeoJSONSourceSpecification> {
  return {
    incidents: { type: "geojson", data: incidents },
    accuracy: { type: "geojson", data: accuracy },
  };
}

/** Accuracy circle (selected pin), Red halo, new-pin pulse and the pins, bottom to top. */
function incidentLayers(pulseId: string | null): maplibregl.LayerSpecification[] {
  return [
    {
      id: "accuracy-fill",
      type: "fill",
      source: "accuracy",
      paint: { "fill-color": "#0EA5E9", "fill-opacity": 0.1 },
    },
    {
      id: "accuracy-outline",
      type: "line",
      source: "accuracy",
      paint: {
        "line-color": "#0EA5E9",
        "line-opacity": 0.8,
        "line-width": 1.5,
        "line-dasharray": [2, 2],
      },
    },
    {
      id: "incident-halo",
      type: "circle",
      source: "incidents",
      filter: ["==", ["get", "priority"], "red"],
      paint: {
        "circle-radius": 17,
        "circle-color": TRIAGE_COLORS.red,
        "circle-opacity": ["case", ["get", "removing"], 0, 0.16],
      },
    },
    {
      id: "incident-event-pulse",
      type: "circle",
      source: "incidents",
      filter: ["==", ["get", "id"], pulseId ?? ""],
      paint: {
        "circle-radius": 12,
        "circle-color": ["match", ["get", "priority"], "red", TRIAGE_COLORS.red,
          "yellow", TRIAGE_COLORS.yellow, "green", TRIAGE_COLORS.green, TRIAGE_COLORS.black],
        "circle-opacity": 0.35,
      },
    },
    {
      id: "incident-pins",
      type: "circle",
      source: "incidents",
      paint: {
        "circle-radius": ["match", ["get", "priority"], "red", 9, "black", 8, 7],
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
          "#FFFFFF",
          ["==", ["get", "priority"], "black"],
          "#A1A1AA",
          "#18181B",
        ],
      },
    },
  ];
}

function FallbackGrid({
  incidents,
  selectedId,
  pendingRemovalId,
  onSelect,
  theme,
}: {
  incidents: Incident[];
  selectedId: string | null;
  pendingRemovalId: string | null;
  onSelect: (incident: Incident) => void;
  theme: BasemapTheme;
}) {
  return (
    <div
      aria-label={`${theme === "light" ? "Light" : "Dark"} grid incident map`}
      className={theme === "light" ? "fallback-grid is-light-theme" : "fallback-grid"}
      role="img"
    >
      <span aria-hidden="true" className="fallback-axis horizontal" />
      <span aria-hidden="true" className="fallback-axis vertical" />
      {incidents.filter(mappable).map((incident, _i, located) => (
        <button
          aria-label={`${incident.priority.name} ${incident.hazard.name.replaceAll("_", " ")}`}
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
          style={fallbackPosition(incident, fallbackFrame(located))}
          title={`${incident.priority.name} · ${incident.hazard.name.replaceAll("_", " ")}`}
          type="button"
        >
          {incident.location_discrepancy && (
            <span aria-label="Location discrepancy" className="pin-warning">
              <AlertTriangle aria-hidden="true" size={10} />
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
  theme = "light",
  filterPriority = "all",
}: OperationsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const incidentsRef = useRef(incidents);
  const onSelectRef = useRef(onSelect);
  const dataRef = useRef(
    incidentCollection(incidents, selectedId, pendingRemovalId, filterPriority),
  );
  const accuracyRef = useRef(
    accuracyCollection(incidents.find((item) => item.id === selectedId)),
  );
  const pulseRef = useRef(pulseIncidentId);
  const locatedIdsRef = useRef<Set<string>>(new Set());
  const [mode, setMode] = useState<MapMode>("loading");
  const modeRef = useRef<MapMode>("loading");
  const basemapThemeRef = useRef<BasemapTheme>(theme);

  const recenterMap = () => {
    if (mapRef.current) fitToIncidents(mapRef.current, incidentsRef.current, 500);
  };

  const handleZoomIn = () => {
    mapRef.current?.zoomIn({ duration: 250 });
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut({ duration: 250 });
  };

  useEffect(() => {
    incidentsRef.current = incidents;
    onSelectRef.current = onSelect;
    dataRef.current = incidentCollection(
      incidents,
      selectedId,
      pendingRemovalId,
      filterPriority,
    );
    accuracyRef.current = accuracyCollection(
      incidents.find((item) => item.id === selectedId),
    );
    pulseRef.current = pulseIncidentId;

    const map = mapRef.current;
    if (!map || !map.getSource("incidents")) return;

    (map.getSource("incidents") as maplibregl.GeoJSONSource | undefined)?.setData(
      dataRef.current,
    );
    (map.getSource("accuracy") as maplibregl.GeoJSONSource | undefined)?.setData(
      accuracyRef.current,
    );
    if (map.getLayer("incident-event-pulse")) {
      map.setFilter("incident-event-pulse", ["==", ["get", "id"], pulseIncidentId ?? ""]);
    }

    const located = new Set(incidents.filter(mappable).map((item) => item.id));
    const previous = locatedIdsRef.current;
    let changed = 0;
    for (const id of located) if (!previous.has(id)) changed++;
    for (const id of previous) if (!located.has(id)) changed++;
    locatedIdsRef.current = located;
    const arriving = incidents.find((item) => item.id === pulseIncidentId && mappable(item));
    if (!selectedId && changed > 1) {
      fitToIncidents(map, incidents, 600);
    } else if (!selectedId && arriving && !map.getBounds().contains([arriving.lon, arriving.lat])) {
      fitToIncidents(map, incidents, 600);
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
  }, [incidents, onSelect, pendingRemovalId, pulseIncidentId, selectedId, filterPriority]);

  useEffect(() => {
    if (!containerRef.current) return;

    const pmtilesUrl = `${window.location.origin}/demo.pmtiles`;
    const p = new pmtiles.PMTiles(pmtilesUrl);
    protocol.add(p);

    const initialStyle = getProtomapsStyle(basemapThemeRef.current, pmtilesUrl);

    let map: maplibregl.Map;
    let animationFrame = 0;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        center: CENTER,
        zoom: 13.5,
        minZoom: 10,
        maxZoom: 18,
        maxBounds: [
          [-74.85, 40.20],
          [-74.10, 40.80],
        ],
        attributionControl: false,
        style: initialStyle,
      });
    } catch {
      modeRef.current = "fallback";
      setMode("fallback");
      return;
    }

    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Only a failure before the first load (no WebGL, missing basemap) means the grid fallback.
    // Later errors (a missing glyph range or sprite icon) are non-fatal: keep the live map.
    const handleError = () => {
      if (modeRef.current === "loading") {
        modeRef.current = "fallback";
        setMode("fallback");
      }
    };
    map.on("error", handleError);
    map.on("load", () => {
      map.resize();

      const sources = incidentSources(dataRef.current, accuracyRef.current);
      for (const [id, source] of Object.entries(sources)) map.addSource(id, source);
      for (const layer of incidentLayers(pulseRef.current)) map.addLayer(layer);

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

        const header = document.createElement("div");
        header.className = "map-popup-header";
        const badge = document.createElement("span");
        badge.className = `map-popup-priority map-popup-priority--${incident.priority.color}`;
        badge.textContent = incident.priority.name;
        const label = document.createElement("strong");
        label.textContent = incident.hazard.name.replaceAll("_", " ");
        header.append(badge, label);
        popup.append(header);

        const frameLabel = document.createElement("div");
        frameLabel.className = "map-popup-frame-label";
        frameLabel.textContent = "Compressed Frame (18B):";
        const frameCode = document.createElement("code");
        frameCode.className = "map-popup-hex";
        frameCode.textContent = incident.frame_hex;
        popup.append(frameLabel, frameCode);

        const summary = document.createElement("div");
        summary.className = "map-popup-summary";
        const people = incident.adults + incident.children;
        const details = [
          incident.status.name,
          `${people} ${people === 1 ? "person" : "people"}`,
          ...incident.medical,
        ].filter(Boolean);
        summary.textContent = details.join(" · ");
        popup.append(summary);

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

      // Soft pulse on the newest pin (§ new pins appear in real time).
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const animatePulse = (timestamp: number) => {
          if (map.getLayer("incident-event-pulse")) {
            const phase = (Math.sin(timestamp / 260) + 1) / 2;
            map.setPaintProperty("incident-event-pulse", "circle-radius", 12 + phase * 16);
            map.setPaintProperty("incident-event-pulse", "circle-opacity", 0.38 * (1 - phase));
          }
          animationFrame = window.requestAnimationFrame(animatePulse);
        };
        animationFrame = window.requestAnimationFrame(animatePulse);
      }

      modeRef.current = "ready";
      setMode("ready");
      fitToIncidents(map, incidentsRef.current, 0);
      locatedIdsRef.current = new Set(
        incidentsRef.current.filter(mappable).map((item) => item.id),
      );
    });

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
      map.off("error", handleError);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    basemapThemeRef.current = theme;
    const map = mapRef.current;
    if (!map || modeRef.current !== "ready") return;

    // Swap the basemap (layers, glyphs, sprite) and carry the incident sources and layers across.
    const nextStyle = getProtomapsStyle(theme, `${window.location.origin}/demo.pmtiles`);
    map.setStyle(nextStyle, {
      transformStyle: (_previous, next) => ({
        ...next,
        sources: { ...next.sources, ...incidentSources(dataRef.current, accuracyRef.current) },
        layers: [...next.layers, ...incidentLayers(pulseRef.current)],
      }),
    });
  }, [theme]);

  return (
    <div className={`map-stage ${theme === "light" ? "is-light-theme" : ""}`}>
      {/* MapLibre Canvas filling 100% of viewport */}
      <div
        className={[
          "map-canvas",
          mode === "fallback" ? "is-hidden" : "",
          theme === "light" ? "is-light-theme" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={containerRef}
      />

      {mode === "fallback" && (
        <FallbackGrid
          incidents={incidents}
          onSelect={onSelect}
          pendingRemovalId={pendingRemovalId}
          selectedId={selectedId}
          theme={theme}
        />
      )}

      {mode === "loading" && (
        <div className="map-loading">
          <MapPinned aria-hidden="true" size={24} />
          <span>Initializing offline map</span>
        </div>
      )}



      {/* Triage legend: top-right, under the action buttons */}
      <div aria-label="Triage legend" className="map-legend-card">
        {LEGEND.map(({ color, label }) => (
          <span data-priority={color} key={color}>
            <i aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>

      {/* Floating Bottom-Right Controls: Recenter + Google Maps Vertical Zoom Group */}
      <div className="floating-map-controls" aria-label="Map navigation controls">
        <button
          aria-label="Recenter map on incidents"
          className="map-control-btn recenter-btn"
          disabled={mode !== "ready"}
          onClick={recenterMap}
          title="Recenter on incidents"
          type="button"
        >
          <LocateFixed size={18} />
        </button>
        <div className="map-zoom-group">
          <button
            aria-label="Zoom in"
            className="map-control-btn zoom-btn"
            disabled={mode !== "ready"}
            onClick={handleZoomIn}
            title="Zoom in"
            type="button"
          >
            <Plus size={18} />
          </button>
          <span className="zoom-divider" />
          <button
            aria-label="Zoom out"
            className="map-control-btn zoom-btn"
            disabled={mode !== "ready"}
            onClick={handleZoomOut}
            title="Zoom out"
            type="button"
          >
            <Minus size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
