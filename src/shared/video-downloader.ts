import * as FileSystem from 'expo-file-system/legacy';
import { ResolvedPlaylistItem, Video } from '../api/types';
import { getVideoIndex, setVideoIndex, type VideoIndex } from './storage';
import { videoFileUrl } from '../api/endpoint';
import type { Logger } from './logger';

export interface DownloadProgress {
    downloaded: number;
    total: number;
}

export interface SyncReport {
    succeeded: number;
    failed: number;
    skipped: number;               // items non tentés (abort mi-parcours)
    totalBytesDownloaded: number;
    freeBytesBefore: number;
    freeBytesAfter: number;
    durationMs: number;
    aborted: boolean;
    abortReason?: string;
}

// On garde toujours cette marge libre après une sync — évite qu'un player affamé
// (buffer, décodage) fasse crasher l'OS en OOM disque.
const SAFETY_MARGIN_BYTES = 200 * 1024 * 1024;

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

function localUriForVideoId(videoId: number): string {
    return getVideoDir() + `${videoId}.mp4`;
}

async function isAlreadyDownloaded(localUri: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(localUri);
    return info.exists && !info.isDirectory && info.size > 0;
}

// Extrait la Map { videoId → Video } d'une playlist résolue. Un même item vidéo
// peut apparaître plusieurs fois (multi-position), on ne télécharge qu'une copie.
function extractVideosMap(items: ResolvedPlaylistItem[]): Map<number, Video> {
    const out = new Map<number, Video>();
    for (const it of items) {
        if (it.itemType === 'video' && it.video && !out.has(it.video.id)) {
            out.set(it.video.id, it.video);
        }
    }
    return out;
}

export async function syncVideos(
    items: ResolvedPlaylistItem[],
    apiKey: string,
    log: Logger,
    onProgress: (progress: DownloadProgress) => void,
): Promise<SyncReport> {
    const startedAt = Date.now();
    await ensureVideoDir();

    // ── 1. Pré-flight : qui est là, à purger, à télécharger ─────────────────────
    const uniqueVideos = extractVideosMap(items);
    const index = await getVideoIndex();
    const currentIds = new Set(uniqueVideos.keys());

    const toPurge: number[] = [];
    for (const key of Object.keys(index)) {
        if (!currentIds.has(Number(key))) toPurge.push(Number(key));
    }

    const toDownload: Video[] = [];
    let alreadyLocalCount = 0;
    for (const [id, video] of uniqueVideos) {
        const localUri = localUriForVideoId(id);
        const entry = index[id];
        const already = entry?.status === 'ready' && await isAlreadyDownloaded(localUri);
        if (already) {
            alreadyLocalCount++;
        } else {
            toDownload.push(video);
            // On matérialise l'entrée en `not_loaded` avant la boucle download
            // pour que MainScreen puisse déjà voir la vidéo comme « connue mais
            // pas encore prête » (utile si la sync dure ou est interrompue).
            index[id] = { uri: localUri, status: 'not_loaded' };
        }
    }
    await setVideoIndex(index);
    const estimatedBytes = toDownload.reduce((sum, v) => sum + v.size, 0);
    const [freeBytesBefore, totalCapacityBytes] = await Promise.all([
        FileSystem.getFreeDiskStorageAsync(),
        FileSystem.getTotalDiskCapacityAsync(),
    ]);

    log('sync.start', {
        toDownload: toDownload.length,
        alreadyLocal: alreadyLocalCount,
        toPurge: toPurge.length,
        estimatedBytes,
        freeBytesBefore,
        totalCapacityBytes,
    });

    // ── 2. Purge (peut libérer de la place utile pour la suite) ─────────────────
    let purgedCount = 0;
    let freedBytes = 0;
    for (const id of toPurge) {
        const uri = index[id].uri;
        let size = 0;
        try {
            const info = await FileSystem.getInfoAsync(uri);
            if (info.exists && !info.isDirectory) size = info.size;
        } catch {}
        try {
            await FileSystem.deleteAsync(uri, { idempotent: true });
            freedBytes += size;
            purgedCount++;
            log('sync.purge.item', { id, kind: 'video', bytes: size, ok: true });
        } catch (e: any) {
            log('sync.purge.item', { id, kind: 'video', bytes: 0, ok: false, error: e?.message });
        }
        delete index[id];
    }
    await setVideoIndex(index);
    const freeBytesAfterPurge = await FileSystem.getFreeDiskStorageAsync();
    log('sync.purge.done', { purgedCount, freedBytes, freeBytesAfterPurge });

    // ── 3. Espace suffisant ? Si non, on abandonne AVANT de tenter un download ──
    if (toDownload.length > 0 && estimatedBytes + SAFETY_MARGIN_BYTES > freeBytesAfterPurge) {
        const reason = 'insufficient-space';
        log('sync.aborted', {
            reason,
            estimatedBytes,
            freeBytes: freeBytesAfterPurge,
            marginBytes: SAFETY_MARGIN_BYTES,
        });
        log('sync.done', {
            succeeded: 0,
            failed: 0,
            skipped: toDownload.length,
            totalBytesDownloaded: 0,
            durationMs: Date.now() - startedAt,
            freeBytesAfter: freeBytesAfterPurge,
            freeBytesBefore,
            aborted: true,
        });
        return {
            succeeded: 0,
            failed: 0,
            skipped: toDownload.length,
            totalBytesDownloaded: 0,
            freeBytesBefore,
            freeBytesAfter: freeBytesAfterPurge,
            durationMs: Date.now() - startedAt,
            aborted: true,
            abortReason: reason,
        };
    }

    // ── 4. Download séquentiel ──────────────────────────────────────────────────
    let succeeded = 0;
    let failed = 0;
    let totalBytesDownloaded = 0;
    onProgress({ downloaded: 0, total: toDownload.length });

    for (let i = 0; i < toDownload.length; i++) {
        const video = toDownload[i];
        const freeBefore = await FileSystem.getFreeDiskStorageAsync();

        // Re-check espace au ras du download : le disque a pu se remplir entre-temps
        // (autre app) ou notre estimation est optimiste. Si insuffisant, on stoppe
        // net — les items suivants seraient dans la même situation.
        if (video.size + SAFETY_MARGIN_BYTES > freeBefore) {
            const remaining = toDownload.length - i;
            const reason = 'insufficient-space-mid-sync';
            log('sync.aborted', {
                reason,
                videoId: video.id,
                videoSize: video.size,
                freeBytes: freeBefore,
                marginBytes: SAFETY_MARGIN_BYTES,
                remaining,
            });
            const freeBytesAfter = freeBefore;
            log('sync.done', {
                succeeded,
                failed,
                skipped: remaining,
                totalBytesDownloaded,
                durationMs: Date.now() - startedAt,
                freeBytesAfter,
                freeBytesBefore,
                aborted: true,
            });
            return {
                succeeded, failed, skipped: remaining,
                totalBytesDownloaded, freeBytesBefore, freeBytesAfter,
                durationMs: Date.now() - startedAt, aborted: true, abortReason: reason,
            };
        }

        log('sync.item.start', {
            id: video.id,
            kind: 'video',
            name: video.name,
            index: i + 1,
            total: toDownload.length,
            estimatedBytes: video.size,
            freeBytesBefore: freeBefore,
        });
        const itemStart = Date.now();
        const localUri = localUriForVideoId(video.id);

        try {
            index[video.id] = { uri: localUri, status: 'loading' };
            await setVideoIndex(index);
            await FileSystem.downloadAsync(videoFileUrl(video.id), localUri, {
                headers: { 'x-api-key': apiKey },
            });
            const info = await FileSystem.getInfoAsync(localUri);
            if (!info.exists || info.isDirectory || info.size === 0) {
                throw new Error('Empty or missing file after download');
            }
            totalBytesDownloaded += info.size;
            index[video.id] = { uri: localUri, status: 'ready' };
            await setVideoIndex(index);
            const freeAfter = await FileSystem.getFreeDiskStorageAsync();
            log('sync.item.done', {
                id: video.id,
                kind: 'video',
                bytes: info.size,
                durationMs: Date.now() - itemStart,
                freeBytesAfter: freeAfter,
            });
            succeeded++;
        } catch (e: any) {
            // Item KO : on log et on passe au suivant plutôt que de bloquer toute la sync.
            // Cleanup best-effort du fichier partiel + retour à `not_loaded` pour
            // qu'une future sync retente (et pour ne pas laisser une entrée
            // `loading` fantôme si l'app crashe pile ici).
            try { await FileSystem.deleteAsync(localUri, { idempotent: true }); } catch {}
            index[video.id] = { uri: localUri, status: 'not_loaded' };
            await setVideoIndex(index);
            log('sync.item.failed', {
                id: video.id,
                kind: 'video',
                durationMs: Date.now() - itemStart,
                reason: e?.message ?? 'unknown',
            });
            failed++;
        }

        onProgress({ downloaded: i + 1, total: toDownload.length });
    }

    // ── 5. Fin ──────────────────────────────────────────────────────────────────
    const freeBytesAfter = await FileSystem.getFreeDiskStorageAsync();
    const durationMs = Date.now() - startedAt;
    log('sync.done', {
        succeeded,
        failed,
        skipped: 0,
        totalBytesDownloaded,
        durationMs,
        freeBytesAfter,
        freeBytesBefore,
        aborted: false,
    });

    return {
        succeeded,
        failed,
        skipped: 0,
        totalBytesDownloaded,
        freeBytesBefore,
        freeBytesAfter,
        durationMs,
        aborted: false,
    };
}

export type { VideoIndex } from './storage';
