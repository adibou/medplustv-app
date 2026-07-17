import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getText, useSlideTextColor } from '../layout.utils';
import type { SlideContent } from '../../api/types';

type Props = { content: SlideContent };

export default function WelcomeLayout({ content }: Props) {
    const color = useSlideTextColor();
    return (
        <View style={styles.stack}>
            <Text style={[styles.title, { color }]}>{getText(content, 'title') || 'Titre'}</Text>
            <Text style={[styles.subtitle, { color }]}>{getText(content, 'subtitle')}</Text>
            <Text style={[styles.body, { color }]}>{getText(content, 'body')}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    stack: {
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    title: {
        fontSize: 96,
        lineHeight: 104,
        fontWeight: '800',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 52,
        lineHeight: 62,
        fontWeight: '600',
        textAlign: 'center',
    },
    body: {
        fontSize: 34,
        lineHeight: 46,
        opacity: 0.75,
        maxWidth: 1400,
        textAlign: 'center',
    },
});
