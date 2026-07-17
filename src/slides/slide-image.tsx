import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { getImageFit, getImageRef, useResolveAsset } from './layout.utils';
import type { SlideContent } from '../api/types';

type SlideImageProps = {
    content: SlideContent;
    zoneKey: string;
    style?: ViewStyle;
    // Rayon appliqué au conteneur ET à l'image (RN clip par-dessus).
    borderRadius?: number;
};

// Résout l'asset via le contexte + rend l'image (ou un placeholder si non résolue).
// Encapsulé ici pour ne pas dupliquer la logique de fallback dans chaque layout.
export default function SlideImage({ content, zoneKey, style, borderRadius = 0 }: SlideImageProps) {
    const resolve = useResolveAsset();
    const ref = getImageRef(content, zoneKey);
    const fit = getImageFit(content, zoneKey);
    const uri = ref ? resolve(ref.id) : undefined;

    return (
        <View style={[styles.container, { borderRadius }, style]}>
            {uri
                ? <Image source={{ uri }} style={[styles.image, { borderRadius }]} resizeMode={fit} />
                : null}
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
