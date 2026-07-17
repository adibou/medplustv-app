import React from 'react';
import { StyleSheet } from 'react-native';
import SlideImage from '../slide-image';
import type { SlideContent } from '../../api/types';

type Props = { content: SlideContent };

export default function FullImageLayout({ content }: Props) {
    return <SlideImage content={content} zoneKey="image" style={styles.image} />;
}

const styles = StyleSheet.create({
    image: {
        width: '100%',
        height: '100%',
    },
});
