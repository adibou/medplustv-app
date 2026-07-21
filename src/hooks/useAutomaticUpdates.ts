import { useEffect } from 'react';
import { checkAndApplyUpdate } from '../shared/updates';

// Vérifie EAS Update au démarrage. Si une update est dispo, elle est
// téléchargée puis appliquée immédiatement via `reloadAsync` — sinon il
// faudrait deux relances pour que la version prenne.
//
// Le check menu (safe car pas de vidéo en cours) est câblé côté `MenuScreen`.
// Pas de trigger foreground/interval : `reloadAsync` coupe l'app, on évite
// tout déclenchement au milieu d'une lecture.
export function useAutomaticUpdates() {
    useEffect(function checkUpdateOnStartup() {
        const controller = new AbortController();
        void checkAndApplyUpdate({ signal: controller.signal });
        return () => controller.abort();
    }, []);
}
