import * as FileSystem from 'expo-file-system/legacy';
import { ResolvedPlaylistItem, SlideAssetRef, SlideContentValue } from '../api/types';
import { getAssetIndex, setAssetIndex } from './storage';
import { slideAssetFileUrl } from '../api/endpoint';
import type { Logger } from './logger';

export interface AssetSyncReport {
    succeeded: number;
    failed: number;
    totalBytesDownloaded: number;
    durationMs: number;
}

function getAssetDir(): string {
    const base = FileSystem.documentDirectory;
    if (!base) throw new Error('FileSystem.documentDirectory non disponible');
    return base + 'assets/';
}

async function ensureAssetDir(): Promise<void> {
    const dir = getAssetDir();
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
}

function localUriForAssetId(assetId: number): string {
    // Pas d'extension : le mimetype est déterminé côté serveur par le stream,
    // et RN `Image` accepte n'importe quelle extension pour du binaire image.
    return getAssetDir() + `${assetId}`;
}

async function isAlreadyDownloaded(localUri: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(localUri);
    return info.exists && !info.isDirectory && info.size > 0;
}

// Parcourt les slides de la playlist et extrait tous les asset ids référencés
// (via `content.zone = { kind: 'asset', id }`).
function extractAssetIds(items: ResolvedPlaylistItem[]): Set<number> {
    const out = new Set<number>();
    for (const it of items) {
        if (it.itemType !== 'slide' || !it.slide) continue;
        for (const value of Object.values(it.slide.content)) {
            if (isAssetRef(value)) out.add(value.id);
        }
    }
    return out;
}

function isAssetRef(v: SlideContentValue): v is SlideAssetRef {
    return typeof v === 'object' && v !== null && v.kind === 'asset';
}

export async function syncSlideAssets(
    items: ResolvedPlaylistItem[],
    apiKey: string,
    log: Logger,
): Promise<AssetSyncReport> {
    const startedAt = Date.now();
    await ensureAssetDir();

    const wanted = extractAssetIds(items);
    const index = await getAssetIndex();

    // ── Purge : entrées d'index dont l'id n'est plus référencé ─────────────────
    let purgedCount = 0;
    let freedBytes = 0;
    for (const key of Object.keys(index)) {
        const id = Number(key);
        if (wanted.has(id)) continue;
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
            log('sync.purge.item', { id, kind: 'asset', bytes: size, ok: true });
        } catch (e: any) {
            log('sync.purge.item', { id, kind: 'asset', bytes: 0, ok: false, error: e?.message });
        }
        delete index[id];
    }
    if (purgedCount > 0) {
        await setAssetIndex(index);
        log('sync.purge.assets.done', { purgedCount, freedBytes });
    }

    // ── Identifie ceux à télécharger ────────────────────────────────────────────
    const toDownload: number[] = [];
    for (const id of wanted) {
        const localUri = localUriForAssetId(id);
        const entry = index[id];
        const already = entry?.status === 'ready' && await isAlreadyDownloaded(localUri);
        if (!already) {
            toDownload.push(id);
            index[id] = { uri: localUri, status: 'not_loaded' };
        }
    }
    await setAssetIndex(index);

    log('sync.assets.start', {
        toDownload: toDownload.length,
        alreadyLocal: wanted.size - toDownload.length,
    });

    // ── Download séquentiel (les assets sont petits, on ne se préoccupe pas de la
    // marge disque comme pour les vidéos) ──────────────────────────────────────
    let succeeded = 0;
    let failed = 0;
    let totalBytesDownloaded = 0;

    for (let i = 0; i < toDownload.length; i++) {
        const id = toDownload[i];
        const localUri = localUriForAssetId(id);
        const itemStart = Date.now();
        log('sync.item.start', { id, kind: 'asset', index: i + 1, total: toDownload.length });
        try {
            index[id] = { uri: localUri, status: 'loading' };
            await setAssetIndex(index);
            await FileSystem.downloadAsync(slideAssetFileUrl(id), localUri, {
                headers: { 'x-api-key': apiKey },
            });
            const info = await FileSystem.getInfoAsync(localUri);
            if (!info.exists || info.isDirectory || info.size === 0) {
                throw new Error('Empty or missing file after download');
            }
            totalBytesDownloaded += info.size;
            index[id] = { uri: localUri, status: 'ready' };
            await setAssetIndex(index);
            log('sync.item.done', {
                id,
                kind: 'asset',
                bytes: info.size,
                durationMs: Date.now() - itemStart,
            });
            succeeded++;
        } catch (e: any) {
            try { await FileSystem.deleteAsync(localUri, { idempotent: true }); } catch {}
            index[id] = { uri: localUri, status: 'not_loaded' };
            await setAssetIndex(index);
            log('sync.item.failed', {
                id,
                kind: 'asset',
                durationMs: Date.now() - itemStart,
                reason: e?.message ?? 'unknown',
            });
            failed++;
        }
    }

    const durationMs = Date.now() - startedAt;
    log('sync.assets.done', { succeeded, failed, totalBytesDownloaded, durationMs });

    return { succeeded, failed, totalBytesDownloaded, durationMs };
}

export type { AssetIndex } from './storage';
