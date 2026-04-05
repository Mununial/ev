import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import RideMap from '../components/RideMap';
import { MapPin, Navigation, Car, Bike, Phone, MessageSquare, Menu, Activity, LogOut, CheckCircle2, Star, Sparkles, Calendar, X, Send, AlertTriangle, Battery, User as UserIcon, IndianRupee, Mic, Headset, AlertCircle, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KIIT_LOCATIONS, CAMPUS_CENTER } from '../data/kiitData';
import { useAuth } from '../context/AuthContext';
import { RideOrchestrator, RidePlan, ClassSchedule } from '../utils/rideSystem';

const socket = io(import.meta.env.VITE_API_URL);

// Mock Schedule for demonstration
const MOCK_SCHEDULE: ClassSchedule[] = [
    { subject: 'Advanced Architecture', startTime: '16:00', location: KIIT_LOCATIONS[4] },
    { subject: 'Cloud Grid Systems', startTime: '18:30', location: KIIT_LOCATIONS.find(l => l.name.includes('SCA')) || KIIT_LOCATIONS[2] },
];

export default function UserDashboard() {
    const { user, logout } = useAuth();
    const [status, setStatus] = useState<'idle' | 'searching' | 'accepted' | 'ongoing' | 'completed'>('idle');
    const [pickup, setPickup] = useState(KIIT_LOCATIONS[0].id);
    const [drop, setDrop] = useState(KIIT_LOCATIONS[1].id);
    const [driver, setDriver] = useState<any>(null);
    const [earnings] = useState({ today: '₹840', missions: 12 });
    const [history, setHistory] = useState<any[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem('ride_history');
        if (saved) setHistory(JSON.parse(saved));
    }, []);

    const addToHistory = (ride: any) => {
        setHistory(prev => {
            const newHistory = [ride, ...prev];
            localStorage.setItem('ride_history', JSON.stringify(newHistory));
            return newHistory;
        });
    };

    const [otp, setOtp] = useState<string>('');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [distance, setDistance] = useState<string>('0.0');
    const [fare, setFare] = useState<number>(0);
    const [vehicleType, setVehicleType] = useState<'bike' | 'car'>('car');
    const [currentRoute, setCurrentRoute] = useState<[number, number][] | undefined>(undefined);
    const [driverDistance, setDriverDistance] = useState<string>('0.0');
    const [duration, setDuration] = useState<string>('0');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showSOS, setShowSOS] = useState(false);
    const [rating, setRating] = useState(0);
    const [view, setView] = useState<'main' | 'history' | 'assistant'>('main');
    const [showFeedback, setShowFeedback] = useState(false);
    const [rideId, setRideId] = useState<string | null>(null);

    // Smart Assistant State
    const [smartPlan, setSmartPlan] = useState<RidePlan | null>(null);

    // Chat states
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const [isCalling, setIsCalling] = useState(false);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isChatOpen]);

    // Initial Smart Plan Trigger
    useEffect(() => {
        const time = new Date().toTimeString().slice(0, 5);
        RideOrchestrator.planNextClassRide(MOCK_SCHEDULE, 85, [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng], time)
            .then(plan => setSmartPlan(plan));
    }, []);

    const fetchRoute = async (start: [number, number], end: [number, number]) => {
        try {
            const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`);
            const data = await response.json();
            if (data.routes && data.routes[0]) {
                const points = data.routes[0].geometry.coordinates.map((coord: any) => [coord[1], coord[0]]) as [number, number][];
                setCurrentRoute(points);
                setDistance((data.routes[0].distance / 1000).toFixed(1));
                setDuration(Math.round(data.routes[0].duration / 60).toString());
                setFare(Math.round((data.routes[0].distance / 1000) * 12));
            }
        } catch (error) {
            console.error('Route Sync Error:', error);
        }
    };

    useEffect(() => {
        if (status === 'accepted' && driver?.location && !currentRoute) {
            const pLoc = KIIT_LOCATIONS.find(l => l.id === pickup);
            if (pLoc) fetchRoute(driver.location, [pLoc.lat, pLoc.lng]);
        } else if (status === 'ongoing' && !currentRoute) {
            const pLoc = KIIT_LOCATIONS.find(l => l.id === pickup);
            const dLoc = KIIT_LOCATIONS.find(l => l.id === drop);
            if (pLoc && dLoc) fetchRoute([pLoc.lat, pLoc.lng], [dLoc.lat, dLoc.lng]);
        } else if (status === 'idle') {
            const pLoc = KIIT_LOCATIONS.find(l => l.id === pickup);
            const dLoc = KIIT_LOCATIONS.find(l => l.id === drop);
            if (pLoc && dLoc) fetchRoute([pLoc.lat, pLoc.lng], [dLoc.lat, dLoc.lng]);
        }
    }, [status, pickup, drop]); // Removed driver?.location dependency to prevent reset loop

    useEffect(() => {
        let watchId: number;
        if ("geolocation" in navigator) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const newLoc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                    setUserLocation(newLoc);
                },
                (err) => console.log("GPS Error:", err),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        }

        socket.on('ride_accepted', (data) => {
            setDriver(data.vehicle);
            if (data.rideId) setRideId(data.rideId);
            setStatus('accepted');
            setCurrentRoute(undefined); // Reset route to fetch intercept route
            setMessages([]);
            const pLoc = KIIT_LOCATIONS.find(l => l.id === pickup);
            const dLoc = KIIT_LOCATIONS.find(l => l.id === drop);
            if (pLoc && dLoc) fetchRoute([pLoc.lat, pLoc.lng], [dLoc.lat, dLoc.lng]);
        });

        socket.on('receive_message', (data) => {
            setMessages(prev => [...prev, data]);
        });

        socket.on('driver_location', (newLoc) => {
            setDriver(prev => prev ? { ...prev, location: newLoc } : null);
            const pLoc = KIIT_LOCATIONS.find(l => l.id === pickup);
            if (pLoc) {
                const rad = (x: number) => x * Math.PI / 180;
                const R = 6371;
                const dLat = rad(pLoc.lat - newLoc[0]);
                const dLong = rad(pLoc.lng - newLoc[1]);
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(newLoc[0])) * Math.cos(rad(pLoc.lat)) * Math.sin(dLong / 2) * Math.sin(dLong / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const d = R * c;
                setDriverDistance(d.toFixed(2));
            }
        });

        socket.on('status_change', (data) => {
            const oldStatus = status;
            setStatus(data.status);
            if (data.status === 'ongoing' && oldStatus !== 'ongoing') {
                setCurrentRoute(undefined); // Reset to fetch mission route
            }
            if (data.status === 'completed') {
                setCurrentRoute(undefined);
                setDistance('0.0');
                setIsChatOpen(false);
                const pLoc = KIIT_LOCATIONS.find(l => l.id === pickup);
                const dLoc = KIIT_LOCATIONS.find(l => l.id === drop);
                addToHistory({
                    id: rideId,
                    from: pLoc?.name,
                    to: dLoc?.name,
                    fare,
                    date: new Date().toLocaleDateString(),
                    type: vehicleType
                });
                setTimeout(() => setView('receipt' as any), 500);
            }
            if (data.status === 'cancelled') {
                setStatus('idle');
                setRideId(null);
                setDriver(null);
                alert('Mission Aborted by Remote Node');
            }
        });

        return () => {
             if (watchId) navigator.geolocation.clearWatch(watchId);
             socket.off('ride_accepted');
             socket.off('status_change');
             socket.off('driver_location');
             socket.off('receive_message');
        };
    }, []);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !rideId) return;
        const msgData = { rideId, message: newMessage, sender: 'user', timestamp: new Date() };
        setMessages(prev => [...prev, msgData]);
        socket.emit('send_message', msgData);
        setNewMessage('');
    };

    const handleBooking = () => {
        if (!pickup || !drop) return;
        const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
        setOtp(newOtp);
        const rideData = {
            id: `RIDE-${Date.now()}`,
            userId: user.uid,
            userName: user.name || user.displayName || 'Passenger',
            pickup: KIIT_LOCATIONS.find(l => l.id === pickup),
            drop: KIIT_LOCATIONS.find(l => l.id === drop),
            vehicleType: vehicleType,
            fare: fare,
            otp: newOtp,
            realLocation: userLocation 
        };
        setRideId(rideData.id);
        socket.emit('request_ride', rideData);
        setStatus('searching');
    };

    const cancelRide = () => {
        if(window.confirm('Abort Mission Upload?')) {
            socket.emit('update_ride_status', { rideId, status: 'cancelled' });
            setStatus('idle');
            setRideId(null);
            setDriver(null);
        }
    };

    const markers: any[] = [];
    if (userLocation) markers.push({ id: 'real_user', type: 'user', position: userLocation, label: 'YOU' });
    const pLoc_m = KIIT_LOCATIONS.find(l => l.id === pickup);
    const dLoc_m = KIIT_LOCATIONS.find(l => l.id === drop);
    if (pLoc_m) markers.push({ id: 'pickup', type: 'user', position: [pLoc_m.lat, pLoc_m.lng], label: 'Pickup Point' });
    if (dLoc_m && status !== 'idle') markers.push({ id: 'drop', type: 'target', position: [dLoc_m.lat, dLoc_m.lng], label: 'Hub Node' });
    if (driver?.location && status !== 'idle') markers.push({ id: 'driver', type: (driver.type || vehicleType) as any, position: driver.location, label: `${(driver.type || vehicleType).toUpperCase()} PILOT` });

    const LocationSelector = ({ label, value, onChange, icon }: any) => {
        const [isOpen, setIsOpen] = useState(false);
        const selectedLoc = KIIT_LOCATIONS.find(l => l.id === value);
        return (
            <div className="flex flex-col gap-2 relative">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">{label}</label>
                <div onClick={() => setIsOpen(!isOpen)} className="relative flex items-center bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-300 p-4 cursor-pointer hover:border-ev-blue/30 transition-all active:scale-[0.98]">
                    <div className="mr-3">{icon}</div>
                    <div className="flex-1 overflow-hidden"><p className="font-black text-xs uppercase tracking-tight text-slate-900 truncate">{selectedLoc?.name || 'Select Node'}</p></div>
                </div>
                <AnimatePresence>
                    {isOpen && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute top-full left-0 right-0 mt-2 bg-slate-50/95 backdrop-blur-3xl border border-slate-300 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[500] max-h-48 overflow-y-auto p-1 custom-scrollbar">
                            {KIIT_LOCATIONS.map(loc => (
                                <div key={loc.id} onClick={() => { onChange(loc.id); setIsOpen(false); }} className={`p-3 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors ${value === loc.id ? 'bg-ev-blue text-white shadow-lg' : 'hover:bg-slate-100 text-slate-400'}`}>{loc.name}</div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    return (
        <div className="h-[100dvh] w-full lg:flex lg:flex-row bg-slate-50 overflow-hidden font-sans text-slate-900 relative">
            <div className="absolute lg:relative top-0 left-0 w-full max-h-[55vh] lg:max-h-none lg:h-full lg:w-[420px] bg-white border-b lg:border-r lg:border-b-0 border-slate-300 p-4 pb-6 lg:p-10 flex flex-col gap-4 lg:gap-8 z-[100] shrink-0 shadow-[0_20px_50px_rgba(0,0,0,0.2)] rounded-b-[2rem] lg:rounded-none overflow-hidden">
                <header className="flex justify-between items-center mb-10">
                    <div className="flex items-center gap-4">
                        {(view !== 'main' && status === 'idle') && <button onClick={() => setView('main')} className="p-3 bg-slate-100 rounded-2xl border border-slate-300"><Navigation className="rotate-[-90deg] w-4 h-4 text-slate-500" /></button>}
                        <button onClick={() => setIsMenuOpen(true)} className="p-3 bg-slate-100 rounded-2xl lg:hidden hover:bg-slate-200 border border-slate-300 shadow-xl active:scale-95 transition-all"><Menu className="w-5 h-5 text-slate-400" /></button>
                        <div>
                            <h1 className="text-xl lg:text-3xl font-black italic tracking-tighter leading-none uppercase">SMILESPHERE <span className="text-primary-500">GRID</span></h1>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1 lg:mt-2">Campus Node v4.2</p>
                        </div>
                    </div>
                    <button onClick={() => { if(window.confirm('Logout?')) logout(); }} className="p-3 bg-slate-100 border border-slate-300 rounded-2xl text-slate-500 hover:text-rose-500 transition-all">
                        <LogOut size={16} />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto pb-10 pr-1 custom-scrollbar flex flex-col gap-6">
                    {/* View Switcher Tabs */}
                    <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl">
                         {['main', 'assistant', 'history'].map(v => (
                             <button key={v} onClick={() => setView(v as any)} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === v ? 'bg-primary-500 text-white shadow-xl shadow-primary-500/20' : 'text-slate-500 hover:text-slate-900'}`}>{v === 'main' ? 'Book' : v === 'assistant' ? 'Smart' : 'History'}</button>
                         ))}
                    </div>

                    <AnimatePresence mode="wait">
                        {view === 'main' && (
                            <motion.div key="main" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex flex-col gap-8">
                                {status === 'idle' && (
                                    <>
                                        <div className="space-y-6">
                                            <LocationSelector label="Pick-up Point" value={pickup} onChange={setPickup} icon={<MapPin className="text-primary-500 w-5 h-5" />} />
                                            <LocationSelector label="Drop Location" value={drop} onChange={setDrop} icon={<Navigation className="text-ev-green w-5 h-5" />} />
                                        </div>
                                        {pickup && drop && distance !== '0.0' && <div className="flex items-center justify-between p-5 bg-slate-100 border border-slate-300 rounded-2xl"><div className="flex items-center gap-3"><Activity className="w-4 h-4 text-primary-500 animate-pulse" /><p className="text-xs font-black italic uppercase">{distance} KM</p></div><p className="text-xl font-black italic">₹{fare}</p></div>}
                                        <div className="grid grid-cols-2 gap-3 lg:gap-4">
                                            <button onClick={() => setVehicleType('bike')} className={`p-4 lg:p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${vehicleType === 'bike' ? 'bg-primary-500/10 border-primary-500' : 'bg-slate-50 border-transparent opacity-60'}`}><Bike className="w-6 h-6" /><p className="text-[10px] font-black uppercase">EV Bike</p></button>
                                            <button onClick={() => setVehicleType('car')} className={`p-4 lg:p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${vehicleType === 'car' ? 'bg-ev-green/10 border-ev-green' : 'bg-slate-100 border-transparent opacity-60'}`}><Car className="w-6 h-6" /><p className="text-[10px] font-black uppercase">EV Car</p></button>
                                        </div>
                                        <button onClick={handleBooking} disabled={!pickup || !drop} className="w-full py-5 lg:py-6 bg-white text-slate-950 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] italic hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-20 uppercase">Start Ride</button>
                                    </>
                                )}
                                {status === 'searching' && (
                                    <div className="flex flex-col items-center py-20 text-center">
                                        <div className="w-24 h-24 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-8" />
                                        <h2 className="text-xl font-black uppercase tracking-tighter">Syncing Grid...</h2>
                                        <button onClick={cancelRide} className="mt-10 text-[10px] font-black text-rose-500 uppercase tracking-widest border border-rose-500/30 px-6 py-3 rounded-xl hover:bg-rose-500/10 active:scale-95 transition-all">Abort Task</button>
                                    </div>
                                )}
                                {(status === 'accepted' || status === 'ongoing') && (
                                    <div className="flex flex-col gap-6">
                                        <div className="bg-white border border-slate-300 p-6 rounded-[2.5rem] flex items-center gap-6 shadow-2xl transition-all hover:border-primary-500/30"><div className="p-5 bg-primary-500 rounded-2xl text-slate-900 shadow-lg shadow-primary-500/20">{vehicleType === 'bike' ? <Bike /> : <Car />}</div><div className="flex-1 overflow-hidden"><p className="text-xl font-black italic tracking-tighter truncate uppercase">{driver?.pilot || 'Alex'}</p><p className="text-[10px] font-black text-slate-500 uppercase">{driver?.plate}</p><p className="text-[10px] font-black text-indigo-400 mt-2 uppercase">{status === 'accepted' ? `ETA: ${duration} MIN (${driverDistance}KM)` : `TRIP TIME: ${duration} MIN (${distance}KM)`}</p></div></div>
                                        <div className="grid grid-cols-2 gap-4 relative z-[200]">
                                            <button onClick={() => setIsCalling(true)} className="py-4 bg-slate-100 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase text-ev-green active:scale-95 transition-all hover:bg-slate-200 border border-slate-300 shadow-xl"><Phone size={16} /> Call</button>
                                            <button onClick={() => setIsChatOpen(true)} className="py-4 bg-slate-100 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase text-ev-blue relative active:scale-95 transition-all hover:bg-slate-200 border border-slate-300 shadow-xl"><MessageSquare size={16} /> Chat {messages.length > 0 && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-slate-900 translate-x-1 -translate-y-1 animate-pulse" />}</button>
                                        </div>
                                        {status === 'accepted' && (
                                            <div className="flex flex-col gap-4">
                                                <div className="bg-primary-500 p-8 rounded-[2.5rem] text-center shadow-lg shadow-primary-500/30"><p className="text-[10px] font-black text-slate-500 uppercase mb-2">Gate Access OTP</p><p className="text-5xl font-black tracking-widest text-slate-900 italic">{otp}</p></div>
                                                <button onClick={cancelRide} className="w-full py-4 text-xs font-black text-rose-500 uppercase tracking-widest hover:bg-rose-500/5 rounded-2xl transition-all">Cancel Task</button>
                                            </div>
                                        )}
                                        {status === 'ongoing' && <button onClick={() => setShowSOS(true)} className="w-full bg-rose-950/20 border border-rose-500/30 p-5 rounded-2xl text-rose-500 font-black text-[10px] uppercase shadow-lg shadow-rose-500/5">Alert SOS</button>}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {view === 'assistant' && (
                            <motion.div key="assistant" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                                <header className="px-2">
                                    <h3 className="text-2xl font-black italic uppercase tracking-tighter inline-flex items-center gap-3">Smart Assistant <Sparkles size={20} className="text-primary-400" /></h3>
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Autonomous Mission Planning</p>
                                </header>

                                {smartPlan ? (
                                    <div className="flex flex-col gap-6">
                                        {/* Next Class Module */}
                                        <div className="bg-slate-100 border border-slate-300 p-6 rounded-[2.5rem] relative overflow-hidden group">
                                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary-500/10 blur-[60px] rounded-full" />
                                            <div className="flex items-center gap-4 mb-6">
                                                <div className="p-3 bg-indigo-600/10 text-indigo-400 rounded-xl"><Calendar size={20} /></div>
                                                <div>
                                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Next Academic Session</p>
                                                    <p className="text-lg font-black uppercase tracking-tighter text-slate-900 italic">{MOCK_SCHEDULE[0].subject}</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-white p-4 rounded-2xl border border-slate-300 text-center shadow-sm">
                                                    <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Target Time</p>
                                                    <p className="text-lg font-black italic text-slate-900">16:00</p>
                                                </div>
                                                <div className="bg-white p-4 rounded-2xl border border-slate-300 text-center shadow-sm">
                                                    <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Departure</p>
                                                    <p className="text-lg font-black italic text-ev-green">{smartPlan.recommendedDeparture}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Battery Module Insight */}
                                        <div className={`p-6 rounded-[2.5rem] border bg-white shadow-xl ${smartPlan.batterySafety.isSafe ? 'border-ev-green/20' : 'border-rose-500/20'}`}>
                                            <div className="flex justify-between items-center mb-4">
                                                <div className="flex items-center gap-3">
                                                    <Battery size={20} className={smartPlan.batterySafety.isSafe ? 'text-ev-green' : 'text-rose-500'} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Battery Module Check</span>
                                                </div>
                                                {smartPlan.batterySafety.isSafe ? <CheckCircle2 className="text-ev-green w-4 h-4" /> : <AlertCircle className="text-rose-500 w-4 h-4" />}
                                            </div>
                                            <p className="text-xs font-bold text-slate-900 mb-2">Estimated Range: {smartPlan.batterySafety.rangeKm.toFixed(0)} KM</p>
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{smartPlan.batterySafety.isSafe ? 'Trip is safe based on grid distance' : smartPlan.batterySafety.suggestion}</p>
                                        </div>

                                        {/* Alerts Module Interaction */}
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">System Alerts</p>
                                            {smartPlan.alerts.map((alert, i) => (
                                                <div key={i} className="bg-slate-100 p-4 rounded-2xl border border-slate-300 text-[10px] font-bold text-indigo-400 flex items-center gap-3 italic">
                                                    <Zap size={12} className="shrink-0" /> {alert}
                                                </div>
                                            ))}
                                        </div>

                                        <button 
                                            onClick={() => {
                                                const locId = MOCK_SCHEDULE[0].location.id;
                                                setDrop(locId);
                                                setView('main');
                                            }}
                                            className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest italic shadow-xl shadow-indigo-600/20 active:scale-95 transition-all"
                                        >
                                            Initiate Mission Plan
                                        </button>
                                    </div>
                                ) : <div className="text-center py-10 opacity-20"><Activity size={40} className="mx-auto mb-4" /><p className="text-xs font-black uppercase">Calculating Grid Plan...</p></div>}
                            </motion.div>
                        )}

                        {view === 'history' && (
                            <motion.div key="history" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col gap-6">
                                <h3 className="text-2xl font-black italic uppercase tracking-tighter">Mission Logs</h3>
                                <div className="space-y-4">
                                     {history.length > 0 ? history.map((h, i) => (
                                         <div key={i} className="bg-slate-100 border border-slate-300 p-6 rounded-[2rem] flex justify-between items-center group hover:bg-slate-200 transition-all cursor-pointer">
                                             <div>
                                                 <p className="text-xs font-black text-slate-900 italic uppercase">{h.from} → {h.to}</p>
                                                 <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">{h.date} • ₹{h.fare}</p>
                                             </div>
                                             <div className="text-right">
                                                 <p className="text-[9px] font-black text-ev-green uppercase">Success</p>
                                                 <p className="text-[8px] text-slate-600 font-bold uppercase mt-1">{h.type}</p>
                                             </div>
                                         </div>
                                     )) : (
                                         <div className="text-center py-20 opacity-20"><Clock size={40} className="mx-auto mb-4" /><p className="text-xs font-black uppercase">Archive Empty</p></div>
                                     )}
                                </div>
                            </motion.div>
                        )}
                        {view === 'receipt' as any && (
                            <motion.div key="receipt" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                                <div className="text-center py-10">
                                    <div className="w-20 h-20 bg-ev-green/10 text-ev-green rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-ev-green/20"><CheckCircle2 size={40} /></div>
                                    <h2 className="text-3xl font-black italic uppercase tracking-tighter">Mission Success</h2>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Grid Telemetry Archived</p>
                                </div>
                                <div className="bg-slate-100 border border-slate-300 p-8 rounded-[2.5rem] space-y-6">
                                    <div className="flex justify-between items-center pb-6 border-b border-slate-300">
                                        <p className="text-[10px] font-black text-slate-500 uppercase">Total Access Fee</p>
                                        <p className="text-3xl font-black italic">₹{fare}</p>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-black text-primary-500 uppercase tracking-widest">Rate Pilot Experience</p>
                                        <div className="flex gap-3">
                                            {[1,2,3,4,5].map(s => (
                                                <button key={s} onClick={() => setRating(s)} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${rating >= s ? 'bg-primary-500 text-white shadow-[0_0_20px_rgba(30,64,175,0.4)]' : 'bg-slate-100 shadow-inner'}`}><Star size={18} fill={rating >= s ? "currentColor" : "none"} /></button>
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={() => { setView('main'); setStatus('idle'); setRideId(null); setDriver(null); setRating(0); }} className="w-full py-5 lg:py-6 bg-white text-slate-950 rounded-[2rem] font-black text-xs uppercase tracking-[.2em] shadow-xl hover:scale-105 active:scale-95 transition-all">Mission Debrief Complete</button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="absolute inset-0 lg:relative lg:flex-1 h-full w-full z-0">
                <RideMap 
                    center={status === 'ongoing' ? (driver?.location || [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng]) : (status === 'accepted' ? [KIIT_LOCATIONS.find(l => l.id === pickup)?.lat || CAMPUS_CENTER.lat, KIIT_LOCATIONS.find(l => l.id === pickup)?.lng || CAMPUS_CENTER.lng] : (userLocation || [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng]))} 
                    markers={markers} 
                    route={currentRoute} 
                    isOngoing={status === 'ongoing'} 
                />
            </div>

            {/* Chat & Call (Same but kept for completeness) */}
            <AnimatePresence>{isCalling && <motion.div className="fixed inset-0 z-[6000] bg-slate-50 flex flex-col items-center justify-center p-10"><Phone size={60} className="text-primary-500 mb-10 animate-pulse" /><h2 className="text-4xl font-black italic uppercase tracking-tighter text-slate-900">Calling Pilot...</h2><button onClick={() => setIsCalling(false)} className="mt-12 w-20 h-20 bg-rose-500 rounded-full flex items-center justify-center text-slate-900"><X size={32} /></button></motion.div>}</AnimatePresence>
            <AnimatePresence>{isChatOpen && <div className="fixed inset-0 z-[5500]"><motion.div className="absolute inset-0 bg-slate-50/80 backdrop-blur-md" onClick={() => setIsChatOpen(false)} /><motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute top-0 right-0 bottom-0 w-full lg:w-[450px] bg-white flex flex-col overflow-hidden"><div className="p-8 border-b border-slate-300 flex justify-between items-center"><div><h3 className="text-xl font-black italic uppercase tracking-tighter leading-none">Grid Chat</h3><p className="text-[10px] font-bold text-slate-500 mt-1 uppercase">Pilot Uplink Active</p></div><X className="text-slate-500" onClick={() => setIsChatOpen(false)}/></div><div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4 custom-scrollbar">{messages.map((m, i) => (<div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] p-4 rounded-2xl text-[13px] font-bold ${m.sender === 'user' ? 'bg-primary-500 text-white' : 'bg-slate-200 text-slate-300'}`}>{m.message}</div></div>))}<div ref={chatEndRef} /></div><form onSubmit={handleSendMessage} className="p-6 bg-slate-50 flex gap-4"><input value={newMessage} onChange={e => setNewMessage(e.target.value)} className="flex-1 bg-slate-100 border border-slate-300 p-4 rounded-2xl outline-none text-sm font-bold" placeholder="Message..." /><button className="p-4 bg-primary-500 text-white rounded-2xl"><Send size={20} /></button></form></motion.div></div>}</AnimatePresence>
            <AnimatePresence>{showSOS && <div className="fixed inset-0 z-[7000] flex items-center justify-center"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSOS(false)} className="absolute inset-0 bg-rose-950/90 backdrop-blur-xl" /><motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="relative bg-rose-500 w-[90%] lg:w-[400px] p-10 rounded-[3rem] text-center shadow-[0_0_100px_rgba(244,63,94,0.6)]"><div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-8 animate-ping shadow-2xl text-rose-500"><AlertTriangle size={48} /></div><p className="text-3xl font-black italic uppercase italic tracking-tighter text-slate-900">Emergency<br/>Response Active</p><p className="text-[10px] font-black text-rose-100 uppercase mt-4 mb-10">Campus Security & Medical<br/>Uplinked to your position</p><button onClick={() => setShowSOS(false)} className="w-full py-5 bg-white text-rose-500 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl">Cancel False Alarm</button></motion.div></div>}</AnimatePresence>

            <AnimatePresence>
                {isMenuOpen && (
                    <div className="fixed inset-0 z-[5000]">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMenuOpen(false)} className="absolute inset-0 bg-slate-50/80 backdrop-blur-xl" />
                        <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} className="absolute top-0 left-0 bottom-0 w-80 bg-white border-r border-slate-300 p-10 flex flex-col gap-8 shadow-[20px_0_100px_rgba(0,0,0,0.8)]">
                            <h2 className="text-2xl font-black italic uppercase tracking-tighter">Grid <span className="text-primary-500">Access</span></h2>
                            <div className="flex flex-col gap-4 mt-6">
                                <button onClick={() => { setView('main'); setIsMenuOpen(false); }} className={`p-5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-left transition-all ${view === 'main' ? 'bg-primary-500 text-white shadow-xl shadow-primary-500/20 scale-105' : 'text-slate-500 hover:text-slate-900'}`}>Quick Booking</button>
                                <button onClick={() => { setView('assistant' as any); setIsMenuOpen(false); }} className={`p-5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-left transition-all ${view === 'assistant' as any ? 'bg-primary-500 text-white shadow-xl shadow-primary-500/20 scale-105' : 'text-slate-500 hover:text-slate-900'}`}>Smart Assistant</button>
                                <button onClick={() => { setView('history' as any); setIsMenuOpen(false); }} className={`p-5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-left transition-all ${view === 'history' as any ? 'bg-primary-500 text-white shadow-xl shadow-primary-500/20 scale-105' : 'text-slate-500 hover:text-slate-900'}`}>Mission History</button>
                            </div>
                            <div className="mt-auto pt-6 border-t border-slate-300">
                                <button onClick={() => logout()} className="flex items-center gap-4 text-rose-500 font-black text-[10px] uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-all"><LogOut size={16} /> Disconnect</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}


