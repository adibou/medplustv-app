import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { requestPairing, pollPairingStatus } from '../api/endpoint';
import { getStoredPairingEmail, storePairingEmail } from '../shared/storage';

// idle       : saisie de l'email
// requesting : POST /pairing/request en cours
// waiting    : lien envoyé (si l'email est connu), on poll /pairing/status
// confirmed  : apiKey récupérée → AuthContext.authenticate
// expired    : le lien n'a pas été cliqué à temps
// error      : l'API n'a pas répondu à la demande
type PairingPhase = 'idle' | 'requesting' | 'waiting' | 'confirmed' | 'expired' | 'error';

const POLL_INTERVAL_MS = 5000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PairingState {
    phase: PairingPhase;
    email: string;
    expiresAt: Date | null;
    apiKey: string | null;
    error: string | null;
    submitEmail: (email: string) => void;
    changeEmail: () => void;
    restart: () => void;
}

export function useDevicePairing(): PairingState {
    const [phase, setPhase] = useState<PairingPhase>('idle');
    const [email, setEmail] = useState('');
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

    const submitEmail = useCallback(async (rawEmail: string) => {
        const trimmed = rawEmail.trim().toLowerCase();
        setEmail(trimmed);
        setError(null);
        if (!EMAIL_REGEX.test(trimmed)) {
            setError('Adresse email invalide');
            setPhase('idle');
            return;
        }

        cleanup();
        setPhase('requesting');
        setApiKey(null);
        storePairingEmail(trimmed).catch(() => {});

        try {
            const result = await requestPairing(trimmed);
            if (!isMountedRef.current) return;

            sessionTokenRef.current = result.sessionToken;
            setExpiresAt(new Date(result.expiresAt));
            setPhase('waiting');
            startPolling(result.sessionToken);
        } catch (e: any) {
            if (!isMountedRef.current) return;
            setError(e.message ?? "Impossible d'envoyer le lien");
            setPhase('error');
        }
    }, [cleanup, startPolling]);

    // Retour à la saisie (l'email reste prérempli).
    const changeEmail = useCallback(() => {
        cleanup();
        sessionTokenRef.current = null;
        setError(null);
        setApiKey(null);
        setPhase('idle');
    }, [cleanup]);

    // Préremplissage avec le dernier email saisi (ré-association après "Dissocier").
    useEffect(() => {
        isMountedRef.current = true;
        getStoredPairingEmail().then((stored) => {
            if (isMountedRef.current && stored) setEmail((current) => current || stored);
        }).catch(() => {});
        return () => {
            isMountedRef.current = false;
            cleanup();
        };
    }, [cleanup]);

    // Pause/reprise du polling selon l'état de l'app
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active' && phase === 'waiting' && !intervalRef.current && sessionTokenRef.current) {
                startPolling(sessionTokenRef.current);
            } else if (state !== 'active') {
                cleanup();
            }
        });
        return () => sub.remove();
    }, [phase, cleanup, startPolling]);

    return {
        phase,
        email,
        expiresAt,
        apiKey,
        error,
        submitEmail,
        changeEmail,
        restart: changeEmail,
    };
}
