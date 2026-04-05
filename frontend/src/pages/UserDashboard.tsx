import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import RideMap from '../components/RideMap';
import { 
    MapPin, Navigation, Car, Bike, Phone, MessageSquare, Menu, Activity, 
    LogOut, CheckCircle2, Star, Sparkles, Calendar, X, Send, AlertTriangle, 
    Battery, User as UserIcon, IndianRupee, Mic, Headset, AlertCircle, Zap,
    ChevronUp, Clock, RotateCcw, Search, ShieldCheck, Map as MapIcon
} from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
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
    const [status, setStatus] = useState<'idle' | 'searching' | 'accepted' | 'ongoing' | 'completed' | 'cancelled'>('idle');
    const [pickup, setPickup] = useState(KIIT_LOCATIONS[0].id);
    const [drop, setDrop] = useState(KIIT_LOCATIONS[1].id);
    const [driver, setDriver] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    
    // UI States
    const [sheetState, setSheetState] = useState<'collapsed' | 'mid' | 'full'>('mid');
    const [view, setView] = useState<'main' | 'history' | 'assistant'>('main');
    const [vehicleType, setVehicleType] = useState<'bike' | 'car'>('car');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [rideId, setRideId] = useState<string | null>(null);
    const [otp, setOtp] = useState<string>('');
    const [distance, setDistance] = useState<string>('0.0');
    const [fare, setFare] = useState<number>(0);
    const [duration, setDuration] = useState<string>('0');
    const [currentRoute, setCurrentRoute] = useState<[number, number][] | undefined>(undefined);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [driverDistance, setDriverDistance] = useState<string>('0.0');
    
    // Search focus states to prevent map interference
    const [isInputFocused, setIsInputFocused] = useState(false);

    // Smart Assistant
    const [smartPlan, setSmartPlan] = useState<RidePlan | null>(null);

    // Chat
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isCalling, setIsCalling] = useState(false);
    const [showSOS, setShowSOS] = useState(false);
    const [isSOSLoading, setIsSOSLoading] = useState(false);
    const [cancelReasonOpen, setCancelReasonOpen] = useState(false);
    const [showComplaint, setShowComplaint] = useState(false);
    const [complaintText, setComplaintText] = useState('');
    const [rating, setRating] = useState(0);
    const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const chatEndRef = useRef<HTMLDivElement>(null);
    const dragControls = useDragControls();

    // Restoring Active Ride
    useEffect(() => {
        const savedRide = localStorage.getItem('active_ride');
        if (savedRide) {
            try {
                const parsed = JSON.parse(savedRide);
                setStatus(parsed.status);
                setPickup(parsed.pickup);
                setDrop(parsed.drop);
                setRideId(parsed.id);
                if (parsed.driver) setDriver(parsed.driver);
                if (parsed.otp) setOtp(parsed.otp);
                if (parsed.fare) setFare(parsed.fare);
                if (parsed.vehicleType) setVehicleType(parsed.vehicleType);
                if (parsed.status !== 'idle') setSheetState('mid');
            } catch(e) {}
        }
    }, []);

    // Save Active Ride state on change
    useEffect(() => {
        if (status === 'idle' || status === 'completed' || status === 'cancelled') {
            localStorage.removeItem('active_ride');
        } else {
            localStorage.setItem('active_ride', JSON.stringify({
                status, pickup, drop, id: rideId, driver, otp, fare, vehicleType
            }));
        }
    }, [status, pickup, drop, rideId, driver, otp, fare, vehicleType]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isChatOpen]);

    useEffect(() => {
        const saved = localStorage.getItem('ride_history');
        if (saved) setHistory(JSON.parse(saved));
        
        // Assistant Plan
        const time = new Date().toTimeString().slice(0, 5);
        RideOrchestrator.planNextClassRide(MOCK_SCHEDULE, 85, [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng], time)
            .then(plan => setSmartPlan(plan));
    }, []);

    const addToHistory = (ride: any) => {
        setHistory(prev => {
            const newHistory = [ride, ...prev];
            localStorage.setItem('ride_history', JSON.stringify(newHistory));
            return newHistory;
        });
    };

    const fetchRoute = async (start: [number, number], end: [number, number]) => {
        if (!start || !end) return;
        try {
            const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`);
            const data = await response.json();
            if (data.routes && data.routes[0]) {
                const points = data.routes[0].geometry.coordinates.map((coord: any) => [coord[1], coord[0]]) as [number, number][];
                setCurrentRoute(points);
                setDistance((data.routes[0].distance / 1000).toFixed(1));
                setDuration(Math.round(data.routes[0].duration / 60).toString());
                setFare(Math.round((data.routes[0].distance / 1000) * (vehicleType === 'bike' ? 8 : 15)));
            }
        } catch (error) { console.error('Route Sync Error:', error); }
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
    }, [status, pickup, drop, vehicleType]); 

    useEffect(() => {
        let watchId: number;
        if ("geolocation" in navigator) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
                (err) => console.log("GPS Error:", err),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        }

        socket.on('ride_accepted', (data) => {
            setDriver(data.vehicle);
            if (data.rideId) setRideId(data.rideId);
            setStatus('accepted');
            setCurrentRoute(undefined);
            setMessages([]);
            setSheetState('mid'); // Auto expand
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
                setCurrentRoute(undefined);
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
                setTimeout(() => {
                    setView('receipt' as any);
                    setSheetState('full');
                }, 500);
            }
            if (data.status === 'cancelled') {
                setStatus('idle');
                setRideId(null);
                setDriver(null);
                showToast('RIDE CANCELLED BY PILOT', 'info');
            }
        });

        socket.on('ride_already_accepted', () => {
            showToast('MISSION INTERCEPTED: Ride taken by another Pilot!', 'info');
            setStatus('idle');
            setRideId(null);
            setDriver(null);
        });

        socket.on('blocked_account', () => {
            showToast('GRID ACCESS SUSPENDED', 'error');
            setTimeout(() => logout(), 3000);
        });

        return () => {
             if (watchId) navigator.geolocation.clearWatch(watchId);
             socket.off('ride_accepted');
             socket.off('status_change');
             socket.off('driver_location');
             socket.off('receive_message');
             socket.off('blocked_account');
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

    const sendQuickReply = (msg: string) => {
        if (!rideId) return;
        const msgData = { rideId, message: msg, sender: 'user', timestamp: new Date() };
        setMessages(prev => [...prev, msgData]);
        socket.emit('send_message', msgData);
    };

    const triggerSOS = async () => {
        setIsSOSLoading(true);
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/admin/sos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.uid,
                    userName: user.displayName || user.name,
                    userPhone: user.phone || user.phoneNumber,
                    rideId: rideId,
                    location: userLocation || [20.35, 85.82] // Fallback to Campus
                })
            });
            showToast('COMMAND CENTER ALERTED', 'success');
            setIsSOSLoading(false);
            setShowSOS(false);
        } catch (e) {
            showToast('UPLINK FAILED', 'error');
            setIsSOSLoading(false);
        }
    };

    const submitComplaint = async () => {
        if (!complaintText.trim()) return;
        const btn = document.activeElement as HTMLButtonElement;
        const originalText = btn?.innerText || "Submit Report";
        if(btn) { btn.innerText = "REPORTING..."; btn.disabled = true; }
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/admin/complaints`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.uid,
                    userName: user.displayName || user.name,
                    text: complaintText,
                    rideId: rideId,
                    driverInfo: driver
                })
            });
            if(btn) btn.innerText = "SUCCESS ✓";
            setTimeout(() => {
                setComplaintText('');
                setShowComplaint(false);
            }, 1500);
        } catch(e) { 
            if(btn) { btn.innerText = originalText; btn.disabled = false; }
            alert('Failed to log report.');
        }
    };

    const handleBooking = () => {
        if (!pickup || !drop) return;
        const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
        setOtp(newOtp);
        const rideData = {
            id: `RIDE-${Date.now()}`,
            userId: user.uid,
            userName: user.displayName || user.name || user.email?.split('@')[0] || 'Passenger',
            userPhone: user.phone || user.phoneNumber || '+919876543210',
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
        setSheetState('mid'); 
    };

    const cancelRide = () => {
        if(window.confirm('Cancel this ride?')) {
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
    if (dLoc_m && status !== 'idle') markers.push({ id: 'drop', type: 'target', position: [dLoc_m.lat, dLoc_m.lng], label: 'Destination' });
    if (driver?.location && status !== 'idle') markers.push({ id: 'driver', type: (driver.type || vehicleType) as any, position: driver.location, label: `${(driver.type || vehicleType).toUpperCase()} PILOT` });

    return (
        <div className="h-[100dvh] w-full bg-[#f0f0f0] overflow-hidden font-sans relative">
            {/* BACKGROUND MAP: Interactive unless typing */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-500 ${isInputFocused ? 'opacity-30' : 'opacity-100'} ${isInputFocused ? 'pointer-events-none' : 'auto'}`}>
                <RideMap 
                    center={status === 'ongoing' ? (driver?.location || [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng]) : (status === 'accepted' ? [KIIT_LOCATIONS.find(l => l.id === pickup)?.lat || CAMPUS_CENTER.lat, KIIT_LOCATIONS.find(l => l.id === pickup)?.lng || CAMPUS_CENTER.lng] : (userLocation || [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng]))} 
                    markers={markers} 
                    route={currentRoute} 
                    isOngoing={status === 'ongoing'}
                />
            </div>

            {/* TOP NAVIGATION / STATUS BAR */}
            <nav className="absolute top-0 left-0 right-0 p-4 z-[100] flex justify-between items-center bg-transparent pointer-events-none">
                <button 
                  onClick={() => setIsMenuOpen(true)}
                  className="p-4 bg-white/95 backdrop-blur-sm rounded-full shadow-lg pointer-events-auto active:scale-90 transition-transform"
                >
                    <Menu className="w-6 h-6 text-black" />
                </button>
                <div className="flex gap-2 pointer-events-auto">
                    <div className="bg-white/95 backdrop-blur-md px-5 py-3 rounded-full shadow-lg flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-[#00C853] rounded-full animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#212121]">Network Live</span>
                    </div>
                    <button onClick={() => setShowComplaint(true)} className="bg-white/95 backdrop-blur-md px-5 py-3 rounded-full shadow-lg flex items-center gap-2 border border-red-100 text-red-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">
                        <Activity size={14} /> Support
                    </button>
                </div>
            </nav>

            {/* SIDEBAR OVERLAY */}
            <AnimatePresence>
                {isMenuOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMenuOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000]" />
                        <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} className="fixed top-0 left-0 bottom-0 w-[280px] sm:w-[320px] bg-white z-[2001] border-r border-gray-100 flex flex-col pt-10">
                            <div className="px-8 pb-8 border-b border-gray-100">
                                <div className="w-16 h-16 bg-[#00C853]/10 text-[#00C853] flex items-center justify-center rounded-full mb-4">
                                    <UserIcon size={32} />
                                </div>
                                <h1 className="text-2xl font-black tracking-tighter text-[#212121] truncate">{user?.displayName || user?.name || user?.email?.split('@')[0] || 'Passenger'}</h1>
                                <p className="text-[10px] font-bold text-[#00C853] mt-1 uppercase tracking-widest">{user?.phoneNumber || user?.email || 'Verified Account'}</p>
                            </div>
                            <div className="space-y-1 p-4 flex-1 overflow-y-auto">
                                {[
                                    { icon: <Activity size={20}/>, label: 'Activity', action: () => { setView('history' as any); setSheetState('full'); setIsMenuOpen(false); } },
                                    { icon: <Star size={20}/>, label: 'Saved Places', action: () => setIsMenuOpen(false) },
                                    { icon: <IndianRupee size={20}/>, label: 'Payments', action: () => setIsMenuOpen(false) },
                                    { icon: <ShieldCheck size={20}/>, label: 'Safety', action: () => { setShowSOS(true); setIsMenuOpen(false); } },
                                ].map((item, i) => (
                                    <button onClick={item.action} key={i} className="w-full px-5 py-4 text-left font-bold text-gray-700 flex items-center gap-4 hover:bg-gray-50 rounded-2xl transition-all">
                                        <div className="text-gray-400">{item.icon}</div>
                                        <span className="flex-1">{item.label}</span>
                                        <ChevronUp className="rotate-90 w-4 h-4 text-gray-300" />
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => { if(window.confirm('Disconnect from Grid?')) logout(); }} className="mt-auto m-6 py-5 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest active:scale-95 transition-transform">
                                <LogOut size={16} /> Disconnect
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* UBER MODAL BOTTOM SHEET */}
            <motion.div 
                className="fixed bottom-0 left-0 w-full bg-white shadow-[0_-20px_60px_rgba(0,0,0,0.15)] z-[1000] rounded-t-[32px] h-[90vh] flex flex-col"
                animate={sheetState}
                variants={{
                    collapsed: { y: '80%' },
                    mid: { y: '35%' },
                    full: { y: '0%' }
                }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                drag={isInputFocused ? false : "y"}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.2}
                onDragEnd={(e, info) => {
                    const offset = info.offset.y;
                    const velocity = info.velocity.y;
                    if (offset < -50 || velocity < -500) {
                        setSheetState(prev => prev === 'collapsed' ? 'mid' : 'full');
                    } else if (offset > 50 || velocity > 500) {
                        setSheetState(prev => prev === 'full' ? 'mid' : 'collapsed');
                    }
                }}
            >
                {/* Drag Handle Area */}
                <div 
                  className="w-full flex justify-center py-4 cursor-grab active:cursor-grabbing shrink-0" 
                  onPointerDown={(e) => dragControls.start(e)}
                  style={{ touchAction: "none" }}
                  onClick={() => setSheetState(prev => prev === 'mid' ? 'full' : 'mid')}
                >
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>
                
                {/* Scrollable Content inside sheet */}
                <div className="flex-1 overflow-y-auto px-6 lg:px-10 pb-24 no-scrollbar">
                    {/* TABS ENGINE */}
                    {status === 'idle' && (
                        <div className="flex bg-[#F5F5F5] p-1.5 rounded-2xl mb-8 relative">
                            {['main', 'assistant', 'history'].map((v) => (
                                <button 
                                    key={v} 
                                    onClick={() => {
                                        setView(v as any);
                                        setSheetState('full');
                                    }}
                                    className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest relative z-10 transition-colors duration-300 ${view === v ? 'text-[#00C853]' : 'text-[#757575]'}`}
                                >
                                    {v === 'main' ? 'Book' : v === 'assistant' ? 'Smart' : 'History'}
                                </button>
                            ))}
                            <motion.div 
                                className="absolute top-1.5 bottom-1.5 bg-white shadow-sm border border-gray-100 rounded-xl z-0"
                                initial={false}
                                animate={{ 
                                    left: view === 'main' ? '6px' : view === 'assistant' ? '33.33%' : 'calc(66.66% - 2px)',
                                    width: 'calc(33.33% - 4px)'
                                }}
                            />
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        {status === 'idle' && view === 'main' && (
                            <motion.div key="booking" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
                                {/* LOCATION SECTION */}
                                <div className="space-y-3 relative z-[100]">
                                    <LocationInput 
                                        label="Pickup Point" 
                                        value={pickup} 
                                        onChange={(val: string) => { setPickup(val); setSheetState('mid'); setIsInputFocused(false); }} 
                                        icon={<div className="w-3 h-3 bg-black rounded-full shadow-[0_0_0_4px_rgba(0,0,0,0.1)]"/>} 
                                        placeholder="Current Location"
                                        onFocus={() => { setIsInputFocused(true); setSheetState('full'); }}
                                        onBlur={() => {}}
                                    />
                                    <div className="absolute left-[30px] top-[40px] bottom-[40px] w-0.5 bg-gray-200 z-[-1]" />
                                    <LocationInput 
                                        label="Where to?" 
                                        value={drop} 
                                        onChange={(val: string) => { setDrop(val); setSheetState('mid'); setIsInputFocused(false); }} 
                                        icon={<div className="w-3 h-3 bg-[#00C853] rounded-sm shadow-[0_0_0_4px_rgba(0,200,83,0.1)]"/>} 
                                        placeholder="Enter Destination"
                                        onFocus={() => { setIsInputFocused(true); setSheetState('full'); }}
                                        onBlur={() => {}}
                                    />
                                </div>

                                {/* PRICE AND DISTANCE CARD */}
                                {pickup && drop && distance !== '0.0' && !isInputFocused && (
                                    <div className="bg-[#F9F9F9] p-5 rounded-3xl flex justify-between items-center border border-gray-100">
                                        <div className="flex items-center gap-4 text-[#212121]">
                                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                                                <Navigation size={18} className="text-[#00C853] rotate-45" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Route Info</p>
                                                <p className="text-base font-bold">{distance} KM • <span className="text-[#00C853]">{duration} MIN</span></p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* VEHICLE SELECTION */}
                                {!isInputFocused && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <VehicleCard 
                                            type="bike" 
                                            selected={vehicleType === 'bike'} 
                                            onClick={() => setVehicleType('bike')}
                                            eta={`${duration}m`}
                                            price={`₹${Math.round(fare * 0.6)}`}
                                            icon={<Bike size={28} />}
                                        />
                                        <VehicleCard 
                                            type="car" 
                                            selected={vehicleType === 'car'} 
                                            onClick={() => setVehicleType('car')}
                                            eta={`${duration}m`}
                                            price={`₹${fare}`}
                                            icon={<Car size={28} />}
                                        />
                                    </div>
                                )}

                                {/* CTA BUTTON */}
                                {!isInputFocused && (
                                    <button 
                                        onClick={handleBooking}
                                        disabled={!pickup || !drop}
                                        className="w-full py-[22px] bg-[#00C853] text-white rounded-[24px] font-black text-[13px] uppercase tracking-[0.2em] hover:bg-[#00E676] active:scale-[0.98] transition-all shadow-[0_10px_30px_rgba(0,200,83,0.3)] disabled:opacity-30 flex items-center justify-center gap-3 disabled:shadow-none"
                                    >
                                        Start Ride
                                    </button>
                                )}
                            </motion.div>
                        )}

                        {status === 'searching' && (
                            <motion.div key="searching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 flex flex-col items-center">
                                <div className="relative w-24 h-24 mb-10">
                                    <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                                    <motion.div className="absolute inset-0 border-4 border-[#00C853] border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
                                    <Search className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#00C853]" size={32} />
                                </div>
                                <h2 className="text-2xl font-black tracking-tighter text-[#212121]">Finding your ride...</h2>
                                <p className="text-xs font-bold text-gray-500 mt-2 mb-8 uppercase tracking-widest text-center px-6">Contacting nearby pilots in grid.<br/>Your Gate Pass OTP will be assigned upon pilot arrival.</p>

                                <button onClick={cancelRide} className="mt-10 py-4 px-8 bg-red-50 text-red-500 rounded-full font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">Cancel Request</button>
                            </motion.div>
                        )}

                        {(status === 'accepted' || status === 'ongoing') && (
                            <motion.div key="accepted" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                                <div className="bg-[#F9F9F9] border border-gray-100 p-6 rounded-[2rem] flex items-center gap-5">
                                    <div className="w-16 h-16 bg-white shadow-sm rounded-full flex items-center justify-center text-[#00C853]">
                                        {vehicleType === 'bike' ? <Bike size={32} /> : <Car size={32} />}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-black uppercase tracking-tight text-[#212121]">{driver?.pilot || 'Alex'}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="px-2 py-1 bg-gray-200 rounded text-[9px] font-black uppercase">{driver?.plate || 'Verified'}</span>
                                            <span className="text-sm font-bold text-gray-500 flex items-center gap-1"><Star size={12} fill="currentColor" className="text-yellow-500"/> 4.9</span>
                                        </div>
                                    </div>
                                </div>

                                {status === 'accepted' && (
                                    <div className="bg-[#E8F5E9] p-6 rounded-[2rem] flex justify-between items-center border border-[#00C853]/20">
                                        <div>
                                            <p className="text-[10px] font-black text-[#00C853] uppercase tracking-widest mb-1">Gate Pass OTP</p>
                                            <p className="text-4xl font-black tracking-widest text-[#212121]">{otp}</p>
                                        </div>
                                        <ShieldCheck size={40} className="text-[#00C853] opacity-20" />
                                    </div>
                                )}

                                <div className="bg-gray-50 border border-gray-100 p-6 rounded-[2rem] flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center">
                                        <Clock className="w-5 h-5 text-[#00C853] animate-pulse" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            {status === 'accepted' ? 'Pilot arriving in' : 'Reaching destination in'}
                                        </p>
                                        <p className="text-lg font-black">{status === 'accepted' ? driverDistance : distance} KM • {duration} MINS</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <a href={`tel:${driver?.phone || '+910000000000'}`} className="flex py-5 bg-white border border-gray-200 rounded-3xl items-center justify-center gap-3 text-[11px] font-black uppercase text-[#212121] shadow-sm active:scale-95 transition-all">
                                        <Phone size={18} className="text-blue-500" /> Phone
                                    </a>
                                    <button onClick={() => setIsChatOpen(true)} className="flex py-5 bg-white border border-gray-200 rounded-3xl items-center justify-center gap-3 text-[11px] font-black uppercase text-[#212121] shadow-sm active:scale-95 transition-all relative">
                                        <MessageSquare size={18} className="text-[#00C853]" /> Chat
                                        {messages.length > 0 && <span className="absolute top-4 right-[25%] w-2 h-2 bg-red-500 rounded-full animate-ping" />}
                                    </button>
                                </div>
                                
                                <button onClick={() => setCancelReasonOpen(true)} className="w-full py-4 text-[10px] font-black text-red-500 uppercase tracking-widest hover:bg-red-50 rounded-2xl transition-all">Cancel Ride</button>
                                
                                {status === 'ongoing' && <button onClick={() => setShowSOS(true)} className="w-full bg-red-100/50 border border-red-200 p-5 rounded-3xl text-red-600 font-black text-[11px] uppercase flex items-center justify-center gap-3"><AlertTriangle size={16} /> Emergency SOS</button>}
                            </motion.div>
                        )}

                        {/* --- ASSISTANT AND HISTORY VIEWS (MIGRATED AND POLISHED) --- */}
                        {view === 'assistant' && (
                            <motion.div key="assistant" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                                <header className="bg-[#E8F5E9] border border-[#00C853]/20 p-6 rounded-[2rem] flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-black uppercase tracking-tighter text-[#00C853]">Smart Predict</h3>
                                        <p className="text-[10px] font-bold text-gray-500 uppercase mt-1">Autonomous Planning</p>
                                    </div>
                                    <Sparkles size={32} className="text-[#00C853] opacity-40" />
                                </header>

                                {smartPlan ? (
                                    <div className="space-y-6">
                                        <div className="bg-white border border-gray-100 p-6 rounded-[2rem] shadow-sm">
                                            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-50">
                                                <div className="p-3 bg-blue-50 text-blue-500 rounded-2xl"><Calendar size={20} /></div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Next Class Suggestion</p>
                                                    <p className="text-base font-black truncate">{MOCK_SCHEDULE[0].subject}</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-gray-50 p-4 rounded-2xl">
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Start Time</p>
                                                    <p className="text-sm font-black text-black">16:00</p>
                                                </div>
                                                <div className="bg-[#E8F5E9] p-4 rounded-2xl">
                                                    <p className="text-[9px] font-bold text-[#00C853] uppercase mb-1">Leave By</p>
                                                    <p className="text-sm font-black text-[#00C853]">{smartPlan.recommendedDeparture}</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    setDrop(MOCK_SCHEDULE[0].location.id);
                                                    setView('main');
                                                }}
                                                className="w-full mt-6 py-4 bg-black text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
                                            >
                                                Fill Route Details
                                            </button>
                                        </div>
                                    </div>
                                ) : <div className="py-20 text-center"><ActivityIndicator /></div>}
                            </motion.div>
                        )}

                        {view === 'history' && (
                            <motion.div key="history" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col gap-4">
                                <h3 className="text-lg font-black uppercase tracking-tighter text-[#212121] mb-2 px-2">Past Rides</h3>
                                {history.length > 0 ? history.map((h, i) => (
                                    <div key={i} className="bg-white border border-gray-100 p-5 rounded-3xl flex justify-between items-center shadow-sm hover:border-gray-300 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400"><MapIcon size={16} /></div>
                                            <div>
                                                <p className="text-xs font-black text-[#212121] uppercase w-48 truncate">{h.from} → {h.to}</p>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">{h.date} • {h.type}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black">₹{h.fare}</p>
                                            <p className="text-[9px] font-bold text-[#00C853] uppercase mt-1 flex items-center justify-end gap-1"><CheckCircle2 size={10} /> Paid</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-16 opacity-50"><Clock size={48} className="mx-auto mb-4 text-gray-300" /><p className="text-[10px] font-black uppercase tracking-widest">No rides yet</p></div>
                                )}
                            </motion.div>
                        )}

                        {view === 'receipt' as any && (
                            <motion.div key="receipt" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6 py-6">
                                <div className="text-center">
                                    <div className="w-24 h-24 bg-[#00C853] text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_10px_30px_rgba(0,200,83,0.3)]"><CheckCircle2 size={48} /></div>
                                    <h2 className="text-3xl font-black uppercase tracking-tighter text-[#212121]">You've Arrived</h2>
                                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mt-2">{new Date().toLocaleString()}</p>
                                </div>
                                <div className="bg-[#F9F9F9] border border-gray-100 p-8 rounded-[2.5rem]">
                                    <div className="flex justify-between items-center pb-6 border-b border-gray-200">
                                        <p className="text-sm font-bold text-gray-500 uppercase">Paid Amount</p>
                                        <p className="text-4xl font-black text-[#00C853]">₹{fare}</p>
                                    </div>
                                    <div className="pt-6 text-center">
                                        <p className="text-[10px] font-black text-[#212121] uppercase tracking-widest mb-4">Rate your pilot</p>
                                        <div className="flex gap-2 justify-center">
                                            {[1,2,3,4,5].map(s => (
                                                <button key={s} onClick={() => setRating(s)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${rating >= s ? 'bg-yellow-400 text-white shadow-lg' : 'bg-white border border-gray-200 text-gray-300'}`}><Star size={20} fill={rating >= s ? "currentColor" : "none"} /></button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => { setView('main'); setStatus('idle'); setRideId(null); setDriver(null); setRating(0); }} className="w-full mt-4 py-5 bg-black text-white rounded-[2rem] font-black text-xs uppercase tracking-widest active:scale-95 transition-all">Done</button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>

            {/* FULL SCREEN MODALS */}
            <AnimatePresence>
                {isCalling && (
                    <motion.div className="fixed inset-0 z-[6000] bg-[#111111] text-white flex flex-col items-center justify-center p-10">
                        <div className="w-32 h-32 bg-[#00C853]/20 rounded-full flex items-center justify-center mb-10 relative">
                            <div className="absolute inset-0 border-2 border-[#00C853] rounded-full animate-ping opacity-50" />
                            <Phone size={48} className="text-[#00C853]" />
                        </div>
                        <h2 className="text-3xl font-black uppercase tracking-tighter">{driver?.pilot || 'Alex'}</h2>
                        <p className="text-sm font-bold text-gray-400 mt-2">Calling...</p>
                        <a href={`tel:${driver?.phone || '+910000000000'}`} onClick={() => setIsCalling(false)} className="mt-20 px-8 py-4 bg-blue-500 rounded-full font-black text-sm uppercase tracking-widest shadow-lg flex items-center gap-3"><Phone size={24} /> Dial Number</a>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {cancelReasonOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[6000] bg-black/60 flex flex-col justify-end p-2">
                        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="bg-white rounded-[32px] p-6 lg:p-10 shadow-2xl relative">
                            <h2 className="text-2xl font-black uppercase tracking-tighter mb-6 underline decoration-red-500 decoration-4 underline-offset-4">Why Cancel?</h2>
                            <div className="space-y-3">
                                {["Driver requested extra cash", "Driver is not moving", "Changed my mind", "Wait time is too long"].map((rsn, idx) => (
                                    <button 
                                        key={idx} 
                                        onClick={() => {
                                            cancelRide();
                                            setCancelReasonOpen(false);
                                        }}
                                        className="w-full text-left px-7 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] font-black text-[13px] uppercase tracking-tighter text-slate-800 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 transition-all active:scale-98 shadow-sm"
                                    >
                                        {rsn}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => setCancelReasonOpen(false)} className="w-full mt-6 py-5 bg-black text-white rounded-full font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all">Keep Ride</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isChatOpen && (
                    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed inset-0 bg-white z-[5500] flex flex-col">
                        <header className="p-6 border-b border-gray-100 flex items-center justify-between bg-white/90 backdrop-blur-md sticky top-0">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setIsChatOpen(false)} className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center active:scale-95"><X size={20}/></button>
                                <div>
                                    <h3 className="text-lg font-black uppercase tracking-tighter">{driver?.pilot || 'Pilot'}</h3>
                                    <p className="text-[10px] font-bold text-[#00C853] uppercase tracking-widest">Online</p>
                                </div>
                            </div>
                        </header>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar bg-[#F9F9F9]">
                            <div className="text-center"><span className="px-3 py-1 bg-gray-200 rounded-full text-[10px] font-bold text-gray-500 uppercase">Chat Secured</span></div>
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[75%] p-4 rounded-[20px] text-[13px] font-bold ${m.sender === 'user' ? 'bg-[#00C853] text-white rounded-br-sm shadow-md' : 'bg-gray-200 text-gray-900 rounded-bl-sm shadow-sm'}`}>
                                        {m.message}
                                    </div>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                        <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar border-t border-gray-100 bg-white shadow-sm shrink-0">
                            {["I'm waiting at pickup", "Where are you?", "Okay", "On my way"].map((qr, idx) => (
                                <button key={idx} onClick={() => sendQuickReply(qr)} className="whitespace-nowrap px-4 py-2 bg-gray-100 rounded-full text-[11px] font-bold text-gray-600 hover:bg-gray-200 active:scale-95">{qr}</button>
                            ))}
                        </div>
                        <form onSubmit={handleSendMessage} className="p-4 bg-white flex gap-3 pb-8 shrink-0">
                            <input value={newMessage} onChange={e => setNewMessage(e.target.value)} className="flex-1 bg-gray-100 px-6 py-4 rounded-full outline-none font-bold text-sm placeholder:text-gray-400" placeholder="Type a message..." />
                            <button className="w-14 h-14 bg-[#00C853] text-white rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform"><Send size={20} /></button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showSOS && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[7000] flex items-center justify-center p-6 pb-20 bg-black/80 backdrop-blur-sm">
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white w-full max-w-sm p-8 rounded-[2.5rem] text-center shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-red-500 animate-pulse" />
                            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500"><AlertTriangle size={36} /></div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-[#212121]">Emergency SOS</h2>
                            <p className="text-sm font-bold text-gray-500 mt-3 mb-8">This will immediately alert Campus Security and broadcast your live location.</p>
                            <button onClick={triggerSOS} disabled={isSOSLoading} className="w-full py-5 bg-red-500 text-white rounded-[20px] font-black uppercase tracking-widest hover:bg-red-600 active:scale-95 transition-transform shadow-[0_10px_30px_rgba(239,68,68,0.3)] mb-4 disabled:opacity-50">
                                {isSOSLoading ? 'Triggering...' : 'Trigger Alarm'}
                            </button>
                            <button onClick={() => setShowSOS(false)} className="text-xs font-bold text-gray-400 hover:text-gray-600 uppercase tracking-widest">Cancel</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showComplaint && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[7000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white w-full max-w-sm p-8 rounded-[2.5rem] shadow-2xl">
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-[#212121]">Log Complaint</h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2 mb-6">Describe the issue for Admin review</p>
                            <textarea 
                                value={complaintText}
                                onChange={e => setComplaintText(e.target.value)}
                                className="w-full h-40 bg-slate-50 border-2 border-slate-200 rounded-[2rem] p-6 text-[15px] font-black italic tracking-tight text-slate-900 outline-none focus:border-[#00C853] transition-all mb-6 resize-none shadow-inner"
                                placeholder="Example: Driver asked for extra money..."
                            />
                            <button onClick={submitComplaint} className="w-full py-5 bg-black text-white rounded-[20px] font-black uppercase tracking-widest active:scale-95 transition-transform shadow-xl mb-4">Submit Report</button>
                            <button onClick={() => setShowComplaint(false)} className="w-full text-xs font-bold text-gray-400 uppercase tracking-widest">Maybe Later</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {toast && (
                    <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 20, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="fixed top-20 left-0 right-0 z-[9999] flex justify-center pointer-events-none px-6">
                        <div className={`px-6 py-4 rounded-2xl shadow-2xl font-black text-[11px] uppercase tracking-widest flex items-center gap-3 border ${toast.type === 'error' ? 'bg-rose-500 text-white border-rose-400' : 'bg-slate-900 text-white border-slate-700'}`}>
                            {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                            {toast.message}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ---------------- SUB COMPONENTS ---------------- //

function LocationInput({ label, value, onChange, icon, placeholder, onFocus, onBlur }: any) {
    const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
    const selectedLoc = KIIT_LOCATIONS.find(l => l.id === value);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close autocomplete when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsAutocompleteOpen(false);
                onBlur();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onBlur]);

    return (
        <div className="flex flex-col relative" ref={containerRef}>
            <div className={`flex items-center gap-4 p-4 bg-white border ${isAutocompleteOpen ? 'border-[#00C853] shadow-[0_0_0_4px_rgba(0,200,83,0.05)]' : 'border-gray-200'} rounded-2xl transition-all`}>
                <div className="shrink-0">{icon}</div>
                <div className="flex-1 pr-6">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-0.5">{label}</p>
                    <input 
                      className="w-full font-black text-[13px] uppercase tracking-tighter text-[#212121] outline-none bg-transparent placeholder:text-gray-300" 
                      value={selectedLoc?.name || ''} 
                      placeholder={placeholder}
                      readOnly
                      onClick={() => {
                          setIsAutocompleteOpen(true);
                          onFocus();
                      }}
                    />
                </div>
                {value && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onChange(''); }}
                        className="absolute right-4 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            <AnimatePresence>
                {isAutocompleteOpen && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: 'auto' }} 
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mt-1"
                    >
                        <div className="bg-white border border-gray-100 rounded-2xl shadow-inner max-h-52 overflow-y-auto no-scrollbar">
                            {KIIT_LOCATIONS.map(loc => (
                                <button 
                                    key={loc.id} 
                                    onClick={() => { onChange(loc.id); setIsAutocompleteOpen(false); onBlur(); }}
                                    className={`w-full text-left px-5 py-4 border-b border-gray-50 text-[11px] font-black uppercase tracking-widest transition-all focus:outline-none flex items-center gap-3 ${value === loc.id ? 'bg-[#E8F5E9] text-[#00C853]' : 'bg-transparent text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <MapPin size={14} className={value === loc.id ? 'text-[#00C853]' : 'text-gray-400'} />
                                    {loc.name}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function VehicleCard({ type, selected, onClick, eta, price, icon }: any) {
    return (
        <motion.button 
            onClick={onClick}
            whileTap={{ scale: 0.95 }}
            className={`p-4 rounded-3xl border-2 transition-all flex flex-col gap-3 relative overflow-hidden text-left ${selected ? 'bg-[#E8F5E9] border-[#00C853] shadow-[0_8px_20px_rgba(0,200,83,0.15)]' : 'bg-[#F9F9F9] border-transparent'}`}
        >
            <div className="flex justify-between items-start w-full">
                <div className={`p-2 rounded-xl transition-colors ${selected ? 'bg-[#00C853] text-white' : 'bg-white shadow-sm text-gray-600'}`}>
                    {icon}
                </div>
                <div className="text-right">
                    <p className={`text-base font-black ${selected ? 'text-[#00C853]' : 'text-[#212121]'}`}>{price}</p>
                </div>
            </div>
            
            <div>
                <p className={`text-xs font-black uppercase tracking-tight ${selected ? 'text-[#212121]' : 'text-gray-500'}`}>EV {type}</p>
                <p className={`text-[10px] font-bold uppercase mt-0.5 flex items-center gap-1 ${selected ? 'text-[#00C853]' : 'text-gray-400'}`}>
                    <Clock size={10} /> Drop in {eta}
                </p>
            </div>
            
            {/* selected ring indicator */}
            {selected && <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-[#00C853]" />}
        </motion.button>
    );
}

function ActivityIndicator() {
    return (
        <div className="relative w-20 h-20">
            <motion.div className="absolute inset-0 border-4 border-[#00C853]/10 rounded-full" />
            <motion.div 
               className="absolute inset-0 border-[5px] border-[#00C853] rounded-full border-t-transparent border-l-transparent"
               animate={{ rotate: 360 }}
               transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            />
            <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#00C853] w-8 h-8" />
        </div>
    );
}
