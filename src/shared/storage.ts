import AsyncStorage from '@react-native-async-storage/async-storage';
import { LoopItem } from '../api/types';

const API_KEY_STORAGE_KEY = 'medplustv_display_api_key';
const LOOP_ITEMS_STORAGE_KEY = 'medplustv_loop_items';
const VIDEO_INDEX_KEY = 'medplustv_video_index';

// id vidéo → URI local du fichier téléchargé
export type VideoIndex = Record<number, string>;

export async function getStoredApiKey(): Promise<string | null> {
    return AsyncStorage.getItem(API_KEY_STORAGE_KEY);
}

export async function storeApiKey(apiKey: string): Promise<void> {
    await AsyncStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
}

export async function clearApiKey(): Promise<void> {
    await AsyncStorage.removeItem(API_KEY_STORAGE_KEY);
}

export async function getStoredLoopItems(): Promise<LoopItem[]> {
    const json = await AsyncStorage.getItem(LOOP_ITEMS_STORAGE_KEY);
    return json ? JSON.parse(json) : [];
}

export async function storeLoopItems(items: LoopItem[]): Promise<void> {
    await AsyncStorage.setItem(LOOP_ITEMS_STORAGE_KEY, JSON.stringify(items));
}

export async function getVideoIndex(): Promise<VideoIndex> {
    const json = await AsyncStorage.getItem(VIDEO_INDEX_KEY);
    return json ? JSON.parse(json) : {};
}

export async function setVideoIndex(index: VideoIndex): Promise<void> {
    await AsyncStorage.setItem(VIDEO_INDEX_KEY, JSON.stringify(index));
}
