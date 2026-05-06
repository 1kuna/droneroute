import type {
  Waypoint,
  PointOfInterest,
  WaypointAction,
} from "@droneroute/shared";
import { DEFAULT_WAYPOINT } from "@droneroute/shared";

// ── Helpers ──────────────────────────────────────────────

const EARTH_RADIUS_M = 6371000;
const MIN_SURVEY_SPACING_M = 3;
const MAX_OVERLAP_PCT = 95;

/** Move a lat/lng point by a distance (meters) and bearing (degrees, 0=N) */
function destinationPoint(
  lat: number,
  lng: number,
  distanceM: number,
  bearingDeg: number,
): [number, number] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);
  const brng = toRad(bearingDeg);
  const d = distanceM / EARTH_RADIUS_M;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [toDeg(lat2), toDeg(lng2)];
}

/** Bearing from point A to point B in degrees (0=N, 90=E) */
function bearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Haversine distance in meters */
function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function diagonalFovToHorizontalVertical(
  diagonalFovDeg: number,
  aspectWidth = 4,
  aspectHeight = 3,
): { horizontalFovDeg: number; verticalFovDeg: number } {
  const diagonalTan = Math.tan((diagonalFovDeg * Math.PI) / 360);
  const diagonal = Math.sqrt(aspectWidth ** 2 + aspectHeight ** 2);
  const horizontalTan = diagonalTan * (aspectWidth / diagonal);
  const verticalTan = diagonalTan * (aspectHeight / diagonal);

  return {
    horizontalFovDeg: round1((Math.atan(horizontalTan) * 360) / Math.PI),
    verticalFovDeg: round1((Math.atan(verticalTan) * 360) / Math.PI),
  };
}

// ── Camera and Overlap Presets ───────────────────────────

export type SurveySpacingMode = "fov" | "manual";
export type SurveyOverlapPreset =
  | "fastest"
  | "default"
  | "highQuality"
  | "custom";

export interface CameraProfile {
  id: string;
  label: string;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  payloadEnumValues?: number[];
  source: string;
}

export const OVERLAP_PRESETS: Record<
  Exclude<SurveyOverlapPreset, "custom">,
  { label: string; forwardOverlapPct: number; sideOverlapPct: number }
> = {
  fastest: {
    label: "Fastest",
    forwardOverlapPct: 70,
    sideOverlapPct: 60,
  },
  default: {
    label: "Default",
    forwardOverlapPct: 80,
    sideOverlapPct: 70,
  },
  highQuality: {
    label: "High quality",
    forwardOverlapPct: 85,
    sideOverlapPct: 80,
  },
};

const fov84 = diagonalFovToHorizontalVertical(84);
const fov821 = diagonalFovToHorizontalVertical(82.1);
const fov82 = diagonalFovToHorizontalVertical(82);

export const CAMERA_PROFILES: CameraProfile[] = [
  {
    id: "custom-84",
    label: "Custom / Generic 84° DFOV",
    ...fov84,
    source: "Generic 4:3 84° diagonal field of view",
  },
  {
    id: "mavic-3e-wide",
    label: "DJI Mavic 3E Wide",
    payloadEnumValues: [66],
    ...fov84,
    source: "DJI Mavic 3 Enterprise wide camera FOV 84°",
  },
  {
    id: "mavic-3t-wide",
    label: "DJI Mavic 3T Wide",
    payloadEnumValues: [67],
    ...fov84,
    source: "DJI Mavic 3 Enterprise wide camera FOV 84°",
  },
  {
    id: "mavic-3m-rgb",
    label: "DJI Mavic 3M RGB",
    payloadEnumValues: [68],
    ...fov84,
    source: "DJI Mavic 3M RGB camera FOV 84°",
  },
  {
    id: "mavic-3m-ms",
    label: "DJI Mavic 3M Multispectral",
    horizontalFovDeg: 61.2,
    verticalFovDeg: 48.1,
    source: "DJI Mavic 3M multispectral FOV 61.2° x 48.10°",
  },
  {
    id: "m30-wide",
    label: "DJI M30/M30T Wide",
    payloadEnumValues: [52, 53],
    ...fov84,
    source: "DJI Matrice 30 wide camera DFOV 84°",
  },
  {
    id: "h30-wide",
    label: "DJI Zenmuse H30/H30T Wide",
    payloadEnumValues: [82, 83],
    ...fov821,
    source: "DJI Zenmuse H30 wide-angle camera DFOV 82.1°",
  },
  {
    id: "matrice-3d-wide",
    label: "DJI Matrice 3D Wide",
    payloadEnumValues: [80],
    ...fov84,
    source: "DJI Dock 2 Matrice 3D wide-angle camera FOV 84°",
  },
  {
    id: "matrice-3td-wide",
    label: "DJI Matrice 3TD Wide",
    payloadEnumValues: [81],
    ...fov82,
    source: "DJI Dock 2 Matrice 3TD wide-angle camera FOV 82°",
  },
  {
    id: "mini-4-pro",
    label: "DJI Mini 4 Pro",
    payloadEnumValues: [100],
    ...fov821,
    source: "DJI Mini 4 Pro camera FOV 82.1°",
  },
];

export function getCameraProfileById(id: string): CameraProfile {
  return (
    CAMERA_PROFILES.find((profile) => profile.id === id) || CAMERA_PROFILES[0]
  );
}

export function getDefaultCameraProfileForPayload(
  payloadEnumValue?: number,
): CameraProfile {
  return (
    CAMERA_PROFILES.find((profile) =>
      profile.payloadEnumValues?.includes(payloadEnumValue ?? -1),
    ) || CAMERA_PROFILES[0]
  );
}

export function getCameraDefaultsForPayload(payloadEnumValue?: number): {
  cameraProfileId: string;
  horizontalFovDeg: number;
  verticalFovDeg: number;
} {
  const profile = getDefaultCameraProfileForPayload(payloadEnumValue);
  return {
    cameraProfileId: profile.id,
    horizontalFovDeg: profile.horizontalFovDeg,
    verticalFovDeg: profile.verticalFovDeg,
  };
}

// ── Template Types ───────────────────────────────────────

export type TemplateType =
  | "orbit"
  | "grid"
  | "photogrammetry"
  | "facade"
  | "pencil";

export interface OrbitParams {
  center: [number, number]; // [lat, lng]
  radiusM: number;
  altitude: number;
  numPoints: number;
  clockwise: boolean;
  createPoi: boolean;
}

export interface SurveyCameraParams {
  spacingMode: SurveySpacingMode;
  cameraProfileId: string;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  overlapPreset: SurveyOverlapPreset;
  forwardOverlapPct: number;
  sideOverlapPct: number;
  spacingM: number; // manual line spacing
  photoSpacingM: number; // manual along-track photo spacing
}

export interface GridParams extends SurveyCameraParams {
  corner1: [number, number]; // [lat, lng]
  corner2: [number, number]; // [lat, lng]
  altitude: number;
  addPhotos: boolean;
  rotationDeg: number; // rotation of the grid in degrees (-180..180)
  reverse: boolean; // fly the grid in reverse order
}

export interface PhotogrammetryParams extends SurveyCameraParams {
  corner1: [number, number]; // [lat, lng]
  corner2: [number, number]; // [lat, lng]
  baseAltitude: number;
  addPhotos: boolean;
  rotationDeg: number; // base rotation of the pattern in degrees (-180..180)
  reverse: boolean; // fly each generated layer in reverse order
}

export interface FacadeParams {
  point1: [number, number]; // [lat, lng] — one end of wall
  point2: [number, number]; // [lat, lng] — other end of wall
  distanceM: number; // distance from wall
  minAltitude: number;
  maxAltitude: number;
  numRows: number;
  numColumns: number;
  addPhotos: boolean;
}

export interface PencilParams {
  path: [number, number][]; // raw drawn points [lat, lng]
  numPoints: number; // target waypoint count
  altitude: number;
  speed: number;
  gimbalPitchAngle: number;
  reverse: boolean;
  poiId?: string; // optional POI to face during flight
}

export type TemplateParams =
  | OrbitParams
  | GridParams
  | PhotogrammetryParams
  | FacadeParams
  | PencilParams;

export interface TemplateResult {
  waypoints: Omit<Waypoint, "index" | "name">[];
  pois: Omit<PointOfInterest, "id">[];
}

export interface SurveySpacingResult {
  lineSpacingM: number;
  photoSpacingM: number;
  footprintWidthM: number;
  footprintLengthM: number;
  forwardOverlapPct: number;
  sideOverlapPct: number;
}

// ── Default Params ───────────────────────────────────────

const defaultCamera = getCameraDefaultsForPayload();

export const DEFAULT_ORBIT_PARAMS: Omit<OrbitParams, "center" | "radiusM"> = {
  altitude: 30,
  numPoints: 12,
  clockwise: true,
  createPoi: true,
};

export const DEFAULT_GRID_PARAMS: Omit<GridParams, "corner1" | "corner2"> = {
  altitude: 80,
  spacingMode: "fov",
  ...defaultCamera,
  overlapPreset: "default",
  forwardOverlapPct: OVERLAP_PRESETS.default.forwardOverlapPct,
  sideOverlapPct: OVERLAP_PRESETS.default.sideOverlapPct,
  spacingM: 30,
  photoSpacingM: 20,
  addPhotos: true,
  rotationDeg: 0,
  reverse: false,
};

export const DEFAULT_PHOTOGRAMMETRY_PARAMS: Omit<
  PhotogrammetryParams,
  "corner1" | "corner2"
> = {
  baseAltitude: 80,
  spacingMode: "fov",
  ...defaultCamera,
  overlapPreset: "default",
  forwardOverlapPct: OVERLAP_PRESETS.default.forwardOverlapPct,
  sideOverlapPct: OVERLAP_PRESETS.default.sideOverlapPct,
  spacingM: 30,
  photoSpacingM: 20,
  addPhotos: true,
  rotationDeg: 0,
  reverse: false,
};

export const DEFAULT_FACADE_PARAMS: Omit<FacadeParams, "point1" | "point2"> = {
  distanceM: 20,
  minAltitude: 10,
  maxAltitude: 30,
  numRows: 4,
  numColumns: 8,
  addPhotos: true,
};

export const DEFAULT_PENCIL_PARAMS: Omit<PencilParams, "path"> = {
  numPoints: 10,
  altitude: 30,
  speed: 7,
  gimbalPitchAngle: -45,
  reverse: false,
};

// ── Survey Spacing ───────────────────────────────────────

function normalizedOverlap(params: SurveyCameraParams): {
  forwardOverlapPct: number;
  sideOverlapPct: number;
} {
  if (params.overlapPreset !== "custom") {
    const preset = OVERLAP_PRESETS[params.overlapPreset];
    return {
      forwardOverlapPct: preset.forwardOverlapPct,
      sideOverlapPct: preset.sideOverlapPct,
    };
  }

  return {
    forwardOverlapPct: clamp(params.forwardOverlapPct, 0, MAX_OVERLAP_PCT),
    sideOverlapPct: clamp(params.sideOverlapPct, 0, MAX_OVERLAP_PCT),
  };
}

export function calculateSurveySpacing(
  params: SurveyCameraParams,
  altitude: number,
): SurveySpacingResult {
  const { forwardOverlapPct, sideOverlapPct } = normalizedOverlap(params);
  const horizontalFovDeg = clamp(
    params.horizontalFovDeg || fov84.horizontalFovDeg,
    1,
    179,
  );
  const verticalFovDeg = clamp(
    params.verticalFovDeg || fov84.verticalFovDeg,
    1,
    179,
  );
  const footprintWidthM =
    2 * altitude * Math.tan((horizontalFovDeg * Math.PI) / 360);
  const footprintLengthM =
    2 * altitude * Math.tan((verticalFovDeg * Math.PI) / 360);

  if (params.spacingMode === "manual") {
    return {
      lineSpacingM: Math.max(MIN_SURVEY_SPACING_M, params.spacingM),
      photoSpacingM: Math.max(MIN_SURVEY_SPACING_M, params.photoSpacingM),
      footprintWidthM,
      footprintLengthM,
      forwardOverlapPct,
      sideOverlapPct,
    };
  }

  return {
    lineSpacingM: Math.max(
      MIN_SURVEY_SPACING_M,
      footprintWidthM * (1 - sideOverlapPct / 100),
    ),
    photoSpacingM: Math.max(
      MIN_SURVEY_SPACING_M,
      footprintLengthM * (1 - forwardOverlapPct / 100),
    ),
    footprintWidthM,
    footprintLengthM,
    forwardOverlapPct,
    sideOverlapPct,
  };
}

// ── Generators ───────────────────────────────────────────

export function generateOrbit(params: OrbitParams): TemplateResult {
  const { center, radiusM, altitude, numPoints, clockwise, createPoi } = params;
  const [cLat, cLng] = center;

  const waypoints: TemplateResult["waypoints"] = [];
  const pois: TemplateResult["pois"] = [];

  // Optionally create a POI at the center
  const poiName = "Orbit center";

  if (createPoi) {
    pois.push({ name: poiName, latitude: cLat, longitude: cLng, height: 0 });
  }

  for (let i = 0; i < numPoints; i++) {
    const fraction = i / numPoints;
    // Start from North (0°), go clockwise or counter-clockwise
    const angleDeg = clockwise ? fraction * 360 : 360 - fraction * 360;
    const [lat, lng] = destinationPoint(cLat, cLng, radiusM, angleDeg);

    // Calculate heading angle toward center
    const headingAngle = bearing(lat, lng, cLat, cLng);
    // Normalize to -180..180 range expected by DJI
    const normalizedHeading =
      headingAngle > 180 ? headingAngle - 360 : headingAngle;

    // Calculate ideal gimbal pitch
    const horizontalDist = radiusM;
    const heightDiff = altitude; // drone is above POI at ground level
    const pitchRad = Math.atan2(heightDiff, horizontalDist);
    const gimbalPitch = Math.round(-pitchRad * (180 / Math.PI));

    waypoints.push({
      ...DEFAULT_WAYPOINT,
      latitude: lat,
      longitude: lng,
      height: altitude,
      speed: 5,
      useGlobalSpeed: false,
      useGlobalHeadingParam: false,
      headingMode: "fixed",
      headingAngle: Math.round(normalizedHeading),
      gimbalPitchAngle: gimbalPitch,
      turnMode: "toPointAndPassWithContinuityCurvature",
      useGlobalTurnParam: false,
      actions: [],
    });
  }

  return { waypoints, pois };
}

interface LocalPoint {
  x: number;
  y: number;
}

interface SurveyRectangle {
  centerLat: number;
  centerLng: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  widthM: number;
  heightM: number;
  cosCenterLat: number;
}

interface SurveyPatternParams {
  corner1: [number, number];
  corner2: [number, number];
  altitude: number;
  lineSpacingM: number;
  photoSpacingM: number;
  addPhotos: boolean;
  rotationDeg: number;
  reverse: boolean;
  gimbalPitchAngle: number;
}

function createTakePhotoAction(): WaypointAction {
  return {
    actionId: 0,
    actionType: "takePhoto",
    params: { payloadPositionIndex: 0 },
  };
}

function getSurveyRectangle(
  corner1: [number, number],
  corner2: [number, number],
): SurveyRectangle {
  const centerLat = (corner1[0] + corner2[0]) / 2;
  const centerLng = (corner1[1] + corner2[1]) / 2;
  const cosCenterLat = Math.cos((centerLat * Math.PI) / 180);

  const toLocal = (point: [number, number]): LocalPoint => ({
    x: ((point[1] - centerLng) * Math.PI * EARTH_RADIUS_M * cosCenterLat) / 180,
    y: ((point[0] - centerLat) * Math.PI * EARTH_RADIUS_M) / 180,
  });

  const p1 = toLocal(corner1);
  const p2 = toLocal(corner2);
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  return {
    centerLat,
    centerLng,
    minX,
    maxX,
    minY,
    maxY,
    widthM: maxX - minX,
    heightM: maxY - minY,
    cosCenterLat,
  };
}

function fromLocal(rect: SurveyRectangle, point: LocalPoint): [number, number] {
  return [
    rect.centerLat + (point.y / EARTH_RADIUS_M) * (180 / Math.PI),
    rect.centerLng +
      (point.x / (EARTH_RADIUS_M * rect.cosCenterLat)) * (180 / Math.PI),
  ];
}

function clipLineToRect(
  rect: SurveyRectangle,
  origin: LocalPoint,
  direction: LocalPoint,
): [LocalPoint, LocalPoint] | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  const eps = 1e-9;

  const applyAxis = (
    coord: number,
    delta: number,
    min: number,
    max: number,
  ): boolean => {
    if (Math.abs(delta) < eps) {
      return coord >= min && coord <= max;
    }

    const t1 = (min - coord) / delta;
    const t2 = (max - coord) / delta;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    return tMin <= tMax;
  };

  if (!applyAxis(origin.x, direction.x, rect.minX, rect.maxX)) return null;
  if (!applyAxis(origin.y, direction.y, rect.minY, rect.maxY)) return null;

  return [
    { x: origin.x + direction.x * tMin, y: origin.y + direction.y * tMin },
    { x: origin.x + direction.x * tMax, y: origin.y + direction.y * tMax },
  ];
}

function generateSegmentPoints(
  start: LocalPoint,
  end: LocalPoint,
  spacingM: number,
): LocalPoint[] {
  const lengthM = Math.hypot(end.x - start.x, end.y - start.y);
  if (lengthM < 0.5) return [];

  const count = Math.max(2, Math.ceil(lengthM / spacingM) + 1);
  const points: LocalPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    points.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    });
  }
  return points;
}

function generateSurveyPattern(
  params: SurveyPatternParams,
): TemplateResult["waypoints"] {
  const rect = getSurveyRectangle(params.corner1, params.corner2);
  if (rect.widthM < 0.5 || rect.heightM < 0.5) return [];

  const baseAngleDeg = rect.widthM >= rect.heightM ? 0 : 90;
  const angleRad = ((baseAngleDeg + params.rotationDeg) * Math.PI) / 180;
  const direction = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  const cross = { x: -direction.y, y: direction.x };

  const corners: LocalPoint[] = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
  ];
  const projections = corners.map(
    (corner) => corner.x * cross.x + corner.y * cross.y,
  );
  const minProjection = Math.min(...projections);
  const maxProjection = Math.max(...projections);
  const crossRangeM = maxProjection - minProjection;
  const passCount = Math.max(
    2,
    Math.ceil(
      crossRangeM / Math.max(MIN_SURVEY_SPACING_M, params.lineSpacingM),
    ) + 1,
  );

  const localPoints: LocalPoint[] = [];
  for (let pass = 0; pass < passCount; pass++) {
    const fraction = passCount <= 1 ? 0 : pass / (passCount - 1);
    const offset = minProjection + fraction * crossRangeM;
    const origin = { x: cross.x * offset, y: cross.y * offset };
    const segment = clipLineToRect(rect, origin, direction);
    if (!segment) continue;

    const [a, b] = pass % 2 === 1 ? [segment[1], segment[0]] : segment;
    localPoints.push(...generateSegmentPoints(a, b, params.photoSpacingM));
  }

  if (params.reverse) {
    localPoints.reverse();
  }

  return localPoints.map((point) => {
    const [latitude, longitude] = fromLocal(rect, point);
    return {
      ...DEFAULT_WAYPOINT,
      latitude,
      longitude,
      height: params.altitude,
      gimbalPitchAngle: params.gimbalPitchAngle,
      useGlobalHeadingParam: false,
      headingMode: "followWayline",
      turnMode: "toPointAndStopWithContinuityCurvature",
      useGlobalTurnParam: false,
      actions: params.addPhotos ? [createTakePhotoAction()] : [],
    };
  });
}

export function generateGrid(params: GridParams): TemplateResult {
  const spacing = calculateSurveySpacing(params, params.altitude);

  return {
    waypoints: generateSurveyPattern({
      corner1: params.corner1,
      corner2: params.corner2,
      altitude: params.altitude,
      lineSpacingM: spacing.lineSpacingM,
      photoSpacingM: spacing.photoSpacingM,
      addPhotos: params.addPhotos,
      rotationDeg: params.rotationDeg,
      reverse: params.reverse,
      gimbalPitchAngle: -90,
    }),
    pois: [],
  };
}

function getPhotogrammetryLayers(params: PhotogrammetryParams): {
  altitude: number;
  rotationDeg: number;
  gimbalPitchAngle: number;
}[] {
  const layerPreset =
    params.overlapPreset === "custom" ? "default" : params.overlapPreset;

  if (layerPreset === "fastest") {
    return [
      {
        altitude: params.baseAltitude,
        rotationDeg: params.rotationDeg,
        gimbalPitchAngle: -90,
      },
    ];
  }

  if (layerPreset === "highQuality") {
    return [
      {
        altitude: params.baseAltitude,
        rotationDeg: params.rotationDeg,
        gimbalPitchAngle: -90,
      },
      {
        altitude: Math.round(params.baseAltitude * 0.85),
        rotationDeg: params.rotationDeg + 90,
        gimbalPitchAngle: -90,
      },
      {
        altitude: Math.round(params.baseAltitude * 0.75),
        rotationDeg: params.rotationDeg + 45,
        gimbalPitchAngle: -65,
      },
      {
        altitude: Math.round(params.baseAltitude * 0.75),
        rotationDeg: params.rotationDeg - 45,
        gimbalPitchAngle: -65,
      },
    ];
  }

  return [
    {
      altitude: params.baseAltitude,
      rotationDeg: params.rotationDeg,
      gimbalPitchAngle: -90,
    },
    {
      altitude: Math.round(params.baseAltitude * 0.75),
      rotationDeg: params.rotationDeg + 90,
      gimbalPitchAngle: -65,
    },
  ];
}

export function generatePhotogrammetry(
  params: PhotogrammetryParams,
): TemplateResult {
  const waypoints = getPhotogrammetryLayers(params).flatMap((layer) => {
    const spacing = calculateSurveySpacing(params, layer.altitude);
    return generateSurveyPattern({
      corner1: params.corner1,
      corner2: params.corner2,
      altitude: layer.altitude,
      lineSpacingM: spacing.lineSpacingM,
      photoSpacingM: spacing.photoSpacingM,
      addPhotos: params.addPhotos,
      rotationDeg: layer.rotationDeg,
      reverse: params.reverse,
      gimbalPitchAngle: layer.gimbalPitchAngle,
    });
  });

  return { waypoints, pois: [] };
}

export function generateFacade(params: FacadeParams): TemplateResult {
  const {
    point1,
    point2,
    distanceM,
    minAltitude,
    maxAltitude,
    numRows,
    numColumns,
    addPhotos,
  } = params;
  const [lat1, lng1] = point1;
  const [lat2, lng2] = point2;

  const waypoints: TemplateResult["waypoints"] = [];

  // Wall bearing and perpendicular offset direction
  const wallBearing = bearing(lat1, lng1, lat2, lng2);
  // Perpendicular: offset 90° to the right of the wall direction
  const offsetBearing = (wallBearing + 90) % 360;

  // Generate the scan grid along the wall
  for (let row = 0; row < numRows; row++) {
    const altFraction = numRows <= 1 ? 0 : row / (numRows - 1);
    const alt = Math.round(
      minAltitude + altFraction * (maxAltitude - minAltitude),
    );
    const reverse = row % 2 === 1; // zigzag

    for (let col = 0; col < numColumns; col++) {
      const colIdx = reverse ? numColumns - 1 - col : col;
      const colFraction = numColumns <= 1 ? 0 : colIdx / (numColumns - 1);

      // Point along the wall
      const wallLat = lat1 + colFraction * (lat2 - lat1);
      const wallLng = lng1 + colFraction * (lng2 - lng1);

      // Offset perpendicular to wall
      const [wpLat, wpLng] = destinationPoint(
        wallLat,
        wallLng,
        distanceM,
        offsetBearing,
      );

      // Heading: face the wall (opposite of offset direction)
      const headingToWall = (offsetBearing + 180) % 360;
      const normalizedHeading =
        headingToWall > 180 ? headingToWall - 360 : headingToWall;

      // Gimbal: calculate pitch toward wall point at ground level
      const heightDiff = alt; // drone altitude above wall base
      const pitchRad = Math.atan2(heightDiff, distanceM);
      const gimbalPitch = Math.round(-pitchRad * (180 / Math.PI));

      waypoints.push({
        ...DEFAULT_WAYPOINT,
        latitude: wpLat,
        longitude: wpLng,
        height: alt,
        speed: 3,
        useGlobalSpeed: false,
        useGlobalHeadingParam: false,
        headingMode: "fixed",
        headingAngle: Math.round(normalizedHeading),
        gimbalPitchAngle: gimbalPitch,
        turnMode: "toPointAndStopWithContinuityCurvature",
        useGlobalTurnParam: false,
        actions: addPhotos ? [createTakePhotoAction()] : [],
      });
    }
  }

  return { waypoints, pois: [] };
}

// ── Pencil (freehand path) ──────────────────────────────

/**
 * Resample a polyline of raw points into exactly `n` equidistant points.
 * Uses cumulative arc-length along the raw path and linear interpolation.
 */
function resamplePath(raw: [number, number][], n: number): [number, number][] {
  if (raw.length === 0) return [];
  if (raw.length === 1 || n <= 1) return [raw[0]];

  // 1. Compute cumulative arc-length distances
  const cumDist: number[] = [0];
  for (let i = 1; i < raw.length; i++) {
    cumDist.push(
      cumDist[i - 1] +
        haversine(raw[i - 1][0], raw[i - 1][1], raw[i][0], raw[i][1]),
    );
  }
  const totalLength = cumDist[cumDist.length - 1];

  if (totalLength === 0) return [raw[0]];

  // 2. Place n points at equal arc-length intervals
  const result: [number, number][] = [];
  let segIdx = 0; // current segment index in the raw path

  for (let k = 0; k < n; k++) {
    const targetDist = (k / (n - 1)) * totalLength;

    // Advance segIdx to find the segment containing targetDist
    while (segIdx < raw.length - 2 && cumDist[segIdx + 1] < targetDist) {
      segIdx++;
    }

    const segLen = cumDist[segIdx + 1] - cumDist[segIdx];
    const t = segLen > 0 ? (targetDist - cumDist[segIdx]) / segLen : 0;

    const lat = raw[segIdx][0] + t * (raw[segIdx + 1][0] - raw[segIdx][0]);
    const lng = raw[segIdx][1] + t * (raw[segIdx + 1][1] - raw[segIdx][1]);
    result.push([lat, lng]);
  }

  return result;
}

/** Total arc-length of a polyline in meters */
export function pathLength(path: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  }
  return total;
}

export function generatePencil(params: PencilParams): TemplateResult {
  const { path, numPoints, altitude, speed, gimbalPitchAngle, reverse, poiId } =
    params;

  if (path.length < 2 || numPoints < 2) return { waypoints: [], pois: [] };

  const resampled = resamplePath(path, numPoints);

  const useTowardPoi = !!poiId;

  const waypoints: TemplateResult["waypoints"] = resampled.map(
    ([lat, lng]) => ({
      ...DEFAULT_WAYPOINT,
      latitude: lat,
      longitude: lng,
      height: altitude,
      speed,
      useGlobalSpeed: false,
      useGlobalHeadingParam: false,
      headingMode: useTowardPoi
        ? ("towardPOI" as const)
        : ("followWayline" as const),
      ...(useTowardPoi ? { poiId } : {}),
      gimbalPitchAngle,
      turnMode: "toPointAndPassWithContinuityCurvature" as const,
      useGlobalTurnParam: false,
      actions: [],
    }),
  );

  if (reverse) {
    waypoints.reverse();
  }

  return { waypoints, pois: [] };
}
