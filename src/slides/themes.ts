// Palettes miroir de medplustv-bo/src/slides/slides.themes.ts.
// Le back ne stocke que la clé — les couleurs sont front-only.

import type { Slide } from '../api/types';

export type SlideThemePalette = {
    background: string;
    text: string;
    accent: string;
    secondary: string;
};

export const THEME_PALETTES: Record<Slide['theme'], SlideThemePalette> = {
    white: {
        background: '#ffffff',
        text: '#1f2937',
        accent: '#1e40af',
        secondary: '#16a34a',
    },
    cream: {
        background: '#f6f1e8',
        text: '#3f3a31',
        accent: '#1e40af',
        secondary: '#16a34a',
    },
    green: {
        background: '#e8f5e8',
        text: '#1f3d1f',
        accent: '#1e40af',
        secondary: '#16a34a',
    },
    blue: {
        background: '#1e40af',
        text: '#ffffff',
        accent: '#ffffff',
        secondary: '#86efac',
    },
};

export function getThemePalette(theme: Slide['theme']): SlideThemePalette {
    return THEME_PALETTES[theme];
}
