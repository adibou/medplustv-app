import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getText, useSlideTextColor } from '../layout.utils';
import SlideImage from '../slide-image';
import type { SlideContent } from '../../api/types';

type Props = { content: SlideContent };

export default function ImageTextLayout({ content }: Props) {
    const color = useSlideTextColor();
    return (
        <View style={styles.container}>
            <SlideImage content={content} zoneKey="image" style={styles.image} />
            <View style={styles.textCol}>
                <Text style={[styles.title, { color }]}>{getText(content, 'title') || 'Titre'}</Text>
                <Text style={[styles.body, { color }]}>{getText(content, 'body')}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    image: {
        width: '50%',
        height: '100%',
    },
    textCol: {
        flex: 1,
        justifyContent: 'center',
        paddingLeft: 48,
    },
    title: {
        fontSize: 76,
        lineHeight: 86,
        fontWeight: '700',
        marginBottom: 24,
    },
    body: {
        fontSize: 34,
        lineHeight: 46,
        opacity: 0.75,
    },
});
