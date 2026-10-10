import type { FeatureCollection, Point } from "geojson";
import { Crosshair, Layers3, MapPinned } from "lucide-react";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Incident, PriorityColor } from "../types/incident";

interface OperationsMapProps {
  incidents: Incident[];
}

type MapMode = "loading" | "ready" | "fallback";

const CENTER: [number, number] = [-97.7431, 30.2672];

export const TRIAGE_COLORS: Record<PriorityColor, string> = {
  red: "#FF4D5E",
  yellow: "#F6C344",
  green: "#35C978",
  black: "#111827",
};

function mappable(incident: Incident): boolean {
  return (
    incident.state === "active" &&
    incident.gps_accuracy.name !== "NO_FIX"
  );
}

function fallbackPosition(incident: Incident) {
  const longitudeSpan = 0.06;
  const latitudeSpan = 0.045;
  const left = 50 + ((incident.lon - CENTER[0]) / longitudeSpan) * 50;
  const top = 50 - ((incident.lat - CENTER[1]) / latitudeSpan) * 50;
  return {
    left: Math.min(96, Math.max(4, left)) + "%",
    top: Math.min(94, Math.max(6, top)) + "%",
  };
}

function FallbackGrid({ incidents }: { incidents: Incident[] }) {
  return (
    <div className="fallback-grid" role="img" aria-label="Dark grid incident map">
      {incidents.filter(mappable).map((incident) => (
        <button
          className="fallback-pin"
          data-priority={incident.priority.color}
          key={incident.id}
          style={fallbackPosition(incident)}
          type="button"
          title={
            incident.priority.name +
            " · " +
            incident.hazard.name.replaceAll("_", " ")
          }
          aria-label={
            incident.priority.name +
            " " +
            incident.hazard.name.replaceAll("_", " ")
          }
        >
          <span />
        </button>
      ))}
    </div>
  );
}

export function OperationsMap({ incidents }: OperationsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mode, setMode] = useState<MapMode>("loading");
  const points = useMemo(
    () => incidents.filter(mappable),
    [incidents],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        center: CENTER,
        zoom: 12.2,
        attributionControl: false,
        style: {
          version: 8,
          sources: {},
          layers: [],
        },
      });
    } catch {
      setMode("fallback");
      return;
    }

    mapRef.current = map;
    const handleError = () => setMode("fallback");

    map.on("error", handleError);
    map.on("load", () => {
      const data: FeatureCollection<
        Point,
        { id: string; priority: PriorityColor; label: string }
      > = {
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
          },
        })),
      };

      map.addSource("incidents", {
        type: "geojson",
        data,
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
          "circle-stroke-width": 2,
          "circle-stroke-color": [
            "match",
            ["get", "priority"],
            "black",
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
        const coordinates = feature?.geometry.type === "Point"
          ? feature.geometry.coordinates
          : null;
        if (!feature || !coordinates) return;
        const popup = document.createElement("div");
        popup.className = "map-popup";
        popup.textContent = String(feature.properties?.label ?? "Incident")
          .replaceAll("_", " ");
        new maplibregl.Popup({ closeButton: false, offset: 14 })
          .setLngLat([coordinates[0], coordinates[1]])
          .setDOMContent(popup)
          .addTo(map);
      });
      setMode("ready");
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    return () => {
      map.off("error", handleError);
      map.remove();
      mapRef.current = null;
    };
  }, [points]);

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
                ? "Offline canvas"
                : "Initializing"}
          </span>
          <span className="map-coordinate">
            <Crosshair size={14} aria-hidden="true" />
            30.2672, -97.7431
          </span>
        </div>
      </div>

      <div className="map-stage">
        <div
          className={mode === "fallback" ? "map-canvas is-hidden" : "map-canvas"}
          ref={containerRef}
        />
        {mode === "fallback" && <FallbackGrid incidents={incidents} />}
        {mode === "loading" && (
          <div className="map-loading">
            <MapPinned size={24} aria-hidden="true" />
            Initializing offline map
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
      </div>
    </section>
  );
}
