import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';

// Identifie précisément le code qui tourne sur la TV : la version native seule ne
// suffit pas (elle reste à 1.0.0), c'est l'`updateId` EAS qui dit quel JS est
// chargé. Envoyé une fois par démarrage (log `app.start`).
export function getAppVersionInfo(): Record<string, unknown> {
    return {
        appVersion: Application.nativeApplicationVersion,
        appBuildVersion: Application.nativeBuildVersion,
        updateId: Updates.updateId,
        runtimeVersion: Updates.runtimeVersion,
        channel: Updates.channel,
        isEmbeddedLaunch: Updates.isEmbeddedLaunch,
        platform: Platform.OS,
        modelName: Device.modelName,
        osVersion: Device.osVersion,
    };
}
