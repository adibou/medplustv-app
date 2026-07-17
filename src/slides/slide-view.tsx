import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { AssetResolverContext, SlideTextColorContext, type ResolveAsset } from './layout.utils';
import SlideHeader from './slide-header';
import SlideFooter from './slide-footer';
import SlideLayoutRenderer from './layouts/layout-renderer';
import { getThemePalette } from './themes';
import type { Slide } from '../api/types';

type SlideViewProps = {
    slide: Slide;
    resolveAsset: ResolveAsset;
    // Titre affiché dans le header (nom de structure / cabinet). Optionnel.
    headerTitle?: string;
};

// Rendu fullscreen d'une slide, en flex natif (pas de transform/scale — trop
// fragile en RN sur Android : `position: absolute` + `transform` peut faire
// disparaître le contenu enfant). Les tailles restent calibrées 1920x1080 — sur
// une TV native c'est pile, sur écran plus petit ça débordera (visible mais rogné).
export default function SlideView({ slide, resolveAsset, headerTitle }: SlideViewProps) {
    const palette = getThemePalette(slide.theme);

    const isImageText = slide.layoutKey === 'image-text';
    // Photo plein écran : pas de header/footer/padding, l'image occupe tout.
    const isFullImage = slide.layoutKey === 'full-image';
    const showHeader = slide.layoutKey !== 'welcome' && !isFullImage;
    const showFooter = !isFullImage;

    const bodyPadding = useMemo(() => {
        if (isFullImage) return { padding: 0 };
        if (isImageText) return { paddingLeft: 0, paddingRight: 96, paddingTop: 0, paddingBottom: 0 };
        return { paddingVertical: 44, paddingHorizontal: 96 };
    }, [isFullImage, isImageText]);



    return (
        <View style={[styles.canvas, { backgroundColor: palette.background }]}>
            <AssetResolverContext.Provider value={resolveAsset}>
                <SlideTextColorContext.Provider value={palette.text}>
                    {showHeader && (
                        <SlideHeader title={headerTitle ?? ''} textColor={palette.text} />
                    )}
                    <View style={[styles.body, bodyPadding]}>
                        <SlideLayoutRenderer
                            layoutKey={slide.layoutKey}
                            content={slide.content}
                            accent={palette.accent}
                        />
                    </View>
                    {showFooter && <SlideFooter accent={palette.accent} secondary={palette.secondary} />}
                </SlideTextColorContext.Provider>
            </AssetResolverContext.Provider>
        </View>
    );
}

const styles = StyleSheet.create({
    canvas: {
        flex: 1,
        overflow: 'hidden',
    },
    body: {
        flex: 1,
        minHeight: 0,
    },
});
