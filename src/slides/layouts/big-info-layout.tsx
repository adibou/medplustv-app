import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getText, useSlideTextColor } from '../layout.utils';
import type { SlideContent } from '../../api/types';

type Props = { content: SlideContent };

export default function BigInfoLayout({ content }: Props) {
    const color = useSlideTextColor();
    return (
        <View style={styles.stack}>
            <Text style={[styles.title, { color }]}>{getText(content, 'title') || 'Titre'}</Text>
            <Text style={[styles.subtitle, { color }]}>{getText(content, 'subtitle')}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    stack: {
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
    },
    title: {
        fontSize: 92,
        lineHeight: 100,
        fontWeight: '800',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 34,
        lineHeight: 46,
        opacity: 0.75,
        maxWidth: 1400,
        textAlign: 'center',
    },
});
