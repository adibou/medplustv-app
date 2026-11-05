import * as FileSystem from 'expo-file-system/legacy';

// Téléchargement « vérifié » : écrit dans un fichier temporaire `.part`, contrôle
// le code HTTP et la taille, puis seulement renomme vers la destination finale.
//
// Pourquoi : `downloadAsync` ne lève PAS d'erreur sur une réponse 4xx/5xx — il
// écrit le corps (JSON/HTML d'erreur) dans le fichier. Sans contrôle, une 500/503
// passagère ou un flux coupé donnait un `.mp4` invalide marqué `ready` pour
// toujours, qui figeait la lecture à chaque passage dans la boucle.
export async function downloadVerified(
    url: string,
    localUri: string,
    headers: Record<string, string>,
    expectedSize?: number | null,
): Promise<number> {
    const tmpUri = localUri + '.part';
    try {
        await FileSystem.deleteAsync(tmpUri, { idempotent: true });
        const res = await FileSystem.downloadAsync(url, tmpUri, { headers });
        if (res.status < 200 || res.status >= 300) {
            throw new Error(`HTTP ${res.status}`);
        }
        const info = await FileSystem.getInfoAsync(tmpUri);
        if (!info.exists || info.isDirectory || info.size === 0) {
            throw new Error('Empty or missing file after download');
        }
        if (expectedSize && expectedSize > 0 && info.size !== expectedSize) {
            throw new Error(`Size mismatch: ${info.size} bytes, expected ${expectedSize}`);
        }
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        await FileSystem.moveAsync({ from: tmpUri, to: localUri });
        return info.size;
    } catch (e) {
        try { await FileSystem.deleteAsync(tmpUri, { idempotent: true }); } catch {}
        throw e;
    }
}
