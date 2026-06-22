import type { Waypoint } from "@droneroute/shared";

export const COMPACT_WAYPOINT_RENDER_THRESHOLD = 500;
export const COMPACT_SELECTED_MARKER_LIMIT = 50;

export type LatLngBoundsTuple = [[number, number], [number, number]];

export function shouldUseCompactWaypointRendering(
  waypointCount: number,
): boolean {
  return waypointCount > COMPACT_WAYPOINT_RENDER_THRESHOLD;
}

export function shouldRenderSelectedWaypointMarkers(
  selectedCount: number,
): boolean {
  return selectedCount > 0 && selectedCount <= COMPACT_SELECTED_MARKER_LIMIT;
}

export function waypointHasPhotoAction(waypoint: Pick<Waypoint, "actions">) {
  return waypoint.actions.some((action) => action.actionType === "takePhoto");
}

export function getWaypointBounds(
  waypoints: Pick<Waypoint, "latitude" | "longitude">[],
): LatLngBoundsTuple | null {
  if (waypoints.length === 0) return null;

  let minLat = waypoints[0].latitude;
  let maxLat = waypoints[0].latitude;
  let minLng = waypoints[0].longitude;
  let maxLng = waypoints[0].longitude;

  for (const waypoint of waypoints) {
    minLat = Math.min(minLat, waypoint.latitude);
    maxLat = Math.max(maxLat, waypoint.latitude);
    minLng = Math.min(minLng, waypoint.longitude);
    maxLng = Math.max(maxLng, waypoint.longitude);
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

export function compactSurveyWaypoints(waypoints: Waypoint[]): Waypoint[] {
  const photoWaypoints = waypoints.filter(waypointHasPhotoAction);
  return photoWaypoints.length > 0 ? photoWaypoints : waypoints;
}
