import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useTVEventHandler } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, apiStatus, dissociateDisplay, getDisplayLoop } from '../../api/endpoint';
import { storeLoopItems, getVideoIndex } from '../../shared/storage';
import { syncVideos } from '../../shared/video-downloader';
import type { DownloadProgress } from '../../shared/video-downloader';
import MenuItem from './components/MenuItem';

export default function MenuScreen() {
    const navigation = useNavigation();
    const { logout, apiKey } = useAuth();
    const [apiResult, setApiResult] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);
    const [localCount, setLocalCount] = useState<number | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

    const focusedAction = useRef<(() => void) | null>(null);

    useEffect(() => {
        getVideoIndex().then(idx => setLocalCount(Object.keys(idx).length));
    }, []);

    // useTVEventHandler((evt) => {
    //     if (evt.eventType === 'select' && focusedAction.current) {
    //         focusedAction.current();
    //     }
    // });

    function handleFocusChange(_focused: boolean, action: () => void) {
        focusedAction.current = _focused ? action : null;
    }

    async function handleTestApi() {
        setTesting(true);
        setApiResult(null);
        try {
            const res = await apiStatus();
            setApiResult(`API OK: ${JSON.stringify(res)}`);
        } catch (e: any) {
            setApiResult(`Erreur: ${e.message}`);
        } finally {
            setTesting(false);
        }
    }

    async function handleSync() {
        if (!apiKey) return;
        setSyncing(true);
        setSyncResult(null);
        setDownloadProgress(null);
        try {
            const items = await getDisplayLoop(apiKey);
            await storeLoopItems(items);
            const index = await syncVideos(items, apiKey, (p) => setDownloadProgress({ ...p }));
            const count = Object.keys(index).length;
            setLocalCount(count);
            setSyncResult(`${count} vidéo${count !== 1 ? 's' : ''} prête${count !== 1 ? 's' : ''}`);
        } catch (e: any) {
            setSyncResult(`Erreur : ${e.message}`);
        } finally {
            setSyncing(false);
            setDownloadProgress(null);
        }
    }

    async function handleDissocier() {
        if (apiKey) {
            try {
                await dissociateDisplay(apiKey);
            } catch {}
        }
        await logout();
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Menu</Text>

            <Text style={styles.sectionTitle}>API {API_BASE_URL}</Text>
            <MenuItem
                label={testing ? 'Test en cours...' : 'Tester la connexion'}
                onPress={handleTestApi}
                onFocusChange={handleFocusChange}
                hasTVPreferredFocus
                disabled={testing}
            />
            {apiResult && (
                <Text style={[styles.apiResult, apiResult.startsWith('API OK') ? styles.ok : styles.err]}>
                    {apiResult}
                </Text>
            )}

            <MenuItem
                label={syncing ? 'Synchronisation...' : 'Synchroniser les vidéos'}
                onPress={handleSync}
                onFocusChange={handleFocusChange}
                disabled={syncing}
            />
            {syncing && !downloadProgress && <ActivityIndicator color="#fff" style={styles.loader} />}
            {syncing && downloadProgress && (
                <Text style={styles.progress}>
                    Téléchargé {downloadProgress.downloaded}/{downloadProgress.total}
                </Text>
            )}
            {!syncing && syncResult && (
                <Text style={[styles.apiResult, syncResult.startsWith('Erreur') ? styles.err : styles.ok]}>
                    {syncResult}
                </Text>
            )}
            {localCount !== null && (
                <Text style={styles.localCount}>
                    {localCount} vidéo{localCount !== 1 ? 's' : ''} en local
                </Text>
            )}

            <MenuItem
                label="Dissocier cet écran"
                onPress={handleDissocier}
                onFocusChange={handleFocusChange}
                danger
            />

            <MenuItem
                label="Retour"
                onPress={() => navigation.goBack()}
                onFocusChange={handleFocusChange}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
        padding: 60,
        gap: 28,
    },
    title: {
        fontSize: 42,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    sectionTitle: {
        fontSize: 16,
        color: '#9a9a9a',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    apiResult: {
        fontSize: 16,
        marginTop: 6,
    },
    ok: { color: '#8fe08f' },
    err: { color: '#ffb0b0' },
    loader: { marginTop: 8 },
    localCount: { fontSize: 14, color: '#9a9a9a', marginTop: -12 },
    progress: { fontSize: 18, color: '#fff', fontVariant: ['tabular-nums'] },
});
