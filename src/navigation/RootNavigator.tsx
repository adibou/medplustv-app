import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import PairingScreen from '../screens/PairingScreen';
import PostPairingScreen from '../screens/PostPairingScreen';
import MainScreen from '../screens/MainScreen';
import MenuScreen from '../screens/menu/MenuScreen';

export type RootStackParamList = {
    Pairing: undefined;
    PostPairing: undefined;
    Main: undefined;
    Menu: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
    const { status } = useAuth();

    if (status === 'loading') {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator id="Root" screenOptions={{ headerShown: false }}>
                {status === 'unauthenticated' && (
                    <Stack.Screen name="Pairing" component={PairingScreen} />
                )}
                {status === 'onboarding' && (
                    <Stack.Screen name="PostPairing" component={PostPairingScreen} />
                )}
                {status === 'authenticated' && (
                    <>
                        <Stack.Screen name="Main" component={MainScreen} />
                        <Stack.Screen name="Menu" component={MenuScreen} />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    loading: {
        flex: 1,
        backgroundColor: '#1a1a2e',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
