import {
  MapContainer,
  TileLayer,
  LayersControl,
  useMapEvents,
  useMap,
  Polyline,
  Rectangle,
} from "react-leaflet";
import L from "leaflet";
import { useMissionStore } from "@/store/missionStore";
import { calculateIdealGimbalPitch, getObstacleWarnings } from "@/lib/geo";
import {
  compactSurveyWaypoints,
  getWaypointBounds,
  shouldRenderSelectedWaypointMarkers,
  shouldUseCompactWaypointRendering,
} from "@/lib/mapRendering";
import { WaypointMarker } from "./WaypointMarker";
import { WaypointDotLayer } from "./WaypointDotLayer";
import { PoiMarker } from "./PoiMarker";
import { MapToolbar } from "./MapToolbar";
import { MapSearch } from "./MapSearch";
import { TemplateDrawHandler } from "./TemplateDrawHandler";
import { PencilDrawHandler } from "./PencilDrawHandler";
import { ObstacleDrawHandler } from "./ObstacleDrawHandler";
import { ObstaclePolygon } from "./ObstaclePolygon";
import { useEffect, useRef, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";

function eventStartedInMapControl(event: L.LeafletMouseEvent): boolean {
  const target = event.originalEvent.target;
  return (
    target instanceof Element &&
    target.closest("[data-map-control='true']") !== null
  );
}

function MapClickHandler() {
  const {
    isAddingWaypoint,
    isAddingPoi,
    templateMode,
    isDrawingObstacle,
    addWaypoint,
    addPoi,
  } = useMissionStore();

  useMapEvents({
    click(e) {
      if (eventStartedInMapControl(e)) return;
      if (templateMode || isDrawingObstacle) return; // These modes handle their own interactions
      if (isAddingWaypoint) {
        addWaypoint(e.latlng.lat, e.latlng.lng);
      } else if (isAddingPoi) {
        addPoi(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
}

/** Expose the Leaflet map instance on the container for external automation. */
function ExposeMapInstance() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    (container as any)._leaflet_map = map;
  }, [map]);
  return null;
}

/**
 * Automatically fits the map to show all waypoints when a mission is loaded
 * (import or saved route). Triggers when waypoints go from 0 to N.
 */
function FitBoundsOnLoad() {
  const map = useMap();
  const waypoints = useMissionStore((s) => s.waypoints);
  const pois = useMissionStore((s) => s.pois);
  const obstacles = useMissionStore((s) => s.obstacles);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const wasEmpty = prevCountRef.current === 0;
    prevCountRef.current = waypoints.length;

    // Only fit bounds when loading a mission (0 → 2+ waypoints at once),
    // not when manually placing the first waypoint (0 → 1)
    if (!wasEmpty || waypoints.length < 2) return;

    const points: L.LatLngExpression[] = [
      ...waypoints.map((wp) => [wp.latitude, wp.longitude] as [number, number]),
      ...pois.map((p) => [p.latitude, p.longitude] as [number, number]),
      ...obstacles.flatMap((o) =>
        o.vertices.map((v) => [v[0], v[1]] as [number, number]),
      ),
    ];

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [waypoints, pois, obstacles, map]);

  return null;
}

function FlightPath() {
  const waypoints = useMissionStore((s) => s.waypoints);
  const obstacles = useMissionStore((s) => s.obstacles);
  const compactPath = shouldUseCompactWaypointRendering(waypoints.length);

  const warnings = useMemo(
    () => getObstacleWarnings(waypoints, obstacles),
    [waypoints, obstacles],
  );

  // Set of segment start indices that have crossing warnings
  const warningSegments = useMemo(() => {
    const set = new Set<number>();
    for (const w of warnings) {
      if (w.type === "crosses") set.add(w.waypointIndex);
    }
    return set;
  }, [warnings]);

  if (waypoints.length < 2) return null;

  if (compactPath) {
    const positions = waypoints.map(
      (wp) => [wp.latitude, wp.longitude] as [number, number],
    );

    return (
      <Polyline
        positions={positions}
        pathOptions={{
          color: warningSegments.size > 0 ? "#ef4444" : "#3b82f6",
          weight: 2,
          opacity: 0.46,
          dashArray: "10, 8",
        }}
      />
    );
  }

  const segments = waypoints.slice(0, -1).map((wp, i) => {
    const next = waypoints[i + 1];
    const duration = Math.max(0.5, Math.min(5, 2 * (7 / wp.speed)));
    const hasWarning = warningSegments.has(wp.index);
    return {
      key: `seg-${wp.index}-${next.index}`,
      positions: [
        [wp.latitude, wp.longitude] as [number, number],
        [next.latitude, next.longitude] as [number, number],
      ],
      duration,
      hasWarning,
    };
  });

  return (
    <>
      {segments.map((seg) => (
        <Polyline
          key={seg.key}
          positions={seg.positions}
          pathOptions={{
            color: seg.hasWarning ? "#ef4444" : "#3b82f6",
            weight: 3,
            opacity: 0.8,
            dashArray: "10, 6",
          }}
          eventHandlers={{
            add: (e) => {
              const el = (e.target as any)._path as SVGElement | undefined;
              if (el) {
                el.style.animation = `dash-flow ${seg.duration.toFixed(2)}s linear infinite`;
              }
            },
          }}
        />
      ))}
    </>
  );
}

function LargeWaypointOverlay() {
  const waypoints = useMissionStore((s) => s.waypoints);
  const selectedWaypointIndices = useMissionStore(
    (s) => s.selectedWaypointIndices,
  );
  const [showDots, setShowDots] = useState(false);
  const bounds = useMemo(() => getWaypointBounds(waypoints), [waypoints]);
  const dotWaypoints = useMemo(
    () => compactSurveyWaypoints(waypoints),
    [waypoints],
  );

  if (!bounds) return null;

  const selected = selectedWaypointIndices.size > 0;
  const showDotLayer = showDots || selected;

  return (
    <>
      <Rectangle
        bounds={bounds}
        pathOptions={{
          color: selected ? "#fbbf24" : "#8b5cf6",
          weight: selected ? 3 : 2,
          opacity: selected ? 0.9 : 0.82,
          fillColor: "#8b5cf6",
          fillOpacity: showDotLayer ? 0.05 : 0.1,
        }}
        eventHandlers={{
          click: (event: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(event.originalEvent);
            setShowDots((value) => !value);
          },
        }}
      />
      {showDotLayer && (
        <WaypointDotLayer
          waypoints={dotWaypoints}
          selectedWaypointIndices={selectedWaypointIndices}
        />
      )}
    </>
  );
}

/** Dotted lines from waypoints to their referenced POI */
function PoiPointingLines() {
  const waypoints = useMissionStore((s) => s.waypoints);
  const pois = useMissionStore((s) => s.pois);

  const lines: {
    from: [number, number];
    to: [number, number];
    key: string;
    perfect: boolean;
  }[] = [];

  for (const wp of waypoints) {
    if (wp.headingMode === "towardPOI" && wp.poiId) {
      const poi = pois.find((p) => p.id === wp.poiId);
      if (poi) {
        const { pitch } = calculateIdealGimbalPitch(wp, poi);
        lines.push({
          from: [wp.latitude, wp.longitude],
          to: [poi.latitude, poi.longitude],
          key: `poi-line-${wp.index}-${poi.id}`,
          perfect: wp.gimbalPitchAngle === pitch,
        });
      }
    }
  }

  return (
    <>
      {lines.map((line) => (
        <Polyline
          key={line.key}
          positions={[line.from, line.to]}
          pathOptions={{
            color: line.perfect ? "#4ade80" : "#ef4444",
            weight: line.perfect ? 3 : 2,
            opacity: line.perfect ? 0.8 : 0.6,
            dashArray: line.perfect ? undefined : "4, 8",
          }}
        />
      ))}
    </>
  );
}

export function MapView() {
  const waypoints = useMissionStore((s) => s.waypoints);
  const selectedWaypointIndices = useMissionStore(
    (s) => s.selectedWaypointIndices,
  );
  const pois = useMissionStore((s) => s.pois);
  const obstacles = useMissionStore((s) => s.obstacles);
  const isAddingWaypoint = useMissionStore((s) => s.isAddingWaypoint);
  const isAddingPoi = useMissionStore((s) => s.isAddingPoi);
  const isDrawingObstacle = useMissionStore((s) => s.isDrawingObstacle);
  const templateMode = useMissionStore((s) => s.templateMode);

  const cursorClass =
    templateMode === "pencil"
      ? "map-tool-pencil"
      : templateMode
        ? "map-tool-template"
        : isDrawingObstacle
          ? "map-tool-obstacle"
          : isAddingWaypoint
            ? "map-tool-waypoint"
            : isAddingPoi
              ? "map-tool-poi"
              : "";
  const compactWaypoints = shouldUseCompactWaypointRendering(waypoints.length);
  const markerWaypoints = useMemo(() => {
    if (!compactWaypoints) return waypoints;
    if (!shouldRenderSelectedWaypointMarkers(selectedWaypointIndices.size)) {
      return [];
    }
    return waypoints.filter((waypoint) =>
      selectedWaypointIndices.has(waypoint.index),
    );
  }, [compactWaypoints, selectedWaypointIndices, waypoints]);

  return (
    <div className={`relative h-full w-full ${cursorClass}`}>
      <MapContainer
        center={[41.3874, 2.1686]}
        zoom={13}
        className="h-full w-full z-0"
        zoomControl={false}
      >
        <LayersControl position="bottomleft">
          <LayersControl.BaseLayer checked name="Street">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com">Esri</a>'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        <MapClickHandler />
        <ExposeMapInstance />
        <MapSearch />
        <FitBoundsOnLoad />
        <FlightPath />
        <PoiPointingLines />
        {compactWaypoints && <LargeWaypointOverlay />}
        <TemplateDrawHandler />
        <PencilDrawHandler />
        <ObstacleDrawHandler />
        {obstacles.map((obstacle) => (
          <ObstaclePolygon key={obstacle.id} obstacle={obstacle} />
        ))}
        {markerWaypoints.map((wp) => (
          <WaypointMarker key={wp.index} waypoint={wp} />
        ))}
        {pois.map((poi) => (
          <PoiMarker key={poi.id} poi={poi} />
        ))}
      </MapContainer>
      <MapToolbar />
    </div>
  );
}
