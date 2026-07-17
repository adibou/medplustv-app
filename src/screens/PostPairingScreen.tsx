import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import AppBackground from '../components/AppBackground';
import { useAuth } from '../contexts/AuthContext';
import { getDisplayLoop } from '../api/endpoint';
import { storePlaylist } from '../shared/storage';
import { syncVideos } from '../shared/video-downloader';
import { createLogger } from '../shared/logger';

// Écran d'accueil post-pairing : enchaîne 3 messages pédagogiques pendant que
// la playlist est récupérée et que la sync des vidéos démarre en tâche de fond.
// Règle : chaque étape reste affichée au moins MIN_VISIBLE_MS pour être lisible,
// même si le travail réseau est déjà terminé. Inversement, on ne fait *pas*
// attendre le background : la sync est fire-and-forget, MainScreen bouclera sur
// la vidéo par défaut le temps que les vidéos atterrissent au fil de l'eau.

type Step = 'paired' | 'fetching-playlist' | 'playlist-ready';

const MIN_VISIBLE_MS: Record<Step, number> = {
    paired: 1000,
    'fetching-playlist': 1500,
    'playlist-ready': 1500,
};

export default function PostPairingScreen() {
    const { apiKey, finishOnboarding } = useAuth();
    const [step, setStep] = useState<Step>('paired');
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Refs pour ne pas relancer l'effet à chaque re-render (l'orchestration
    // doit tourner une seule fois, séquentiellement).
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current || !apiKey) return;
        startedRef.current = true;

        const log = createLogger(apiKey);

        (async () => {
            // ── Étape 1 : "Pairing réussi" ──────────────────────────────────
            await wait(MIN_VISIBLE_MS.paired);
            setStep('fetching-playlist');

            // ── Étape 2 : "Récupération de la playlist" ─────────────────────
            // La récupération et le timer d'affichage tournent en parallèle,
            // on avance quand les deux sont terminés.
            const fetchStart = Date.now();
            const fetchPromise = (async () => {
                try {
                    const items = await getDisplayLoop(apiKey);
                    await storePlaylist(items);
                    return items;
                } catch (e: any) {
                    // Si la récup échoue on ne bloque pas l'onboarding : MainScreen
                    // sait bouclrr sur la vidéo par défaut sans playlist. On log
                    // pour que ce soit visible côté BO.
                    log('onboarding.playlist.fetch.failed', { message: e?.message ?? 'unknown' });
                    setFetchError(e?.message ?? 'unknown');
                    return null;
                }
            })();

            const [items] = await Promise.all([
                fetchPromise,
                wait(MIN_VISIBLE_MS['fetching-playlist']),
            ]);
            log('onboarding.playlist.fetched', {
                items: items?.length ?? 0,
                durationMs: Date.now() - fetchStart,
                ok: items !== null,
            });
            setStep('playlist-ready');

            // ── Étape 3 : "Playlist récupérée, ça va se charger" ────────────
            // On kick la sync EN PARALLÈLE du dernier timer : les downloads
            // commencent immédiatement, MainScreen les verra apparaître au
            // fil de l'eau via ses relectures d'index.
            if (items && items.length > 0) {
                syncVideos(items, apiKey, log, () => { /* no-op */ }).catch((e: any) => {
                    log('onboarding.sync.crashed', { message: e?.message ?? 'unknown' });
                });
            }
            await wait(MIN_VISIBLE_MS['playlist-ready']);

            finishOnboarding();
        })();
    }, [apiKey, finishOnboarding]);

    return (
        <AppBackground style={styles.container}>
            {step === 'paired' && (
                <View style={styles.block}>
                    <Text style={styles.check}>✓</Text>
                    <Text style={styles.title}>Écran associé avec succès !</Text>
                </View>
            )}

            {step === 'fetching-playlist' && (
                <View style={styles.block}>
                    <ActivityIndicator size="large" color="#0f3460" />
                    <Text style={styles.title}>Récupération de la playlist…</Text>
                    <View style={styles.infoBubble}>
                        <Text style={styles.infoIcon}>💡</Text>
                        <Text style={styles.infoText}>
                            Vous pouvez personnaliser la playlist affichée sur cet écran en vous
                            connectant à <Text style={styles.infoStrong}>app.medplus.tv</Text>.
                        </Text>
                    </View>
                </View>
            )}

            {step === 'playlist-ready' && (
                <View style={styles.block}>
                    <Text style={styles.check}>✓</Text>
                    <Text style={styles.title}>Playlist récupérée</Text>
                    <Text style={styles.subtitle}>
                        Tout est en place, les vidéos vont se charger petit à petit.
                    </Text>
                    {fetchError && (
                        <Text style={styles.warning}>
                            (La playlist n'a pas pu être récupérée pour le moment, la lecture par
                            défaut sera utilisée en attendant.)
                        </Text>
                    )}
                </View>
            )}
        </AppBackground>
    );
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 60,
    },
    block: {
        alignItems: 'center',
        gap: 24,
        maxWidth: 720,
    },
    check: {
        fontSize: 72,
        color: '#4CAF50',
        fontWeight: 'bold',
        lineHeight: 80,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#0f3460',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 20,
        color: '#333',
        textAlign: 'center',
        lineHeight: 28,
    },
    infoBubble: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#c7d5ee',
        paddingHorizontal: 20,
        paddingVertical: 16,
        marginTop: 8,
        maxWidth: 640,
    },
    infoIcon: {
        fontSize: 22,
        lineHeight: 28,
    },
    infoText: {
        flex: 1,
        fontSize: 16,
        lineHeight: 22,
        color: '#333',
    },
    infoStrong: {
        color: '#0f3460',
        fontWeight: 'bold',
    },
    warning: {
        fontSize: 14,
        color: '#8a5a00',
        textAlign: 'center',
        marginTop: 12,
        maxWidth: 560,
    },
});
