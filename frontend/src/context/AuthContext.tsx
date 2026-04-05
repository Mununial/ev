import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  user: any | null;
  loading: boolean;
  loginWithGoogle: () => void;
  loginWithEmail: (email: string, pass: string, requestedRole?: string) => Promise<boolean>;
  registerWithEmail: (name: string, email: string, pass: string) => Promise<boolean>;
  verifyOTP: (email: string, otp: string, userData: { name: string, role: string, password?: string, vehicleType?: string }) => Promise<boolean>;
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

  const loginWithGoogle = () => {
    setLoading(true);
    setTimeout(() => {
        const u = {
            uid: 'DEMO_USER_123',
            displayName: 'SMILESPHERE Pilot',
            email: 'admin@SMILESPHERE.ev',
            role: 'admin',
            photoURL: 'https://img.icons8.com/color/96/avatar.png'
        };
        setUser(u);
        setLoading(false);
    }, 500);
  };

  const loginWithEmail = async (email: string, pass: string, requestedRole?: string) => {
    setLoading(true);
    try {
        const resp = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass, requestedRole })
        });
        const data = await resp.json();
        setLoading(false);
        if (data.success) {
            setUser(data.user);
            return true;
        }
        return false;
    } catch {
        setLoading(false);
        return false;
    }
  };

  const registerWithEmail = async (name: string, email: string, pass: string) => {
    try {
        const resp = await fetch('http://localhost:5000/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name })
        });
        const data = await resp.json();
        return data.success;
    } catch (e) {
        console.error(e);
        return false;
    }
  };

  const verifyOTP = async (email: string, otp: string, userData: { name: string, role: string, password?: string, vehicleType?: string, vehicleNumber?: string }) => {
    try {
        const resp = await fetch('http://localhost:5000/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });
        const data = await resp.json();
        if (data.success) {
            const regResp = await fetch('http://localhost:5000/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...userData, email })
            });
            const regData = await regResp.json();
            if (regData.success) {
                setUser(regData.user);
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error(e);
        return false;
    }
  };

  const forgotPassword = async (email: string) => {
      try {
          const resp = await fetch('http://localhost:5000/api/auth/forgot-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email })
          });
          return (await resp.json()).success;
      } catch { return false; }
  };

  const resetPassword = async (email: string, otp: string, newPassword: string) => {
      try {
          const resp = await fetch('http://localhost:5000/api/auth/reset-password', {
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
          await fetch('http://localhost:5000/api/auth/delete', {
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

  const logout = () => {
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
