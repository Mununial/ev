import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import RideMap from '../components/RideMap';
import { Power, Car, Bike, Battery, Shield, Activity, MapPin, Navigation, ArrowRight, CheckCircle2, Menu, X, IndianRupee, Clock, Settings, AlertTriangle, Phone, User as UserIcon, MessageSquare, Send, Mic, Headset, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CAMPUS_CENTER } from '../data/kiitData';
import { useAuth } from '../context/AuthContext';

const socket = io(import.meta.env.VITE_API_URL);

export default function ProviderDashboard() {
    const { user, logout } = useAuth();
    const [isOnline, setIsOnline] = useState(false);
    const [status, setStatus] = useState<'idle' | 'pending' | 'accepted' | 'ongoing'>('idle');
    const [rideRequest, setRideRequest] = useState<any>(null);
    const [location, setLocation] = useState<[number, number]>([CAMPUS_CENTER.lat, CAMPUS_CENTER.lng]);
    const [history, setHistory] = useState<any[]>([]);
    const [battery, setBattery] = useState(Math.floor(70 + Math.random() * 20));
    const [otpInput, setOtpInput] = useState('');
    const [otpError, setOtpError] = useState(false);
    const [distance, setDistance] = useState<string>('0.0');
    const [currentRoute, setCurrentRoute] = useState<[number, number][] | undefined>(undefined);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [view, setView] = useState<'main' | 'stats'>('main');
    const [showSOS, setShowSOS] = useState(false);
    const [earnings] = useState({ today: '₹840', missions: 12 });

    useEffect(() => {
        const saved = localStorage.getItem('pilot_history');
        if (saved) setHistory(JSON.parse(saved));
    }, []);

    const addToHistory = (ride: any) => {
        const newHist = [ride, ...history].slice(0, 20);
        setHistory(newHist);
        localStorage.setItem('pilot_history', JSON.stringify(newHist));
    };

    // Chat states
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const [isCalling, setIsCalling] = useState(false);

    const providerId = user?.uid?.slice(-6).toUpperCase() || 'SMILESPHERE-P';
    const vehicle = { 
        model: user?.vehicleType === 'Bike' ? 'EV Bike' : (user?.vehicleType === 'EV' ? 'EV Car' : 'Custom Node'), 
        plate: user?.vehicleNumber || `OD-02-EV-${providerId}`, 
        battery: battery,
        pilot: user?.name || user?.displayName || 'Authorized Pilot',
        phone: user?.phone || user?.phoneNumber || '+910000000000'
    };

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isChatOpen]);

    useEffect(() => {
        socket.on('receive_message', (data) => {
            setMessages(prev => [...prev, data]);
        });
        return () => {
             socket.off('receive_message');
        };
    }, []);

    useEffect(() => {
        socket.on('new_ride_request', (data) => {
            if (isOnline && status === 'idle') {
                setRideRequest(data);
                setStatus('pending');
                setMessages([]);
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
                audio.play().catch(() => console.log('Audio Blocked'));
            }
        });

        socket.on('ride_already_accepted', () => {
            alert('Mission Intercepted: This ride was securely taken by another Pilot!');
            setStatus('idle');
            setRideRequest(null);
            setCurrentRoute([]);
        });

        return () => {
            socket.off('new_ride_request');
            socket.off('ride_already_accepted');
        };
    }, [isOnline, status]);

    useEffect(() => {
        if (isOnline) {
            const interval = setInterval(() => {
                socket.emit('update_location', { 
                    providerId, 
                    location, 
                    vehicle,
                    rideId: rideRequest?.id 
                });
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [isOnline, location, rideRequest]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !rideRequest?.id) return;
        const msgData = {
            rideId: rideRequest.id,
            message: newMessage,
            sender: 'provider',
            timestamp: new Date()
        };
        // Optimistic update
        setMessages(prev => [...prev, msgData]);
        socket.emit('send_message', msgData);
        setNewMessage('');
    };

    const sendQuickReply = (msg: string) => {
        if (!rideRequest?.id) return;
        const msgData = { rideId: rideRequest.id, message: msg, sender: 'provider', timestamp: new Date() };
        setMessages(prev => [...prev, msgData]);
        socket.emit('send_message', msgData);
    };

    const fetchRoute = async (start: [number, number], end: [number, number]) => {
        try {
            const resp = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`);
            const data = await resp.json();
            if (data.routes && data.routes[0]) {
                const coords = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
                setCurrentRoute(coords);
                setDistance((data.routes[0].distance / 1000).toFixed(1));
            }
        } catch (e) {
            setCurrentRoute([start, end]);
        }
    };

    const toggleOnline = () => {
        if (!isOnline) {
            socket.emit('provider_online', { providerId, location, vehicle, uid: user?.uid });
        } else {
            window.location.reload();
        }
        setIsOnline(!isOnline);
    };

    const acceptRide = () => {
        socket.emit('accept_ride', { rideId: rideRequest.id, providerId, uid: user?.uid });
        setStatus('accepted');
        if (rideRequest?.pickup) {
            fetchRoute(location, [rideRequest.pickup.lat, rideRequest.pickup.lng]);
        }
    };

    const verifyOtp = () => {
        if (otpInput === rideRequest?.otp) {
            setOtpError(false);
            setStatus('ongoing');
            socket.emit('update_ride_status', { rideId: rideRequest.id, status: 'ongoing' });
        } else {
            setOtpError(true);
            setTimeout(() => setOtpError(false), 2000);
        }
    };

    useEffect(() => {
        if (status === 'accepted' && rideRequest?.pickup) {
            fetchRoute(location, [rideRequest.pickup.lat, rideRequest.pickup.lng]);
        } else if (status === 'ongoing' && rideRequest?.pickup && rideRequest?.drop) {
            fetchRoute([rideRequest.pickup.lat, rideRequest.pickup.lng], [rideRequest.drop.lat, rideRequest.drop.lng]);
        }
    }, [status, location, rideRequest]);

    return (
        <div className="h-[100dvh] w-full lg:flex lg:flex-row bg-slate-50 overflow-hidden font-sans text-slate-900 relative">
            {/* Control Sidebar */}
            <div className="absolute lg:relative top-0 left-0 w-full max-h-[50vh] lg:max-h-none lg:h-full lg:w-[420px] bg-white border-b lg:border-r lg:border-b-0 border-slate-300 p-4 pb-6 lg:p-10 flex flex-col gap-4 lg:gap-8 z-[100] shrink-0 shadow-[0_20px_50px_rgba(0,0,0,0.2)] rounded-b-[2rem] lg:rounded-none overflow-hidden">
                <header className="flex justify-between items-center px-1 lg:px-0">
                    <div className="flex items-center gap-3 lg:gap-5">
                        <button onClick={() => setIsMenuOpen(true)} className="p-3 bg-slate-100 rounded-2xl lg:hidden hover:bg-slate-200 border border-slate-300"><Menu className="w-5 h-5 text-slate-400" /></button>
                        <div>
                            <h1 className="text-xl lg:text-3xl font-black italic tracking-tighter leading-none italic uppercase">SMILESPHERE <span className="text-primary-500">PILOT</span></h1>
                            <p className="text-[8px] lg:text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1 lg:mt-2 opacity-60">Grid Protocol 4.1</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="hidden lg:flex gap-2 mr-2 border-r border-slate-200 pr-2">
                            <button onClick={() => setView('main')} className={`px-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${view === 'main' ? 'bg-primary-500 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Mission</button>
                            <button onClick={() => setView('stats')} className={`px-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${view === 'stats' ? 'bg-primary-500 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>History</button>
                        </div>
                        <button onClick={toggleOnline} className={`px-4 py-2.5 rounded-2xl font-black text-[9px] lg:text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-xl ${isOnline ? 'bg-ev-green text-slate-950 shadow-ev-green/20' : 'bg-slate-800 text-slate-400 grayscale'}`}>
                            <Power className={`w-3.5 h-3.5 ${isOnline ? 'animate-pulse' : ''}`} /> {isOnline ? 'Active' : 'Standby'}
                        </button>
                        <button onClick={() => { if(window.confirm('Disconnect Pilot?')) logout(); }} className="p-3 bg-slate-100 border border-slate-300 rounded-2xl text-slate-500 hover:text-rose-500 transition-all">
                            <LogOut size={16} />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto pr-1 pb-10 custom-scrollbar flex flex-col gap-5 lg:gap-8">
                    {view === 'main' ? (
                        <>
                            <div className="bg-slate-100 border border-slate-300 p-4 lg:p-6 rounded-2xl lg:rounded-[2rem] grid grid-cols-2 gap-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 lg:p-3 rounded-lg ${battery < 20 ? 'bg-rose-500/10 text-rose-500' : 'bg-ev-green/10 text-ev-green'}`}><Battery className="w-5 h-5" /></div>
                                    <p className="text-xl font-black italic tracking-tighter uppercase">{battery}%</p>
                                </div>
                                <div className="flex items-center gap-2 justify-end text-slate-500"><Shield size={16} /><p className="text-[9px] font-black uppercase tracking-widest">Secure Uplink</p></div>
                            </div>

                            <div className="bg-slate-100 border border-slate-300 p-5 rounded-2xl lg:rounded-[2rem]">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4">Registered Vehicle Profile</h3>
                                <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-primary-100/50 text-slate-800 rounded-lg border border-slate-300">
                                            {user?.vehicleType === 'Bike' ? <Bike className="w-5 h-5" /> : <Car className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black uppercase tracking-tight">{vehicle.model}</p>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">{user?.vehicleType || 'EV'} CLASS</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[11px] bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-black uppercase tracking-[0.2em] border border-slate-300 shadow-inner">
                                            {vehicle.plate}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                {status === 'idle' && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-10 lg:py-16 text-center glass-card border-dashed border-2 border-slate-300 rounded-[2rem] lg:rounded-[3rem]">
                                        {user?.vehicleType === 'Bike' ? <Bike className={`w-16 h-16 lg:w-24 lg:h-24 ${isOnline ? 'text-ev-green animate-pulse' : 'text-slate-800 opacity-20'}`} /> : <Car className={`w-16 h-16 lg:w-24 lg:h-24 ${isOnline ? 'text-ev-green animate-pulse' : 'text-slate-800 opacity-20'}`} />}
                                        <h2 className="text-lg lg:text-2xl font-black italic uppercase mt-6 tracking-tighter">{isOnline ? 'Network Scanning...' : 'System Latent'}</h2>
                                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-2">Awaiting Grid Dispatch</p>
                                    </motion.div>
                                )}

                                {status === 'pending' && rideRequest && (
                                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-indigo-600 p-6 rounded-[2rem] lg:rounded-[2.5rem] shadow-2xl">
                                        <div className="flex justify-between items-center mb-6">
                                            <h2 className="text-xl font-black italic uppercase leading-none">Task Broadcast</h2>
                                            <span className="bg-white text-indigo-600 text-[10px] px-4 py-1 rounded-full font-black uppercase tracking-widest italic">₹{rideRequest?.fare}</span>
                                        </div>
                                        <div className="space-y-4 mb-8">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Mission Hubs</p>
                                            <p className="text-xs font-bold uppercase truncate">{rideRequest?.pickup?.name} → {rideRequest?.drop?.name}</p>
                                        </div>
                                        <div className="flex gap-4">
                                            <button onClick={() => setStatus('idle')} className="flex-1 bg-slate-200 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest">Discard</button>
                                            <button onClick={acceptRide} className="flex-[2] bg-white text-indigo-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl">Start Ride</button>
                                        </div>
                                    </motion.div>
                                )}

                                {(status === 'accepted' || status === 'ongoing') && (
                                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col gap-4">
                                        <div className="bg-white border border-slate-300 p-6 rounded-[2rem] flex items-center gap-5">
                                            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500"><UserIcon size={24} /></div>
                                            <div className="flex-1">
                                                <p className="text-sm font-black uppercase italic tracking-tighter">{rideRequest?.userName || 'Client Alpha'}</p>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ID #HUB-{rideRequest?.id?.slice(-4)}</p>
                                            </div>
                            <a href={`tel:${rideRequest?.userPhone || '+910000000000'}`} className="p-4 bg-ev-green/10 text-ev-green rounded-xl"><Phone size={18} /></a>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            <button onClick={() => setIsChatOpen(true)} className="py-5 bg-slate-100 border border-slate-300 rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest relative">
                                                <MessageSquare size={18} className="text-indigo-400" /> Dispatcher Messaging
                                                {messages.length > 0 && <div className="absolute top-0 right-0 w-3 h-3 bg-rose-500 rounded-full border-2 border-slate-950 translate-x-1 -translate-y-1" />}
                                            </button>
                                        </div>

                                        {status === 'accepted' ? (
                                            <div className="space-y-4">
                                                <input maxLength={4} value={otpInput} onChange={e => setOtpInput(e.target.value)} className={`w-full bg-slate-50 border-2 py-5 rounded-3xl text-4xl text-center font-black tracking-[0.5em] italic outline-none transition-all ${otpError ? 'border-rose-500 shake' : 'border-slate-300 focus:border-ev-blue/50'}`} placeholder="OTP" />
                                                <button onClick={verifyOtp} className="w-full bg-ev-blue text-white py-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl">Start Ride</button>
                                            </div>
                                        ) : (
                                            <button onClick={() => {
                                                socket.emit('update_ride_status', { rideId: rideRequest.id, status: 'completed' }); 
                                                setStatus('idle'); 
                                                addToHistory({ 
                                                    id: rideRequest.id, 
                                                    client: rideRequest.userName, 
                                                    fare: rideRequest.fare, 
                                                    time: new Date().toLocaleTimeString(), 
                                                    route: `${rideRequest.pickup.name} → ${rideRequest.drop.name}` 
                                                });
                                                setRideRequest(null);
                                            }} className="w-full bg-ev-green text-slate-950 py-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl">Terminate Successful Task</button>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <h3 className="text-xl font-black italic tracking-tighter uppercase mb-2">Archived Missions</h3>
                            <div className="grid gap-3">
                                {history.length === 0 ? (
                                    <div className="text-[10px] text-slate-400 font-bold uppercase text-center py-10 opacity-40">No records found</div>
                                ) : history.map((h, i) => (
                                    <div key={i} className="bg-slate-100 border border-slate-300 p-5 rounded-2xl flex flex-col gap-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-ev-green bg-ev-green/10 px-3 py-1.5 rounded-lg border border-ev-green/30">Completed</span>
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h.time}</span>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-xs font-bold uppercase truncate">{h.client}</p>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{h.route}</p>
                                            </div>
                                            <p className="text-base font-black italic text-slate-900">₹{h.fare}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sidebar Mobile Menu & Desktop Tabs Wrapper */}
            <AnimatePresence>
                {isMenuOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMenuOpen(false)} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[4900] lg:hidden" />
                        <motion.div initial={{ x: '-100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '-100%', opacity: 0 }} className="fixed inset-y-0 left-0 w-80 bg-white shadow-2xl z-[5000] p-8 flex flex-col gap-6 rounded-r-[2rem] border-r border-slate-300 lg:hidden">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-black italic uppercase tracking-tighter">Pilot Menu</h2>
                                <button onClick={() => setIsMenuOpen(false)} className="p-3 bg-slate-100 rounded-xl active:scale-95"><X size={20} /></button>
                            </div>
                            <button onClick={() => { setView('main'); setIsMenuOpen(false); }} className={`p-4 rounded-2xl font-black text-xs uppercase tracking-widest text-left transition-all ${view === 'main' ? 'bg-primary-500 text-white shadow-xl' : 'bg-slate-100 hover:bg-slate-200'}`}>Current Mission</button>
                            <button onClick={() => { setView('stats'); setIsMenuOpen(false); }} className={`p-4 rounded-2xl font-black text-xs uppercase tracking-widest text-left transition-all ${view === 'stats' ? 'bg-primary-500 text-white shadow-xl' : 'bg-slate-100 hover:bg-slate-200'}`}>Mission History</button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 lg:hidden z-[90]">
                {/* Optional floating action button can go here if needed */}
            </div>

            {/* Map Area */}
            <div className="absolute inset-0 lg:relative lg:flex-1 flex-1 z-0 h-full w-full">
        <RideMap 
        center={status !== 'idle' && rideRequest?.pickup ? [rideRequest.pickup.lat, rideRequest.pickup.lng] : location} 
        markers={[
            { id: 'driver', type: (rideRequest?.vehicleType as any) || 'car', position: location, label: 'YOU' }, 
            ...(rideRequest?.pickup ? [{ id: 'pickup', type: 'user' as const, position: [rideRequest.pickup.lat, rideRequest.pickup.lng] as [number, number], label: 'Pickup Hub' }] : []), 
            ...(rideRequest?.drop ? [{ id: 'drop', type: 'target' as const, position: [rideRequest.drop.lat, rideRequest.drop.lng] as [number, number], label: 'Destination Hub' }] : [])
        ]} 
        route={currentRoute} 
        isOngoing={status === 'ongoing'} 
    />
            </div>

            {/* Calling UI (Native tel: intercepts before modal) */}
            <AnimatePresence>
                {isCalling && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[6000] bg-slate-50 flex flex-col items-center justify-center p-10 text-center">
                        <div className="w-32 h-32 bg-primary-500 rounded-full flex items-center justify-center text-slate-900 mb-10 shadow-2xl animate-pulse"><Phone size={60} /></div>
                        <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-4 text-slate-900">Calling Client...</h2>
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-12">{rideRequest?.userName || 'Alpha'}</p>
                        <a href={`tel:${rideRequest?.userPhone || '+910000000000'}`} onClick={() => setIsCalling(false)} className="mt-6 px-8 py-4 bg-blue-500 text-white rounded-full font-black text-sm uppercase tracking-widest shadow-lg flex items-center gap-3 mx-auto"><Phone size={24} /> Dial Number</a>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Chat Drawer */}
            <AnimatePresence>
                {isChatOpen && (
                    <div className="fixed inset-0 z-[5500]">
                         <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} className="absolute inset-0 bg-slate-50/80 backdrop-blur-md" />
                         <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute top-0 right-0 bottom-0 w-full lg:w-[450px] bg-white flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.9)]">
                            <div className="p-8 border-b border-slate-300 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                     <div className="p-3 bg-primary-500 rounded-xl text-slate-900"><MessageSquare size={20} /></div>
                                     <div>
                                        <h3 className="text-xl font-black italic uppercase tracking-tighter leading-none">Grid Chat</h3>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Uplinked to Client {rideRequest?.userName}</p>
                                     </div>
                                </div>
                                <X className="text-slate-500 cursor-pointer" onClick={() => setIsChatOpen(false)} />
                            </div>
                            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4 custom-scrollbar">
                                {messages.length === 0 && <div className="flex-1 flex flex-col items-center justify-center text-center opacity-20"><Headset size={60} className="mb-4" /><p className="text-xs font-black uppercase italic tracking-widest">Secure grid channel established.<br/>Messages are encrypted.</p></div>}
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.sender === 'provider' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] p-4 rounded-2xl text-[13px] font-bold tracking-tight ${m.sender === 'provider' ? 'bg-primary-500 text-white rounded-tr-none shadow-md' : 'bg-slate-200 text-slate-800 rounded-tl-none shadow-sm'}`}>
                                            {m.message}
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="px-6 py-3 flex gap-2 overflow-x-auto no-scrollbar border-t border-slate-200 bg-slate-50 shrink-0">
                                {["On the way", "I have arrived", "Calling you now..."].map((qr, idx) => (
                                    <button key={idx} onClick={() => sendQuickReply(qr)} className="whitespace-nowrap px-4 py-2 bg-slate-200 rounded-full text-[11px] font-bold text-slate-700 hover:bg-slate-300 active:scale-95 transition-all">{qr}</button>
                                ))}
                            </div>
                            <form onSubmit={handleSendMessage} className="p-6 bg-slate-50 flex items-center gap-4 border-t border-slate-300 shrink-0">
                                <input value={newMessage} onChange={e => setNewMessage(e.target.value)} className="flex-1 bg-slate-100 border border-slate-300 p-4 rounded-2xl outline-none focus:ring-2 ring-primary-500 text-sm font-bold" placeholder="Transmit data..." />
                                <button type="submit" className="p-4 bg-primary-500 text-white rounded-2xl shadow-xl"><Send size={20} /></button>
                            </form>
                         </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

