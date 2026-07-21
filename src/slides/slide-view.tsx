import React, { useMemo, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
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

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

// Canvas 1920x1080 rendu en absolu puis scalé pour fitter le viewport, comme le BO.
// `collapsable={false}` est indispensable sur Android RN : sans ça, un View absolu
// scalé peut être aplati/dropé par la view flattening → contenu invisible.
export default function SlideView({ slide, resolveAsset, headerTitle }: SlideViewProps) {
    const palette = getThemePalette(slide.theme);
    const [viewport, setViewport] = useState({ width: 0, height: 0 });

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

    const { scale, offsetX, offsetY } = useMemo(() => {
        if (viewport.width <= 0 || viewport.height <= 0) {
            return { scale: 0, offsetX: 0, offsetY: 0 };
        }
        const s = Math.min(viewport.width / BASE_WIDTH, viewport.height / BASE_HEIGHT);
        return {
            scale: s,
            offsetX: (viewport.width - BASE_WIDTH * s) / 2,
            offsetY: (viewport.height - BASE_HEIGHT * s) / 2,
        };
    }, [viewport]);

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setViewport((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };

    return (
        <View style={styles.viewport} onLayout={onLayout}>
            {scale > 0 && (
                <View
                    collapsable={false}
                    style={[
                        styles.canvas,
                        {
                            backgroundColor: palette.background,
                            left: offsetX,
                            top: offsetY,
                            transform: [{ scale }],
                            transformOrigin: 'top left',
                        },
                    ]}
                >
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
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    viewport: {
        flex: 1,
        overflow: 'hidden',
        backgroundColor: '#000',
    },
    canvas: {
        position: 'absolute',
        width: BASE_WIDTH,
        height: BASE_HEIGHT,
        overflow: 'hidden',
    },
    body: {
        flex: 1,
        minHeight: 0,
    },
});
