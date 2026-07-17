import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { requestPairingCode, pollPairingStatus } from '../api/endpoint';

type PairingPhase = 'idle' | 'requesting' | 'displaying' | 'confirmed' | 'expired' | 'error';

const POLL_INTERVAL_MS = 5000;

export interface PairingState {
    phase: PairingPhase;
    code: string | null;
    expiresAt: Date | null;
    apiKey: string | null;
    error: string | null;
    restart: () => void;
}

export function useDevicePairing(): PairingState {
    const [phase, setPhase] = useState<PairingPhase>('idle');
    const [code, setCode] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<Date | null>(null);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMountedRef = useRef(true);
    const sessionTokenRef = useRef<string | null>(null);

    const cleanup = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const startPolling = useCallback((sessionToken: string) => {
        cleanup();
        intervalRef.current = setInterval(async () => {
            try {
                const result = await pollPairingStatus(sessionToken);
                if (!isMountedRef.current) return;

                if (result.status === 'confirmed') {
                    cleanup();
                    setApiKey(result.apiKey);
                    setPhase('confirmed');
                } else if (result.status === 'expired') {
                    cleanup();
                    setPhase('expired');
                }
            } catch {
                // Erreur réseau transitoire, on continue de poller
            }
        }, POLL_INTERVAL_MS);
    }, [cleanup]);

    const startPairing = useCallback(async () => {
        cleanup();
        setPhase('requesting');
        setError(null);
        setApiKey(null);
        setCode(null);

        try {
            const result = await requestPairingCode();
            if (!isMountedRef.current) return;

            setCode(result.code);
            sessionTokenRef.current = result.sessionToken;
            setExpiresAt(new Date(result.expiresAt));
            setPhase('displaying');

            startPolling(result.sessionToken);
        } catch (e: any) {
            if (!isMountedRef.current) return;
            setError(e.message ?? 'Impossible de générer le code');
            setPhase('error');
        }
    }, [cleanup, startPolling]);

    // Démarrage automatique au montage
    useEffect(() => {
        isMountedRef.current = true;
        startPairing();
        return () => {
            isMountedRef.current = false;
            cleanup();
        };
    }, [startPairing, cleanup]);

    // Pause/reprise du polling selon l'état de l'app
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active' && phase === 'displaying' && !intervalRef.current && sessionTokenRef.current) {
                startPolling(sessionTokenRef.current);
            } else if (state !== 'active') {
                cleanup();
            }
        });
        return () => sub.remove();
    }, [phase, cleanup, startPolling]);

    // Redémarrage automatique après expiration
    useEffect(() => {
        if (phase === 'expired') {
            const timeout = setTimeout(() => {
                startPairing();
            }, 3000);
            return () => clearTimeout(timeout);
        }
    }, [phase, startPairing]);

    return {
        phase,
        code,
        expiresAt,
        apiKey,
        error,
        restart: startPairing,
    };
}
