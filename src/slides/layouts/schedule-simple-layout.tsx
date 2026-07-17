import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getText, useSlideTextColor } from '../layout.utils';
import type { SlideContent } from '../../api/types';

type Props = { content: SlideContent };

// Variante 3 lignes du schedule complet.
export default function ScheduleSimpleLayout({ content }: Props) {
    const color = useSlideTextColor();
    const rows = [
        { label: 'Lundi - Vendredi', value: getText(content, 'weekdaysHours') },
        { label: 'Samedi', value: getText(content, 'saturdayHours') },
        { label: 'Dimanche', value: getText(content, 'sundayHours') },
    ];

    return (
        <View style={styles.container}>
            <View style={styles.leftCol}>
                <Text style={[styles.title, { color }]}>{getText(content, 'title') || 'Horaires'}</Text>
                <Text style={[styles.subtitle, { color }]}>{getText(content, 'subtitle')}</Text>
            </View>
            <View style={styles.table}>
                {rows.map((row, i) => {
                    const displayValue = row.value || '—';
                    const isClosed = /ferm/i.test(displayValue);
                    return (
                        <View
                            key={row.label}
                            style={[styles.row, i < rows.length - 1 && styles.rowBorder]}
                        >
                            <Text style={styles.dayLabel}>{row.label}</Text>
                            <Text
                                style={[
                                    styles.dayValue,
                                    isClosed && styles.closedValue,
                                    !row.value && styles.emptyValue,
                                ]}
                            >
                                {displayValue}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: 72,
        alignItems: 'center',
        height: '100%',
    },
    leftCol: {
        width: '44%',
        justifyContent: 'center',
    },
    title: {
        fontSize: 76,
        lineHeight: 84,
        fontWeight: '800',
        letterSpacing: -0.6,
        marginBottom: 16,
    },
    subtitle: {
        fontSize: 44,
        lineHeight: 56,
        opacity: 0.82,
        maxWidth: 640,
    },
    table: {
        width: '52%',
        backgroundColor: '#f4f4f5',
        borderRadius: 22,
        paddingVertical: 32,
        paddingHorizontal: 48,
        borderWidth: 1,
        borderColor: 'rgba(17,24,39,0.08)',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 24,
        paddingVertical: 24,
    },
    rowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.06)',
    },
    dayLabel: {
        fontWeight: '500',
        color: '#333b47',
        fontSize: 44,
        lineHeight: 52,
    },
    dayValue: {
        fontWeight: '500',
        color: '#333b47',
        textAlign: 'right',
        fontSize: 44,
        lineHeight: 52,
    },
    closedValue: { color: '#dc2626' },
    emptyValue: { color: 'rgba(51,59,71,0.45)' },
});
