import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useTVEventHandler } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, apiStatus, dissociateDisplay } from '../../api/endpoint';
import { getVideoIndex, getLastSyncAt } from '../../shared/storage';
import { runFullSync } from '../../shared/sync-manager';
import type { DownloadProgress, SyncReport } from '../../shared/video-downloader';
import { createLogger, formatBytes } from '../../shared/logger';
import MenuItem from './components/MenuItem';
import AppBackground from '../../components/AppBackground';

export default function MenuScreen() {
    const navigation = useNavigation();
    const { logout, apiKey } = useAuth();
    const [apiResult, setApiResult] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);
    const [localCount, setLocalCount] = useState<number | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
    const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

    const focusedAction = useRef<(() => void) | null>(null);

    useEffect(() => {
        getVideoIndex().then(idx => setLocalCount(Object.keys(idx).length));
        getLastSyncAt().then(setLastSyncAt);
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
            setApiResult(`API OK: ${res.message}`);
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
        const log = createLogger(apiKey);
        try {
            const report: SyncReport | null = await runFullSync(apiKey, log, (p) => setDownloadProgress({ ...p }));
            if (report === null) {
                setSyncResult('⚠ Sync déjà en cours');
            } else {
                const idx = await getVideoIndex();
                setLocalCount(Object.keys(idx).length);
                setSyncResult(formatSyncReport(report));
            }
            setLastSyncAt(await getLastSyncAt());
        } catch (e: any) {
            log('sync.error', { message: e?.message });
            setSyncResult(`Erreur : ${e.message}`);
        } finally {
            setSyncing(false);
            setDownloadProgress(null);
        }
    }

    function isSyncFailure(msg: string): boolean {
        return msg.startsWith('Erreur') || msg.startsWith('⚠');
    }

    function formatLastSyncAt(ts: number | null): string {
        if (ts === null) return 'Dernière synchro : jamais';
        const d = new Date(ts);
        const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return `Dernière synchro : ${date} à ${time}`;
    }

    function formatSyncReport(r: SyncReport): string {
        const parts: string[] = [];
        if (r.aborted) parts.push(`⚠ interrompu (${r.abortReason ?? 'raison inconnue'})`);
        parts.push(`${r.succeeded} OK`);
        if (r.failed > 0) parts.push(`${r.failed} échec${r.failed > 1 ? 's' : ''}`);
        if (r.skipped > 0) parts.push(`${r.skipped} non tenté${r.skipped > 1 ? 's' : ''}`);
        parts.push(`↓ ${formatBytes(r.totalBytesDownloaded)}`);
        parts.push(`disque libre : ${formatBytes(r.freeBytesAfter)}`);
        return parts.join(' • ');
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
        <AppBackground style={styles.container}>
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
            {syncing && !downloadProgress && <ActivityIndicator color="#0f3460" style={styles.loader} />}
            {syncing && downloadProgress && (
                <Text style={styles.progress}>
                    Téléchargé {downloadProgress.downloaded}/{downloadProgress.total}
                </Text>
            )}
            {!syncing && syncResult && (
                <Text style={[styles.apiResult, isSyncFailure(syncResult) ? styles.err : styles.ok]}>
                    {syncResult}
                </Text>
            )}
            {localCount !== null && (
                <Text style={styles.localCount}>
                    {localCount} vidéo{localCount !== 1 ? 's' : ''} en local
                </Text>
            )}
            <Text style={styles.lastSync}>{formatLastSyncAt(lastSyncAt)}</Text>

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
        </AppBackground>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 60,
        gap: 28,
    },
    title: {
        fontSize: 42,
        fontWeight: 'bold',
        color: '#0f3460',
        marginBottom: 8,
    },
    sectionTitle: {
        fontSize: 16,
        color: '#5a6b85',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    apiResult: {
        fontSize: 16,
        marginTop: 6,
    },
    ok: { color: '#2e7d32' },
    err: { color: '#c62828' },
    loader: { marginTop: 8 },
    localCount: { fontSize: 14, color: '#5a6b85', marginTop: -12 },
    lastSync: { fontSize: 14, color: '#5a6b85', marginTop: -20 },
    progress: { fontSize: 18, color: '#0f3460', fontVariant: ['tabular-nums'] },
});
