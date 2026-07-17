import { Platform } from 'react-native';
import {
    PairingRequestResponse,
    PairingStatusResponse,
    ResolvedPlaylistResponse,
    ResolvedPlaylistItem,
} from './types';

const defaultHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? `http://${defaultHost}:3001/api`;

// ── Pairing (public, pas d'apiKey) ─────────────────────────────────────────────

export async function requestPairingCode(): Promise<PairingRequestResponse> {
    const res = await fetch(`${API_BASE_URL}/pairing/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Pairing request failed: ${res.status}`);
    return res.json();
}

export async function pollPairingStatus(sessionToken: string): Promise<PairingStatusResponse> {
    const url = `${API_BASE_URL}/pairing/status?sessionToken=${encodeURIComponent(sessionToken)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pairing poll failed: ${res.status}`);
    return res.json();
}

// ── Playlist du display (auth via x-api-key) ───────────────────────────────────

export async function getDisplayLoop(apiKey: string): Promise<ResolvedPlaylistItem[]> {
    const res = await fetch(`${API_BASE_URL}/playlists/for-display`, {
        headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) throw new Error(`Get display loop failed: ${res.status}`);
    const data: ResolvedPlaylistResponse = await res.json();
    return data.items;
}

// ── Diagnostic ─────────────────────────────────────────────────────────────────

export async function apiStatus(): Promise<{ message: string; time: string }> {
    const res = await fetch(`${API_BASE_URL}/`);
    if (!res.ok) throw new Error(`API status check failed: ${res.status}`);
    return res.json();
}

// ── Dissociation ───────────────────────────────────────────────────────────────
// Un display s'auto-dissocie. L'apiKey contient son id sous la forme `id.secret`.
export async function dissociateDisplay(apiKey: string): Promise<void> {
    const displayId = apiKey.split('.')[0];
    const res = await fetch(`${API_BASE_URL}/displays/${displayId}/unpair`, {
        method: 'PUT',
        headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) throw new Error(`Dissociation failed: ${res.status}`);
}

// ── Logs (auth via x-api-key, side-effect fire-and-forget) ─────────────────────
// Le shape de `data` dépend du slug (contrat côté app). Le back stocke tel quel.
export async function sendDisplayLog(apiKey: string, slug: string, data: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/display-logs/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ slug, data }),
    });
    if (!res.ok) throw new Error(`sendDisplayLog(${slug}) failed: ${res.status}`);
}

// ── Streaming vidéo (URL absolue, utilisée par le downloader) ──────────────────
// Public — pas d'auth requise pour le fichier lui-même (la sécurité est portée
// par la connaissance de l'id + le fait que le lien n'est jamais exposé côté BO
// sans droits sur la vidéo).
export function videoFileUrl(videoId: number): string {
    return `${API_BASE_URL}/videos/file/${videoId}/file`;
}