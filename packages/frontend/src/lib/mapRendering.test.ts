import type { Waypoint } from "@droneroute/shared";
import {
  COMPACT_WAYPOINT_RENDER_THRESHOLD,
  compactSurveyWaypoints,
  getWaypointBounds,
  shouldRenderSelectedWaypointMarkers,
  shouldUseCompactWaypointRendering,
  waypointHasPhotoAction,
} from "./mapRendering";

function assertOk(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function waypoint(index: number, overrides: Partial<Waypoint> = {}): Waypoint {
  return {
    index,
    name: `Waypoint ${index + 1}`,
    latitude: 41 + index * 0.001,
    longitude: 2 + index * 0.001,
    height: 80,
    speed: 7,
    useGlobalSpeed: true,
    useGlobalHeight: true,
    useGlobalHeadingParam: true,
    useGlobalTurnParam: true,
    gimbalPitchAngle: -90,
    actions: [],
    ...overrides,
  };
}

function testCompactThreshold(): void {
  assertEqual(
    shouldUseCompactWaypointRendering(COMPACT_WAYPOINT_RENDER_THRESHOLD),
    false,
    "threshold value should still render normal waypoint markers",
  );
  assertEqual(
    shouldUseCompactWaypointRendering(COMPACT_WAYPOINT_RENDER_THRESHOLD + 1),
    true,
    "values above threshold should render compact survey overlays",
  );
}

function testSelectedMarkerLimit(): void {
  assertEqual(
    shouldRenderSelectedWaypointMarkers(0),
    false,
    "zero selected waypoints should not render selected markers",
  );
  assertEqual(
    shouldRenderSelectedWaypointMarkers(1),
    true,
    "one selected waypoint should render an editable marker",
  );
  assertEqual(
    shouldRenderSelectedWaypointMarkers(51),
    false,
    "large selections should stay locked in compact rendering",
  );
}

function testBounds(): void {
  const bounds = getWaypointBounds([
    waypoint(0, { latitude: 41.2, longitude: 2.4 }),
    waypoint(1, { latitude: 41.5, longitude: 2.1 }),
    waypoint(2, { latitude: 41.1, longitude: 2.6 }),
  ]);

  assertOk(bounds, "expected bounds");
  assertEqual(bounds?.[0][0], 41.1, "minimum latitude should match");
  assertEqual(bounds?.[0][1], 2.1, "minimum longitude should match");
  assertEqual(bounds?.[1][0], 41.5, "maximum latitude should match");
  assertEqual(bounds?.[1][1], 2.6, "maximum longitude should match");
}

function testPhotoFiltering(): void {
  const photoWaypoint = waypoint(1, {
    actions: [
      {
        actionId: 1,
        actionType: "takePhoto",
        params: { payloadPositionIndex: 0 },
      },
    ],
  });
  const hoverWaypoint = waypoint(2, {
    actions: [{ actionId: 2, actionType: "hover", params: { hoverTime: 2 } }],
  });

  assertEqual(
    waypointHasPhotoAction(photoWaypoint),
    true,
    "photo waypoint should be detected",
  );
  assertEqual(
    waypointHasPhotoAction(hoverWaypoint),
    false,
    "non-photo waypoint should not be detected as a capture point",
  );

  const compact = compactSurveyWaypoints([
    waypoint(0),
    photoWaypoint,
    hoverWaypoint,
  ]);
  assertEqual(compact.length, 1, "compact survey should prefer photo points");
  assertEqual(compact[0].index, 1, "compact survey should keep photo point");

  const noPhotos = compactSurveyWaypoints([waypoint(3), hoverWaypoint]);
  assertEqual(
    noPhotos.length,
    2,
    "compact survey should fall back to all waypoints without photos",
  );
}

testCompactThreshold();
testSelectedMarkerLimit();
testBounds();
testPhotoFiltering();

console.log("mapRendering tests passed");
