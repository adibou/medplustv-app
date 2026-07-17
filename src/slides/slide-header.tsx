import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

type SlideHeaderProps = {
    title: string;
    textColor: string;
};

// Bandeau haut-droit : titre contextuel + horloge. Miroir de medplustv-bo/src/slides/components/slide-header.tsx.
export default function SlideHeader({ title, textColor }: SlideHeaderProps) {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    const clockText = useMemo(
        () => now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        [now],
    );

    return (
        <View style={styles.header}>
            {title ? (
                <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
                    {title}
                </Text>
            ) : null}
            <Text style={[styles.clock, { color: textColor }]}>{clockText}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        position: 'absolute',
        top: 24,
        right: 40,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        maxWidth: 1120,
        gap: 24,
    },
    title: {
        textAlign: 'right',
        fontSize: 32,
        lineHeight: 40,
        fontWeight: '500',
        maxWidth: 840,
    },
    clock: {
        fontSize: 36,
        lineHeight: 44,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});
