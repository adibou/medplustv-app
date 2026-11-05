// Vidéo en cours de lecture, partagée entre MainScreen (qui l'écrit) et la sync
// (qui la lit) : la purge ne doit jamais supprimer le fichier que le player est
// en train de lire, sinon ExoPlayer passe en erreur au prochain accès disque.
let currentVideoId: number | null = null;

export function setNowPlayingVideo(videoId: number | null): void {
    currentVideoId = videoId;
}

export function getNowPlayingVideo(): number | null {
    return currentVideoId;
}
