# Synchronisation vidéos & slides

Doc de cadrage avant durcissement. Objectif : que la sync soit **robuste** (reprise après erreur, jamais de disque plein qui casse l'app) et **auditable** (logs clairs début/fin + par item).

---

## 1. État actuel

### Ce qui existe

Implémentation actuelle dans [src/shared/video-downloader.ts](../src/shared/video-downloader.ts), déclenchée depuis [MenuScreen](../src/screens/menu/MenuScreen.tsx) via `handleSync`.

Flux :

1. `GET /displays/loop` (header `x-api-key`) → `LoopItem[]`
2. `storeLoopItems(items)` en AsyncStorage
3. `syncVideos(items, apiKey, onProgress)` :
   - `ensureVideoDir()` — crée `documentDirectory/videos/` si absent
   - filtre les items `type === 'video'`
   - **purge** : pour chaque entrée de `videoIndex` dont l'`id` n'est plus dans la playlist → `FileSystem.deleteAsync` + suppression de l'entrée d'index
   - **identifie les manquants** : pour chaque vidéo de la playlist, si absente de l'index OU si le fichier local n'existe pas/est vide → à télécharger
   - **télécharge séquentiellement** : `FileSystem.downloadAsync(streamUrl, localUri, { headers })`
   - persiste `videoIndex` **après chaque fichier** (résiste aux coupures)

### Storage local

- Fichiers : `documentDirectory/videos/{id}.mp4`
- Index : AsyncStorage clé `medplustv_video_index`, shape `Record<number, string>` (id → localUri)
- Playlist : AsyncStorage clé `medplustv_loop_items`, shape `LoopItem[]`

---

## 2. Limites actuelles

### Bloquants pour la v1

- **Pas de contrôle d'espace disque** — un `downloadAsync` sur disque plein throw, mais on n'a aucun garde-fou avant d'attaquer une sync qui va faire 5 GB.
- **Pas de retry / arrêt à la première erreur** — un timeout réseau sur la vidéo n°3/20 fait perdre les 17 restantes.
- **Purge best-effort silencieuse** — le `try {} catch {}` sur `deleteAsync` peut laisser des fichiers orphelins qui bouffent le disque sans qu'on le sache.
- **Aucun log structuré** — un `console.error` implicite au mieux. Impossible à débugger en prod sur un écran chez un client.
- **Pas de scan des orphelins réels** — on purge selon l'index, mais si l'index est corrompu / partiellement écrit, des `.mp4` peuvent traîner hors index et ne jamais être nettoyés.
- **Slides pas gérés du tout** — le player filtre `type === 'video'`. Voir §4.

### Non-bloquants v1 (à noter)

- Endpoints backend actuellement appelés par l'app **ne matchent pas ceux exposés** par [medplustv-api](../../medplustv-api) : `/displays/loop`, `/displays/request-code`, `/displays/poll`, `/videos/:id/stream` n'existent pas côté API (qui a `/pairing/request|status|confirm`, `/displays/:id/unpair`, `/videos/:id/file`). À réconcilier avant le ship.
- Pas de reprise de download interrompu (`createDownloadResumable` d'`expo-file-system` existe mais n'est pas utilisé).
- Pas de check `Content-Length` avant download — impossible d'anticiper la place nécessaire.

---

## 3. Cible

### Objectifs

1. **Ne jamais planter par manque d'espace.** Contrôle avant chaque download + refus explicite si insuffisant.
2. **Toujours pouvoir rejouer une sync partielle.** Reprise idempotente : re-lancer une sync qui a échoué reprend juste ce qui manque.
3. **Traçabilité.** Logs structurés début/fin + par item. Un client qui a un écran cassé doit pouvoir nous envoyer un dump lisible.
4. **Nettoyage garanti.** Ce qui n'est plus dans la playlist disparaît réellement du disque. Ce qui est orphelin sur disque (hors index) est traqué et supprimé.

### Non-objectifs (v1)

- Téléchargement parallèle multi-fichiers (séquentiel = simple = suffisant sur un écran TV).
- Reprise inter-session d'un download partiel via `DownloadResumable` (à considérer v2).
- Delta binaire / patching (téléchargement complet à chaque changement de fichier).

---

## 4. Cas des slides

Une slide est un **contenu JSON + layout** (voir [medplustv-api slides readme](../../medplustv-api/src/slides/readme.md)), pas un binaire à télécharger.

Ce qu'il faut synchroniser pour une slide :

- Le `layoutKey` + le `content` (JSON, quelques Ko max) → stockage AsyncStorage directement.
- **Les assets images référencés** dans `content` (`{ kind: 'asset', id: number }`) → à télécharger comme des fichiers.

Proposition de shape stockée localement :

```ts
// AsyncStorage: medplustv_slides_content = Record<number, SlideSnapshot>
type SlideSnapshot = {
    id: number;
    layoutKey: string;
    content: Record<string, unknown>;  // valeurs des zones
    durationInMs: number;
};

// documentDirectory/assets/{id}.{ext}
// AsyncStorage: medplustv_asset_index = Record<number, { localUri: string; contentHash?: string }>
```

Le rendu côté app (à faire dans un futur `SlideScreen` / composant `SlideRenderer`) prend un `SlideSnapshot` + résout les `asset.id` via `asset_index` pour afficher les images en local.

**Ordre de sync recommandé :** vidéos puis slides puis assets d'images, dans une même passe orchestrée. Un échec sur une slide n'empêche pas les vidéos qui ont réussi de tourner.

**API attendue côté backend (à confirmer) :**
- Playlist actuellement retournée doit inclure les slides avec leur `content` complet OU un endpoint dédié `GET /displays/slides` pour éviter d'alourdir `/loop`.
- Assets accessibles via `GET /assets/:id/file` (à créer).

---

## 5. Design proposé pour la nouvelle sync

### 5.1. Pré-flight

Avant d'ouvrir la première connexion :

1. Récupérer la playlist (`getDisplayLoop`).
2. Calculer la **liste des items à télécharger** (vidéos + assets slides absents/vides).
3. Récupérer, pour chaque item à télécharger, sa **taille estimée** :
   - Idéalement via un champ `fileSizeBytes` sur `LoopItem` renvoyé par l'API (à ajouter côté backend).
   - Fallback : requête `HEAD` sur l'URL de stream pour lire `Content-Length`.
4. `getFreeDiskStorageAsync()` → espace libre du device.
5. Estimer `spaceNeeded = sum(itemsToDownload.size) + marge de sécurité (ex: 200 MB)`.
6. Si `spaceNeeded > spaceFree` → **abandon** avant tout download, log d'erreur explicite, message UI actionnable ("libérez X MB").

### 5.2. Purge

Faire la purge **avant** les téléchargements (pour libérer de la place utile) :

1. **Purge selon index** : entrées d'`videoIndex` / `assetIndex` dont l'id n'est plus dans la playlist → `deleteAsync` + retrait de l'index. Erreur de delete → log warn mais on continue.
2. **Purge orphelins** : `readDirectoryAsync(videoDir)` → tout fichier dont le nom (`{id}.mp4`) ne correspond à aucune entrée d'index actuelle → `deleteAsync`. Idem pour `assetDir`.
3. Persister l'index nettoyé.
4. Relire l'espace libre après purge (les téléchargements se basent sur cette valeur à jour).

### 5.3. Téléchargement

Séquentiel, item par item :

1. Avant chaque download : re-check `getFreeDiskStorageAsync() >= itemSize + marge`. Si faux → abort, marquer l'item en erreur, log et sortir de la boucle (les items suivants seraient aussi condamnés).
2. `FileSystem.downloadAsync(url, localUri, { headers })`.
3. Sur succès : vérifier `getInfoAsync(localUri).size > 0`, ajouter à l'index, `setVideoIndex(index)` (persist).
4. Sur échec : **retry avec backoff** (ex: 3 tentatives, 2s / 5s / 15s). Après échec définitif → log error, item marqué en erreur mais on **continue** les items suivants.
5. Log de fin d'item avec taille effective + durée + espace restant.

### 5.4. Post-flight

- Log résumé de sync (compteurs, espace consommé, durée totale).
- Retourner à l'appelant un objet `SyncReport` avec `{ succeeded, failed, skipped, totalBytesDownloaded, finalFreeBytes }` — utilisable par l'UI pour un feedback détaillé.

---

## 6. Logs

### Principes

- Toujours **structuré** (objet JSON), pas de texte libre concaténé.
- Un logger léger `src/shared/logger.ts` : wrappe `console.log`/`warn`/`error` en ajoutant `timestamp` + `event` + payload. Pas de dépendance externe (on n'est pas sur du server).
- En v1 : sortie console. En v2 : POST batch vers un endpoint API `/logs` pour remontée serveur.
- Formater les tailles en MB dans les logs pour la lisibilité (helper `formatMB(bytes)`).

### Événements à émettre

| Event                   | Quand                              | Payload                                                                                                                    |
|-------------------------|------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| `sync.start`            | Début de sync                      | `{ toDownload: number, alreadyLocal: number, toPurge: number, estimatedBytes, freeBytesBefore, totalCapacityBytes }`       |
| `sync.purge.item`       | Chaque fichier purgé               | `{ id, kind: 'video'|'asset', bytes, ok: boolean, error? }`                                                                |
| `sync.purge.done`       | Fin de phase de purge              | `{ purgedCount, freedBytes, freeBytesAfterPurge }`                                                                         |
| `sync.item.start`       | Début download d'un item           | `{ id, kind, index, total, estimatedBytes, freeBytesBefore }`                                                              |
| `sync.item.done`        | Fin download OK                    | `{ id, kind, bytes, durationMs, freeBytesAfter }`                                                                          |
| `sync.item.retry`       | Retry après échec                  | `{ id, kind, attempt, maxAttempts, delayMs, reason }`                                                                      |
| `sync.item.failed`      | Échec définitif                    | `{ id, kind, attempts, reason }`                                                                                           |
| `sync.aborted`          | Sync coupée (espace / réseau fatal)| `{ reason, itemsCompleted, itemsRemaining, freeBytes }`                                                                    |
| `sync.done`             | Fin de sync (OK ou partielle)      | `{ succeeded, failed, skipped, totalBytesDownloaded, durationMs, freeBytesAfter, freeBytesBefore }`                        |

### Exemple

```
[2026-07-15T14:22:03.211Z] sync.start { toDownload: 8, alreadyLocal: 12, toPurge: 3, estimatedBytes: 640000000, freeBytesBefore: 4200000000, totalCapacityBytes: 32000000000 }
[2026-07-15T14:22:03.412Z] sync.purge.done { purgedCount: 3, freedBytes: 180000000, freeBytesAfterPurge: 4380000000 }
[2026-07-15T14:22:03.500Z] sync.item.start { id: 42, kind: 'video', index: 1, total: 8, estimatedBytes: 80000000, freeBytesBefore: 4380000000 }
[2026-07-15T14:22:11.902Z] sync.item.done { id: 42, kind: 'video', bytes: 79881234, durationMs: 8402, freeBytesAfter: 4300118766 }
...
[2026-07-15T14:24:15.033Z] sync.done { succeeded: 8, failed: 0, skipped: 0, totalBytesDownloaded: 635000000, durationMs: 132000, freeBytesAfter: 3745000000, freeBytesBefore: 4200000000 }
```

---

## 7. Espace disque — règles

- **Marge de sécurité** : garder toujours au moins **200 MB libres** post-sync. À ajuster selon retour terrain (les slides peuvent avoir besoin de buffer pour les décoder).
- **Estimation vs réel** : si `Content-Length` diverge fortement de la taille réelle après download, log warn et se baser sur la taille réelle pour la suite.
- **Panic si `freeBytes < marge` en cours de sync** : arrêt immédiat de la boucle, `sync.aborted`. Ne pas essayer d'être malin.
- **Cache vs Document** : on utilise `documentDirectory` (les vidéos doivent survivre au nettoyage système). Ne pas basculer sur `cacheDirectory` — le système peut vider quand il veut.

---

## 8. Ordre de mise en œuvre suggéré (v1)

Étapes indépendantes qu'on peut découper en petits PR :

1. **Logger structuré** (`src/shared/logger.ts`) + helper `formatBytes`.
2. **Réconcilier les endpoints** app ↔ API (`/videos/:id/file` vs `/stream`, `/pairing/*` vs `/displays/*`). C'est le prérequis à toute sync qui marche vraiment.
3. **Refonte `syncVideos` en `syncMedia`** avec les phases pré-flight / purge / download / post-flight + tous les logs listés en §6.
4. **Contrôle d'espace disque** : pré-flight + check avant chaque item.
5. **Purge orphelins** (fichiers hors index) en début de sync.
6. **Retry avec backoff** sur download.
7. **UI MenuScreen** : afficher `SyncReport` retourné (succeeded / failed / espace consommé) au lieu du simple compteur actuel.

Slides + assets : à ajouter dans un deuxième temps une fois le socle vidéo stable, en réutilisant le même orchestrateur (`syncMedia` prend `videos + slides + assets`).

---

## 9. Points ouverts

- Backend renvoie-t-il `fileSizeBytes` dans `LoopItem` ? Sinon prévoir soit un ajout API, soit un `HEAD` (préférable de l'avoir server-side, ça évite N requêtes réseau au pré-flight).
- Comment gère-t-on un display dont le disque est trop petit pour la playlist totale ? Fail complet OU sync partielle "on prend ce qu'on peut" ?
- Y a-t-il une notion de **priorité** dans la playlist (télécharger les premiers items d'abord pour pouvoir commencer à jouer avant la fin de la sync) ?
- Faut-il un mécanisme de sync **automatique périodique** (ex: toutes les nuits) ou reste-t-on sur du manuel via le menu ?
