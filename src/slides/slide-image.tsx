import React from 'react';
import { View, Image, StyleSheet, ImageSourcePropType, ViewStyle } from 'react-native';
import { getImageFit, getImageRef, useResolveAsset } from './layout.utils';
import type { SlideContent } from '../api/types';
import defaultSlideImage from '../../assets/images/default-slide-image.png';

type SlideImageProps = {
    content: SlideContent;
    zoneKey: string;
    style?: ViewStyle;
    // Rayon appliqué au conteneur ET à l'image (RN clip par-dessus).
    borderRadius?: number;
};

// Résout l'asset via le contexte + rend l'image. Fallback sur le placeholder
// bundlé (miroir de medplustv-bo/src/assets/images/default-slide-image.png) quand
// aucun asset n'est référencé — parité avec la preview BO.
export default function SlideImage({ content, zoneKey, style, borderRadius = 0 }: SlideImageProps) {
    const resolve = useResolveAsset();
    const ref = getImageRef(content, zoneKey);
    const fit = getImageFit(content, zoneKey);
    const uri = ref ? resolve(ref.id) : undefined;

    const source: ImageSourcePropType = uri ? { uri } : defaultSlideImage;

    return (
        <View style={[styles.container, { borderRadius }, style]}>
            <Image source={source} style={[styles.image, { borderRadius }]} resizeMode={fit} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(0,0,0,0.06)',
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
});
