import React, { createContext, useContext, useState, useEffect } from 'react';
import { getStoredApiKey, storeApiKey, clearApiKey } from '../shared/storage';

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

interface AuthState {
    status: AuthStatus;
    apiKey: string | null;
    authenticate: (apiKey: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<AuthStatus>('loading');
    const [apiKey, setApiKey] = useState<string | null>(null);

    useEffect(() => { checkApiKey(); }, []);

    async function checkApiKey() {
        const key = await getStoredApiKey();
        if (key) {
            setApiKey(key);
            setStatus('authenticated');
        } else {
            setStatus('unauthenticated');
        }
    }

    async function authenticate(key: string) {
        await storeApiKey(key);
        setApiKey(key);
        setStatus('authenticated');
    }

    async function logout() {
        await clearApiKey();
        setApiKey(null);
        setStatus('unauthenticated');
    }

    return (
        <AuthContext.Provider value={{ status, apiKey, authenticate, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
