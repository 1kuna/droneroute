import { useMemo } from "react";
import { CircleMarker, Polyline, Rectangle } from "react-leaflet";
import type { Waypoint } from "@droneroute/shared";
import type { TemplateResult } from "@/lib/templates";
import {
  compactSurveyWaypoints,
  getWaypointBounds,
  shouldUseCompactWaypointRendering,
} from "@/lib/mapRendering";
import { WaypointDotLayer } from "./WaypointDotLayer";

interface TemplatePreviewProps {
  result: TemplateResult;
}

export function TemplatePreview({ result }: TemplatePreviewProps) {
  const { waypoints, pois } = result;
  const indexedWaypoints = useMemo<Waypoint[]>(
    () =>
      waypoints.map((waypoint, index) => ({
        ...waypoint,
        index,
        name: `Preview waypoint ${index + 1}`,
      })),
    [waypoints],
  );
  const compactPreview = shouldUseCompactWaypointRendering(waypoints.length);
  const bounds = compactPreview ? getWaypointBounds(indexedWaypoints) : null;

  // Build polyline from waypoint positions
  const positions: [number, number][] = waypoints.map((wp) => [
    wp.latitude,
    wp.longitude,
  ]);

  return (
    <>
      {bounds && (
        <Rectangle
          bounds={bounds}
          pathOptions={{
            color: "#8b5cf6",
            weight: 2,
            opacity: 0.82,
            fillColor: "#8b5cf6",
            fillOpacity: 0.08,
          }}
        />
      )}

      {/* Flight path preview */}
      {positions.length >= 2 && (
        <Polyline
          positions={positions}
          pathOptions={{
            color: "#a78bfa",
            weight: compactPreview ? 1.5 : 2,
            opacity: compactPreview ? 0.45 : 0.7,
            dashArray: "6, 4",
          }}
        />
      )}

      {/* Waypoint markers */}
      {compactPreview ? (
        <WaypointDotLayer
          waypoints={compactSurveyWaypoints(indexedWaypoints)}
        />
      ) : (
        waypoints.map((wp, i) => (
          <CircleMarker
            key={`preview-wp-${i}`}
            center={[wp.latitude, wp.longitude]}
            radius={5}
            pathOptions={{
              color: "#a78bfa",
              fillColor: "#c4b5fd",
              fillOpacity: 0.8,
              weight: 2,
            }}
          />
        ))
      )}

      {/* POI markers */}
      {pois.map((poi, i) => (
        <CircleMarker
          key={`preview-poi-${i}`}
          center={[poi.latitude, poi.longitude]}
          radius={7}
          pathOptions={{
            color: "#f59e0b",
            fillColor: "#fbbf24",
            fillOpacity: 0.8,
            weight: 2,
          }}
        />
      ))}
    </>
  );
}
