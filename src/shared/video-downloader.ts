import * as FileSystem from 'expo-file-system/legacy';
import { LoopItem } from '../api/types';
import { getVideoIndex, setVideoIndex } from './storage';
import { API_BASE_URL } from '../api/endpoint';

export interface DownloadProgress {
    downloaded: number;
    total: number;
}

function getVideoDir(): string {
    const base = FileSystem.documentDirectory;
    if (!base) throw new Error('FileSystem.documentDirectory non disponible');
    return base + 'videos/';
}

async function ensureVideoDir(): Promise<void> {
    const dir = getVideoDir();
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
}

function localUriForItem(item: LoopItem): string {
    return getVideoDir() + `${item.id}.mp4`;
}

function streamUrlForItem(item: LoopItem): string {
    return `${API_BASE_URL}/videos/${item.id}/stream`;
}

async function isAlreadyDownloaded(localUri: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(localUri);
    return info.exists && info.size > 0;
}

export async function syncVideos(
    items: LoopItem[],
    apiKey: string,
    onProgress: (progress: DownloadProgress) => void,
): Promise<VideoIndex> {
    await ensureVideoDir();

    const videoItems = items.filter(i => i.type === 'video');
    const index = await getVideoIndex();

    // Supprimer les entrées de l'index dont la vidéo n'est plus dans la playlist
    const currentIds = new Set(videoItems.map(i => i.id));
    for (const key of Object.keys(index)) {
        if (!currentIds.has(Number(key))) {
            try {
                await FileSystem.deleteAsync(index[Number(key)], { idempotent: true });
            } catch {}
            delete index[Number(key)];
        }
    }

    // Identifier les vidéos à télécharger
    const toDownload: LoopItem[] = [];
    for (const item of videoItems) {
        const localUri = localUriForItem(item);
        const already = index[item.id] && await isAlreadyDownloaded(localUri);
        if (!already) {
            toDownload.push(item);
        }
    }

    const total = toDownload.length;
    let downloaded = 0;
    onProgress({ downloaded, total });

    for (const item of toDownload) {
        const localUri = localUriForItem(item);
        await FileSystem.downloadAsync(streamUrlForItem(item), localUri, {
            headers: { 'x-api-key': apiKey },
        });
        index[item.id] = localUri;
        downloaded++;
        onProgress({ downloaded, total });
        // Persister l'index au fur et à mesure pour résister aux coupures
        await setVideoIndex(index);
    }

    return index;
}

// Ré-exporter le type pour les consommateurs
export type { VideoIndex } from './storage';
