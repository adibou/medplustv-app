import React, { useState } from 'react';
import { TouchableHighlight, StyleSheet, Text } from 'react-native';

// Bouton focusable télécommande : sans feedback focus visible, un utilisateur
// avec DPAD ne sait pas quel bouton est ciblé (bloquant pour la revue Play Store TV).
export default function TVButton({
    label,
    onPress,
    variant,
    hasTVPreferredFocus = false,
    disabled = false,
}: {
    label: string;
    onPress: () => void;
    variant: 'primary' | 'secondary';
    hasTVPreferredFocus?: boolean;
    disabled?: boolean;
}) {
    const [focused, setFocused] = useState(false);
    const isPrimary = variant === 'primary';
    return (
        <TouchableHighlight
            onPress={onPress}
            disabled={disabled}
            hasTVPreferredFocus={hasTVPreferredFocus}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            underlayColor={isPrimary ? '#16213e' : '#dbe6ff'}
            style={[
                styles.button,
                !isPrimary && styles.buttonSecondary,
                focused && styles.buttonFocused,
                disabled && styles.buttonDisabled,
            ]}
        >
            <Text style={isPrimary ? styles.buttonText : styles.buttonSecondaryText}>{label}</Text>
        </TouchableHighlight>
    );
}

const styles = StyleSheet.create({
    button: {
        backgroundColor: '#0f3460',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 8,
    },
    buttonText: {
        fontSize: 18,
        color: '#fff',
        fontWeight: 'bold',
    },
    buttonSecondary: {
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#0f3460',
    },
    buttonSecondaryText: {
        fontSize: 18,
        color: '#0f3460',
        fontWeight: 'bold',
    },
    buttonFocused: {
        borderWidth: 3,
        borderColor: '#e94560',
        transform: [{ scale: 1.05 }],
    },
    buttonDisabled: {
        opacity: 0.5,
    },
});
