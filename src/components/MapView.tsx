import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Filter, X, MapPin } from 'lucide-react';
import { useState, useMemo, FormEvent, useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';

// Fix for default marker icons in Leaflet with React
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

export interface PlantMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  variety: string;
  family?: string;
  domain?: string;
  density?: string;
  healthStatus?: string;
  fullData?: any;
}

interface MapViewProps {
  markers: PlantMarker[];
  center?: [number, number];
  zoom?: number;
  onMarkerClick?: (marker: PlantMarker) => void;
}

// Component to handle map centering
function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

// Component to handle map events
function MapEvents({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

export default function MapView({ markers, center = [48.8566, 2.3522], zoom = 5, onMapClick, onMarkerClick }: MapViewProps & { onMapClick?: (lat: number, lng: number) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const [mapZoom, setMapZoom] = useState<number>(zoom);
  const [overlayType, setOverlayType] = useState<'none' | 'health' | 'density'>('none');
  const [isSearching, setIsSearching] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        setMapCenter([position.coords.latitude, position.coords.longitude]);
        setMapZoom(12);
      } catch (error) {
        console.warn("Geolocation error:", error);
      }
    };
    fetchLocation();
  }, []);

  const families = useMemo(() => {
    const set = new Set(markers.map(m => m.family).filter(Boolean));
    return Array.from(set) as string[];
  }, [markers]);

  const filteredMarkers = useMemo(() => {
    return markers.filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           m.variety.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (m.domain && m.domain.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesFamily = !selectedFamily || m.family === selectedFamily;
      return matchesSearch && matchesFamily;
    });
  }, [markers, searchQuery, selectedFamily]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      // Use Nominatim for geographic search
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setMapCenter([parseFloat(lat), parseFloat(lon)]);
        setMapZoom(13);
      } else if (filteredMarkers.length > 0) {
        // Fallback to plant name search if no geo result
        const first = filteredMarkers[0];
        setMapCenter([first.lat, first.lng]);
        setMapZoom(12);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const getMarkerColor = (marker: PlantMarker) => {
    if (overlayType === 'health') {
      const status = marker.healthStatus?.toLowerCase() || '';
      if (status.includes('excellent') || status.includes('bonne') || status.includes('sain')) return '#10b981'; // emerald-500
      if (status.includes('moyen') || status.includes('stress')) return '#f59e0b'; // amber-500
      if (status.includes('mauvais') || status.includes('malade')) return '#ef4444'; // red-500
      return '#3b82f6'; // blue-500 (default)
    }
    if (overlayType === 'density') {
      const density = parseFloat(marker.density || '0');
      if (density > 5) return '#7c3aed'; // violet-600
      if (density > 2) return '#8b5cf6'; // violet-500
      return '#a78bfa'; // violet-400
    }
    return '#10b981'; // default emerald
  };

  const createCustomIcon = (color: string) => {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
  };

  return (
    <div className="h-full w-full relative flex flex-col gap-3">
      {/* Search and Filter UI */}
      <div className="absolute top-4 left-14 right-4 z-[1000] flex flex-col gap-2">
        <form onSubmit={handleSearch} className="relative group">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isSearching ? 'animate-pulse text-emerald-500' : 'text-slate-400'} group-focus-within:text-emerald-500 transition-colors`} size={16} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Lieu, parcelle ou variété..." 
            className="w-full pl-9 pr-8 py-1.5 bg-[#161c18]/90 backdrop-blur rounded-xl shadow-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-xs text-slate-200"
          />
          {searchQuery && (
            <button 
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </form>

        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <div className="flex bg-[#161c18]/90 backdrop-blur p-1 rounded-full shadow-md border border-white/5">
            <button 
              onClick={() => setMapType('standard')}
              className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all ${mapType === 'standard' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:bg-white/5'}`}
            >
              Standard
            </button>
            <button 
              onClick={() => setMapType('satellite')}
              className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all ${mapType === 'satellite' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:bg-white/5'}`}
            >
              Satellite
            </button>
          </div>

          <div className="h-8 w-px bg-white/10 mx-1"></div>

          <div className="flex bg-[#161c18]/90 backdrop-blur p-1 rounded-full shadow-md border border-white/5">
            <button 
              onClick={() => setOverlayType('none')}
              className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all ${overlayType === 'none' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:bg-white/5'}`}
            >
              Standard
            </button>
            <button 
              onClick={() => setOverlayType('health')}
              className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all ${overlayType === 'health' ? 'bg-emerald-600 text-emerald-50' : 'text-slate-400 hover:bg-white/5'}`}
            >
              Santé
            </button>
            <button 
              onClick={() => setOverlayType('density')}
              className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all ${overlayType === 'density' ? 'bg-violet-600 text-violet-50' : 'text-slate-400 hover:bg-white/5'}`}
            >
              Densité
            </button>
          </div>

          <div className="h-8 w-px bg-white/10 mx-1"></div>

          <button 
            onClick={() => setSelectedFamily(null)}
            className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap shadow-md transition-all ${!selectedFamily ? 'bg-emerald-600 text-emerald-50' : 'bg-[#161c18] text-slate-400 border border-white/5'}`}
          >
            Tous
          </button>
          {families.map(family => (
            <button 
              key={family}
              onClick={() => setSelectedFamily(family)}
              className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap shadow-md transition-all ${selectedFamily === family ? 'bg-emerald-600 text-emerald-50' : 'bg-[#161c18] text-slate-400 border border-white/5'}`}
            >
              {family}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 rounded-2xl overflow-hidden shadow-inner border border-black/5 relative">
        <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
          <ChangeView center={mapCenter} zoom={mapZoom} />
          <MapEvents onMapClick={onMapClick} />
          {mapType === 'standard' ? (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          ) : (
            <>
              <TileLayer
                attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
              <TileLayer
                attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              />
            </>
          )}
          {filteredMarkers.map((marker) => (
            <Marker 
              key={marker.id} 
              position={[marker.lat, marker.lng]}
              icon={overlayType === 'none' ? DefaultIcon : createCustomIcon(getMarkerColor(marker))}
              eventHandlers={{
                click: () => {
                  if (onMarkerClick) onMarkerClick(marker);
                }
              }}
            >
              <Popup>
                <div className="p-1 min-w-[120px]">
                  <h3 className="font-bold text-emerald-400 text-sm">{marker.name}</h3>
                  <p className="text-[10px] text-slate-400 font-medium">{marker.variety}</p>
                  <div className="mt-2 space-y-1 border-t border-white/5 pt-2">
                    {marker.domain && <p className="text-[10px] text-emerald-400 flex items-center gap-1"><MapPin size={10} /> {marker.domain}</p>}
                    {marker.healthStatus && (
                      <p className="text-[10px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getMarkerColor(marker) }}></span>
                        Santé: <span className="font-bold">{marker.healthStatus}</span>
                      </p>
                    )}
                    {marker.density && (
                      <p className="text-[10px] text-slate-400">
                        Densité: <span className="font-bold text-slate-300">{marker.density}</span>
                      </p>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        
        {/* Legend for Overlays */}
        {overlayType !== 'none' && (
          <div className="absolute bottom-4 left-4 bg-[#161c18]/90 backdrop-blur p-2 rounded-lg shadow-lg border border-white/10 z-[1000] text-[8px] font-bold uppercase tracking-wider space-y-1">
            <p className="text-slate-400 mb-1">Légende: {overlayType === 'health' ? 'Santé' : 'Densité'}</p>
            {overlayType === 'health' ? (
              <>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Bonne</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500/100"></span> Stress</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500/100"></span> Mauvaise</div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-violet-600"></span> Élevée ({'>'}5)</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-violet-500"></span> Moyenne ({'>'}2)</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-violet-400"></span> Faible</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

