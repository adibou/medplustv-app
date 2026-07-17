import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';

// Snapshot du matériel/OS/app envoyé au backend au moment du pairing (et utilisable
// pour d'autres logs). Toutes les valeurs sont brutes — on ne classifie pas côté TV,
// c'est le backoffice qui interprète (Fire TV vs Android TV vs Chromecast, etc.).
export interface DeviceInfo {
    platform: string;                     // 'android' | 'ios' | 'web'
    isTV: boolean;
    osName: string | null;                // 'Android', 'iOS', 'iPadOS', 'tvOS', 'Fire OS'
    osVersion: string | null;             // '13', '17.4', ...
    osBuildId: string | null;             // build interne OS
    deviceType: string;                   // 'PHONE' | 'TABLET' | 'TV' | 'DESKTOP' | 'UNKNOWN'
    brand: string | null;                 // 'Amazon', 'Google', 'Samsung', 'Apple'
    manufacturer: string | null;
    modelName: string | null;             // 'AFTM' (Fire TV), 'Chromecast', 'iPhone13,2'
    designName: string | null;
    productName: string | null;
    totalRamBytes: number | null;         // RAM totale (mémoire vive) de l'appareil
    freeDiskBytes: number | null;         // espace disque libre — dimensionne le cache/téléchargements
    totalDiskBytes: number | null;        // capacité disque totale
    isPhysicalDevice: boolean;            // false sur émulateur
    appVersion: string | null;            // ex '1.0.0'
    appBuildVersion: string | null;       // versionCode Android / CFBundleVersion iOS
    applicationId: string | null;         // 'com.ad1bou.medplustvapp'
}

// Table de correspondance des enums numériques d'expo-device vers des libellés lisibles.
const DEVICE_TYPE_LABEL: Record<number, string> = {
    [Device.DeviceType.PHONE]: 'PHONE',
    [Device.DeviceType.TABLET]: 'TABLET',
    [Device.DeviceType.TV]: 'TV',
    [Device.DeviceType.DESKTOP]: 'DESKTOP',
    [Device.DeviceType.UNKNOWN]: 'UNKNOWN',
};

export async function getDeviceInfo(): Promise<DeviceInfo> {
    // getDeviceTypeAsync est async car sur iOS il peut nécessiter un appel natif.
    // Les valeurs disque peuvent échouer (rare) : on capture pour ne pas planter tout le payload.
    const [deviceTypeEnum, freeDiskBytes, totalDiskBytes] = await Promise.all([
        Device.getDeviceTypeAsync(),
        FileSystem.getFreeDiskStorageAsync().catch(() => null),
        FileSystem.getTotalDiskCapacityAsync().catch(() => null),
    ]);
    return {
        platform: Platform.OS,
        isTV: Platform.isTV,
        osName: Device.osName,
        osVersion: Device.osVersion,
        osBuildId: Device.osBuildId,
        deviceType: DEVICE_TYPE_LABEL[deviceTypeEnum] ?? 'UNKNOWN',
        brand: Device.brand,
        manufacturer: Device.manufacturer,
        modelName: Device.modelName,
        designName: Device.designName,
        productName: Device.productName,
        totalRamBytes: Device.totalMemory,
        freeDiskBytes,
        totalDiskBytes,
        isPhysicalDevice: Device.isDevice,
        appVersion: Application.nativeApplicationVersion,
        appBuildVersion: Application.nativeBuildVersion,
        applicationId: Application.applicationId,
    };
}
