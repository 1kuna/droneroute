## Summary

Fixed map search interactions so using the search field does not accidentally
add mission waypoints.

## Changes

- Stopped search control mouse, touch, wheel, and keyboard events from reaching
  the map waypoint click handler
- Prevented pressing Enter in the search form from placing a waypoint
