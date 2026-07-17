import { createContext, useContext } from 'react';
import type { SlideAssetRef, SlideContent, SlideContentValue } from '../api/types';

// Contexte fourni par SlideView pour que les layouts résolvent leurs asset ids
// vers l'URI locale téléchargée. Retourne undefined si l'asset n'est pas encore
// prêt en local — les layouts affichent alors un placeholder.
export type ResolveAsset = (id: number) => string | undefined;

export const AssetResolverContext = createContext<ResolveAsset>(() => undefined);

export function useResolveAsset(): ResolveAsset {
    return useContext(AssetResolverContext);
}

// RN ne cascade pas `color` de View → Text (contrairement au CSS). On expose la
// couleur du thème via contexte pour que les textes "canvas" (titres, corps de
// slide) l'appliquent sans prop-drilling.
export const SlideTextColorContext = createContext<string>('#1f2937');

export function useSlideTextColor(): string {
    return useContext(SlideTextColorContext);
}

export function getText(content: SlideContent | undefined, key: string): string {
    const value = content?.[key];
    return typeof value === 'string' ? value : '';
}

export function getImageRef(content: SlideContent | undefined, key: string): SlideAssetRef | undefined {
    const value: SlideContentValue | undefined = content?.[key];
    if (typeof value === 'object' && value !== null && value.kind === 'asset') return value;
    return undefined;
}

// Défaut par zone : le QR code doit rester lisible → `contain`. Le reste → `cover`.
export function getImageFit(content: SlideContent | undefined, key: string): 'cover' | 'contain' {
    const ref = getImageRef(content, key);
    if (ref?.fit) return ref.fit;
    return key === 'qr' ? 'contain' : 'cover';
}
