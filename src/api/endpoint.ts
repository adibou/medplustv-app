import { Platform } from 'react-native';
import { PairRequestResponse, PairPollResponse, LoopItem } from './types';

const defaultHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? `http://${defaultHost}:3001`;

export async function requestPairingCode(): Promise<PairRequestResponse> {
    const res = await fetch(`${API_BASE_URL}/displays/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Pairing request failed: ${res.status}`);
    return res.json();
}

export async function pollPairingStatus(code: string): Promise<PairPollResponse> {
    const res = await fetch(`${API_BASE_URL}/displays/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(`Pairing poll failed: ${res.status}`);
    return res.json();
}

export async function getDisplayLoop(apiKey: string): Promise<LoopItem[]> {
    const res = await fetch(`${API_BASE_URL}/displays/loop`, {
        headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) throw new Error(`Get display loop failed: ${res.status}`);
    return res.json();
}

export async function apiStatus(): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE_URL}`);
    if (!res.ok) throw new Error(`API status check failed: ${res.status}`);
    return res.json();
}

export async function dissociateDisplay(apiKey: string): Promise<void> {
    const displayId = apiKey.split('.')[0];
    const res = await fetch(`${API_BASE_URL}/displays/${displayId}`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) throw new Error(`Dissociation failed: ${res.status}`);
}
