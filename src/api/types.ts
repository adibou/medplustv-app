export interface Video {
    id: number;
    name: string;
    durationMs: number;
}

export interface LoopItem {
    id: number;
    type: 'video' | 'slide';
    title: string;
    description: string;
    thumbnailUrl: string;
    url: string;
    durationInMs: number;
    tags: { id: number; name: string }[];
}

export interface PairRequestResponse {
    code: string;
    expiresAt: string;
}

export type PairPollResponse =
    | { status: 'pending' }
    | { status: 'expired' }
    | { status: 'paired'; apiKey: string };
