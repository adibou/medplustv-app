import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableHighlight, useTVEventHandler } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { getStoredPlaylist, getVideoIndex, setVideoIndex, getStoredMuted, storeMuted } from '../shared/storage';
import type { ResolvedPlaylistItem } from '../api/types';
import { useAuth } from '../contexts/AuthContext';
import { createLogger } from '../shared/logger';
import defaultVideoAsset from '../../assets/video.mp4';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

interface PlayableItem {
    item: ResolvedPlaylistItem;
    videoId: number;
    uri: string;
}

// Fréquence de re-check quand on tourne sur la vidéo par défaut : dès qu'une
// première vidéo de playlist devient `ready`, on bascule dessus au tour suivant.
const DEFAULT_RECHECK_MS = 15_000;

export default function MainScreen() {
    const navigation = useNavigation<Nav>();
    const { apiKey } = useAuth();
    const focusedAction = useRef<(() => void) | null>(null);

    const [paused, setPaused] = useState(false);
    const [muted, setMuted] = useState(false);

    const pausedRef = useRef(false);
    const mutedRef = useRef(false);
    const isPlayingDefaultRef = useRef(false);
    // videoId de la dernière vidéo de playlist jouée — sert de curseur pour
    // reprendre la boucle au bon endroit après un re-read d'index (les positions
    // dans la liste `playable` peuvent bouger si une vidéo apparaît/disparaît).
    const lastPlayedVideoIdRef = useRef<number | null>(null);
    const defaultRecheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Anti-doublon pour le log `video.notfound` (une fois par videoId par session).
    const loggedNotFoundRef = useRef<Set<number>>(new Set());

    const log = useMemo(() => createLogger(apiKey), [apiKey]);
    const logRef = useRef(log);
    logRef.current = log;

    const player = useVideoPlayer(null, p => {
        p.loop = false;
    });

    useTVEventHandler((evt) => {
        if (evt.eventType === 'select' && focusedAction.current) {
            focusedAction.current();
        }
    });

    function handleFocusChange(focused: boolean, action: () => void) {
        focusedAction.current = focused ? action : null;
    }

    // Lit playlist + index et matérialise la liste des vidéos prêtes à jouer.
    // On ne conserve que les items `video` avec entrée `ready` en index — les
    // `loading`/`not_loaded`/`notfound` sont skippés silencieusement (elles
    // apparaîtront quand la sync les fera passer `ready`).
    async function pickPlayable(): Promise<PlayableItem[]> {
        const [items, index] = await Promise.all([getStoredPlaylist(), getVideoIndex()]);
        const out: PlayableItem[] = [];
        for (const it of items) {
            if (it.itemType === 'video' && it.video) {
                const entry = index[it.video.id];
                if (entry?.status === 'ready') {
                    out.push({ item: it, videoId: it.video.id, uri: entry.uri });
                }
            }
        }
        return out;
    }

    async function markNotFound(videoId: number, uri: string) {
        const idx = await getVideoIndex();
        const entry = idx[videoId];
        if (entry && entry.status !== 'notfound') {
            idx[videoId] = { uri: entry.uri, status: 'notfound' };
            await setVideoIndex(idx);
        }
        if (!loggedNotFoundRef.current.has(videoId)) {
            loggedNotFoundRef.current.add(videoId);
            logRef.current('video.notfound', { videoId, uri });
        }
    }

    function logItemStart(item: ResolvedPlaylistItem) {
        if (item.itemType === 'video' && item.video) {
            logRef.current('video.run', { videoId: item.video.id });
        } else if (item.itemType === 'slide' && item.slide) {
            logRef.current('slide.run', { slideId: item.slide.id });
        }
    }

    // Vérifie le fichier au moment de la lecture. Une entrée `ready` peut
    // pointer sur un fichier disparu (nettoyage OS, purge externe…) — on
    // détecte ici, on marque `notfound` + log, et l'appelant passera au suivant.
    async function verifyAndPlay(entry: PlayableItem): Promise<boolean> {
        const info = await FileSystem.getInfoAsync(entry.uri);
        if (!info.exists || info.isDirectory || info.size === 0) {
            await markNotFound(entry.videoId, entry.uri);
            return false;
        }
        stopDefaultRecheck();
        isPlayingDefaultRef.current = false;
        player.loop = false;
        // `replaceAsync` : charge l'asset hors du thread UI (sinon warning iOS +
        // deprecation à venir de la variante sync).
        await player.replaceAsync(entry.uri);
        if (!pausedRef.current) player.play();
        lastPlayedVideoIdRef.current = entry.videoId;
        logItemStart(entry.item);
        return true;
    }

    // Joue la vidéo par défaut en boucle et arme un re-check périodique pour
    // sortir dès qu'une vidéo de playlist devient jouable.
    async function playDefault() {
        isPlayingDefaultRef.current = true;
        lastPlayedVideoIdRef.current = null;
        player.loop = true;
        await player.replaceAsync(defaultVideoAsset);
        if (!pausedRef.current) player.play();
        startDefaultRecheck();
    }

    function startDefaultRecheck() {
        if (defaultRecheckRef.current) return;
        defaultRecheckRef.current = setInterval(() => {
            void tryLeaveDefault();
        }, DEFAULT_RECHECK_MS);
    }

    function stopDefaultRecheck() {
        if (defaultRecheckRef.current) {
            clearInterval(defaultRecheckRef.current);
            defaultRecheckRef.current = null;
        }
    }

    async function tryLeaveDefault() {
        if (!isPlayingDefaultRef.current) return;
        const playable = await pickPlayable();
        if (playable.length === 0) return;
        await playFrom(playable, 0);
    }

    // Tente de jouer à partir de `idx`, en avançant sur les items `notfound`.
    // Si aucun ne peut être joué → repli sur la vidéo par défaut.
    async function playFrom(playable: PlayableItem[], idx: number): Promise<void> {
        if (playable.length === 0) {
            await playDefault();
            return;
        }
        const len = playable.length;
        for (let i = 0; i < len; i++) {
            const j = ((idx + i) % len + len) % len;
            const ok = await verifyAndPlay(playable[j]);
            if (ok) return;
        }
        await playDefault();
    }

    async function advance(direction: 1 | -1 = 1) {
        const playable = await pickPlayable();
        if (playable.length === 0) {
            await playDefault();
            return;
        }
        const currentIdx = lastPlayedVideoIdRef.current !== null
            ? playable.findIndex(p => p.videoId === lastPlayedVideoIdRef.current)
            : -1;
        // Si la vidéo courante n'est plus dans la liste, on repart au début
        // (comportement plus lisible qu'un modulo sur une position obsolète).
        const nextIdx = currentIdx < 0 ? 0 : currentIdx + direction;
        await playFrom(playable, nextIdx);
    }

    // Bootstrap : au focus initial, on lance la lecture. Le focusEffect gère
    // aussi le retour depuis le menu, où la sync peut avoir enrichi l'index.
    useFocusEffect(useCallback(() => {
        void (async () => {
            const playable = await pickPlayable();
            if (playable.length === 0) {
                await playDefault();
            } else {
                // Si on avait un curseur (retour depuis menu), reprendre. Sinon 0.
                const startIdx = lastPlayedVideoIdRef.current !== null
                    ? Math.max(0, playable.findIndex(p => p.videoId === lastPlayedVideoIdRef.current))
                    : 0;
                await playFrom(playable, startIdx);
            }
        })();
        return () => {
            stopDefaultRecheck();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []));

    // Fin de vidéo (playlist uniquement — la vidéo par défaut est en loop=true).
    useEffect(() => {
        const sub = player.addListener('statusChange', ({ status }) => {
            if (status !== 'idle') return;
            if (pausedRef.current) return;
            if (isPlayingDefaultRef.current) return;
            void advance(1);
        });
        return () => sub.remove();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player]);

    useEffect(() => () => stopDefaultRecheck(), []);

    // Charge la préférence mute persistée au mount (indépendant du player pour
    // éviter toute race avec l'init natif d'expo-video).
    useEffect(() => {
        void (async () => {
            const stored = await getStoredMuted();
            if (stored) {
                mutedRef.current = true;
                setMuted(true);
            }
        })();
    }, []);

    // Synchronise `muted` → `player.muted`. Découplé de `replaceAsync` : on
    // n'écrit la propriété que sur changement d'état, jamais dans le flow de
    // chargement (des écritures pendant l'init du player natif peuvent tuer
    // la session audio sur TV). On skip aussi le tout premier fire quand
    // muted=false : inutile d'écrire la valeur par défaut sur un player à peine
    // instancié.
    const mutedAppliedRef = useRef(false);
    useEffect(() => {
        if (!mutedAppliedRef.current && !muted) return;
        mutedAppliedRef.current = true;
        player.muted = muted;
    }, [player, muted]);

    function handlePrev() {
        void advance(-1);
    }

    function handleNext() {
        void advance(1);
    }

    function handleMute() {
        const next = !mutedRef.current;
        mutedRef.current = next;
        setMuted(next);
        void storeMuted(next);
    }

    function handlePlayPause() {
        if (pausedRef.current) {
            player.play();
            pausedRef.current = false;
            setPaused(false);
        } else {
            player.pause();
            pausedRef.current = true;
            setPaused(true);
        }
    }

    return (
        <View style={styles.container}>
            <VideoView
                style={styles.videoFullscreen}
                player={player}
                nativeControls={false}
            />
            <View style={styles.overlay}>
                <View style={styles.controlsRow}>
                    <TVButton label="⏮" onPress={handlePrev} onFocusChange={handleFocusChange} />
                    <TVButton
                        label={paused ? '▶' : '⏸'}
                        onPress={handlePlayPause}
                        onFocusChange={handleFocusChange}
                        hasTVPreferredFocus
                    />
                    <TVButton label="⏭" onPress={handleNext} onFocusChange={handleFocusChange} />
                    <TVButton
                        label={muted ? '🔇' : '🔊'}
                        onPress={handleMute}
                        onFocusChange={handleFocusChange}
                    />
                    <TVButton
                        label="☰"
                        onPress={() => navigation.navigate('Menu')}
                        onFocusChange={handleFocusChange}
                    />
                </View>
            </View>
        </View>
    );
}

function TVButton({
    label,
    onPress,
    onFocusChange,
    hasTVPreferredFocus = false,
}: {
    label: string;
    onPress: () => void;
    onFocusChange: (focused: boolean, action: () => void) => void;
    hasTVPreferredFocus?: boolean;
}) {
    const [focused, setFocused] = useState(false);

    return (
        <TouchableHighlight
            onPress={onPress}
            hasTVPreferredFocus={hasTVPreferredFocus}
            onFocus={() => { setFocused(true); onFocusChange(true, onPress); }}
            onBlur={() => { setFocused(false); onFocusChange(false, onPress); }}
            underlayColor="#0f3460"
            style={[styles.button, focused && styles.buttonFocused]}
        >
            <Text style={styles.buttonText}>{label}</Text>
        </TouchableHighlight>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    videoFullscreen: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    overlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 32,
        paddingVertical: 14,
    },
    controlsRow: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    button: {
        backgroundColor: '#16213e',
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#0f3460',
        minWidth: 50,
        alignItems: 'center',
    },
    buttonFocused: {
        backgroundColor: '#0f3460',
        borderColor: '#e94560',
        transform: [{ scale: 1.08 }],
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
