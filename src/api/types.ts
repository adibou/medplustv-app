// DTOs miroir de medplustv-api. À garder synchro avec les types serveur :
// - Video/VideoWithTags : src/videos/videos.types.ts
// - Slide / SlideContent : src/slides/slides.types.ts
// - ResolvedPlaylistItem : src/playlists/crud/playlists.types.ts
// - Pairing*             : src/pairing/pairing.types.ts

export type Tag = {
    id: number;
    name: string;
    color: string | null;
    scope: 'national' | 'organization' | 'structure';
    scopeId: number | null;
};

export type Video = {
    id: number;
    name: string;
    description: string | null;
    scope: 'national' | 'organization' | 'structure';
    scopeId: number | null;
    storageProvider: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    size: number;
    durationSeconds: number;
    thumbnailStorageProvider: string | null;
    thumbnailStorageKey: string | null;
    authorId: number;
    deleted: 0 | 1;
    createdAt: string;
    updatedAt: string;
};

export type VideoWithTags = Video & { tags: Tag[] };

export type SlideAssetRef = { kind: 'asset'; id: number; fit?: 'cover' | 'contain' };
export type SlideContentValue = string | SlideAssetRef;
export type SlideContent = Record<string, SlideContentValue>;

export type Slide = {
    id: number;
    name: string;
    layoutKey: string;
    content: SlideContent;
    scope: 'national' | 'organization' | 'structure';
    scopeId: number | null;
    theme: 'white' | 'cream' | 'green' | 'blue';
    duration: 5 | 10 | 15;
    authorId: number;
    deleted: 0 | 1;
    createdAt: string;
    updatedAt: string;
};

export type ResolvedItemOrigin = 'own' | 'inherited-org' | 'inherited-national';

export type ResolvedPlaylistItem = {
    id: number;                     // id de la row playlist_items
    playlistId: number;
    itemType: 'video' | 'slide';
    itemId: number;                 // id de la vidéo ou de la slide
    position: number;
    mandatory: 0 | 1;
    origin: ResolvedItemOrigin;
    hiddenByChild: boolean;
    hiddenHere: boolean;
    video: VideoWithTags | null;
    slide: Slide | null;
};

export type ResolvedPlaylistResponse = {
    items: ResolvedPlaylistItem[];
};

// ── Pairing ────────────────────────────────────────────────────────────────────

export type PairingRequestResponse = {
    code: string;
    sessionToken: string;
    expiresAt: string;
};

export type PairingStatusResponse =
    | { status: 'pending'; expiresAt: string }
    | { status: 'expired' }
    | { status: 'confirmed'; apiKey: string; displayId: number };
