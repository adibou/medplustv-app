import React, { createContext, useContext, useState, useEffect } from 'react';
import { getStoredApiKey, storeApiKey, clearApiKey, clearPlaylist } from '../shared/storage';
import { createLogger } from '../shared/logger';
import { getDeviceInfo } from '../shared/device-info';

// `onboarding` : entre l'authenticate() (pairing confirmé) et le
// finishOnboarding() appelé par PostPairingScreen. Permet à RootNavigator
// d'afficher les messages d'accueil avant de laisser la main à MainScreen.
type AuthStatus = 'loading' | 'unauthenticated' | 'onboarding' | 'authenticated';

interface AuthState {
    status: AuthStatus;
    apiKey: string | null;
    authenticate: (apiKey: string) => Promise<void>;
    finishOnboarding: () => void;
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
        // Un display fraîchement pairé peut hériter d'une playlist d'une association
        // précédente. On la vide pour repartir propre — les fichiers vidéo restent,
        // le prochain sync les gardera s'ils sont encore dans la nouvelle playlist.
        await clearPlaylist();
        await storeApiKey(key);
        // Snapshot matériel + version app poussé au moment du pairing pour tracer
        // le parc côté BO (Fire TV vs Android TV, versions, etc.). Fire-and-forget.
        try {
            const info = await getDeviceInfo();
            createLogger(key)('display.paired', info as unknown as Record<string, unknown>);
        } catch (e: any) {
            createLogger(key)('display.paired', { deviceInfoError: e?.message ?? 'unknown' });
        }
        setApiKey(key);
        setStatus('onboarding');
    }

    function finishOnboarding() {
        setStatus('authenticated');
    }

    async function logout() {
        await clearApiKey();
        setApiKey(null);
        setStatus('unauthenticated');
    }

    return (
        <AuthContext.Provider value={{ status, apiKey, authenticate, finishOnboarding, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
