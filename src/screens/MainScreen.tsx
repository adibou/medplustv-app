import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableHighlight, useTVEventHandler } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { getStoredLoopItems, getVideoIndex } from '../shared/storage';
import type { LoopItem } from '../api/types';
import type { VideoIndex } from '../shared/storage';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

interface PlayableItem {
    item: LoopItem;
    localUri: string;
}

export default function MainScreen() {
    const navigation = useNavigation<Nav>();
    const focusedAction = useRef<(() => void) | null>(null);

    const [playlist, setPlaylist] = useState<PlayableItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Refs pour les callbacks d'événements (évite les closures périmées)
    const currentIndexRef = useRef(0);
    const playlistRef = useRef<PlayableItem[]>([]);
    const pausedRef = useRef(false);

    useTVEventHandler((evt) => {
        if (evt.eventType === 'select' && focusedAction.current) {
            focusedAction.current();
        }
    });

    function handleFocusChange(focused: boolean, action: () => void) {
        focusedAction.current = focused ? action : null;
    }

    useFocusEffect(useCallback(() => {
        loadPlaylist();
    }, []));

    async function loadPlaylist() {
        const [items, index]: [LoopItem[], VideoIndex] = await Promise.all([
            getStoredLoopItems(),
            getVideoIndex(),
        ]);
        const playable: PlayableItem[] = items
            .filter(i => i.type === 'video' && index[i.id])
            .map(i => ({ item: i, localUri: index[i.id]! }));
        playlistRef.current = playable;
        setPlaylist(playable);
        setLoaded(true);
    }

    const player = useVideoPlayer(null, p => {
        p.loop = false;
    });

    // Démarrer la lecture quand la playlist est prête
    useEffect(() => {
        if (!loaded || !playlist.length) return;
        currentIndexRef.current = 0;
        player.replace(playlist[0].localUri);
        player.play();
    }, [loaded]);

    // Passer à la vidéo suivante en fin de lecture
    useEffect(() => {
        if (!loaded) return;
        const sub = player.addListener('statusChange', ({ status }) => {
            if (status === 'idle' && !pausedRef.current && playlistRef.current.length > 0) {
                const next = (currentIndexRef.current + 1) % playlistRef.current.length;
                currentIndexRef.current = next;
                setCurrentIndex(next);
                player.replace(playlistRef.current[next].localUri);
                player.play();
            }
        });
        return () => sub.remove();
    }, [loaded, player]);

    function goTo(idx: number) {
        const uri = playlistRef.current[idx]?.localUri;
        if (!uri) return;
        currentIndexRef.current = idx;
        setCurrentIndex(idx);
        player.replace(uri);
        if (!pausedRef.current) player.play();
    }

    function handlePrev() {
        if (!playlistRef.current.length) return;
        goTo((currentIndexRef.current - 1 + playlistRef.current.length) % playlistRef.current.length);
    }

    function handleNext() {
        if (!playlistRef.current.length) return;
        goTo((currentIndexRef.current + 1) % playlistRef.current.length);
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

    if (!loaded) {
        return (
            <View style={styles.center}>
                <Text style={styles.message}>Chargement...</Text>
            </View>
        );
    }

    if (playlist.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={styles.message}>
                    Aucune vidéo disponible.{'\n'}
                    Synchronisez les vidéos depuis le menu.
                </Text>
                <TVButton
                    label="☰  Menu"
                    onPress={() => navigation.navigate('Menu')}
                    onFocusChange={handleFocusChange}
                    hasTVPreferredFocus
                />
            </View>
        );
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
    center: {
        flex: 1,
        backgroundColor: '#1a1a2e',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        padding: 60,
    },
    message: {
        fontSize: 32,
        color: '#9a9a9a',
        textAlign: 'center',
        lineHeight: 48,
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
