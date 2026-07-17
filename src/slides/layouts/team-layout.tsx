import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getImageRef, getText, useSlideTextColor } from '../layout.utils';
import SlideImage from '../slide-image';
import type { SlideContent } from '../../api/types';

type Props = { content: SlideContent };

// TEAM_MAX_MEMBERS = 8 (miroir de src/slides/slides.layouts.ts côté API).
const TEAM_MAX_MEMBERS = 8;

// Filtre les slots peuplés — au moins une donnée (photo, nom ou rôle). Fallback
// sur 1 slot si rien pour ne pas afficher une slide vide.
function visibleMemberIndices(content: SlideContent): number[] {
    const visible: number[] = [];
    for (let i = 1; i <= TEAM_MAX_MEMBERS; i++) {
        const hasName = getText(content, `member${i}Name`) !== '';
        const hasRole = getText(content, `member${i}Role`) !== '';
        const hasPhoto = getImageRef(content, `member${i}Image`) !== undefined;
        if (hasName || hasRole || hasPhoto) visible.push(i);
    }
    return visible.length > 0 ? visible : [1];
}

export default function TeamLayout({ content }: Props) {
    const members = visibleMemberIndices(content);
    const color = useSlideTextColor();
    return (
        <View>
            <Text style={[styles.title, { color }]}>{getText(content, 'title') || 'Une equipe a votre ecoute'}</Text>
            <View style={styles.grid}>
                {members.map((i) => (
                    <View key={i} style={styles.card}>
                        <SlideImage
                            content={content}
                            zoneKey={`member${i}Image`}
                            style={styles.memberImage}
                            borderRadius={8}
                        />
                        <Text style={styles.name}>{getText(content, `member${i}Name`) || `Membre ${i}`}</Text>
                        <Text style={styles.role}>{getText(content, `member${i}Role`)}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    title: {
        textAlign: 'center',
        fontSize: 54,
        lineHeight: 64,
        fontWeight: '700',
        marginBottom: 30,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 20,
    },
    card: {
        // Cartes 25% de large — 4 par ligne. `gap` gère l'espacement.
        width: '23%',
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
    },
    memberImage: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 8,
    },
    name: {
        fontWeight: '700',
        fontSize: 28,
        lineHeight: 36,
        marginTop: 10,
        textAlign: 'center',
        color: '#1f2937',
    },
    role: {
        fontSize: 22,
        lineHeight: 30,
        opacity: 0.7,
        textAlign: 'center',
        color: '#1f2937',
    },
});
