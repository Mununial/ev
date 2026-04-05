import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';

interface AuthContextType {
  user: any | null;
  loading: boolean;
  loginWithGoogle: () => void;
  loginWithEmail: (email: string, pass: string, requestedRole?: string) => Promise<boolean>;
  registerWithEmail: (userData: { name: string, email: string, pass: string, role: string, vehicleType?: string, vehicleNumber?: string }) => Promise<boolean>;
  verifyOTP: (email: string, otp: string) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<boolean>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<boolean>;
  deleteAccount: (email: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('SMILESPHERE_auth');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
        localStorage.setItem('SMILESPHERE_auth', JSON.stringify(user));
    } else {
        localStorage.removeItem('SMILESPHERE_auth');
    }
  }, [user]);

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const u = {
            uid: result.user.uid,
            displayName: result.user.displayName,
            email: result.user.email,
            role: 'user', // Default to user for google sign-in
            photoURL: result.user.photoURL
        };
        // Option: Sync with backend if needed
        setUser(u);
        setLoading(false);
    } catch (e) {
        console.error(e);
        setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string, requestedRole?: string) => {
    setLoading(true);
    try {
        // Step 1: Login via Firebase
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        
        // Step 2: Fetch metadata from our backend
        const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass, requestedRole, uid: cred.user.uid })
        });
        const data = await resp.json();
        setLoading(false);
        if (data.success) {
            setUser(data.user);
            return true;
        }
        return false;
    } catch (e: any) {
        setLoading(false);
        alert(e.message);
        return false;
    }
  };

  const registerWithEmail = async (userData: { name: string, email: string, pass: string, role: string, vehicleType?: string, vehicleNumber?: string }) => {
    try {
        setLoading(true);
        // Step 1: Register in Firebase
        const cred = await createUserWithEmailAndPassword(auth, userData.email, userData.pass);

        // Step 2: Save metadata in backend
        const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...userData, password: userData.pass, uid: cred.user.uid })
        });
        const data = await resp.json();
        setLoading(false);
        if (data.success) {
            setUser(data.user);
            return true;
        }
        return false;
    } catch (e: any) {
        setLoading(false);
        alert(e.message);
        return false;
    }
  };

  const verifyOTP = async (email: string, otp: string) => {
    try {
        const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });
        const data = await resp.json();
        return data.success;
    } catch (e) {
        console.error(e);
        return false;
    }
  };

  const forgotPassword = async (email: string) => {
      try {
          setLoading(true);
          await sendPasswordResetEmail(auth, email);
          setLoading(false);
          alert('Password reset link sent to your email! No OTP required.');
          return true;
      } catch (e: any) { 
          setLoading(false);
          alert(e.message);
          return false; 
      }
  };

  const resetPassword = async (email: string, otp: string, newPassword: string) => {
      try {
          const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/reset-password`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, otp, newPassword })
          });
          const data = await resp.json();
          if (!data.success) alert(data.error);
          return data.success;
      } catch { return false; }
  };

  const deleteAccount = async (email: string) => {
      const confirmText = prompt(`ACCOUNT DELETION\n\nThis will permanently delete your profile, ride history, and configuration. Type "DELETE" to confirm destruction of ${email}:`);
      if (confirmText !== "DELETE") {
          alert('Deletion aborted.');
          return;
      }
      try {
          await fetch(`${import.meta.env.VITE_API_URL}/api/auth/delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email })
          });
          logout();
          alert('Account securely deleted from SmileSphere Grid.');
      } catch {
          alert('Failed to connect to SmileSphere backend.');
      }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    localStorage.removeItem('SMILESPHERE_auth');
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, loginWithEmail, registerWithEmail, verifyOTP, forgotPassword, resetPassword, deleteAccount, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


