import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
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

// Rend une slide fullscreen en scalant un canvas 1920x1080 vers la largeur mesurée
// du parent (le TV a un ratio 16:9). Approche miroir du BO (transform: scale) — ça
// permet de porter les tailles pixel-perfect sans devoir tout re-calculer en `%`.
export default function SlideView({ slide, resolveAsset, headerTitle }: SlideViewProps) {
    const [hostWidth, setHostWidth] = useState(BASE_WIDTH);
    const palette = getThemePalette(slide.theme);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setHostWidth(e.nativeEvent.layout.width || BASE_WIDTH);
    }, []);

    const scale = hostWidth / BASE_WIDTH;

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
        <View style={styles.host} onLayout={onLayout}>
            <View style={styles.viewport}>
                <View
                    style={[
                        styles.canvas,
                        {
                            width: BASE_WIDTH,
                            height: BASE_HEIGHT,
                            backgroundColor: palette.background,
                            transform: [{ scale }],
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
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    host: {
        // Parent est `absolute` fullscreen → `flex: 1` ne s'appliquerait pas.
        // On mesure la largeur via onLayout et on scale le canvas 1920x1080 dessus.
        width: '100%',
        height: '100%',
    },
    viewport: {
        flex: 1,
        overflow: 'hidden',
    },
    canvas: {
        position: 'absolute',
        top: 0,
        left: 0,
        transformOrigin: 'top left',
    },
    body: {
        flex: 1,
        minHeight: 0,
    },
});
