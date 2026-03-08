import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useDevicePairing } from '../hooks/useDevicePairing';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL, apiStatus } from '../api/endpoint';

export default function PairingScreen() {
    const { phase, code, error, apiKey, restart } = useDevicePairing();
    const { authenticate } = useAuth();
    const [welcome, setWelcome] = React.useState('');

    useEffect(() => {
        if (phase === 'paired' && apiKey) {
            authenticate(apiKey);
        }
    }, [phase, apiKey, authenticate]);


    useEffect(() => {
        apiStatus().then(status => {
            setWelcome(`API status: ${status}`);
        }).catch(err => {
            setWelcome(`API status check failed: ${err.message}`);
        });
    }, []);


    return (
        <View style={styles.container}>
            <Text>Pas de token détecté sur cet appareil. On démarre la procédure d'association.</Text>
            <Text>API url : {API_BASE_URL}</Text>
            <Text>API key : {apiKey}</Text>
            <Text>{welcome}</Text>


            {(phase === 'idle' || phase === 'requesting') && (
                <>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.message}>Génération du code...</Text>
                </>
            )}

            {phase === 'displaying' && code && (
                <>
                    <Text style={styles.title}>Associez cet écran</Text>
                    <Text style={styles.instruction}>
                        Rendez-vous sur votre compte MedPlusTV et saisissez ce code :
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

            {phase === 'paired' && (
                <>
                    <ActivityIndicator size="large" color="#4CAF50" />
                    <Text style={styles.success}>Écran associé avec succès !</Text>
                </>
            )}

            {phase === 'error' && (
                <>
                    <Text style={styles.error}>{error}</Text>
                    <Pressable style={styles.retryButton} onPress={restart}>
                        <Text style={styles.retryText}>Réessayer</Text>
                    </Pressable>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 16,
    },
    instruction: {
        fontSize: 20,
        color: '#ccc',
        textAlign: 'center',
        marginBottom: 40,
        maxWidth: 600,
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
        color: '#fff',
        marginTop: 16,
    },
    success: {
        fontSize: 28,
        color: '#4CAF50',
        fontWeight: 'bold',
        marginTop: 16,
    },
    error: {
        fontSize: 20,
        color: '#e94560',
        textAlign: 'center',
        marginBottom: 24,
    },
    retryButton: {
        backgroundColor: '#0f3460',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 8,
    },
    retryText: {
        fontSize: 20,
        color: '#fff',
        fontWeight: 'bold',
    },
});
