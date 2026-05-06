import {
  DEFAULT_GRID_PARAMS,
  DEFAULT_PHOTOGRAMMETRY_PARAMS,
  generateGrid,
  generatePhotogrammetry,
  type GridParams,
  type PhotogrammetryParams,
} from "./templates";

const EARTH_RADIUS_M = 6371000;

function assertOk(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function rectangleAround(
  center: [number, number],
  widthM: number,
  heightM: number,
): { corner1: [number, number]; corner2: [number, number] } {
  const [lat, lng] = center;
  const halfHeightDeg = (heightM / 2 / EARTH_RADIUS_M) * (180 / Math.PI);
  const halfWidthDeg =
    (widthM / 2 / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180))) *
    (180 / Math.PI);

  return {
    corner1: [lat - halfHeightDeg, lng - halfWidthDeg],
    corner2: [lat + halfHeightDeg, lng + halfWidthDeg],
  };
}

function gridParams(overrides: Partial<GridParams> = {}): GridParams {
  return {
    ...DEFAULT_GRID_PARAMS,
    ...rectangleAround([37.7749, -122.4194], 120, 90),
    ...overrides,
  };
}

function photogrammetryParams(
  overrides: Partial<PhotogrammetryParams> = {},
): PhotogrammetryParams {
  return {
    ...DEFAULT_PHOTOGRAMMETRY_PARAMS,
    ...rectangleAround([37.7749, -122.4194], 120, 90),
    ...overrides,
  };
}

function assertEveryWaypointTakesPhoto(
  waypoints: ReturnType<typeof generateGrid>["waypoints"],
): void {
  assertOk(waypoints.length > 0, "expected generated waypoints");
  assertEqual(
    waypoints.every((wp) =>
      wp.actions.some((action) => action.actionType === "takePhoto"),
    ),
    true,
    "expected every generated capture waypoint to include a takePhoto action",
  );
}

function assertInsideRectangle(
  waypoints: ReturnType<typeof generateGrid>["waypoints"],
  corner1: [number, number],
  corner2: [number, number],
): void {
  const minLat = Math.min(corner1[0], corner2[0]) - 1e-8;
  const maxLat = Math.max(corner1[0], corner2[0]) + 1e-8;
  const minLng = Math.min(corner1[1], corner2[1]) - 1e-8;
  const maxLng = Math.max(corner1[1], corner2[1]) + 1e-8;

  for (const wp of waypoints) {
    assertOk(wp.latitude >= minLat, `latitude below rectangle: ${wp.latitude}`);
    assertOk(wp.latitude <= maxLat, `latitude above rectangle: ${wp.latitude}`);
    assertOk(
      wp.longitude >= minLng,
      `longitude left of rectangle: ${wp.longitude}`,
    );
    assertOk(
      wp.longitude <= maxLng,
      `longitude right of rectangle: ${wp.longitude}`,
    );
  }
}

function bearingDeg(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const toDeg = (value: number) => (value * 180) / Math.PI;
  const dLng = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLng) * Math.cos(toRad(to.latitude));
  const x =
    Math.cos(toRad(from.latitude)) * Math.sin(toRad(to.latitude)) -
    Math.sin(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function axialTrackSet(
  waypoints: ReturnType<typeof generatePhotogrammetry>["waypoints"],
): Set<number> {
  const axes = new Set<number>();
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    if (prev.height !== curr.height) continue;
    if (prev.gimbalPitchAngle !== curr.gimbalPitchAngle) continue;

    const bearing = bearingDeg(prev, curr);
    const axis = bearing > 180 ? bearing - 180 : bearing;
    axes.add(Math.round(axis / 15) * 15);
  }
  return axes;
}

function testGridProducesInteriorPhotoWaypoints(): void {
  const params = gridParams({
    spacingMode: "manual",
    spacingM: 30,
    photoSpacingM: 25,
    addPhotos: true,
    rotationDeg: 0,
  });
  const result = generateGrid(params);
  const latitudeLines = new Map<string, number>();
  for (const wp of result.waypoints) {
    const key = wp.latitude.toFixed(7);
    latitudeLines.set(key, (latitudeLines.get(key) ?? 0) + 1);
  }

  assertOk(
    result.waypoints.length > latitudeLines.size * 2,
    "expected more than two endpoint waypoints per survey pass",
  );
  assertOk(
    [...latitudeLines.values()].some((count) => count > 2),
    "expected at least one pass with interior capture waypoints",
  );
  assertEveryWaypointTakesPhoto(result.waypoints);
}

function testOverlapPresetDensity(): void {
  const fastest = generateGrid(gridParams({ overlapPreset: "fastest" }))
    .waypoints.length;
  const defaultCount = generateGrid(gridParams({ overlapPreset: "default" }))
    .waypoints.length;
  const highQuality = generateGrid(gridParams({ overlapPreset: "highQuality" }))
    .waypoints.length;

  assertOk(fastest < defaultCount, "default should exceed fastest density");
  assertOk(
    defaultCount < highQuality,
    "high quality should exceed default density",
  );
}

function testAltitudeChangesDensity(): void {
  const lowAltitude = generateGrid(
    gridParams({ altitude: 50, overlapPreset: "default" }),
  ).waypoints.length;
  const highAltitude = generateGrid(
    gridParams({ altitude: 120, overlapPreset: "default" }),
  ).waypoints.length;

  assertOk(
    highAltitude < lowAltitude,
    "higher altitude should increase FOV-derived spacing and reduce waypoints",
  );
}

function testRotatedGridIsClipped(): void {
  const params = gridParams({ rotationDeg: 37, overlapPreset: "highQuality" });
  const result = generateGrid(params);
  assertInsideRectangle(result.waypoints, params.corner1, params.corner2);
}

function testPhotogrammetryDefaultLayers(): void {
  const result = generatePhotogrammetry(
    photogrammetryParams({ overlapPreset: "default" }),
  );
  const altitudes = new Set(result.waypoints.map((wp) => wp.height));
  const pitches = new Set(result.waypoints.map((wp) => wp.gimbalPitchAngle));

  assertOk(altitudes.size >= 2, "default should emit multiple altitudes");
  assertOk(pitches.size >= 2, "default should emit nadir and oblique pitches");
  assertOk(
    axialTrackSet(result.waypoints).size >= 2,
    "default should emit multiple survey directions",
  );
  assertEveryWaypointTakesPhoto(result.waypoints);
}

function testPhotogrammetryHighQualityIsRicher(): void {
  const defaultResult = generatePhotogrammetry(
    photogrammetryParams({ overlapPreset: "default" }),
  );
  const highQualityResult = generatePhotogrammetry(
    photogrammetryParams({ overlapPreset: "highQuality" }),
  );

  assertOk(
    highQualityResult.waypoints.length > defaultResult.waypoints.length,
    "high quality should emit more capture waypoints than default",
  );
  assertOk(
    axialTrackSet(highQualityResult.waypoints).size >
      axialTrackSet(defaultResult.waypoints).size,
    "high quality should emit more survey directions than default",
  );
}

testGridProducesInteriorPhotoWaypoints();
testOverlapPresetDensity();
testAltitudeChangesDensity();
testRotatedGridIsClipped();
testPhotogrammetryDefaultLayers();
testPhotogrammetryHighQualityIsRicher();

console.log("template tests passed");
