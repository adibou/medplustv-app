import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Image, StyleSheet, TouchableHighlight, useTVEventHandler, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { setNowPlayingVideo } from '../shared/now-playing';
import { getAppVersionInfo } from '../shared/app-version';
import defaultVideoAsset from '../../assets/video.mp4';
import logoAsset from '../../assets/images/logo.png';

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

// Durée d'affichage de la barre de contrôles après le dernier appui télécommande.
const OVERLAY_AUTO_HIDE_MS = 5_000;

// ── Garde-fous anti-gel ────────────────────────────────────────────────────────
// Le passage à l'élément suivant dépend de signaux (fin de vidéo, timer de slide)
// qui peuvent ne jamais arriver (erreur décodeur, promesse bloquée, exception).
// Le watchdog vérifie périodiquement que la lecture avance et force l'élément
// suivant sinon.
const WATCHDOG_INTERVAL_MS = 10_000;
// Marge tolérée au-delà de la durée attendue de l'élément avant de le déclarer bloqué.
const STALL_GRACE_MS = 30_000;
// Vidéo dont la position de lecture n'avance plus depuis cette durée = bloquée.
const PROGRESS_STALL_MS = 30_000;
// Durée attendue quand la vidéo n'a pas de durée connue.
const UNKNOWN_DURATION_MS = 10 * 60_000;
// Chargement d'une source (replaceAsync) qui ne répond pas → échec.
const LOAD_TIMEOUT_MS = 20_000;
// Un enchaînement en cours depuis plus longtemps est considéré comme bloqué : le
// verrou est libéré pour ne pas geler toute la suite.
const ADVANCE_LOCK_TIMEOUT_MS = 30_000;
// Au-delà de N erreurs de lecture sur une même vidéo, on la marque `notfound` :
// elle sort de la boucle et sera retéléchargée à la prochaine sync.
const MAX_VIDEO_ERRORS = 2;
// Une pause oubliée (appui involontaire sur la télécommande) reprend toute seule.
const AUTO_RESUME_MS = 10 * 60_000;

// Le log `app.start` n'est envoyé qu'une fois par lancement de l'app.
let appStartLogged = false;

// Promesse de chargement de source bornée dans le temps.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
        promise.then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
        );
    });
}

function errorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
    return String(e);
}

// Élément en cours, pour le watchdog : quand il a démarré et combien de temps il
// est censé durer. `seq` s'incrémente à chaque démarrage (dédoublonnage des
// signaux de fin).
type CurrentItem = {
    seq: number;
    kind: 'video' | 'slide';
    id: number;
    uri: string | null;
    at: number;
    expectedMs: number;
};

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
    const [overlayVisible, setOverlayVisible] = useState(false);
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
    // Timer d'auto-hide de la barre de contrôles.
    const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const overlayVisibleRef = useRef(false);
    // ── Garde-fous anti-gel ──
    const currentItemRef = useRef<CurrentItem | null>(null);
    const playSeqRef = useRef(0);
    // Seq de l'élément dont la fin a déjà été traitée (playToEnd et statusChange
    // 'idle' peuvent arriver tous les deux).
    const endHandledSeqRef = useRef(-1);
    // Verrou d'enchaînement : timestamp de début de l'enchaînement en cours (0 = libre).
    const advancingSinceRef = useRef(0);
    const lastProgressRef = useRef<{ seq: number; time: number; at: number } | null>(null);
    const videoErrorCountRef = useRef<Map<number, number>>(new Map());
    const autoResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const log = useMemo(() => createLogger(apiKey), [apiKey]);
    const logRef = useRef(log);
    logRef.current = log;

    useEffect(() => {
        if (appStartLogged || !apiKey) return;
        appStartLogged = true;
        log('app.start', getAppVersionInfo());
    }, [apiKey, log]);

    const player = useVideoPlayer(null, p => {
        p.loop = false;
    });

    // Anti-doublon "select" : sur émulateur (et certaines TV), l'onPress natif du
    // bouton ET le fallback `useTVEventHandler('select')` fire tous les deux → l'action
    // se déclenche 2 fois. On garde un verrou court : la première invocation passe,
    // les suivantes dans la fenêtre sont ignorées. Le fallback reste utile pour les
    // remotes qui ne mappent pas `select` sur `onPress`.
    const actionLockRef = useRef(0);
    function runAction(fn: () => void) {
        const now = Date.now();
        if (now - actionLockRef.current < 300) return;
        actionLockRef.current = now;
        fn();
    }

    function clearOverlayTimer() {
        if (overlayTimeoutRef.current) {
            clearTimeout(overlayTimeoutRef.current);
            overlayTimeoutRef.current = null;
        }
    }

    function scheduleOverlayHide() {
        clearOverlayTimer();
        overlayTimeoutRef.current = setTimeout(() => {
            overlayTimeoutRef.current = null;
            overlayVisibleRef.current = false;
            setOverlayVisible(false);
        }, OVERLAY_AUTO_HIDE_MS);
    }

    function showOverlay() {
        if (!overlayVisibleRef.current) {
            overlayVisibleRef.current = true;
            setOverlayVisible(true);
        }
        scheduleOverlayHide();
    }

    function hideOverlay() {
        clearOverlayTimer();
        overlayVisibleRef.current = false;
        setOverlayVisible(false);
    }

    useTVEventHandler((evt) => {
        if (!evt.eventType) return;
        // Premier appui après auto-hide : on ne fait qu'afficher la barre —
        // aucun bouton n'était focus, donc pas d'action à déclencher.
        if (!overlayVisibleRef.current) {
            showOverlay();
            return;
        }
        // Barre visible + flèche haut : referme la barre.
        if (evt.eventType === 'up') {
            hideOverlay();
            return;
        }
        showOverlay();
        if (evt.eventType === 'select' && focusedAction.current) {
            // focusedAction est déjà wrappé par runAction côté parent : si l'onPress
            // natif a fire juste avant, l'anti-rebond ignorera cet appel.
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

    function logItemStart(item: ResolvedPlaylistItem, uri: string | null = null) {
        const seq = ++playSeqRef.current;
        if (item.itemType === 'video' && item.video) {
            const durationMs = item.video.durationSeconds > 0 ? item.video.durationSeconds * 1000 : UNKNOWN_DURATION_MS;
            currentItemRef.current = { seq, kind: 'video', id: item.video.id, uri, at: Date.now(), expectedMs: durationMs };
            setNowPlayingVideo(item.video.id);
            logRef.current('video.run', {}, { scope: 'video', scopeId: item.video.id });
        } else if (item.itemType === 'slide' && item.slide) {
            currentItemRef.current = { seq, kind: 'slide', id: item.slide.id, uri: null, at: Date.now(), expectedMs: item.slide.duration * 1000 };
            setNowPlayingVideo(null);
            logRef.current('slide.run', {}, { scope: 'slide', scopeId: item.slide.id });
        }
    }

    function scopeOfCurrent() {
        const cur = currentItemRef.current;
        return cur ? { scope: cur.kind, scopeId: cur.id } : undefined;
    }

    // Compte les erreurs de lecture d'une vidéo ; au-delà du seuil elle passe
    // `notfound` (sortie de la boucle + retéléchargement à la prochaine sync).
    async function registerVideoError(videoId: number, uri: string) {
        const count = (videoErrorCountRef.current.get(videoId) ?? 0) + 1;
        videoErrorCountRef.current.set(videoId, count);
        if (count >= MAX_VIDEO_ERRORS) {
            videoErrorCountRef.current.delete(videoId);
            await markNotFound(videoId, uri);
        }
    }

    // Exécute un enchaînement sous verrou, sans jamais laisser une exception tuer
    // la chaîne de lecture : en cas d'erreur on log et on se replie sur la vidéo
    // par défaut (dont le re-check ramènera la playlist). `force` ignore un verrou
    // en cours (utilisé par le watchdog quand l'enchaînement précédent est bloqué).
    async function runGuarded(label: string, fn: () => Promise<void>, force = false): Promise<void> {
        const now = Date.now();
        const lockedSince = advancingSinceRef.current;
        if (!force && lockedSince !== 0 && now - lockedSince < ADVANCE_LOCK_TIMEOUT_MS) return;
        advancingSinceRef.current = now;
        try {
            await fn();
        } catch (e) {
            logRef.current('player.advance.error', { stage: label, message: errorMessage(e) }, scopeOfCurrent());
            try {
                await playDefault();
            } catch (e2) {
                logRef.current('player.advance.error', { stage: 'fallback-default', message: errorMessage(e2) });
            }
        } finally {
            // Ne libère que son propre verrou (un `force` a pu en poser un plus récent).
            if (advancingSinceRef.current === now) advancingSinceRef.current = 0;
        }
    }

    function safeAdvance(direction: 1 | -1 = 1, force = false): Promise<void> {
        return runGuarded('advance', () => advance(direction), force);
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
        isPlayingDefaultRef.current = false;
        player.loop = false;
        // On NE cache PAS la slide (si elle est visible) avant le replaceAsync :
        // sinon on verrait l'ancienne vidéo (encore chargée dans le player, juste
        // pausée pendant la slide) le temps que la nouvelle source charge. La slide
        // sert de cover pendant tout le swap.
        try {
            await withTimeout(player.replaceAsync(entry.uri), LOAD_TIMEOUT_MS, 'replaceAsync');
        } catch (e) {
            logRef.current('video.error', { stage: 'load', message: errorMessage(e) }, { scope: 'video', scopeId: entry.videoId });
            await registerVideoError(entry.videoId, entry.uri);
            return false;
        }
        setDisplayedSlide(null);
        if (!pausedRef.current) player.play();
        lastPlayedRef.current = { kind: 'video', id: entry.videoId };
        logItemStart(entry.item, entry.uri);
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
            void runGuarded('slide-end', () => advanceFrom(list, keyOf(entry), 1));
        }, durationMs);
        return true;
    }

    // Joue la vidéo par défaut en boucle et arme un re-check périodique pour
    // sortir dès qu'un item de playlist devient jouable.
    async function playDefault() {
        clearSlideTimer();
        isPlayingDefaultRef.current = true;
        lastPlayedRef.current = null;
        currentItemRef.current = null;
        setNowPlayingVideo(null);
        player.loop = true;
        // Re-check armé AVANT le chargement : même si la vidéo par défaut échoue à
        // charger, on retentera la playlist au prochain tick.
        startDefaultRecheck();
        // Slide gardée visible jusqu'à ce que la vidéo par défaut soit chargée,
        // même logique que verifyAndPlayVideo : évite le flash de l'ancienne source.
        await withTimeout(player.replaceAsync(defaultVideoAsset), LOAD_TIMEOUT_MS, 'replaceAsync(default)');
        setDisplayedSlide(null);
        if (!pausedRef.current) player.play();
    }

    function startDefaultRecheck() {
        if (defaultRecheckRef.current) return;
        defaultRecheckRef.current = setInterval(() => {
            void runGuarded('leave-default', tryLeaveDefault);
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
        void runGuarded('bootstrap', async () => {
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
        }, true);
        return () => {
            stopDefaultRecheck();
            clearSlideTimer();
            clearOverlayTimer();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []));

    // Fin de vidéo (playlist uniquement — la vidéo par défaut est en loop=true).
    // Skip si on est sur une slide : la vidéo peut passer `idle` parce qu'on l'a
    // pausée juste avant d'afficher la slide.
    // `playToEnd` est le signal principal ; `idle` reste en secours (sur Android,
    // la fin de lecture ExoPlayer est aussi remontée en `idle`). Dédoublonné par
    // `seq` pour ne pas sauter un élément quand les deux arrivent.
    function handleVideoEnded() {
        if (pausedRef.current) return;
        if (isPlayingDefaultRef.current) return;
        if (currentSlideRef.current !== null) return;
        const cur = currentItemRef.current;
        if (!cur || cur.kind !== 'video') return;
        if (endHandledSeqRef.current === cur.seq) return;
        endHandledSeqRef.current = cur.seq;
        void safeAdvance(1);
    }

    // Erreur du player (décodeur, fichier illisible…) : sans traitement le player
    // reste en `error` sans jamais émettre de fin → écran figé. On log, on compte
    // et on passe à la suite.
    function handlePlayerError(message: string) {
        if (isPlayingDefaultRef.current) {
            logRef.current('video.error', { stage: 'playback-default', message });
            return;
        }
        if (currentSlideRef.current !== null) return;
        // Enchaînement en cours : l'erreur concerne la source en train d'être
        // chargée, déjà gérée (et attribuée) par verifyAndPlayVideo.
        if (advancingSinceRef.current !== 0) return;
        const cur = currentItemRef.current;
        if (!cur || cur.kind !== 'video') return;
        if (endHandledSeqRef.current === cur.seq) return;
        endHandledSeqRef.current = cur.seq;
        logRef.current('video.error', { stage: 'playback', message }, { scope: 'video', scopeId: cur.id });
        void (async () => {
            if (cur.uri) await registerVideoError(cur.id, cur.uri).catch(() => undefined);
            await safeAdvance(1);
        })();
    }

    useEffect(() => {
        const statusSub = player.addListener('statusChange', ({ status, error }) => {
            if (status === 'error') {
                handlePlayerError(error?.message ?? 'unknown');
                return;
            }
            if (status === 'idle') handleVideoEnded();
        });
        const endSub = player.addListener('playToEnd', () => handleVideoEnded());
        return () => {
            statusSub.remove();
            endSub.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player]);

    // Watchdog : si l'élément courant dépasse sa durée prévue (+ marge), ou si la
    // position d'une vidéo n'avance plus, on log `player.stall` et on force la
    // suite — en passant outre un éventuel enchaînement bloqué.
    useEffect(() => {
        const interval = setInterval(() => {
            if (pausedRef.current || isPlayingDefaultRef.current) return;
            const cur = currentItemRef.current;
            if (!cur) return;
            const now = Date.now();
            const elapsed = now - cur.at;
            let reason: string | null = null;
            if (elapsed > cur.expectedMs + STALL_GRACE_MS) {
                reason = 'overdue';
            } else if (cur.kind === 'video' && currentSlideRef.current === null) {
                const time = player.currentTime;
                const last = lastProgressRef.current;
                if (!last || last.seq !== cur.seq || Math.abs(time - last.time) > 0.1) {
                    lastProgressRef.current = { seq: cur.seq, time, at: now };
                } else if (now - last.at > PROGRESS_STALL_MS) {
                    reason = 'no-progress';
                }
            }
            if (!reason) return;
            logRef.current('player.stall', {
                reason,
                itemKind: cur.kind,
                itemId: cur.id,
                elapsedMs: elapsed,
                expectedMs: cur.expectedMs,
                playerStatus: player.status,
                currentTime: player.currentTime,
            }, { scope: cur.kind, scopeId: cur.id });
            // Évite de re-déclencher sur le même élément avant que la suite démarre.
            cur.at = now;
            lastProgressRef.current = null;
            endHandledSeqRef.current = cur.seq;
            clearSlideTimer();
            void safeAdvance(1, true);
        }, WATCHDOG_INTERVAL_MS);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player]);

    useEffect(() => () => {
        stopDefaultRecheck();
        clearSlideTimer();
        clearOverlayTimer();
        clearAutoResume();
        setNowPlayingVideo(null);
    }, []);

    // Retour de background : expo-video pause nativement le player quand l'app
    // passe en background sans mettre à jour notre state React → au réveil on
    // relance manuellement pour éviter le mismatch (bouton "play" affiché alors
    // que rien ne joue). Pour les slides on ré-arme le timer d'affichage avec
    // une durée pleine — le setTimeout JS peut être gelé pendant le background.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            if (pausedRef.current) return;
            // Le temps passé en background ne compte pas dans la fenêtre du watchdog.
            restartWatchdogWindow();
            const slide = currentSlideRef.current;
            if (slide) {
                clearSlideTimer();
                const capturedKey = lastPlayedRef.current;
                const durationMs = slide.duration * 1000;
                slideTimeoutRef.current = setTimeout(() => {
                    slideTimeoutRef.current = null;
                    void runGuarded('slide-end', async () => {
                        const { list, assetIdx } = await pickPlayable();
                        setAssetIndex(assetIdx);
                        await advanceFrom(list, capturedKey, 1);
                    });
                }, durationMs);
                return;
            }
            player.play();
        });
        return () => sub.remove();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player]);

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
        void safeAdvance(-1);
    }

    function handleNext() {
        void safeAdvance(1);
    }

    function restartWatchdogWindow() {
        const cur = currentItemRef.current;
        if (cur) cur.at = Date.now();
        lastProgressRef.current = null;
    }

    function clearAutoResume() {
        if (autoResumeTimeoutRef.current) {
            clearTimeout(autoResumeTimeoutRef.current);
            autoResumeTimeoutRef.current = null;
        }
    }

    function handleMute() {
        const next = !mutedRef.current;
        mutedRef.current = next;
        setMuted(next);
        void storeMuted(next);
    }

    function handlePlayPause() {
        if (pausedRef.current) resumePlayback(false);
        else pausePlayback();
    }

    function pausePlayback() {
        pausedRef.current = true;
        setPaused(true);
        clearSlideTimer();
        player.pause();
        logRef.current('player.pause', {}, scopeOfCurrent());
        // Filet de sécurité : une pause oubliée (appui involontaire) ne doit pas
        // laisser l'écran figé indéfiniment en salle d'attente.
        clearAutoResume();
        autoResumeTimeoutRef.current = setTimeout(() => {
            autoResumeTimeoutRef.current = null;
            if (pausedRef.current) resumePlayback(true);
        }, AUTO_RESUME_MS);
    }

    function resumePlayback(auto: boolean) {
        clearAutoResume();
        logRef.current('player.resume', { auto }, scopeOfCurrent());
        restartWatchdogWindow();
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
                void runGuarded('slide-end', async () => {
                    const { list, assetIdx } = await pickPlayable();
                    setAssetIndex(assetIdx);
                    await advanceFrom(list, capturedKey, 1);
                });
            }, durationMs);
        } else {
            player.play();
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
            {/* Capteur focus invisible : sans élément focusable à l'écran, la
                TV ne route pas les events DPAD vers JS et `useTVEventHandler`
                ne fire pas. Ce catcher garde le focus quand la barre est cachée
                pour que le premier appui télécommande soit toujours capté. */}
            {/* Indicateur persistant : une image figée par une pause doit se voir. */}
            {paused && !overlayVisible && (
                <View style={styles.pausedBadge} pointerEvents="none">
                    <Ionicons name="pause" size={28} color="#fff" />
                </View>
            )}
            {!overlayVisible && (
                <TouchableHighlight
                    style={styles.focusCatcher}
                    hasTVPreferredFocus
                    onPress={showOverlay}
                    underlayColor="transparent"
                >
                    <View style={styles.focusCatcher} />
                </TouchableHighlight>
            )}
            {overlayVisible && (
                <View style={styles.overlay}>
                    <LinearGradient
                        colors={['#f2f4f8', '#dbe6ff']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.overlayRow}>
                        <Image source={logoAsset} style={styles.logo} resizeMode="contain" />
                        <View style={styles.controlsRow}>
                            <TVButton icon="play-skip-back" onPress={() => runAction(handlePrev)} onFocusChange={handleFocusChange} />
                            <TVButton
                                icon={paused ? 'play' : 'pause'}
                                onPress={() => runAction(handlePlayPause)}
                                onFocusChange={handleFocusChange}
                            />
                            {/* Focus initial sur « suivant » et non sur pause : un double
                                appui involontaire sur OK ne doit pas figer l'écran. */}
                            <TVButton
                                icon="play-skip-forward"
                                onPress={() => runAction(handleNext)}
                                onFocusChange={handleFocusChange}
                                hasTVPreferredFocus
                            />
                            <TVButton
                                icon={muted ? 'volume-mute' : 'volume-high'}
                                onPress={() => runAction(handleMute)}
                                onFocusChange={handleFocusChange}
                            />
                            <TVButton
                                icon="ellipsis-horizontal"
                                onPress={() => runAction(() => navigation.navigate('Menu'))}
                                onFocusChange={handleFocusChange}
                            />
                        </View>
                    </View>
                    <LinearGradient
                        colors={['#0f3460', '#4CAF50']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.overlayBottomBar}
                    />
                </View>
            )}
        </View>
    );
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TVButton({
    icon,
    onPress,
    onFocusChange,
    hasTVPreferredFocus = false,
}: {
    icon: IoniconName;
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
            <Ionicons name={icon} size={28} color={focused ? '#fff' : '#0f3460'} />
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
        paddingHorizontal: 32,
        paddingTop: 14,
        paddingBottom: 22,
        overflow: 'hidden',
    },
    overlayRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logo: {
        width: 56,
        height: 56,
        marginRight: 24,
    },
    overlayBottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 8,
    },
    pausedBadge: {
        position: 'absolute',
        top: 32,
        right: 32,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(15, 52, 96, 0.85)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    focusCatcher: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    controlsRow: {
        flex: 1,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    button: {
        backgroundColor: 'transparent',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'transparent',
        minWidth: 56,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonFocused: {
        backgroundColor: '#0f3460',
        borderColor: '#e94560',
        transform: [{ scale: 1.08 }],
    },
});
