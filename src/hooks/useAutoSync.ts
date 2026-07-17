import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { getLastSyncAt } from '../shared/storage';
import { runFullSync } from '../shared/sync-manager';
import { createLogger } from '../shared/logger';

// Fenêtre de resynchro : toutes les 4h à partir de la dernière sync réussie.
export const AUTO_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Petit délai après retour foreground / mount pour ne pas se battre avec le
// bootstrap réseau de l'app.
const STARTUP_DELAY_MS = 5_000;

// Déclenche une sync auto si la dernière est trop ancienne (ou n'a jamais eu
// lieu), puis re-vérifie régulièrement. Idempotent grâce au mutex du sync-manager.
export function useAutoSync(apiKey: string | null) {
    const apiKeyRef = useRef(apiKey);
    apiKeyRef.current = apiKey;

    useEffect(() => {
        if (!apiKey) return;

        let cancelled = false;
        const log = createLogger(apiKey);

        async function maybeSync(trigger: 'startup' | 'interval' | 'foreground') {
            if (cancelled) return;
            const key = apiKeyRef.current;
            if (!key) return;
            const last = await getLastSyncAt();
            const now = Date.now();
            const dueSince = last === null ? Infinity : now - last;
            if (dueSince < AUTO_SYNC_INTERVAL_MS) return;
            log('sync.auto.trigger', { trigger, lastSyncAt: last, dueSince });
            try {
                const report = await runFullSync(key, log);
                if (report === null) {
                    log('sync.auto.skipped', { reason: 'already-in-flight' });
                }
            } catch (e: any) {
                log('sync.auto.error', { message: e?.message });
            }
        }

        const startupTimer = setTimeout(() => void maybeSync('startup'), STARTUP_DELAY_MS);
        // Re-check périodique — on ne planifie pas à intervalle exact de 4h car
        // l'app peut être en background, on préfère vérifier plus souvent et
        // ne sync que si la fenêtre est effectivement écoulée.
        const interval = setInterval(() => void maybeSync('interval'), 30 * 60 * 1000);
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') void maybeSync('foreground');
        });

        return () => {
            cancelled = true;
            clearTimeout(startupTimer);
            clearInterval(interval);
            sub.remove();
        };
    }, [apiKey]);
}
