import * as Updates from 'expo-updates';
import { createLogger } from './logger';

// Check EAS Update, télécharge la version dispo puis `reloadAsync` pour
// l'appliquer sans exiger un second lancement. Fire-and-forget : n'expose
// jamais d'erreur, tout est loggé en interne.
//
// No-op en `__DEV__` — les APIs Updates ne fonctionnent qu'en build release.
//
// `signal` permet à l'appelant d'annuler juste avant le reload s'il n'est
// plus en position sûre (ex: l'utilisateur a quitté le menu pour revenir
// sur la lecture vidéo). Une fois `reloadAsync` lancé, l'app redémarre —
// donc on veut vraiment vérifier au dernier moment.
export async function checkAndApplyUpdate(options?: { signal?: AbortSignal }): Promise<void> {
    if (__DEV__) return;

    const log = createLogger(null);

    try {
        const update = await Updates.checkForUpdateAsync();
        if (options?.signal?.aborted) return;
        if (!update.isAvailable) {
            log('updates.check.none');
            return;
        }
        log('updates.available');
        await Updates.fetchUpdateAsync();
        if (options?.signal?.aborted) return;
        log('updates.reload');
        await Updates.reloadAsync();
    } catch (e: any) {
        log('updates.error', { message: e?.message });
    }
}
