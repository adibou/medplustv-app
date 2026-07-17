// Autorise `import x from './foo.mp4'` : le bundler Metro renvoie une référence
// d'asset (number) exploitable par expo-video / require().
declare module '*.mp4' {
    const asset: number;
    export default asset;
}

// Idem pour les images bundlées — Metro renvoie une référence utilisable comme
// source d'un composant `Image`.
declare module '*.png' {
    const asset: number;
    export default asset;
}
