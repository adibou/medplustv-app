import { getDisplayLoop } from '../api/endpoint';
import { storePlaylist, storeLastSyncAt } from './storage';
import { syncVideos, type DownloadProgress, type SyncReport } from './video-downloader';
import { syncSlideAssets } from './asset-downloader';
import type { Logger } from './logger';

// Mutex module-level : garantit qu'une seule sync tourne à la fois, quel que soit
// l'appelant (bouton menu, auto-sync périodique, retour d'app en foreground…).
// Fire concurrent → renvoie null, l'appelant peut décider de skip ou attendre.
let inFlight: Promise<SyncReport> | null = null;

export function isSyncInFlight(): boolean {
    return inFlight !== null;
}

export async function runFullSync(
    apiKey: string,
    log: Logger,
    onProgress?: (p: DownloadProgress) => void,
): Promise<SyncReport | null> {
    if (inFlight) return null;
    const p = (async () => {
        const items = await getDisplayLoop(apiKey);
        await storePlaylist(items);
        const report = await syncVideos(items, apiKey, log, onProgress ?? (() => {}));
        // Assets slides après les vidéos : un échec asset ne pollue pas le report
        // vidéo, et les vidéos priment (elles pèsent 100x plus lourd).
        await syncSlideAssets(items, apiKey, log);
        // On persiste la date même si des items ont échoué : ça reflète le
        // dernier passage effectué, pas la dernière sync 100% verte.
        await storeLastSyncAt(Date.now());
        return report;
    })();
    inFlight = p;
    try {
        return await p;
    } finally {
        inFlight = null;
    }
}
