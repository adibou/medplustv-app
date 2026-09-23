import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useDevicePairing } from '../hooks/useDevicePairing';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL, apiStatus } from '../api/endpoint';
import AppBackground from '../components/AppBackground';
import TVButton from '../components/TVButton';

type ReachabilityStatus = 'idle' | 'checking' | 'ok' | 'ko';

export default function PairingScreen() {
    const { phase, email, error, apiKey, submitEmail, changeEmail, restart } = useDevicePairing();
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
            {phase === 'idle' && (
                <EmailStep initialEmail={email} error={error} onSubmit={submitEmail} />
            )}

            {phase === 'requesting' && (
                <>
                    <ActivityIndicator size="large" color="#0f3460" />
                    <Text style={styles.message}>Envoi du lien...</Text>
                </>
            )}

            {phase === 'waiting' && (
                <>
                    <Text style={styles.title}>Vérifiez vos emails</Text>
                    <Text style={styles.instruction}>
                        Si cette adresse est connue, un email vient d&apos;être envoyé à{' '}
                        <Text style={styles.instructionLink}>{email}</Text>.{'\n'}
                        Ouvrez le lien qu&apos;il contient pour associer cet écran.
                    </Text>
                    <ActivityIndicator size="small" color="#666" style={styles.polling} />
                    <Text style={styles.waiting}>En attente du clic sur le lien...</Text>
                    <View style={styles.buttonRow}>
                        <TVButton variant="secondary" label="Changer d'adresse" onPress={changeEmail} hasTVPreferredFocus />
                    </View>
                </>
            )}

            {phase === 'expired' && (
                <>
                    <Text style={styles.title}>Le lien a expiré</Text>
                    <Text style={styles.instruction}>
                        Le lien envoyé à <Text style={styles.instructionLink}>{email}</Text> n&apos;a pas été utilisé à temps.
                    </Text>
                    <View style={styles.buttonRow}>
                        <TVButton variant="primary" label="Recommencer" onPress={restart} hasTVPreferredFocus />
                    </View>
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
                        Le serveur MedPlusTV n&apos;a pas pu envoyer le lien d&apos;association.
                        Vérifiez que cet écran est bien connecté à Internet, puis réessayez.
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
                                    ✓ Le serveur répond. Vous pouvez réessayer l&apos;association.
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

// Saisie de l'email : le TextInput est focusable au DPAD (select → clavier IME
// Android TV / plein écran tvOS). Un seul `hasTVPreferredFocus` : l'input.
function EmailStep({ initialEmail, error, onSubmit }: {
    initialEmail: string;
    error: string | null;
    onSubmit: (email: string) => void;
}) {
    const [value, setValue] = useState(initialEmail);
    const [focused, setFocused] = useState(false);

    // Préremplissage asynchrone (dernier email persisté) arrivé après le montage.
    useEffect(() => {
        if (initialEmail) setValue((current) => current || initialEmail);
    }, [initialEmail]);

    const canSubmit = value.trim().length > 0;

    return (
        <>
            <Text style={styles.title}>Associez cet écran</Text>
            <Text style={styles.instruction}>
                Saisissez l&apos;adresse email de votre compte <Text style={styles.instructionLink}>MedPlusTV</Text>,
                vous recevrez un lien pour associer cet écran.
            </Text>
            <TextInput
                value={value}
                onChangeText={setValue}
                onSubmitEditing={() => canSubmit && onSubmit(value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="prenom.nom@exemple.fr"
                placeholderTextColor="#8a93a5"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="done"
                hasTVPreferredFocus
                style={[styles.input, focused && styles.inputFocused]}
            />
            {error && <Text style={styles.inputError}>{error}</Text>}
            <View style={styles.buttonRow}>
                <TVButton variant="primary" label="Envoyer le lien" onPress={() => onSubmit(value)} disabled={!canSubmit} />
            </View>
        </>
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
        marginBottom: 32,
        maxWidth: 640,
        lineHeight: 28,
    },
    instructionLink: {
        color: '#0f3460',
        fontWeight: 'bold',
    },
    input: {
        width: 520,
        maxWidth: '100%',
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#0f3460',
        borderRadius: 10,
        paddingHorizontal: 20,
        paddingVertical: 14,
        fontSize: 22,
        color: '#0f3460',
        marginBottom: 12,
    },
    inputFocused: {
        borderWidth: 3,
        borderColor: '#e94560',
    },
    inputError: {
        fontSize: 16,
        color: '#e94560',
        marginBottom: 12,
    },
    polling: {
        marginBottom: 12,
    },
    waiting: {
        fontSize: 16,
        color: '#666',
        marginBottom: 24,
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
        marginTop: 8,
    },
});
