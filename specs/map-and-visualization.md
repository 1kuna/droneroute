# Map and visualization

An interactive map where you plan flights and see everything at a glance.

## What you can do

- Pan, zoom, and interact with a full OpenStreetMap-based map.
- See the flight path as an animated dashed line connecting all waypoints.
- See colored lines from waypoints to POIs showing camera aim (green = correct pitch, red = needs adjustment).
- See obstacle polygons drawn on the map.
- Use the floating toolbar to switch between waypoint mode, POI mode, and template tools.
- View an elevation graph below the waypoint list that shows altitude changes across the flight.
- See live previews when configuring templates before placing them.
- See large survey missions as a compact translucent area with lightweight
  capture dots instead of thousands of oversized waypoint markers.
- See dense mission elevation as a simplified profile so the sidebar remains
  responsive on large surveys.
- Scroll dense waypoint lists without rendering every waypoint row at once.

## How it works

The map is the central workspace. Everything you do — placing waypoints, POIs, obstacles, or templates — happens directly on the map. The sidebar shows lists and settings, and the two stay in sync.

## Good to know

- The flight path animation speed reflects the configured drone speed at each segment, giving you a visual sense of pacing.
- You can click waypoints and POIs directly on the map to select and edit them.
- Dense survey missions are locked on the map by default for performance and
  safety. Click the survey area to reveal or hide capture dots; select a
  specific waypoint from the sidebar when you need its full draggable marker.
