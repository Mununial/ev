import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import RideMap from '../components/RideMap';
import { LayoutDashboard, Car, Bike, Users, Activity, BarChart3, Settings, Battery, Shield, ArrowUpRight, Search, Plus, Navigation2, Zap, Globe, Menu, X, Filter, RefreshCw, Smartphone, IndianRupee, Trash2, Edit3, MoreVertical, CheckCircle2, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { CAMPUS_CENTER, KIIT_LOCATIONS } from '../data/kiitData';
import { useAuth } from '../context/AuthContext';

const socket = io(import.meta.env.VITE_API_URL);

type DashboardView = 'ops' | 'assets' | 'providers' | 'grid' | 'revenue' | 'config';

export default function AdminDashboard() {
    const { logout } = useAuth();
    const [fleet, setFleet] = useState<any>({});
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [dbPilots, setDbPilots] = useState<any[]>([]);
    const [stats, setStats] = useState({ rides: 124, earnings: 4850, carbon: 1.2 });
    const [pulseData, setPulseData] = useState<any[]>(Array.from({length: 12}).map((_, i) => ({ time: new Date(Date.now() - (11 - i) * 3000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}), value: Math.floor(20 + Math.random() * 80) })));
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isCreatePilotModalOpen, setIsCreatePilotModalOpen] = useState(false);
    const [newPilot, setNewPilot] = useState({ name: '', email: '', password: '', vehicleType: 'EV', vehicleNumber: '', phone: '' });
    const [newEV, setNewEV] = useState({ id: '', plate: '', model: '' });
    const [activeTab, setActiveTab] = useState<'live' | 'assets'>('live');
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState<DashboardView>('ops');

    const fetchVehicles = async () => {
        try {
            const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/vehicles`);
            const data = await resp.json();
            setVehicles(data);
        } catch (e) {
            console.error('Failed to fetch vehicles:', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchPilots = async () => {
        try {
            const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/pilots`);
            setDbPilots(await resp.json());
        } catch (e) {}
    };

    const handleBlockPilot = async (uid: string) => {
        if (!window.confirm('Toggle block status for this Provider profile?')) return;
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/admin/toggle-block-pilot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid })
            });
            fetchPilots();
        } catch (e) {
            alert('Admin Uplink Error');
        }
    };

    useEffect(() => {
        fetchVehicles();
        fetchPilots();
        socket.on('fleet_update', (data) => {
            setFleet(data);
        });
        
        const simInterval = setInterval(() => {
            setPulseData(prev => {
                const nextTime = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                return [...prev.slice(1), { time: nextTime, value: Math.floor(20 + Math.random() * 80) }];
            });
            setFleet((currentFleet: any) => {
                const active = Object.values(currentFleet).filter((p: any) => p.status === 'busy').length;
                if (active > 0) {
                    setStats(s => ({
                        ...s,
                        rides: s.rides + active,
                        earnings: s.earnings + (active * Math.floor(Math.random() * 5 + 1)),
                        carbon: +(s.carbon + (active * 0.01)).toFixed(2)
                    }));
                }
                return currentFleet;
            });
        }, 3000);

        return () => {
            clearInterval(simInterval);
            socket.off('fleet_update');
        };
    }, []);

    const handleAddEV = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/vehicles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEV)
            });
            const data = await resp.json();
            if (data.success) {
                await fetchVehicles();
                setIsAddModalOpen(false);
                setNewEV({ id: '', plate: '', model: '' });
                alert('Vehicle Registered in Command Center!');
            }
        } catch (e) {
            alert('Grid Link Timeout - Check Connection');
        }
    };

    const handleDeleteVehicle = async (plate: string) => {
        if (!window.confirm(`Permanently purge asset [${plate}] from Grid Inventory?`)) return;
        try {
            const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/vehicles`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plate })
            });
            const data = await resp.json();
            if (data.success) {
                await fetchVehicles();
            } else {
                alert('Vehicle is currently locked to an active Pilot Uplink.');
            }
        } catch {
            alert('Failed to connect to Grid Router.');
        }
    };

    const handleCreatePilot = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!newPilot.name || !newPilot.email || !newPilot.password || !newPilot.vehicleType || !newPilot.vehicleNumber || !newPilot.phone) {
             alert('All fields required for Pilot Provisioning');
             return;
        }
        try {
            const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/create-pilot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newPilot)
            });
            const data = await resp.json();
            if (data.success) {
                alert('Success: Pilot Provisioned. Credentials Active.');
                setIsCreatePilotModalOpen(false);
                setNewPilot({ name: '', email: '', password: '', vehicleType: 'EV', vehicleNumber: '', phone: '' });
                fetchPilots();
            } else {
                alert(data.error || 'Failed to provision pilot');
            }
        } catch (e) {
            alert('Admin uplink failed');
        }
    };

    const fleetArray = Object.values(fleet);
    const filteredFleet = fleetArray.filter((p: any) => 
        p.vehicle?.plate.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.providerId.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredVehicles = vehicles.filter((v: any) => 
        v.plate.toLowerCase().includes(searchTerm.toLowerCase()) || 
        v.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const changeView = (view: DashboardView) => {
        setCurrentView(view);
        setIsSidebarOpen(false);
    };

    return (
        <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900 relative">
            
            {/* Mobile Header Overlay */}
            <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-50/80 backdrop-blur-xl border-b border-slate-300 z-[1000] flex items-center justify-between px-6">
                 <div className="flex items-center gap-3">
                    <Shield className="text-indigo-400 w-5 h-5" />
                    <h1 className="text-sm font-black italic tracking-tighter uppercase tracking-widest leading-none">Command Center</h1>
                 </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => { if(window.confirm('Disconnect Command?')) logout(); }} className="p-2 bg-slate-100 border border-slate-300 rounded-xl text-rose-500">
                        <LogOut size={18} />
                    </button>
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-slate-100 rounded-xl">
                        <Menu className="w-5 h-5" />
                    </button>
                 </div>
            </div>

            {/* Sidebar Desktop */}
            <div className="hidden lg:flex w-80 border-r border-slate-300 p-8 flex-col gap-10 bg-white shrink-0">
                <AdminSidebarContent currentView={currentView} changeView={changeView} logout={logout} />
            </div>

            {/* Sidebar Mobile */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setIsSidebarOpen(false)}
                            className="fixed inset-0 bg-slate-50/60 backdrop-blur-sm z-[2000] lg:hidden"
                        />
                        <motion.div 
                            initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
                            className="fixed top-0 left-0 bottom-0 w-80 bg-white border-r border-slate-300 p-8 flex flex-col gap-10 z-[2100] lg:hidden"
                        >
                            <AdminSidebarContent currentView={currentView} changeView={changeView} logout={logout} />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Mobile Backdrop */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsSidebarOpen(false)}
                        className="fixed inset-0 bg-slate-50/60 backdrop-blur-sm z-[1500] lg:hidden"
                    />
                )}
            </AnimatePresence>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-14 flex flex-col gap-6 lg:gap-10 pt-24 lg:pt-14 relative scroll-smooth overflow-x-hidden">
                <AnimatePresence mode="wait">
                    {currentView === 'ops' && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-10">
                            {/* Ops View is the original Dashboard */}
                            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 relative z-10">
                                <div className="space-y-2">
                                    <h2 className="text-3xl sm:text-5xl font-black tracking-tighter text-slate-900 uppercase italic">Fleet Control</h2>
                                    <div className="flex flex-wrap items-center gap-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                        <span className="flex items-center gap-2 text-ev-green"><div className="w-1.5 h-1.5 bg-ev-green rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse" /> Grid Uplink Active</span>
                                        <span className="flex items-center gap-2"><Smartphone className="w-2.5 h-2.5" /> Mobility Hub</span>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                                    <div className="relative group w-full lg:w-80">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 w-3.5 h-3.5" />
                                        <input 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full bg-slate-100 border border-slate-300 py-4 pl-12 pr-6 rounded-2xl outline-none focus:ring-2 ring-indigo-500/50 focus:bg-white transition-all text-[11px] font-black uppercase tracking-widest placeholder:text-slate-700 shadow-2xl" 
                                            placeholder="Search Grid Sector..." 
                                        />
                                    </div>
                                    <button onClick={() => setIsCreatePilotModalOpen(true)} className="flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-[0_10px_30px_rgba(79,70,229,0.4)] hover:shadow-indigo-500/60 transition-all hover:-translate-y-1">
                                        <Users className="w-3.5 h-3.5" /> Provision Pilot
                                    </button>
                                    <button onClick={() => setIsAddModalOpen(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-3">
                                        <Plus className="w-4 h-4" strokeWidth={3} /> Register Asset
                                    </button>
                                </div>
                            </header>

                            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-8 relative z-10">
                                <StatCard label="Live Units" value={`${fleetArray.length}`} sub="Active Providers" icon={<Users />} color="ev-blue" trend="+3 Units" />
                                <StatCard label="Total Assets" value={`${vehicles.length}`} sub="Registered eVs" icon={<Car />} color="ev-purple" trend="Healthy" />
                                <StatCard label="Revenue" value={`₹${stats.earnings.toLocaleString()}`} sub="Daily Flow" icon={<BarChart3 />} color="ev-gold" trend="Target Hit" />
                                <StatCard label="Ecology" value={`${stats.carbon}T`} sub="Carbon Offset" icon={<Zap />} color="ev-green" trend="Eco+" />
                            </section>

                            <section className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-10 relative z-10">
                                <div className="xl:col-span-1 flex flex-col gap-6">
                                    <div className="flex items-center justify-between px-2">
                                        <div className="flex gap-4">
                                            <button onClick={() => setActiveTab('live')} className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'live' ? 'text-slate-900 border-b-2 border-indigo-500 pb-1' : 'text-slate-500'}`}>Live Stream</button>
                                            <button onClick={() => setActiveTab('assets')} className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'assets' ? 'text-slate-900 border-b-2 border-indigo-500 pb-1' : 'text-slate-500'}`}>Registered Assets</button>
                                        </div>
                                        <RefreshCw onClick={fetchVehicles} className={`w-3.5 h-3.5 text-slate-500 cursor-pointer hover:rotate-180 transition-all ${loading ? 'animate-spin' : ''}`} />
                                    </div>
                                    <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                        <AnimatePresence mode="wait">
                                            {activeTab === 'live' ? (
                                                <div className="space-y-4">
                                                    {filteredFleet.length === 0 ? (
                                                        <div className="glass-card p-12 text-center rounded-[2.5rem] border-dashed border-2 border-slate-300">
                                                            <Activity className="w-10 h-10 text-slate-800 mx-auto mb-4" />
                                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">No providers live</p>
                                                        </div>
                                                    ) : filteredFleet.map((p: any) => (
                                                        <AssetRow key={p.providerId} name={p.vehicle?.plate || 'Pilot Entity'} sub={p.status === 'busy' ? 'In-Trip' : 'Standby'} val={`${p.vehicle?.battery || 0}%`} status={p.status} isLive />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {filteredVehicles.map((v: any) => (
                                                        <AssetRow key={v.id} name={v.plate} sub={v.model} val={`${v.battery}%`} status={v.status} />
                                                    ))}
                                                </div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                                <div className="xl:col-span-2 min-h-[500px] border border-slate-300 rounded-[2.5rem] overflow-hidden relative">
                                    <RideMap center={[CAMPUS_CENTER.lat, CAMPUS_CENTER.lng]} markers={fleetArray.map((p: any) => ({ id: p.providerId, type: 'car' as const, position: p.location, label: `${p.vehicle?.plate}` }))} />
                                </div>
                            </section>
                        </motion.div>
                    )}

                    {currentView === 'assets' && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-8">
                             <header className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-4xl font-black italic uppercase tracking-tighter">Fleet Assets</h2>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Manage Grid inventory</p>
                                </div>
                                <button onClick={() => setIsAddModalOpen(true)} className="bg-white text-slate-950 px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl flex items-center gap-3">
                                    <Plus className="w-4 h-4" strokeWidth={3} /> Register New eV
                                </button>
                             </header>

                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {vehicles.map((v: any) => (
                                    <div key={v.id} className="bg-white border border-slate-300 p-8 rounded-[2.5rem] group hover:border-indigo-500/30 transition-all shadow-2xl relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">{v.model.toLowerCase().includes('bike') ? <Bike size={60} /> : <Car size={60} />}</div>
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="p-4 bg-indigo-600/10 text-indigo-400 rounded-2xl">{v.model.toLowerCase().includes('bike') ? <Bike className="w-6 h-6" /> : <Car className="w-6 h-6" />}</div>
                                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${v.status === 'active' ? 'bg-ev-green/10 text-ev-green' : 'bg-slate-800 text-slate-500'}`}>{v.status}</span>
                                        </div>
                                        <h3 className="text-xl font-black uppercase tracking-tighter mb-1">{v.plate}</h3>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">{v.model}</p>
                                        <div className="flex items-center gap-4 bg-slate-100 p-4 rounded-2xl border border-slate-300">
                                            <Battery className={`w-5 h-5 ${v.battery < 20 ? 'text-rose-500 animate-pulse' : 'text-ev-green'}`} />
                                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className={`h-full ${v.battery < 20 ? 'bg-rose-500' : 'bg-ev-green'}`} style={{ width: `${v.battery}%` }} />
                                            </div>
                                            <span className="text-xs font-black italic">{v.battery}%</span>
                                        </div>
                                        <div className="flex gap-2 mt-6 pt-6 border-t border-slate-300">
                                            <button className="flex-1 py-3 bg-slate-100 hover:bg-indigo-600/10 hover:text-indigo-400 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all inline-flex items-center justify-center gap-2"><Edit3 size={12} /> Diagnostics</button>
                                            <button onClick={() => handleDeleteVehicle(v.plate)} className="p-3 bg-slate-100 hover:bg-rose-500/10 hover:text-rose-500 rounded-xl transition-all"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                             </div>
                        </motion.div>
                    )}

                    {currentView === 'providers' && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-8">
                             <header>
                                <h2 className="text-4xl font-black italic uppercase tracking-tighter text-slate-900">Provider Grid</h2>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Active Pilots in Command Hub</p>
                             </header>

                             <div className="bg-white border border-slate-300 rounded-[2.5rem] overflow-hidden shadow-2xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-100">
                                            <tr>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Provider Name</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Vehicle Type</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Availability</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {dbPilots.length === 0 ? (
                                                <tr><td colSpan={5} className="px-8 py-10 text-center text-slate-500 font-bold uppercase text-[10px]">No pilot profiles detected in sector</td></tr>
                                            ) : dbPilots.map((p: any) => {
                                                const pSuffix = p.uid.split('_')[1]?.toUpperCase() || p.uid;
                                                const liveData: any = Object.values(fleet).find((f: any) => f.providerId === pSuffix || f.providerId.includes(pSuffix));
                                                const isOnline = !!liveData;
                                                const isBlocked = !!p.blocked;
                                                
                                                return (
                                                    <tr key={p.uid} className={`transition-colors group ${isBlocked ? 'bg-rose-50/50 grayscale' : 'hover:bg-slate-50 cursor-pointer'}`}>
                                                        <td className="px-8 py-6">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-900 ${isBlocked ? 'bg-rose-200' : 'bg-indigo-600/20 text-indigo-600'}`}><Users size={18} /></div>
                                                                <div>
                                                                    <p className={`text-sm font-black uppercase tracking-tighter ${isBlocked ? 'text-rose-900' : 'text-slate-900'}`}>{p.name}</p>
                                                                    <p className="text-[9px] font-bold text-slate-500 uppercase">{p.email}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6">
                                                            <p className={`text-xs font-black ${isBlocked ? 'text-rose-900' : 'text-slate-900'}`}>{p.vehicleType || 'Generic'} CLASS</p>
                                                            <p className="text-[10px] font-bold text-slate-500 uppercase">{p.vehicleNumber || 'UNIDENTIFIED'}</p>
                                                        </td>
                                                        <td className="px-8 py-6">
                                                            <div className="flex items-center gap-2">
                                                                <div className={`w-2 h-2 rounded-full ${isOnline ? (liveData.status === 'busy' ? 'bg-ev-purple animate-pulse' : 'bg-ev-green') : 'bg-slate-300'}`} />
                                                                <span className={`text-[10px] font-black uppercase tracking-widest ${isOnline ? (liveData.status === 'busy' ? 'text-ev-purple' : 'text-ev-green') : 'text-slate-500'}`}>{isOnline ? liveData.status : 'OFFLINE'}</span>
                                                            </div>
                                                        </td>
                                                        <td className={`px-8 py-6 text-xs font-black uppercase tracking-widest ${isBlocked ? 'text-rose-500' : 'text-green-600'}`}>
                                                            {isBlocked ? 'BLOCKED' : 'ACTIVE'}
                                                        </td>
                                                        <td className="px-8 py-6 text-right">
                                                            <div className="flex items-center justify-end gap-4">
                                                                {!isBlocked && isOnline && <p className="text-[10px] font-black text-slate-500">{liveData.vehicle?.battery}% PWR</p>}
                                                                <button onClick={() => handleBlockPilot(p.uid)} className={`px-4 py-2 ${isBlocked ? 'bg-slate-800 text-white hover:bg-slate-900' : 'bg-rose-100 text-rose-500 hover:bg-rose-200'} rounded-lg font-black text-[9px] uppercase tracking-widest transition-all shadow-sm`}>{isBlocked ? 'RESTORE' : 'BLOCK'}</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                             </div>
                        </motion.div>
                    )}

                    {currentView === 'grid' && (
                        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="h-full flex flex-col gap-6">
                             <header className="flex justify-between items-center">
                                 <div>
                                    <h2 className="text-4xl font-black italic uppercase tracking-tighter">Full Grid Monitor</h2>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Real-time geospatial telemetry flow</p>
                                 </div>
                                 <div className="flex items-center gap-4">
                                     <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl border border-slate-300">
                                         <Activity className="w-4 h-4 text-ev-green" />
                                         <span className="text-[10px] font-black uppercase tracking-widest">{fleetArray.length} LIVE UNITS</span>
                                     </div>
                                 </div>
                             </header>
                             <div className="flex-1 min-h-[600px] rounded-[3rem] overflow-hidden border border-slate-300 shadow-2xl relative">
                                 <RideMap center={[CAMPUS_CENTER.lat, CAMPUS_CENTER.lng]} markers={fleetArray.map((p: any) => ({ id: p.providerId, type: 'car' as const, position: p.location, label: `${p.vehicle?.plate} (${p.status})` }))} />
                             </div>
                        </motion.div>
                    )}

                    {currentView === 'revenue' && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col gap-8">
                            <header>
                                <h2 className="text-4xl font-black italic uppercase tracking-tighter">Revenue Hub</h2>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Financial telemetry analytics</p>
                            </header>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                <div className="bg-white p-8 rounded-[3rem] border border-slate-300 shadow-2xl">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Total Grid Earnings</p>
                                    <div className="flex items-baseline gap-2 mb-8">
                                        <IndianRupee className="w-8 h-8 text-ev-gold" />
                                        <p className="text-5xl font-black italic tracking-tighter uppercase">{stats.earnings.toLocaleString()}</p>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest opacity-60"><span>Fleet Share (70%)</span><span>₹3,395</span></div>
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest opacity-60"><span>Service Fee (30%)</span><span>₹1,455</span></div>
                                    </div>
                                </div>

                                <div className="bg-white p-8 rounded-[3rem] border border-slate-300 shadow-2xl col-span-1 lg:col-span-2">
                                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-8">System Activity Pulse</p>
                                     <div className="h-64 mt-4 -ml-4">
                                         <ResponsiveContainer width="100%" height="100%">
                                             <AreaChart data={pulseData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                                 <defs>
                                                     <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                         <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                                                         <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                     </linearGradient>
                                                 </defs>
                                                 <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 900 }} dy={10} minTickGap={20} />
                                                 <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 900 }} dx={-10} />
                                                 <Tooltip 
                                                     contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                                     itemStyle={{ color: '#0f172a', fontWeight: 900, fontSize: '14px' }}
                                                     labelStyle={{ color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 900 }}
                                                 />
                                                 <Area type="monotone" dataKey="value" name="Activity Pulse" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" />
                                             </AreaChart>
                                         </ResponsiveContainer>
                                     </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {currentView === 'config' && (
                        <motion.div 
                            key="config"
                            initial={{ opacity: 0, scale: 0.95 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.95 }} 
                            className="flex flex-col gap-10 max-w-4xl"
                        >
                             <header>
                                <h2 className="text-4xl font-black italic uppercase tracking-tighter">System Config</h2>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Modify Command OS Core parameters</p>
                             </header>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                 <div className="space-y-6">
                                     <div className="bg-slate-100 p-8 rounded-[2.5rem] border border-slate-300">
                                         <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-3"><Zap size={14} className="text-indigo-400" /> Grid Parameters</h3>
                                         <div className="space-y-4">
                                             <InteractiveSwitch label="Automatic Dispatching" defaultChecked />
                                             <InteractiveSwitch label="Dynamic Pricing Model" defaultChecked />
                                             <InteractiveSwitch label="Energy Conservation Mode" />
                                         </div>
                                     </div>
                                     <div className="bg-slate-100 p-8 rounded-[2.5rem] border border-slate-300">
                                         <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-3"><Shield size={14} className="text-indigo-400" /> Security Protocol</h3>
                                         <div className="space-y-4">
                                             <InteractiveSwitch label="2FA Admin Uplink" defaultChecked />
                                             <InteractiveSwitch label="Biometric Fleet Key" defaultChecked />
                                         </div>
                                     </div>
                                 </div>
                                 <div className="bg-indigo-600 p-10 rounded-[3rem] text-slate-900 shadow-2xl shadow-indigo-500/20 relative overflow-hidden">
                                     <div className="absolute -top-10 -right-10 w-40 h-40 bg-slate-200 blur-3xl rounded-full" />
                                     <CheckCircle2 className="w-16 h-16 mb-6 opacity-40" />
                                     <h3 className="text-3xl font-black italic uppercase tracking-tighter mb-4">Command OS is Healthy</h3>
                                     <p className="text-xs font-bold opacity-80 uppercase tracking-widest mb-10">Last security scan: 2 minutes ago ● No anomalies detected</p>
                                     <button 
                                        onClick={(e) => {
                                            const btn = e.currentTarget;
                                            const originalText = btn.innerText;
                                            btn.innerText = "SCANNING GRID...";
                                            btn.disabled = true;
                                            setTimeout(() => {
                                                btn.innerText = "GRID OPTIMIZED ✓";
                                                setTimeout(() => {
                                                    btn.innerText = originalText;
                                                    btn.disabled = false;
                                                }, 2000);
                                            }, 3000);
                                        }}
                                        className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-colors disabled:opacity-50"
                                     >
                                         Execute Deep Scan
                                     </button>
                                 </div>
                             </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Add EV Modal */}
                <AnimatePresence>
                    {isAddModalOpen && (
                        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddModalOpen(false)} className="absolute inset-0 bg-slate-50/90 backdrop-blur-md" />
                            <motion.div initial={{ scale: 0.9, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 30 }} className="relative w-full max-w-2xl bg-white border border-slate-300 rounded-[3rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.8)]">
                                <div className="p-8 lg:p-12">
                                    <div className="flex justify-between items-start mb-10">
                                        <div>
                                            <h3 className="text-3xl font-black italic uppercase leading-none mb-3">Asset Registration</h3>
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Connect new mobility units to the grid</p>
                                        </div>
                                        <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-slate-900 shadow-xl"><Plus className="w-6 h-6" /></div>
                                    </div>
                                    <form onSubmit={handleAddEV} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-6">
                                            <FormInput label="Identifier" value={newEV.id} onChange={(v:any) => setNewEV({...newEV, id: v})} placeholder="e.g., Campus Unit 05" />
                                            <FormInput label="Licence Plate" value={newEV.plate} onChange={(v:any) => setNewEV({...newEV, plate: v})} placeholder="OD-02-XXXX" />
                                            <FormInput label="eV Model" value={newEV.model} onChange={(v:any) => setNewEV({...newEV, model: v})} placeholder="Tata Nexon EV" />
                                        </div>
                                        <div className="flex flex-col gap-6">
                                            <div className="flex-1 bg-slate-100 border border-slate-300 rounded-3xl p-6 flex flex-col gap-4">
                                                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest border-b border-slate-300 pb-3">Grid Verification</p>
                                                <CheckItem label="Secure OS Compliant" />
                                                <CheckItem label="Battery Link Stable" />
                                                <CheckItem label="GPS Module Active" />
                                            </div>
                                            <div className="flex gap-4">
                                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 bg-slate-100 p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                                                <button type="submit" className="flex-[2] bg-indigo-600 text-white p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">Submit Link</button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Create Pilot Provider Modal */}
                <AnimatePresence>
                    {isCreatePilotModalOpen && (
                        <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCreatePilotModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" />
                            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl">
                                <div className="p-8 lg:p-10">
                                    <div className="flex justify-between items-center mb-10">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white"><Users className="w-5 h-5" /></div>
                                            <div>
                                                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900">Provision Pilot</h2>
                                                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">Generate Authorized Credentials</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setIsCreatePilotModalOpen(false)} className="text-slate-400 hover:text-slate-900 transition-colors"><X size={24} /></button>
                                    </div>
                                    <form onSubmit={handleCreatePilot} className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Full Name</label>
                                            <input required type="text" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold shadow-inner outline-none focus:ring-2 ring-indigo-500/50" value={newPilot.name} onChange={e => setNewPilot({...newPilot, name: e.target.value})} placeholder="SMILESPHERE Pilot 01" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Pilot Login Email</label>
                                            <input required type="email" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold shadow-inner outline-none focus:ring-2 ring-indigo-500/50" value={newPilot.email} onChange={e => setNewPilot({...newPilot, email: e.target.value})} placeholder="pilot1@smilesphere.com" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Temporary Password</label>
                                            <input required type="text" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold shadow-inner outline-none focus:ring-2 ring-indigo-500/50" value={newPilot.password} onChange={e => setNewPilot({...newPilot, password: e.target.value})} placeholder="Secret Key" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Mobile Number</label>
                                            <input required type="tel" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold shadow-inner outline-none focus:ring-2 ring-indigo-500/50" value={newPilot.phone} onChange={e => setNewPilot({...newPilot, phone: e.target.value})} placeholder="+91 0000000000" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Vehicle Type</label>
                                                <select className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold shadow-inner outline-none focus:ring-2 ring-indigo-500/50" value={newPilot.vehicleType} onChange={e => setNewPilot({...newPilot, vehicleType: e.target.value})}>
                                                    <option value="EV">EV Class</option>
                                                    <option value="Bike">Bike Class</option>
                                                    <option value="Others">Custom Node</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">License Plate</label>
                                                <input required type="text" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold uppercase shadow-inner outline-none focus:ring-2 ring-indigo-500/50" value={newPilot.vehicleNumber} onChange={e => setNewPilot({...newPilot, vehicleNumber: e.target.value.toUpperCase()})} placeholder="OD-02-AZ-9999" />
                                            </div>
                                        </div>
                                        <button type="submit" className="w-full py-5 bg-slate-900 border border-slate-700 hover:bg-black text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:shadow-2xl transition-all active:scale-95">Generate Security Credentials</button>
                                    </form>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

            </main>
        </div>
    );
}

function AdminSidebarContent({ currentView, changeView, logout }: any) {
    return (
        <>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-5 px-2">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl border border-slate-300">
                        <Shield className="text-slate-900 w-6 h-6" />
                    </div>
                    <div className="overflow-hidden flex-1">
                        <h1 className="text-xl font-black tracking-tighter leading-none italic uppercase">SMILESPHERE <span className="text-indigo-400">ADMIN</span></h1>
                        <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1 opacity-60">System Core 4.2</p>
                    </div>
                    <button 
                        onClick={() => { if(window.confirm('Grid Logout?')) logout(); }}
                        className="p-3 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-slate-900 transition-all shadow-lg"
                        title="Disconnect System"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>

            <nav className="flex flex-col gap-3">
                <NavItem icon={<LayoutDashboard />} label="System Control" active={currentView === 'ops'} onClick={() => changeView('ops')} />
                <NavItem icon={<Car />} label="Fleet Assets" active={currentView === 'assets'} onClick={() => changeView('assets')} />
                <NavItem icon={<Users />} label="Provider List" active={currentView === 'providers'} onClick={() => changeView('providers')} />
                <NavItem icon={<Globe />} label="Grid Monitor" active={currentView === 'grid'} onClick={() => changeView('grid')} />
                <NavItem icon={<BarChart3 />} label="Revenue Hub" active={currentView === 'revenue'} onClick={() => changeView('revenue')} />
            </nav>

            <div className="mt-auto flex flex-col gap-6">
                <div className="bg-indigo-500/5 border border-indigo-500/20 p-6 rounded-[2rem] relative overflow-hidden group">
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/20 blur-[50px]" />
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Zap className="w-3 h-3 fill-current" /> Grid Link
                    </p>
                    <div className="space-y-1 text-left">
                        <p className="text-[10px] font-bold text-slate-400 leading-none">Node: West-BBSR</p>
                        <p className="text-[10px] font-bold text-ev-green leading-none">Uplink: Live</p>
                    </div>
                </div>
                <button onClick={() => changeView('config')} className={`flex items-center gap-4 p-5 rounded-[1.5rem] font-black text-[10px] transition-all uppercase tracking-widest leading-none border border-transparent ${currentView === 'config' ? 'bg-slate-200 text-slate-900 border-slate-300' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
                    <Settings className="w-5 h-5" /> System Configuration
                </button>
            </div>
        </>
    );
}

function NavItem({ icon, label, active = false, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) {
    return (
        <button onClick={onClick} className={`flex items-center gap-4 p-5 rounded-2xl text-xs font-black tracking-widest uppercase transition-all group ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
            <span className={`w-5 h-5 ${active ? 'text-slate-900' : 'text-slate-500 group-hover:text-indigo-400'} transition-colors`}>{icon}</span>
            <span>{label}</span>
        </button>
    );
}

function InteractiveSwitch({ label, defaultChecked = false }: { label: string, defaultChecked?: boolean }) {
    const [checked, setChecked] = useState(defaultChecked);
    return (
        <div onClick={() => setChecked(!checked)} className="flex items-center justify-between p-4 bg-slate-100 rounded-2xl border border-slate-300 cursor-pointer hover:bg-slate-200 transition-all">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">{label}</span>
            <div className={`w-10 h-5 rounded-full relative p-1 transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                <div className={`w-3 h-3 bg-white rounded-full transition-all ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
        </div>
    );
}

function ConfigSwitch({ label, active = false }: { label: string, active?: boolean }) {
    return (
        <div className="flex items-center justify-between p-4 bg-slate-100 rounded-2xl border border-slate-300">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">{label}</span>
            <div className={`w-10 h-5 rounded-full relative p-1 transition-colors ${active ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                <div className={`w-3 h-3 bg-white rounded-full transition-all ${active ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
        </div>
    );
}

function AssetRow({ name, sub, val, status, isLive = false }: any) {
    return (
        <motion.div 
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            className="bg-white p-5 rounded-[1.5rem] flex items-center gap-5 border border-slate-300 hover:border-indigo-500/30 transition-all cursor-pointer group"
        >
            <div className="relative">
                <div className={`p-4 rounded-xl transition-all ${status === 'busy' ? 'bg-indigo-600/10 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
                    {sub.toLowerCase().includes('bike') ? <Bike className="w-5 h-5" /> : <Car className="w-5 h-5" />}
                </div>
                <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-2 border-slate-950 rounded-full ${status === 'busy' ? 'bg-indigo-500 animate-pulse' : 'bg-ev-green'}`} />
            </div>
            <div className="flex-1 overflow-hidden">
                <p className="text-[13px] font-black text-slate-900 leading-tight truncate uppercase tracking-tighter">{name}</p>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic">{sub}</p>
            </div>
            <div className="text-right">
                <p className="text-[12px] font-black text-slate-900 italic">{val}</p>
                {isLive && <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mt-0.5">Live Data</p>}
            </div>
        </motion.div>
    );
}

function StatCard({ label, value, sub, icon, color, trend }: any) {
    const colorClasses: any = {
        'ev-blue': 'bg-indigo-600 shadow-indigo-600/20',
        'ev-green': 'bg-ev-green shadow-ev-green/20 text-slate-950',
        'ev-gold': 'bg-ev-gold shadow-ev-gold/20 text-slate-950',
        'ev-purple': 'bg-ev-purple shadow-ev-purple/20'
    };

    return (
        <motion.div 
            whileHover={{ y: -5 }} 
            className="bg-white p-6 lg:p-8 rounded-[2.5rem] border border-slate-300 flex flex-col gap-6 relative overflow-hidden group shadow-2xl"
        >
            <div className="flex justify-between items-start">
                <div className={`p-4 rounded-2xl ${colorClasses[color]} group-hover:rotate-6 transition-transform duration-500`}>
                    {React.cloneElement(icon as React.ReactElement, { className: 'w-5 h-5' })}
                </div>
                <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl ${trend.includes('+') ? 'text-ev-green bg-ev-green/10' : 'text-indigo-400 bg-indigo-400/10'} uppercase tracking-widest border border-slate-300`}>{trend}</span>
            </div>
            <div>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2 opacity-60">{label}</p>
                <p className="text-4xl font-black text-slate-900 leading-none italic uppercase tracking-tighter">{value}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-4 uppercase tracking-tighter border-l border-slate-300 pl-3">{sub}</p>
            </div>
        </motion.div>
    );
}

function FormInput({ label, value, onChange, placeholder }: any) {
    return (
        <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">{label}</label>
            <input 
                required value={value} onChange={e => onChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 p-4 rounded-2xl outline-none focus:ring-2 ring-indigo-500/50 text-xs font-bold"
                placeholder={placeholder}
            />
        </div>
    );
}

function CheckItem({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-300">
            <div className="w-5 h-5 bg-ev-green/10 text-ev-green rounded-lg flex items-center justify-center border border-ev-green/20">✓</div>
            {label}
            {label}
        </div>
    );
}

