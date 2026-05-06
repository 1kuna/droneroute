import { useRef, useEffect } from "react";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Check, X, MapPin } from "lucide-react";
import type {
  TemplateType,
  OrbitParams,
  GridParams,
  PhotogrammetryParams,
  FacadeParams,
  PencilParams,
  SurveyOverlapPreset,
} from "@/lib/templates";
import {
  CAMERA_PROFILES,
  OVERLAP_PRESETS,
  calculateSurveySpacing,
  getCameraProfileById,
} from "@/lib/templates";
import type { PointOfInterest } from "@droneroute/shared";

interface TemplateConfigPanelProps {
  type: TemplateType;
  orbitParams?: OrbitParams | null;
  gridParams?: GridParams | null;
  photogrammetryParams?: PhotogrammetryParams | null;
  facadeParams?: FacadeParams | null;
  pencilParams?: PencilParams | null;
  onOrbitChange?: (params: OrbitParams) => void;
  onGridChange?: (params: GridParams) => void;
  onPhotogrammetryChange?: (params: PhotogrammetryParams) => void;
  onFacadeChange?: (params: FacadeParams) => void;
  onPencilChange?: (params: PencilParams) => void;
  onApply: () => void;
  onCancel: () => void;
  waypointCount: number;
  pois?: PointOfInterest[];
}

type SurveyParams = GridParams | PhotogrammetryParams;

function displayMeters(value: number): string {
  return `${Math.round(value * 10) / 10}m`;
}

export function TemplateConfigPanel({
  type,
  orbitParams,
  gridParams,
  photogrammetryParams,
  facadeParams,
  pencilParams,
  onOrbitChange,
  onGridChange,
  onPhotogrammetryChange,
  onFacadeChange,
  onPencilChange,
  onApply,
  onCancel,
  waypointCount,
  pois,
}: TemplateConfigPanelProps) {
  const title =
    type === "orbit"
      ? "Orbit"
      : type === "grid"
        ? "Grid survey"
        : type === "photogrammetry"
          ? "Photogrammetry"
          : type === "facade"
            ? "Facade scan"
            : "Pencil path";
  const description =
    type === "orbit"
      ? "Circular flight path around a center point. Adjust the radius, number of points, and enable POI to keep the camera focused on the center."
      : type === "grid"
        ? "FOV-aware lawn-mower pattern for systematic area coverage. Use overlap presets or manual spacing."
        : type === "photogrammetry"
          ? "Multi-layer mapping pattern with nadir and oblique passes for richer 3D reconstruction."
          : type === "facade"
            ? "Vertical scanning pattern along a wall or building face. Set the standoff distance, altitude range, and grid density for full coverage."
            : "Freehand flight path drawn on the map. Adjust the number of waypoints to control how closely the path is followed.";

  // Stop all pointer/keyboard/wheel events from reaching Leaflet (native DOM level)
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    const events = [
      "mousedown",
      "mouseup",
      "dblclick",
      "wheel",
      "keydown",
      "keyup",
      "pointerdown",
      "pointerup",
      "touchstart",
      "touchend",
    ];
    for (const evt of events) el.addEventListener(evt, stop);
    return () => {
      for (const evt of events) el.removeEventListener(evt, stop);
    };
  }, []);

  const renderSurveyControls = (
    params: SurveyParams,
    onChange: (params: any) => void,
    altitudeKey: "altitude" | "baseAltitude",
    altitudeLabel: string,
  ) => {
    const altitude =
      altitudeKey === "altitude"
        ? (params as GridParams).altitude
        : (params as PhotogrammetryParams).baseAltitude;
    const spacing = calculateSurveySpacing(params, altitude);

    const update = (updates: Record<string, unknown>) => {
      onChange({ ...params, ...updates });
    };

    return (
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <Label className="text-[10px]">{altitudeLabel}</Label>
          <NumericInput
            value={altitude}
            onChange={(v) => update({ [altitudeKey]: v })}
            min={5}
            step={5}
            fallback={80}
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px]">Spacing mode</Label>
          <Select
            value={params.spacingMode}
            onValueChange={(v) => update({ spacingMode: v })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fov">FOV + overlap</SelectItem>
              <SelectItem value="manual">Manual spacing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {params.spacingMode === "fov" && (
          <>
            <div className="col-span-2">
              <Label className="text-[10px]">Camera profile</Label>
              <Select
                value={params.cameraProfileId}
                onValueChange={(v) => {
                  const profile = getCameraProfileById(v);
                  update({
                    cameraProfileId: v,
                    horizontalFovDeg: profile.horizontalFovDeg,
                    verticalFovDeg: profile.verticalFovDeg,
                  });
                }}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMERA_PROFILES.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Horizontal FOV (°)</Label>
              <NumericInput
                value={params.horizontalFovDeg}
                onChange={(v) => update({ horizontalFovDeg: v })}
                min={1}
                max={179}
                step={0.5}
                fallback={73.7}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">Vertical FOV (°)</Label>
              <NumericInput
                value={params.verticalFovDeg}
                onChange={(v) => update({ verticalFovDeg: v })}
                min={1}
                max={179}
                step={0.5}
                fallback={58.4}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">Overlap preset</Label>
              <Select
                value={params.overlapPreset}
                onValueChange={(v) => {
                  const presetName = v as SurveyOverlapPreset;
                  if (presetName === "custom") {
                    update({ overlapPreset: presetName });
                    return;
                  }
                  const preset = OVERLAP_PRESETS[presetName];
                  update({
                    overlapPreset: presetName,
                    forwardOverlapPct: preset.forwardOverlapPct,
                    sideOverlapPct: preset.sideOverlapPct,
                  });
                }}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fastest">Fastest</SelectItem>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="highQuality">High quality</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {params.overlapPreset === "custom" && (
              <>
                <div>
                  <Label className="text-[10px]">Forward overlap (%)</Label>
                  <NumericInput
                    value={params.forwardOverlapPct}
                    onChange={(v) => update({ forwardOverlapPct: v })}
                    min={0}
                    max={95}
                    step={1}
                    fallback={80}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Side overlap (%)</Label>
                  <NumericInput
                    value={params.sideOverlapPct}
                    onChange={(v) => update({ sideOverlapPct: v })}
                    min={0}
                    max={95}
                    step={1}
                    fallback={70}
                    className="h-7 text-xs"
                  />
                </div>
              </>
            )}
            <div className="col-span-2 text-[10px] text-muted-foreground">
              Line {displayMeters(spacing.lineSpacingM)} · Photo{" "}
              {displayMeters(spacing.photoSpacingM)} · Footprint{" "}
              {displayMeters(spacing.footprintWidthM)} ×{" "}
              {displayMeters(spacing.footprintLengthM)}
            </div>
          </>
        )}

        {params.spacingMode === "manual" && (
          <>
            <div>
              <Label className="text-[10px]">Line spacing (m)</Label>
              <NumericInput
                value={params.spacingM}
                onChange={(v) => update({ spacingM: v })}
                min={3}
                step={5}
                fallback={30}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">Photo spacing (m)</Label>
              <NumericInput
                value={params.photoSpacingM}
                onChange={(v) => update({ photoSpacingM: v })}
                min={3}
                step={5}
                fallback={20}
                className="h-7 text-xs"
              />
            </div>
          </>
        )}

        <div>
          <Label className="text-[10px]">Rotation (°)</Label>
          <NumericInput
            value={params.rotationDeg}
            onChange={(v) => update({ rotationDeg: v })}
            min={-180}
            max={180}
            step={5}
            fallback={0}
            className="h-7 text-xs"
          />
        </div>
        <div className="flex items-end gap-3 pb-1">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={params.addPhotos}
              onChange={(e) => update({ addPhotos: e.target.checked })}
              className="rounded"
            />
            Photos
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={params.reverse}
              onChange={(e) => update({ reverse: e.target.checked })}
              className="rounded"
            />
            Reverse
          </label>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={panelRef}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl p-3 min-w-[340px] max-w-[560px] max-h-[82vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
            {title}
          </span>
          <Badge
            variant={waypointCount > 500 ? "destructive" : "secondary"}
            className="text-[10px] gap-1"
          >
            {waypointCount > 500 ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <MapPin className="h-3 w-3" />
            )}
            {waypointCount} waypoints
          </Badge>
        </div>
        <button
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">{description}</p>
      {waypointCount > 500 && (
        <p className="text-[10px] text-destructive mb-3">
          Large mission. Check battery time and DJI waypoint limits before
          flying.
        </p>
      )}

      {type === "orbit" && orbitParams && onOrbitChange && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <Label className="text-[10px]">Radius (m)</Label>
            <NumericInput
              value={orbitParams.radiusM}
              onChange={(v) => onOrbitChange({ ...orbitParams, radiusM: v })}
              min={5}
              step={5}
              fallback={5}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Altitude (m)</Label>
            <NumericInput
              value={orbitParams.altitude}
              onChange={(v) => onOrbitChange({ ...orbitParams, altitude: v })}
              min={5}
              step={5}
              fallback={30}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Points</Label>
            <NumericInput
              value={orbitParams.numPoints}
              onChange={(v) => onOrbitChange({ ...orbitParams, numPoints: v })}
              min={3}
              max={72}
              fallback={12}
              integer
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={orbitParams.clockwise}
                onChange={(e) =>
                  onOrbitChange({ ...orbitParams, clockwise: e.target.checked })
                }
                className="rounded"
              />
              Clockwise
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={orbitParams.createPoi}
                onChange={(e) =>
                  onOrbitChange({ ...orbitParams, createPoi: e.target.checked })
                }
                className="rounded"
              />
              Center POI
            </label>
          </div>
        </div>
      )}

      {type === "grid" &&
        gridParams &&
        onGridChange &&
        renderSurveyControls(
          gridParams,
          onGridChange,
          "altitude",
          "Altitude (m)",
        )}

      {type === "photogrammetry" &&
        photogrammetryParams &&
        onPhotogrammetryChange &&
        renderSurveyControls(
          photogrammetryParams,
          onPhotogrammetryChange,
          "baseAltitude",
          "Base altitude (m)",
        )}

      {type === "facade" && facadeParams && onFacadeChange && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <Label className="text-[10px]">Distance from wall (m)</Label>
            <NumericInput
              value={facadeParams.distanceM}
              onChange={(v) =>
                onFacadeChange({ ...facadeParams, distanceM: v })
              }
              min={3}
              step={5}
              fallback={20}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Min altitude (m)</Label>
            <NumericInput
              value={facadeParams.minAltitude}
              onChange={(v) => {
                onFacadeChange({
                  ...facadeParams,
                  minAltitude: v,
                  maxAltitude: Math.max(v + 5, facadeParams.maxAltitude),
                });
              }}
              min={2}
              step={5}
              fallback={10}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Max altitude (m)</Label>
            <NumericInput
              value={facadeParams.maxAltitude}
              onChange={(v) =>
                onFacadeChange({
                  ...facadeParams,
                  maxAltitude: Math.max(facadeParams.minAltitude + 5, v),
                })
              }
              min={facadeParams.minAltitude + 5}
              step={5}
              fallback={30}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Rows</Label>
            <NumericInput
              value={facadeParams.numRows}
              onChange={(v) => onFacadeChange({ ...facadeParams, numRows: v })}
              min={1}
              max={20}
              fallback={4}
              integer
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Columns</Label>
            <NumericInput
              value={facadeParams.numColumns}
              onChange={(v) =>
                onFacadeChange({ ...facadeParams, numColumns: v })
              }
              min={2}
              max={30}
              fallback={8}
              integer
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={facadeParams.addPhotos}
                onChange={(e) =>
                  onFacadeChange({
                    ...facadeParams,
                    addPhotos: e.target.checked,
                  })
                }
                className="rounded"
              />
              Photos
            </label>
          </div>
        </div>
      )}

      {type === "pencil" && pencilParams && onPencilChange && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <Label className="text-[10px]">Waypoints</Label>
            <NumericInput
              value={pencilParams.numPoints}
              onChange={(v) =>
                onPencilChange({ ...pencilParams, numPoints: v })
              }
              min={2}
              max={200}
              fallback={10}
              integer
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Altitude (m)</Label>
            <NumericInput
              value={pencilParams.altitude}
              onChange={(v) => onPencilChange({ ...pencilParams, altitude: v })}
              min={5}
              step={5}
              fallback={30}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Speed (m/s)</Label>
            <NumericInput
              value={pencilParams.speed}
              onChange={(v) => onPencilChange({ ...pencilParams, speed: v })}
              min={1}
              max={15}
              step={0.5}
              fallback={7}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Gimbal pitch (°)</Label>
            <NumericInput
              value={pencilParams.gimbalPitchAngle}
              onChange={(v) =>
                onPencilChange({ ...pencilParams, gimbalPitchAngle: v })
              }
              min={-90}
              max={45}
              step={5}
              fallback={-45}
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-end pb-1 gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={pencilParams.reverse}
                onChange={(e) =>
                  onPencilChange({ ...pencilParams, reverse: e.target.checked })
                }
                className="rounded"
              />
              Reverse
            </label>
          </div>
          {pois && pois.length > 0 && (
            <div>
              <Label className="text-[10px]">Face POI</Label>
              <Select
                value={pencilParams.poiId || "none"}
                onValueChange={(v) =>
                  onPencilChange({
                    ...pencilParams,
                    poiId: v === "none" ? undefined : v,
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (follow path)</SelectItem>
                  {pois.map((poi) => (
                    <SelectItem key={poi.id} value={poi.id}>
                      {poi.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onApply}
          className="flex-1 h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Check className="h-3 w-3 mr-1" />
          Apply
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="h-7 text-xs"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
