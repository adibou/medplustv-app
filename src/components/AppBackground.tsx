import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

// Fond partagé par tous les écrans hors lecture vidéo (pairing, menu, erreurs).
// Dégradé diagonal gris très clair → bleu clair, avec une barre bleu → vert en bas.
export default function AppBackground({ children, style }: Props) {
    return (
        <View style={styles.root}>
            <LinearGradient
                colors={['#f2f4f8', '#dbe6ff']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View style={[styles.content, style]}>{children}</View>
            <LinearGradient
                colors={['#0f3460', '#4CAF50']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.bottomBar}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    content: {
        flex: 1,
    },
    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 8,
    },
});
