import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getText, useSlideTextColor } from '../layout.utils';
import SlideImage from '../slide-image';
import type { SlideContent } from '../../api/types';

type Props = {
    content: SlideContent;
    accent: string;
};

// Applique une opacité 22 (~13%) au fond de l'icône, comme le BO (`${accent}22`).
function accentBg(accent: string): string {
    return accent + '22';
}

export default function ContactLayout({ content, accent }: Props) {
    const iconBg = accentBg(accent);
    const color = useSlideTextColor();
    return (
        <View>
            <Text style={[styles.title, { color }]}>{getText(content, 'title') || 'Coordonnees'}</Text>
            <View style={styles.twoCol}>
                <View style={styles.list}>
                    <ContactItem icon="📍" text={getText(content, 'address')} accent={accent} iconBg={iconBg} textColor={color} />
                    <ContactItem icon="📞" text={getText(content, 'phone')} accent={accent} iconBg={iconBg} textColor={color} />
                    <ContactItem icon="🌐" text={getText(content, 'website')} accent={accent} iconBg={iconBg} textColor={color} />
                </View>
                <SlideImage content={content} zoneKey="qr" style={styles.qr} borderRadius={12} />
            </View>
        </View>
    );
}

function ContactItem({ icon, text, accent, iconBg, textColor }: { icon: string; text: string; accent: string; iconBg: string; textColor: string }) {
    return (
        <View style={styles.item}>
            <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
                <Text style={[styles.icon, { color: accent }]}>{icon}</Text>
            </View>
            <Text style={[styles.itemText, { color: textColor }]}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    title: {
        fontSize: 54,
        lineHeight: 64,
        fontWeight: '700',
        marginBottom: 26,
    },
    twoCol: {
        flexDirection: 'row',
        gap: 48,
        alignItems: 'flex-start',
    },
    list: {
        flex: 1,
        gap: 20,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconBox: {
        width: 52,
        height: 52,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    icon: {
        fontSize: 28,
    },
    itemText: {
        flex: 1,
        fontSize: 32,
        lineHeight: 40,
    },
    qr: {
        width: 320,
        aspectRatio: 1,
    },
});
