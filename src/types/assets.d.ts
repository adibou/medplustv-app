// Autorise `import x from './foo.mp4'` : le bundler Metro renvoie une référence
// d'asset (number) exploitable par expo-video / require().
declare module '*.mp4' {
    const asset: number;
    export default asset;
}
