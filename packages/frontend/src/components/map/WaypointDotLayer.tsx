import { useEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Waypoint } from "@droneroute/shared";
import { waypointHasPhotoAction } from "@/lib/mapRendering";

interface WaypointDotLayerProps {
  waypoints: Waypoint[];
  selectedWaypointIndices?: ReadonlySet<number>;
  visible?: boolean;
}

interface DotPoint {
  index: number;
  latitude: number;
  longitude: number;
  hasPhoto: boolean;
}

function toDotPoints(waypoints: Waypoint[]): DotPoint[] {
  return waypoints.map((waypoint) => ({
    index: waypoint.index,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    hasPhoto: waypointHasPhotoAction(waypoint),
  }));
}

export function WaypointDotLayer({
  waypoints,
  selectedWaypointIndices,
  visible = true,
}: WaypointDotLayerProps) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const points = useMemo(() => toDotPoints(waypoints), [waypoints]);
  const pointsRef = useRef(points);
  const selectedRef = useRef<ReadonlySet<number> | undefined>(
    selectedWaypointIndices,
  );

  useEffect(() => {
    pointsRef.current = points;
    selectedRef.current = selectedWaypointIndices;
    redrawRef.current?.();
  }, [points, selectedWaypointIndices]);

  useEffect(() => {
    if (!visible) return;

    const pane = map.getPane("overlayPane");
    if (!pane) return;

    const canvas = L.DomUtil.create(
      "canvas",
      "leaflet-waypoint-dot-layer",
    ) as HTMLCanvasElement;
    canvas.style.pointerEvents = "none";
    canvas.style.position = "absolute";
    pane.appendChild(canvas);
    canvasRef.current = canvas;

    const redraw = () => {
      const currentCanvas = canvasRef.current;
      if (!currentCanvas) return;

      const ctx = currentCanvas.getContext("2d");
      if (!ctx) return;

      const size = map.getSize();
      const ratio = window.devicePixelRatio || 1;
      currentCanvas.width = size.x * ratio;
      currentCanvas.height = size.y * ratio;
      currentCanvas.style.width = `${size.x}px`;
      currentCanvas.style.height = `${size.y}px`;

      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(currentCanvas, topLeft);

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);

      const bounds = map.getBounds().pad(0.12);
      for (const point of pointsRef.current) {
        if (!bounds.contains([point.latitude, point.longitude])) continue;

        const selected = selectedRef.current?.has(point.index) ?? false;
        const pixel = map.latLngToContainerPoint([
          point.latitude,
          point.longitude,
        ]);

        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, selected ? 3.4 : 1.8, 0, Math.PI * 2);
        ctx.fillStyle = selected
          ? "#fbbf24"
          : point.hasPhoto
            ? "#c4b5fd"
            : "#93c5fd";
        ctx.globalAlpha = selected ? 1 : 0.86;
        ctx.fill();

        if (selected) {
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = "#78350f";
          ctx.globalAlpha = 1;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    const scheduleRedraw = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        redraw();
      });
    };

    redrawRef.current = scheduleRedraw;
    scheduleRedraw();

    map.on("move zoom resize zoomend moveend viewreset", scheduleRedraw);

    return () => {
      map.off("move zoom resize zoomend moveend viewreset", scheduleRedraw);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      canvas.remove();
      canvasRef.current = null;
      redrawRef.current = null;
    };
  }, [map, visible]);

  return null;
}
