import { useCallback, useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

interface GeocodeResult {
  displayName: string;
  latitude: number;
  longitude: number;
  boundingBox?: {
    south: number;
    north: number;
    west: number;
    east: number;
  };
  type?: string;
  category?: string;
}

function resultSubtitle(result: GeocodeResult): string {
  const parts = [result.category, result.type].filter(Boolean);
  return parts.length > 0
    ? parts.join(" / ")
    : `${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}`;
}

export function MapSearch() {
  const map = useMap();
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);

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

  const flyToResult = useCallback(
    (result: GeocodeResult) => {
      const bounds = result.boundingBox;
      if (bounds && bounds.north > bounds.south && bounds.east > bounds.west) {
        map.fitBounds(
          [
            [bounds.south, bounds.west],
            [bounds.north, bounds.east],
          ],
          { padding: [72, 72], maxZoom: 18, animate: true },
        );
        return;
      }

      map.flyTo([result.latitude, result.longitude], 17, {
        animate: true,
        duration: 0.8,
      });
    },
    [map],
  );

  const searchLocations = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2 || loading) return;

    setLoading(true);
    try {
      const data = await api.get<{ results: GeocodeResult[] }>(
        `/geocode/search?q=${encodeURIComponent(trimmed)}&limit=6`,
      );
      setResults(data.results);

      if (data.results.length === 0) {
        toast.warning("No matching locations found");
        return;
      }

      flyToResult(data.results[0]);
    } catch (err: any) {
      toast.error(`Search failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
  };

  return (
    <div
      ref={panelRef}
      className="absolute top-4 left-4 z-[1000] w-[min(420px,calc(100%-180px))]"
    >
      <form
        onSubmit={searchLocations}
        className="flex items-center gap-1.5 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-1.5"
      >
        <Search className="h-4 w-4 text-muted-foreground ml-1.5 shrink-0" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search city, address, or place"
          className="h-8 text-xs border-0 bg-transparent px-1 focus-visible:ring-0"
        />
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            className="text-muted-foreground hover:text-foreground p-1"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={loading || query.trim().length < 2}
          className="h-8 px-3"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="text-xs">Search</span>
          )}
        </Button>
      </form>

      {results.length > 1 && (
        <div className="mt-1 max-h-64 overflow-y-auto bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg py-1">
          {results.map((result) => (
            <button
              key={`${result.latitude}:${result.longitude}:${result.displayName}`}
              type="button"
              onClick={() => flyToResult(result)}
              className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
            >
              <MapPin className="h-4 w-4 mt-0.5 text-sky-400 shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs font-medium truncate">
                  {result.displayName}
                </span>
                <span className="block text-[10px] text-muted-foreground truncate">
                  {resultSubtitle(result)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
