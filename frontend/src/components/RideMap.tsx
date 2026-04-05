import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// FIX: Leaflet marker icons in React (Vite/TypeScript)
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icons for EV Platform
const evCarIcon = L.divIcon({
    html: `
        <div class="relative flex items-center justify-center">
            <div class="absolute w-12 h-12 bg-ev-blue/20 rounded-full animate-ping opacity-75"></div>
            <div class="relative w-10 h-10 bg-white border-2 border-ev-blue rounded-xl flex items-center justify-center text-xl shadow-2xl">🚗</div>
        </div>
    `,
    className: 'custom-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
});

const evBikeIcon = L.divIcon({
    html: `
        <div class="relative flex items-center justify-center">
            <div class="absolute w-10 h-10 bg-ev-purple/20 rounded-full animate-ping opacity-75"></div>
            <div class="relative w-8 h-8 bg-white border-2 border-ev-purple rounded-lg flex items-center justify-center text-lg shadow-2xl">🚲</div>
        </div>
    `,
    className: 'custom-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

const userIcon = L.divIcon({
    html: `
        <div class="relative w-8 h-8 bg-primary-500 border-2 border-white rounded-full flex items-center justify-center text-lg shadow-xl animate-bounce">📍</div>
    `,
    className: 'custom-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

const destinationIcon = L.divIcon({
    html: `
        <div class="relative w-10 h-10 bg-ev-green border-2 border-white rounded-xl flex items-center justify-center text-xl shadow-2xl shadow-ev-green/50">🎯</div>
    `,
    className: 'custom-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
});

function MapResizer() {
    const map = useMap();
    useEffect(() => {
        setTimeout(() => map.invalidateSize(), 500);
    }, [map]);
    return null;
}

interface MapProps {
    center: [number, number];
    markers?: { id: string, type: 'car' | 'user' | 'bike' | 'target', position: [number, number], label?: string }[];
    route?: [number, number][];
    isOngoing?: boolean;
}

export default function RideMap({ center, markers, route, isOngoing }: MapProps) {
    const [animatedPos, setAnimatedPos] = useState<[number, number] | null>(null);

    useEffect(() => {
        if (isOngoing && route && route.length > 1) {
            // High-resolution interpolation
            const denseRoute: [number, number][] = [];
            for (let i = 0; i < route.length - 1; i++) {
                const start = route[i];
                const end = route[i+1];
                const steps = 15; // 15 intermediate micro-nodes per segment
                for (let j = 0; j <= steps; j++) {
                    denseRoute.push([
                        start[0] + (end[0] - start[0]) * (j / steps),
                        start[1] + (end[1] - start[1]) * (j / steps)
                    ]);
                }
            }

            let index = 0;
            const interval = setInterval(() => {
                if (index < denseRoute.length) {
                    setAnimatedPos(denseRoute[index]);
                    index++;
                } else {
                    clearInterval(interval);
                }
            }, 100); // 100ms per micro-node (10 updates/sec)
            return () => clearInterval(interval);
        } else {
            setAnimatedPos(null);
        }
    }, [isOngoing, route]);

    return (
        <MapContainer 
            center={center} 
            zoom={16} 
            scrollWheelZoom={true}
            className="h-full w-full rounded-[40px] grayscale-[0.2] brightness-[0.8] contrast-[1.2]"
            style={{ isolation: 'isolate' }}
        >
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {markers?.map(m => {
                const pos = (m.id === 'driver' && animatedPos) ? animatedPos : m.position;
                let finalIcon = userIcon;
                if(m.type === 'car') finalIcon = evCarIcon;
                else if(m.type === 'bike') finalIcon = evBikeIcon;
                else if(m.type === 'target') finalIcon = destinationIcon;
                
                return (
                    <Marker 
                        key={m.id} 
                        position={pos} 
                        icon={finalIcon}
                    >
                        <Popup className="glass-popup">
                            <div className="font-bold text-slate-800">{m.label || m.type}</div>
                            {(m.type === 'car' || m.type === 'bike') && <p className="text-xs text-primary-600 font-bold uppercase">Grid Node Active</p>}
                        </Popup>
                    </Marker>
                );
            })}
            {route && (
                <Polyline 
                    positions={route} 
                    pathOptions={{
                        color: "#22c55e",
                        weight: 6,
                        opacity: 0.8,
                        dashArray: "15, 20",
                        className: "animated-polyline"
                    }} 
                />
            )}
            <MapResizer />
        </MapContainer>
    );
}
