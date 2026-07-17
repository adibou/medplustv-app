import React, { useState } from 'react';
import { TouchableHighlight, StyleSheet, Text } from 'react-native';

type MenuItemProps = {
    label: string;
    onFocusChange: (focused: boolean, action: () => void) => void;
    onPress: () => void;
    hasTVPreferredFocus?: boolean;
    disabled?: boolean;
    danger?: boolean;
};

export default function MenuItem({
    label,
    onFocusChange,
    onPress,
    hasTVPreferredFocus = false,
    disabled = false,
    danger = false,
}: MenuItemProps) {
    const [focused, setFocused] = useState(false);

    return (
        <TouchableHighlight
            onPress={onPress}
            hasTVPreferredFocus={hasTVPreferredFocus}
            disabled={disabled}
            onFocus={() => {
                setFocused(true);
                onFocusChange(true, onPress);
            }}
            onBlur={() => {
                setFocused(false);
                onFocusChange(false, onPress);
            }}
            underlayColor="rgba(15, 52, 96, 0.12)"
            style={[styles.item, focused && styles.itemFocused, disabled && styles.itemDisabled]}
        >
            <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
        </TouchableHighlight>
    );
}

const styles = StyleSheet.create({
    item: {
        paddingHorizontal: 24,
        paddingVertical: 4,
        borderRadius: 4,
        alignSelf: 'flex-start',
    },
    itemFocused: {
        backgroundColor: 'rgba(15, 52, 96, 0.12)',
    },
    itemDisabled: {
        opacity: 0.5,
    },
    label: {
        color: '#0f3460',
        fontSize: 12,
        fontWeight: '600',
    },
    labelDanger: {
        color: '#c62828',
    },
});
