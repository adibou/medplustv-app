import React from 'react';
import { View, StyleSheet } from 'react-native';

type SlideFooterProps = {
    accent: string;
    secondary: string;
};

// Bandeau bas 70/30. La version BO utilise un linear-gradient net à 70% ; on reproduit
// avec deux Views côte à côte (pas de gradient nécessaire, la coupure est franche).
export default function SlideFooter({ accent, secondary }: SlideFooterProps) {
    return (
        <View style={styles.footer}>
            <View style={[styles.left, { backgroundColor: accent }]} />
            <View style={[styles.right, { backgroundColor: secondary }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    footer: {
        height: 32,
        flexDirection: 'row',
    },
    left: { flex: 70 },
    right: { flex: 30 },
});
