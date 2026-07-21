import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, apiStatus, dissociateDisplay } from '../../api/endpoint';
import {
    getVideoIndex,
    getAssetIndex,
    getStoredPlaylist,
    getLastSyncAt,
} from '../../shared/storage';
import {
    runFullSync,
    subscribeSyncPhase,
    getCurrentSyncPhase,
    type SyncPhase,
} from '../../shared/sync-manager';
import { createLogger, formatBytes } from '../../shared/logger';
import { checkAndApplyUpdate } from '../../shared/updates';
import MenuItem from './components/MenuItem';
import AppBackground from '../../components/AppBackground';

type ServerStatus = 'checking' | 'ok' | 'error';

interface LocalStats {
    videoCount: number;
    slideCount: number;
    totalBytes: number;
    freeBytes: number;
}

export default function MenuScreen() {
    const navigation = useNavigation();
    const { logout, apiKey } = useAuth();

    const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
    const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
    const [stats, setStats] = useState<LocalStats | null>(null);
    const [installDate, setInstallDate] = useState<Date | null>(null);
    const [syncPhase, setSyncPhase] = useState<SyncPhase | null>(getCurrentSyncPhase());
    const [confirmingDissociate, setConfirmingDissociate] = useState(false);

    const focusedAction = useRef<(() => void) | null>(null);

    // Refresh stats + sync date depuis le storage. Rappelé après une sync.
    async function refreshLocalData(): Promise<void> {
        const [videoIndex, assetIndex, playlist, ts, freeBytes] = await Promise.all([
            getVideoIndex(),
            getAssetIndex(),
            getStoredPlaylist(),
            getLastSyncAt(),
            FileSystem.getFreeDiskStorageAsync().catch(() => 0),
        ]);
        let totalBytes = 0;
        for (const entry of Object.values(videoIndex)) {
            if (entry.status !== 'ready') continue;
            try {
                const info = await FileSystem.getInfoAsync(entry.uri);
                if (info.exists && !info.isDirectory) totalBytes += info.size;
            } catch { /* fichier disparu, on ignore */ }
        }
        for (const entry of Object.values(assetIndex)) {
            if (entry.status !== 'ready') continue;
            try {
                const info = await FileSystem.getInfoAsync(entry.uri);
                if (info.exists && !info.isDirectory) totalBytes += info.size;
            } catch { /* idem */ }
        }
        const videoCount = Object.values(videoIndex).filter(e => e.status === 'ready').length;
        const uniqueSlideIds = new Set<number>();
        for (const it of playlist) {
            if (it.itemType === 'slide') uniqueSlideIds.add(it.itemId);
        }
        setStats({ videoCount, slideCount: uniqueSlideIds.size, totalBytes, freeBytes });
        setLastSyncAt(ts);
    }

    useEffect(() => {
        void refreshLocalData();
        Application.getInstallationTimeAsync().then(setInstallDate).catch(() => {});

        // Test connexion serveur — 10s max, sinon "erreur". On abort le fetch pour
        // ne pas laisser trainer une requête zombie si le réseau est très lent.
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 10_000);
        apiStatus(ac.signal)
            .then(() => setServerStatus('ok'))
            .catch(() => setServerStatus('error'))
            .finally(() => clearTimeout(timer));

        // Check EAS Update ici (fenêtre safe : pas de vidéo en cours). Le
        // signal évite un reloadAsync si l'utilisateur repart avant la fin
        // du fetch.
        const updateCtrl = new AbortController();
        void checkAndApplyUpdate({ signal: updateCtrl.signal });

        const unsub = subscribeSyncPhase(setSyncPhase);
        return () => {
            clearTimeout(timer);
            ac.abort();
            updateCtrl.abort();
            unsub();
        };
    }, []);

    function handleFocusChange(_focused: boolean, action: () => void) {
        focusedAction.current = _focused ? action : null;
    }

    async function handleSync() {
        if (!apiKey) return;
        const log = createLogger(apiKey);
        try {
            await runFullSync(apiKey, log);
        } catch (e: any) {
            log('sync.error', { message: e?.message });
        } finally {
            await refreshLocalData();
        }
    }

    async function handleConfirmDissociate() {
        if (apiKey) {
            try {
                await dissociateDisplay(apiKey);
            } catch { /* on veut logout même si l'API a échoué */ }
        }
        await logout();
    }

    return (
        <AppBackground style={styles.container}>
            <View style={styles.topRow}>
                <Text style={styles.title}>Menu</Text>
                <Image
                    source={require('../../../assets/images/logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </View>

            <View style={styles.infoBlock}>
                <Text style={styles.versionLine}>
                    MedPlusTV {Application.nativeApplicationVersion ?? '?'}
                    {' '}
                    {installDate ? `(${formatShortDate(installDate)})` : ''}
                </Text>
                <Text style={styles.infoLine}>{formatLastSyncLine(lastSyncAt)}</Text>
                <Text style={styles.infoLine}>{formatCountsLine(stats)}</Text>
                <Text style={styles.infoLine}>{formatStorageLine(stats)}</Text>
                <Text style={styles.serverLine}>{formatServerStatus(serverStatus)}</Text>
            </View>

            <View style={styles.buttons}>
                <MenuItem
                    label="Retour"
                    onPress={() => navigation.goBack()}
                    onFocusChange={handleFocusChange}
                    hasTVPreferredFocus
                />

                {syncPhase ? (
                    <View style={styles.syncStatus}>
                        <Text style={styles.syncPhase}>{formatPhaseLabel(syncPhase)}</Text>
                        <Text style={styles.syncHint}>
                            Synchronisation en cours, vous pouvez retourner aux vidéos, la
                            synchronisation continuera en arrière-plan.
                        </Text>
                    </View>
                ) : (
                    <MenuItem
                        label="Synchroniser les vidéos maintenant"
                        onPress={handleSync}
                        onFocusChange={handleFocusChange}
                    />
                )}

                {confirmingDissociate ? (
                    <View style={styles.confirmRow}>
                        <MenuItem
                            label="Confirmer la dissociation"
                            onPress={handleConfirmDissociate}
                            onFocusChange={handleFocusChange}
                            danger
                        />
                        <MenuItem
                            label="Annuler"
                            onPress={() => setConfirmingDissociate(false)}
                            onFocusChange={handleFocusChange}
                        />
                    </View>
                ) : (
                    <MenuItem
                        label="Dissocier cet écran"
                        onPress={() => setConfirmingDissociate(true)}
                        onFocusChange={handleFocusChange}
                        danger
                    />
                )}
            </View>
        </AppBackground>
    );
}

function formatShortDate(d: Date): string {
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatLastSyncLine(lastSyncAt: number | null): string {
    if (lastSyncAt === null) return 'Dernière synchronisation : jamais';
    const d = new Date(lastSyncAt);
    const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `Dernière synchronisation le ${date} à ${time}`;
}

function formatCountsLine(stats: LocalStats | null): string {
    if (!stats) return '…';
    const v = stats.videoCount;
    const s = stats.slideCount;
    return `${v} vidéo${v > 1 ? 's' : ''} et ${s} diapositive${s > 1 ? 's' : ''} en local`;
}

function formatStorageLine(stats: LocalStats | null): string {
    if (!stats) return '…';
    return `${formatBytes(stats.totalBytes)} au total — ${formatBytes(stats.freeBytes)} disponibles`;
}

function formatServerStatus(s: ServerStatus): string {
    switch (s) {
        case 'checking': return 'Connexion au serveur…';
        case 'ok':       return 'Serveur : connecté ✓';
        case 'error':    return `Erreur de connexion au serveur (${API_BASE_URL})`;
    }
}

function formatPhaseLabel(phase: SyncPhase): string {
    switch (phase.kind) {
        case 'fetching-playlist':
            return 'Récupération de la playlist…';
        case 'videos':
            return phase.total === 0
                ? 'Vidéos : rien à télécharger'
                : `Synchronisation vidéo ${phase.downloaded}/${phase.total}`;
        case 'slides':
            return phase.total === 0
                ? 'Diapositives : rien à télécharger'
                : `Synchronisation diapositive ${phase.downloaded}/${phase.total}`;
    }
}

const styles = StyleSheet.create({
    container: {
        padding: 60,
        gap: 32,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 42,
        fontWeight: 'bold',
        color: '#0f3460',
    },
    logo: {
        width: 160,
        height: 60,
    },
    infoBlock: {
        gap: 4,
        alignItems: 'flex-start',
    },
    versionLine: {
        fontSize: 14,
        color: '#0f3460',
        fontWeight: '600',
    },
    infoLine: {
        fontSize: 13,
        color: '#5a6b85',
    },
    serverLine: {
        fontSize: 12,
        color: '#5a6b85',
        marginTop: 4,
    },
    buttons: {
        gap: 12,
        alignItems: 'flex-start',
    },
    syncStatus: {
        gap: 4,
        maxWidth: 640,
    },
    syncPhase: {
        fontSize: 14,
        color: '#0f3460',
        fontWeight: '700',
    },
    syncHint: {
        fontSize: 12,
        color: '#5a6b85',
    },
    confirmRow: {
        flexDirection: 'row',
        gap: 12,
    },
});
