import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResolvedPlaylistItem } from '../api/types';

const API_KEY_STORAGE_KEY = 'medplustv_display_api_key';
const LOOP_ITEMS_STORAGE_KEY = 'medplustv_loop_items';
const VIDEO_INDEX_KEY = 'medplustv_video_index';
const MUTED_KEY = 'medplustv_muted';

// Cycle de vie d'une vidéo côté client :
//   not_loaded → loading → ready
//                          ↓ (fichier disparu détecté à la lecture)
//                        notfound
// `notfound` est un signal remonté par le player quand une entrée `ready` n'a
// plus de fichier sur disque ; une future sync réussie la repassera en `ready`.
export type VideoStatus = 'not_loaded' | 'loading' | 'ready' | 'notfound';

export interface VideoIndexEntry {
    uri: string;
    status: VideoStatus;
}

// id vidéo → { uri local, statut }
export type VideoIndex = Record<number, VideoIndexEntry>;

export async function getStoredApiKey(): Promise<string | null> {
    return AsyncStorage.getItem(API_KEY_STORAGE_KEY);
}

export async function storeApiKey(apiKey: string): Promise<void> {
    await AsyncStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
}

export async function clearApiKey(): Promise<void> {
    await AsyncStorage.removeItem(API_KEY_STORAGE_KEY);
}

export async function getStoredPlaylist(): Promise<ResolvedPlaylistItem[]> {
    const json = await AsyncStorage.getItem(LOOP_ITEMS_STORAGE_KEY);
    return json ? JSON.parse(json) : [];
}

export async function storePlaylist(items: ResolvedPlaylistItem[]): Promise<void> {
    await AsyncStorage.setItem(LOOP_ITEMS_STORAGE_KEY, JSON.stringify(items));
}

export async function clearPlaylist(): Promise<void> {
    await AsyncStorage.removeItem(LOOP_ITEMS_STORAGE_KEY);
}

export async function getVideoIndex(): Promise<VideoIndex> {
    const json = await AsyncStorage.getItem(VIDEO_INDEX_KEY);
    if (!json) return {};
    const raw = JSON.parse(json) as Record<string, unknown>;
    // Migration ancienne shape (`Record<number, string>`) : les entrées string
    // représentaient un fichier téléchargé et vérifié → on les remonte en `ready`.
    const out: VideoIndex = {};
    for (const [id, val] of Object.entries(raw)) {
        if (typeof val === 'string') {
            out[Number(id)] = { uri: val, status: 'ready' };
        } else if (val && typeof val === 'object' && 'uri' in val && 'status' in val) {
            out[Number(id)] = val as VideoIndexEntry;
        }
    }
    return out;
}

export async function setVideoIndex(index: VideoIndex): Promise<void> {
    await AsyncStorage.setItem(VIDEO_INDEX_KEY, JSON.stringify(index));
}

export async function getStoredMuted(): Promise<boolean> {
    return (await AsyncStorage.getItem(MUTED_KEY)) === '1';
}

export async function storeMuted(muted: boolean): Promise<void> {
    await AsyncStorage.setItem(MUTED_KEY, muted ? '1' : '0');
}
