import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import UserDashboard from './pages/UserDashboard';
import ProviderDashboard from './pages/ProviderDashboard';
import AdminDashboard from './pages/AdminDashboard';
import { User as UserIcon, Shield, Car, Navigation, ArrowRight, Activity, Zap, Globe, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRole }: { children: React.ReactNode, allowedRole?: string }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (allowedRole && user.role !== allowedRole && user.role !== 'admin') return <Navigate to="/terminal" replace />;
  
  return <>{children}</>;
};

function AuthPage() {
  const { user, loginWithGoogle, loginWithEmail, registerWithEmail, verifyOTP, forgotPassword, resetPassword } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'otp' | 'forgot'>('login');
  const [formData, setFormData] = useState({ name: '', email: '', password: '', newPassword: '', confirmPassword: '', otp: '', role: 'user', vehicleType: '', vehicleNumber: '' });
  const [otpContext, setOtpContext] = useState<'signup' | 'forgot'>('signup');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // URL Parameter detection (for autocompleting reset forms via link)
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') as any;
    const ctx = params.get('ctx') as any;
    const email = params.get('email');
    const otp = params.get('otp');

    if (mode && (mode === 'otp' || mode === 'login' || mode === 'signup')) {
        setAuthMode(mode);
        if (ctx) setOtpContext(ctx);
        if (email || otp) {
            setFormData(p => ({ ...p, email: email || p.email, otp: otp || p.otp }));
        }
        // clean up URL
        window.history.replaceState({}, '', window.location.pathname);
    }

    if (user) {
        if (user.role === 'admin') navigate('/admin');
        else if (user.role === 'provider') navigate('/pilot');
        else navigate('/user');
    }
  }, [user, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (authMode === 'login') {
      const success = await loginWithEmail(formData.email, formData.password);
      if (!success) setError('Invalid credentials');
    } else if (authMode === 'signup') {
      if (formData.password !== formData.confirmPassword) { setError('Passwords do not match'); return; }
      const success = await registerWithEmail({ name: formData.name, email: formData.email, pass: formData.password, role: formData.role, vehicleType: formData.vehicleType, vehicleNumber: formData.vehicleNumber });
      if (!success) setError('Failed to register. Email may already be in use.');
    } else if (authMode === 'otp') {
      if (otpContext === 'forgot') {
         const success = await resetPassword(formData.email, formData.otp, formData.newPassword);
         if (success) { setAuthMode('login'); alert('Password reset successful'); }
         else setError('Failed to reset. Invalid OTP or common/old password.');
      } else {
         const success = await verifyOTP(formData.email, formData.otp);
         if (!success) setError('Invalid OTP or validation error.');
      }
    } else if (authMode === 'forgot') {
      const success = await forgotPassword(formData.email);
      if (success) { 
          alert('Check your inbox! Firebase has sent a password reset link to your email.');
          setAuthMode('login'); 
      }
      else setError('Failed to initiate reset. Ensure the email is registered.');
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center relative overflow-y-auto font-sans p-6 py-20 lg:py-0">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-primary-600/20 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-ev-blue/20 rounded-full blur-[150px] animate-pulse delay-1000" />
        
        <header className="flex flex-col items-center gap-4 mb-10 z-10 text-center">
            <motion.div initial={{ rotate: 12, scale: 1 }} className="w-20 h-20 bg-gradient-to-br from-primary-400 to-primary-600 rounded-[2rem] flex items-center justify-center shadow-2xl mb-4 border border-slate-300">
                <Navigation className="text-slate-900 w-10 h-10" />
            </motion.div>
            <h1 className="text-5xl font-black tracking-tighter bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent italic">SMILESPHERE EV</h1>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.5em] leading-none">Sustainability Hub Grid Access</p>
        </header>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="z-10 w-full max-w-md glass-card p-8 lg:p-10 border border-slate-300 shadow-2xl relative overflow-hidden">
            <div className="flex gap-6 mb-10">
                <button onClick={() => { setAuthMode('login'); setError(''); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all ${authMode === 'login' ? 'border-primary-500 text-slate-900' : 'border-transparent text-slate-500'}`}>Login</button>
                <button onClick={() => { setAuthMode('signup'); setError(''); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all ${authMode === 'signup' ? 'border-primary-500 text-slate-900' : 'border-transparent text-slate-500'}`}>Grid Registration</button>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
                <AnimatePresence mode="wait">
                    {authMode === 'signup' ? (
                        <motion.div key="signup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                            <div className="space-y-1.5 px-1">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Full Name</label>
                                <input type="text" required placeholder="First Last" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:border-primary-500 transition-all" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div className="space-y-1.5 px-1">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Email Address</label>
                                <input type="email" required placeholder="name@email.com" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:border-primary-500 transition-all" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div className="space-y-1.5 px-1">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Password</label>
                                <input type="password" required placeholder="••••••••" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:border-primary-500 transition-all" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                            </div>
                            <div className="space-y-1.5 px-1">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Confirm Password</label>
                                <input type="password" required placeholder="••••••••" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:border-primary-500 transition-all" value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} />
                            </div>
                         </motion.div>
                    ) : authMode === 'login' ? (
                        <motion.div key="login" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                            <div className="space-y-1.5 px-1">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Email Address</label>
                                <input type="email" required placeholder="name@email.com" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:border-primary-500 transition-all" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div className="space-y-1.5 px-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Password</label>
                                    <button type="button" onClick={() => { setAuthMode('forgot'); setError(''); }} className="text-[9px] font-black uppercase tracking-widest text-primary-500 hover:text-primary-600 transition-all">Forgot Password?</button>
                                </div>
                                <input type="password" required placeholder="••••••••" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:border-primary-500 transition-all" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                            </div>
                        </motion.div>
                    ) : authMode === 'forgot' ? (
                        <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                            <div className="space-y-1.5 px-1">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Email Address</label>
                                <input type="email" required placeholder="name@email.com" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:border-primary-500 transition-all" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div className="space-y-1.5 px-1">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">New Password</label>
                                <input type="password" required placeholder="••••••••" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:border-primary-500 transition-all" value={formData.newPassword} onChange={e => setFormData({...formData, newPassword: e.target.value})} />
                            </div>
                            <div className="space-y-1.5 px-1">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Confirm Password</label>
                                <input type="password" required placeholder="••••••••" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:border-primary-500 transition-all" value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} />
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div key="otp" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4">
                            <p className="text-[10px] text-slate-400 font-bold mb-6 uppercase tracking-widest leading-relaxed">Verification token dispatched <span className="text-slate-900 block">{formData.email}</span></p>
                            <input type="text" required maxLength={6} placeholder="000000" className="w-full bg-slate-100 border border-slate-300 rounded-2xl p-5 text-3xl font-black text-center tracking-[0.5em] text-slate-900 outline-none focus:border-primary-500 mb-2" value={formData.otp} onChange={e => setFormData({...formData, otp: e.target.value})} />
                            <button type="button" onClick={async () => {
                                if (otpContext === 'forgot') await forgotPassword(formData.email);
                                else await registerWithEmail(formData.name, formData.email, formData.password);
                                alert("OTP Resent!");
                            }} className="text-[10px] text-primary-500 font-black uppercase tracking-widest hover:text-primary-600 transition-all">Resend OTP</button>
                        </motion.div>
                    )}
                </AnimatePresence>
                {error && <p className="text-rose-500 text-[9px] font-black uppercase tracking-[0.2em] text-center">{error}</p>}
                <button type="submit" className="w-full py-5 text-white bg-primary-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] shadow-xl hover:bg-primary-400 transition-all">
                    {authMode === 'login' ? 'Login' : authMode === 'signup' ? 'Create Account' : 'Confirm'}
                </button>
                <button onClick={loginWithGoogle} type="button" className="w-full py-4 bg-slate-100 border border-slate-300 text-slate-900 rounded-2xl flex items-center justify-center gap-3 font-black text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                    <img src="https://img.icons8.com/color/48/000000/google-logo.png" className="w-4 h-4" /> Sign in with Google
                </button>
            </form>
        </motion.div>
        <p className="mt-10 text-slate-700 text-[8px] font-black tracking-[0.4em] uppercase text-center opacity-50">Built with Quantum Integrity ● SMILESPHERE V.4</p>
    </div>
  );
}

function TerminalPage() {
    const { user, logout, deleteAccount } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-6 relative overflow-y-auto">
            <div className="absolute inset-0 bg-primary-950/20 blur-[120px]" />
            <div className="z-10 w-full max-w-5xl">
                <div className="flex justify-between items-center mb-10 bg-slate-100 p-4 rounded-3xl border border-slate-300 backdrop-blur-xl">
                    <div className="flex items-center gap-4 px-2">
                        <img src={user.photoURL} className="w-12 h-12 rounded-2xl border-2 border-primary-500" />
                        <div>
                            <p className="text-slate-900 font-black text-xs uppercase tracking-tighter">{user.displayName}</p>
                            <p className="text-slate-500 text-[8px] uppercase font-bold tracking-widest italic">{user.role.toUpperCase()} ENTITY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => deleteAccount(user.email)} className="px-6 py-3 bg-slate-100 hover:bg-rose-500/10 text-rose-500 transition-all rounded-2xl font-black text-[10px] uppercase tracking-widest leading-none border border-slate-300">Delete Account</button>
                        <button onClick={logout} className="px-6 py-3 bg-slate-100 hover:bg-rose-500/10 text-slate-400 hover:text-slate-900 transition-all rounded-2xl font-black text-[10px] uppercase tracking-widest leading-none border border-slate-300">Logout</button>
                    </div>
                </div>

                <div className="text-center mb-16">
                    <h2 className="text-5xl lg:text-7xl font-black tracking-tighter bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent uppercase italic">Select Terminal</h2>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.6em] mt-3">Grid Command Authority Interface</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <RoleCard title="User Node" desc="Book your premium EV ride" icon={<UserIcon />} onClick={() => navigate('/user')} color="bg-primary-500" />
                    <RoleCard title="Pilot Grid" desc="Access provider terminal" icon={<Car />} onClick={() => navigate('/pilot')} color="bg-ev-blue" />
                    <RoleCard title="Command OS" desc="Fleet Analytics" icon={<Shield />} onClick={() => {
                        const pass = prompt("Cipher Key:");
                        if (pass === 'SMILESPHERE2026' || user.role === 'admin') navigate('/admin');
                    }} color="bg-indigo-600" />
                </div>
            </div>
        </div>
    );
}

function RoleCard({ title, desc, icon, onClick, color }: any) {
    return (
        <motion.button whileHover={{ y: -5, scale: 1.02 }} onClick={onClick} className="bg-white/40 backdrop-blur-3xl border border-slate-300 p-8 rounded-[2.5rem] text-left group transition-all hover:bg-white/60 flex flex-col gap-6 relative overflow-hidden shadow-2xl">
            <div className={`absolute top-0 right-0 w-24 h-24 opacity-5 blur-3xl ${color}`} />
            <div className={`w-16 h-16 ${color} rounded-2xl flex items-center justify-center text-slate-900 shadow-xl`}>
                {icon}
            </div>
            <div>
                <h3 className="text-2xl font-black italic tracking-tighter text-slate-900 uppercase italic mb-1">{title}</h3>
                <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest leading-relaxed mb-4">{desc}</p>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-900 transition-colors" />
            </div>
        </motion.button>
    );
}

export default function App() {
  return (
    <BrowserRouter>
        <AuthProvider>
            <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/terminal" element={<ProtectedRoute><TerminalPage /></ProtectedRoute>} />
                <Route path="/user" element={<ProtectedRoute allowedRole="user"><UserDashboard /></ProtectedRoute>} />
                <Route path="/pilot" element={<ProtectedRoute allowedRole="provider"><ProviderDashboard /></ProtectedRoute>} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/" element={<Navigate to="/auth" replace />} />
            </Routes>
        </AuthProvider>
    </BrowserRouter>
  );
}
