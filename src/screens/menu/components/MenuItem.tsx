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
            underlayColor="#2d2d2d"
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
        backgroundColor: '#2d2d2d',
    },
    itemDisabled: {
        opacity: 0.5,
    },
    label: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    labelDanger: {
        color: '#ff9f9f',
    },
});
