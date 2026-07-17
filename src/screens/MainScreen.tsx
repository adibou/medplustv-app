import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableHighlight, useTVEventHandler } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import {
    getStoredPlaylist,
    getVideoIndex,
    setVideoIndex,
    getStoredMuted,
    storeMuted,
    getAssetIndex,
    type AssetIndex,
} from '../shared/storage';
import type { ResolvedPlaylistItem, Slide, SlideAssetRef, SlideContentValue } from '../api/types';
import { useAuth } from '../contexts/AuthContext';
import { createLogger } from '../shared/logger';
import SlideView from '../slides/slide-view';
import defaultVideoAsset from '../../assets/video.mp4';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

// PlayableItem : soit une vidéo prête (fichier ready), soit une slide dont tous les
// assets image sont ready. Les items pas encore synchros sont skippés côté picker
// et réapparaîtront quand la sync les rendra jouables.
type PlayableVideo = { kind: 'video'; item: ResolvedPlaylistItem; videoId: number; uri: string };
type PlayableSlide = { kind: 'slide'; item: ResolvedPlaylistItem; slide: Slide };
type PlayableItem = PlayableVideo | PlayableSlide;

// Fréquence de re-check quand on tourne sur la vidéo par défaut : dès qu'une
// première vidéo de playlist devient `ready`, on bascule dessus au tour suivant.
const DEFAULT_RECHECK_MS = 15_000;

function isAssetRef(v: SlideContentValue): v is SlideAssetRef {
    return typeof v === 'object' && v !== null && v.kind === 'asset';
}

// Une slide est jouable ssi tous ses assets image sont `ready` en index. Si un seul
// manque on skip — la slide réapparaîtra une fois la sync assets terminée.
function slideAssetsReady(slide: Slide, assetIndex: AssetIndex): boolean {
    for (const value of Object.values(slide.content)) {
        if (!isAssetRef(value)) continue;
        const entry = assetIndex[value.id];
        if (!entry || entry.status !== 'ready') return false;
    }
    return true;
}

// Clé stable pour tracker "quel item on vient de jouer" — sert de curseur pour
// `advance` car les positions dans `playable` peuvent bouger d'un tick à l'autre.
type PlayedKey = { kind: 'video' | 'slide'; id: number };
function keyOf(p: PlayableItem): PlayedKey {
    return p.kind === 'video' ? { kind: 'video', id: p.videoId } : { kind: 'slide', id: p.slide.id };
}
function sameKey(a: PlayedKey, b: PlayedKey): boolean {
    return a.kind === b.kind && a.id === b.id;
}

export default function MainScreen() {
    const navigation = useNavigation<Nav>();
    const { apiKey } = useAuth();
    const focusedAction = useRef<(() => void) | null>(null);

    const [paused, setPaused] = useState(false);
    const [muted, setMuted] = useState(false);
    // Slide en cours d'affichage (null quand on est sur une vidéo ou sur le default).
    const [currentSlide, setCurrentSlide] = useState<Slide | null>(null);
    // Snapshot d'asset index utilisé pour résoudre les URIs de la slide affichée.
    // Rafraîchi à chaque pickPlayable pour rester en phase avec la sync.
    const [assetIndex, setAssetIndex] = useState<AssetIndex>({});

    const pausedRef = useRef(false);
    const mutedRef = useRef(false);
    const isPlayingDefaultRef = useRef(false);
    // Curseur du dernier item joué — les positions dans `playable` peuvent bouger
    // si un item apparaît/disparaît, on repart de la clé plutôt que d'un index.
    const lastPlayedRef = useRef<PlayedKey | null>(null);
    const defaultRecheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Timer d'affichage d'une slide — armé quand on affiche une slide, cleared à
    // chaque avance pour éviter le double-fire (ex: appui manuel sur ⏭).
    const slideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Anti-doublon pour le log `video.notfound` (une fois par videoId par session).
    const loggedNotFoundRef = useRef<Set<number>>(new Set());
    // Miroir de `currentSlide` en ref — évite de dépendre de l'état React pour
    // le guard du listener statusChange (qui capture l'état de son render).
    const currentSlideRef = useRef<Slide | null>(null);

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

    function setDisplayedSlide(slide: Slide | null) {
        currentSlideRef.current = slide;
        setCurrentSlide(slide);
    }

    // Lit playlist + indexes et matérialise la liste des items prêts à jouer :
    // - vidéos avec entrée d'index `ready`
    // - slides dont tous les assets référencés sont `ready`
    async function pickPlayable(): Promise<{ list: PlayableItem[]; assetIdx: AssetIndex }> {
        const [items, vIndex, aIndex] = await Promise.all([
            getStoredPlaylist(),
            getVideoIndex(),
            getAssetIndex(),
        ]);
        const out: PlayableItem[] = [];
        for (const it of items) {
            if (it.itemType === 'video' && it.video) {
                const entry = vIndex[it.video.id];
                if (entry?.status === 'ready') {
                    out.push({ kind: 'video', item: it, videoId: it.video.id, uri: entry.uri });
                }
            } else if (it.itemType === 'slide' && it.slide) {
                if (slideAssetsReady(it.slide, aIndex)) {
                    out.push({ kind: 'slide', item: it, slide: it.slide });
                }
            }
        }
        return { list: out, assetIdx: aIndex };
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
            logRef.current('video.notfound', { uri }, { scope: 'video', scopeId: videoId });
        }
    }

    function logItemStart(item: ResolvedPlaylistItem) {
        if (item.itemType === 'video' && item.video) {
            logRef.current('video.run', {}, { scope: 'video', scopeId: item.video.id });
        } else if (item.itemType === 'slide' && item.slide) {
            logRef.current('slide.run', {}, { scope: 'slide', scopeId: item.slide.id });
        }
    }

    function clearSlideTimer() {
        if (slideTimeoutRef.current) {
            clearTimeout(slideTimeoutRef.current);
            slideTimeoutRef.current = null;
        }
    }

    // Vérifie le fichier au moment de la lecture. Une entrée `ready` peut
    // pointer sur un fichier disparu (nettoyage OS, purge externe…) — on
    // détecte ici, on marque `notfound` + log, et l'appelant passera au suivant.
    async function verifyAndPlayVideo(entry: PlayableVideo): Promise<boolean> {
        const info = await FileSystem.getInfoAsync(entry.uri);
        if (!info.exists || info.isDirectory || info.size === 0) {
            await markNotFound(entry.videoId, entry.uri);
            return false;
        }
        stopDefaultRecheck();
        clearSlideTimer();
        setDisplayedSlide(null);
        isPlayingDefaultRef.current = false;
        player.loop = false;
        try {
            await player.replaceAsync(entry.uri);
        } catch {
            return false;
        }
        if (!pausedRef.current) player.play();
        lastPlayedRef.current = { kind: 'video', id: entry.videoId };
        logItemStart(entry.item);
        return true;
    }

    // Affiche une slide fullscreen, pause la vidéo (économie CPU) et arme le timer
    // sur `slide.duration` secondes. Pas de vérification fichier — les assets sont
    // déjà validés par pickPlayable.
    function playSlide(entry: PlayableSlide, list: PlayableItem[]): boolean {
        stopDefaultRecheck();
        clearSlideTimer();
        isPlayingDefaultRef.current = false;
        // On stoppe la lecture vidéo pour ne pas cramer du CPU/batterie derrière la slide.
        player.pause();
        setDisplayedSlide(entry.slide);
        lastPlayedRef.current = { kind: 'slide', id: entry.slide.id };
        logItemStart(entry.item);
        const durationMs = entry.slide.duration * 1000;
        slideTimeoutRef.current = setTimeout(() => {
            slideTimeoutRef.current = null;
            if (pausedRef.current) return;
            void advanceFrom(list, keyOf(entry), 1);
        }, durationMs);
        return true;
    }

    // Joue la vidéo par défaut en boucle et arme un re-check périodique pour
    // sortir dès qu'un item de playlist devient jouable.
    async function playDefault() {
        clearSlideTimer();
        setDisplayedSlide(null);
        isPlayingDefaultRef.current = true;
        lastPlayedRef.current = null;
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
        const { list, assetIdx } = await pickPlayable();
        if (list.length === 0) return;
        setAssetIndex(assetIdx);
        await playFrom(list, 0);
    }

    // Tente de jouer à partir de `idx`, en avançant sur les items KO
    // (vidéo `notfound`). Si aucun ne peut être joué → repli sur la vidéo par défaut.
    async function playFrom(playable: PlayableItem[], idx: number): Promise<void> {
        if (playable.length === 0) {
            await playDefault();
            return;
        }
        const len = playable.length;
        for (let i = 0; i < len; i++) {
            const j = ((idx + i) % len + len) % len;
            const entry = playable[j];
            const ok = entry.kind === 'video'
                ? await verifyAndPlayVideo(entry)
                : playSlide(entry, playable);
            if (ok) return;
        }
        await playDefault();
    }

    // Avance depuis un `list` déjà connu, à partir d'une clé de curseur — utile pour
    // le timer d'une slide qui capture la liste au moment où elle démarre.
    async function advanceFrom(playable: PlayableItem[], cursor: PlayedKey | null, direction: 1 | -1): Promise<void> {
        const currentIdx = cursor ? playable.findIndex(p => sameKey(keyOf(p), cursor)) : -1;
        // Si le curseur n'est plus dans la liste on repart au début — plus lisible
        // qu'un modulo sur une position obsolète.
        const nextIdx = currentIdx < 0 ? 0 : currentIdx + direction;
        await playFrom(playable, nextIdx);
    }

    async function advance(direction: 1 | -1 = 1) {
        const { list, assetIdx } = await pickPlayable();
        setAssetIndex(assetIdx);
        if (list.length === 0) {
            await playDefault();
            return;
        }
        await advanceFrom(list, lastPlayedRef.current, direction);
    }

    // Bootstrap : au focus initial, on lance la lecture. Le focusEffect gère
    // aussi le retour depuis le menu, où la sync peut avoir enrichi les indexes.
    useFocusEffect(useCallback(() => {
        void (async () => {
            const { list, assetIdx } = await pickPlayable();
            setAssetIndex(assetIdx);
            if (list.length === 0) {
                await playDefault();
            } else {
                const cursor = lastPlayedRef.current;
                const startIdx = cursor
                    ? Math.max(0, list.findIndex(p => sameKey(keyOf(p), cursor)))
                    : 0;
                await playFrom(list, startIdx);
            }
        })();
        return () => {
            stopDefaultRecheck();
            clearSlideTimer();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []));

    // Fin de vidéo (playlist uniquement — la vidéo par défaut est en loop=true).
    // Skip si on est sur une slide : la vidéo peut passer `idle` parce qu'on l'a
    // pausée juste avant d'afficher la slide.
    useEffect(() => {
        const sub = player.addListener('statusChange', ({ status }) => {
            if (status !== 'idle') return;
            if (pausedRef.current) return;
            if (isPlayingDefaultRef.current) return;
            if (currentSlideRef.current !== null) return;
            void advance(1);
        });
        return () => sub.remove();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player]);

    useEffect(() => () => {
        stopDefaultRecheck();
        clearSlideTimer();
    }, []);

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
            pausedRef.current = false;
            setPaused(false);
            // Sur reprise depuis une slide : ré-armer le timer avec la durée pleine
            // (approximation acceptable — précision seconde n'a pas d'enjeu ici).
            const slide = currentSlideRef.current;
            if (slide) {
                clearSlideTimer();
                const durationMs = slide.duration * 1000;
                const capturedKey = lastPlayedRef.current;
                slideTimeoutRef.current = setTimeout(() => {
                    slideTimeoutRef.current = null;
                    void (async () => {
                        const { list, assetIdx } = await pickPlayable();
                        setAssetIndex(assetIdx);
                        await advanceFrom(list, capturedKey, 1);
                    })();
                }, durationMs);
            } else {
                player.play();
            }
        } else {
            pausedRef.current = true;
            setPaused(true);
            clearSlideTimer();
            player.pause();
        }
    }

    // Résout un asset id vers l'URI locale via l'index snapshot chargé par pickPlayable.
    const resolveAsset = useCallback((id: number): string | undefined => {
        const entry = assetIndex[id];
        return entry?.status === 'ready' ? entry.uri : undefined;
    }, [assetIndex]);

    return (
        <View style={styles.container}>
            <VideoView
                style={styles.videoFullscreen}
                player={player}
                nativeControls={false}
            />
            {currentSlide && (
                <View style={styles.slideFullscreen}>
                    <SlideView slide={currentSlide} resolveAsset={resolveAsset} />
                </View>
            )}
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
    // Slide au-dessus du VideoView (le player n'est pas détruit — juste caché).
    slideFullscreen: {
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
