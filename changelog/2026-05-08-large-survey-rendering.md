## Summary

Improved map performance and readability for large grid survey and
photogrammetry missions.

## Changes

- Render large waypoint sets as a compact survey area with lightweight capture
  dots instead of thousands of draggable map markers
- Use a single lightweight flight path for dense missions to keep zooming and
  panning responsive
- Downsample the elevation chart for dense missions instead of rendering
  thousands of SVG waypoint handles
- Virtualize dense waypoint lists so the sidebar only renders the visible rows
- Keep dense generated missions locked by default instead of auto-selecting
  thousands of waypoints after applying a template
- Added focused rendering helper tests for compact mission thresholds, bounds,
  and photo-point filtering
