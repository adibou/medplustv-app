import { sendDisplayLog } from '../api/endpoint';

export type LogPayload = Record<string, unknown>;
// `scope` / `scopeId` sont hissés hors de `data` : ils vont dans des colonnes
// dédiées côté API (indexées) pour permettre des stats performantes comme
// "nombre de lectures de la vidéo X ce mois-ci".
export type LogScope = { scope: 'video' | 'slide'; scopeId: number };
export type Logger = (slug: string, data?: LogPayload, scope?: LogScope) => void;

// Un logger émet vers console + push distant (fire-and-forget, ne throw jamais).
// Le remote push est skip si `apiKey` est null (ex: écran non pairé).
export function createLogger(apiKey: string | null): Logger {
    return function log(slug, data = {}, scope) {
        // eslint-disable-next-line no-console
        console.log(`[${new Date().toISOString()}] ${slug}`, scope ?? '', data);
        if (apiKey) {
            sendDisplayLog(apiKey, slug, data, scope).catch((e: Error) => {
                // Une log qui échoue ne doit JAMAIS casser le flow appelant.
                // eslint-disable-next-line no-console
                console.warn(`log ${slug} push failed:`, e.message);
            });
        }
    };
}

// Helpers de formatage pour rendre les logs lisibles côté console.
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
