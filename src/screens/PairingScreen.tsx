import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableHighlight } from 'react-native';
import { useDevicePairing } from '../hooks/useDevicePairing';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL, apiStatus } from '../api/endpoint';
import AppBackground from '../components/AppBackground';

type ReachabilityStatus = 'idle' | 'checking' | 'ok' | 'ko';

export default function PairingScreen() {
    const { phase, code, error, apiKey, restart } = useDevicePairing();
    const { authenticate } = useAuth();
    const [reachability, setReachability] = useState<ReachabilityStatus>('idle');
    const [reachabilityDetail, setReachabilityDetail] = useState<string | null>(null);

    useEffect(() => {
        if (phase === 'confirmed' && apiKey) {
            authenticate(apiKey);
        }
    }, [phase, apiKey, authenticate]);

    // Reset du diagnostic quand on relance un pairing.
    useEffect(() => {
        if (phase !== 'error') {
            setReachability('idle');
            setReachabilityDetail(null);
        }
    }, [phase]);

    async function checkServer() {
        setReachability('checking');
        setReachabilityDetail(null);
        try {
            const res = await apiStatus();
            setReachability('ok');
            setReachabilityDetail(res.time);
        } catch (e: any) {
            setReachability('ko');
            setReachabilityDetail(e?.message ?? 'Erreur inconnue');
        }
    }

    return (
        <AppBackground style={styles.container}>
            {(phase === 'idle' || phase === 'requesting') && (
                <>
                    <ActivityIndicator size="large" color="#0f3460" />
                    <Text style={styles.message}>Génération du code...</Text>
                </>
            )}

            {phase === 'displaying' && code && (
                <>
                    <Text style={styles.title}>Associez cet écran</Text>
                    <Text style={styles.instruction}>
                        Rendez-vous sur votre compte <Text style={styles.instructionLink}>app.medplus.tv</Text>, cliquez sur <Text style={styles.instructionAction}>{'+ associer un écran'}</Text> et saisissez ce code :
                    </Text>
                    <View style={styles.codeContainer}>
                        {code.split('').map((digit, i) => (
                            <View key={i} style={styles.digitBox}>
                                <Text style={styles.digit}>{digit}</Text>
                            </View>
                        ))}
                    </View>
                    <ActivityIndicator size="small" color="#666" style={styles.polling} />
                    <Text style={styles.waiting}>En attente d'association...</Text>
                </>
            )}

            {phase === 'expired' && (
                <>
                    <Text style={styles.message}>Code expiré</Text>
                    <Text style={styles.waiting}>Génération d'un nouveau code...</Text>
                    <ActivityIndicator size="small" color="#666" style={styles.polling} />
                </>
            )}

            {phase === 'confirmed' && (
                <>
                    <ActivityIndicator size="large" color="#4CAF50" />
                    <Text style={styles.success}>Écran associé avec succès !</Text>
                </>
            )}

            {phase === 'error' && (
                <View style={styles.errorBlock}>
                    <Text style={styles.errorTitle}>Association impossible</Text>
                    <Text style={styles.errorBody}>
                        Le serveur MedPlusTV n'a pas pu être joint pour générer un code
                        d'association. Vérifiez que cet écran est bien connecté à Internet,
                        puis réessayez.
                    </Text>

                    <View style={styles.techBox}>
                        <Text style={styles.techLabel}>Serveur</Text>
                        <Text style={styles.techValue}>{API_BASE_URL}</Text>
                        <Text style={styles.techLabel}>Détail technique</Text>
                        <Text style={styles.techValue}>{error ?? 'Erreur inconnue'}</Text>
                    </View>

                    {reachability !== 'idle' && (
                        <View style={styles.diagBox}>
                            {reachability === 'checking' && (
                                <>
                                    <ActivityIndicator size="small" color="#666" />
                                    <Text style={styles.diagText}>Test de la connexion au serveur...</Text>
                                </>
                            )}
                            {reachability === 'ok' && (
                                <Text style={styles.diagOk}>
                                    ✓ Le serveur répond. Vous pouvez réessayer l'association.
                                </Text>
                            )}
                            {reachability === 'ko' && (
                                <>
                                    <Text style={styles.diagKo}>
                                        ✗ Le serveur ne répond pas.
                                    </Text>
                                    {reachabilityDetail && (
                                        <Text style={styles.diagDetail}>{reachabilityDetail}</Text>
                                    )}
                                </>
                            )}
                        </View>
                    )}

                    <View style={styles.buttonRow}>
                        <TVButton
                            variant="secondary"
                            label="Tester la connexion"
                            onPress={checkServer}
                            disabled={reachability === 'checking'}
                        />
                        <TVButton
                            variant="primary"
                            label="Réessayer l'association"
                            onPress={restart}
                            hasTVPreferredFocus
                        />
                    </View>
                </View>
            )}
        </AppBackground>
    );
}

// Bouton focusable télécommande : sans feedback focus visible, un utilisateur
// avec DPAD ne sait pas quel bouton est ciblé (bloquant pour la revue Play Store TV).
function TVButton({
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
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#0f3460',
        marginBottom: 16,
    },
    instruction: {
        fontSize: 20,
        color: '#333',
        textAlign: 'center',
        marginBottom: 40,
        maxWidth: 600,
    },
    instructionLink: {
        color: '#0f3460',
        fontWeight: 'bold',
    },
    instructionAction: {
        color: '#0f3460',
        fontWeight: 'bold',
        borderWidth: 1,
        borderColor: '#0f3460',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    codeContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 40,
    },
    digitBox: {
        backgroundColor: '#16213e',
        borderRadius: 12,
        width: 80,
        height: 100,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#0f3460',
    },
    digit: {
        fontSize: 48,
        fontWeight: 'bold',
        color: '#e94560',
    },
    polling: {
        marginBottom: 12,
    },
    waiting: {
        fontSize: 16,
        color: '#666',
    },
    message: {
        fontSize: 24,
        color: '#0f3460',
        marginTop: 16,
    },
    success: {
        fontSize: 28,
        color: '#4CAF50',
        fontWeight: 'bold',
        marginTop: 16,
    },
    errorBlock: {
        maxWidth: 720,
        alignItems: 'stretch',
    },
    errorTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#e94560',
        textAlign: 'center',
        marginBottom: 16,
    },
    errorBody: {
        fontSize: 18,
        color: '#333',
        textAlign: 'center',
        lineHeight: 26,
        marginBottom: 24,
    },
    techBox: {
        backgroundColor: '#f4f6fa',
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
    },
    techLabel: {
        fontSize: 12,
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    techValue: {
        fontSize: 14,
        color: '#0f3460',
        fontFamily: 'monospace',
        marginBottom: 10,
    },
    diagBox: {
        alignItems: 'center',
        marginBottom: 20,
        gap: 6,
    },
    diagText: {
        fontSize: 14,
        color: '#666',
    },
    diagOk: {
        fontSize: 16,
        color: '#4CAF50',
        fontWeight: '600',
    },
    diagKo: {
        fontSize: 16,
        color: '#e94560',
        fontWeight: '600',
    },
    diagDetail: {
        fontSize: 12,
        color: '#666',
        fontFamily: 'monospace',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
    },
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
