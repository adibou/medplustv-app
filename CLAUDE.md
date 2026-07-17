# medplustv-app

App **TV** (Android TV / Apple TV, aussi mobile/web) pour afficher la playlist vidéo d'un écran MedPlusTV. Expo 55, `react-native-tvos`, TypeScript, New Architecture activée.

Backend : voir le repo frère `medplustv-api` (Express 5 + Kysely). Backoffice : `medplustv-bo`.

## Commandes

- `npm start` — Expo dev server
- `npm run android` / `npm run ios` — build mobile
- `npm run prebuild:tv` — prebuild avec plugin TV (`EXPO_TV=1`) — **obligatoire avant `android`/`ios` pour cibler TV**
- `npm run prebuild` — prebuild sans TV
- `npm run lint` — ESLint via Expo
- Pas de typecheck script — utiliser `npx tsc --noEmit`
- Pas de tests

## Stack

- **Runtime** : `react-native@npm:react-native-tvos@0.83-stable` (fork officiel TV). L'`expo.install.exclude` empêche Expo de forcer un downgrade.
- **Navigation** : `@react-navigation/native-stack` v7 (screens natifs, mieux pour la TV que le stack JS)
- **Player** : `expo-video` (`useVideoPlayer` + `VideoView`). L'API `player.replace(uri)` + `player.play()` + listener `statusChange` pour enchaîner.
- **Storage** : `@react-native-async-storage/async-storage` (K/V) + `expo-file-system/legacy` (fichiers). L'API legacy est utilisée volontairement — la nouvelle API expo-file-system n'est pas encore adoptée ici.
- **Auth** : simple header `x-api-key` (format `{displayId}.{secret}`), stocké dans AsyncStorage.

## Architecture

```
src/
  api/
    endpoint.ts      # fetch wrappers vers l'API HTTP
    types.ts         # DTOs (LoopItem, PairPollResponse, etc.)
  contexts/
    AuthContext.tsx  # status: loading | unauthenticated | authenticated
  hooks/
    useDevicePairing.ts  # état machine du pairing (request → poll → paired/expired)
  navigation/
    RootNavigator.tsx    # switch Pairing ⇄ Main/Menu selon auth
  screens/
    PairingScreen.tsx    # affichage du code, feedback pairing
    MainScreen.tsx       # player fullscreen + overlay contrôles TV
    menu/
      MenuScreen.tsx     # test API, sync vidéos, dissociation
      components/MenuItem.tsx
  shared/
    storage.ts           # AsyncStorage helpers (apiKey, loopItems, videoIndex)
    video-downloader.ts  # syncVideos : télécharge/purge selon la playlist
```

## Flux clés

### Pairing (premier lancement)
1. `AuthContext` monte → check AsyncStorage → `unauthenticated` si vide
2. `PairingScreen` monte → `useDevicePairing` appelle `POST /displays/request-code` → affiche le code
3. Poll `POST /displays/poll` toutes les 5s. Trois issues : `pending` / `expired` (retry auto après 3s) / `paired` (retourne `apiKey`)
4. Sur `paired` → `authenticate(apiKey)` → stockage AsyncStorage → RootNavigator bascule sur `Main`

### Sync vidéos (depuis MenuScreen)
1. `GET /displays/loop` (header `x-api-key`) → liste `LoopItem[]`
2. `storeLoopItems(items)` en AsyncStorage
3. `syncVideos` :
   - purge les fichiers/entrées de l'index dont l'id n'est plus dans la playlist
   - télécharge les nouveaux via `GET /videos/:id/stream` dans `documentDirectory/videos/{id}.mp4`
   - persiste `videoIndex` (map `id → localUri`) **après chaque fichier** pour résister aux coupures

### Lecture (MainScreen)
- Charge `loopItems` + `videoIndex` depuis AsyncStorage (**pas d'appel API**, tout est local)
- Filtre `type === 'video' && index[id]` → construit `playlist`
- Joue en boucle : listener `statusChange==='idle'` → next (modulo)
- Overlay bas : `⏮ ⏸/▶ ⏭ ☰`. Focus TV via `TouchableHighlight`. `useTVEventHandler('select')` déclenche l'action focus courante (fallback pour les remotes qui ne mappent pas 'select' sur `onPress`).

## Conventions (NON DÉRIVABLES)

### Indentation
- **4 espaces** (pas 2). Cohérent dans tout le repo.

### Composants TV
- **Toujours** utiliser `TouchableHighlight` (pas `Pressable`) pour les éléments focusables sur TV — voir `MenuItem.tsx` et `TVButton` dans `MainScreen`.
- **Pattern focus** : chaque composant focusable expose `onFocusChange(focused, action)` que l'écran parent utilise pour piper vers `useTVEventHandler`. Ça permet au bouton `select` de la remote de déclencher l'action même si `onPress` ne fire pas.
- `hasTVPreferredFocus` sur **exactement un** bouton par écran (focus initial).
- `underlayColor` sur `TouchableHighlight` pour un feedback visuel au press.

### Refs pour le player
- `MainScreen` maintient `playlistRef` / `currentIndexRef` / `pausedRef` en parallèle du state React. **Ne pas retirer** — le listener `statusChange` d'`expo-video` capture les closures, il faut lire la valeur courante via ref, sinon on lit toujours l'index initial.

### API endpoint
- Toujours passer par `src/api/endpoint.ts` — pas de `fetch` sauvage ailleurs.
- `API_BASE_URL` = `EXPO_PUBLIC_API_BASE_URL` sinon `http://10.0.2.2:3001` sur Android (emu) ou `http://localhost:3001`.
- Le préfixe `EXPO_PUBLIC_` est requis pour que la var soit injectée dans le bundle Expo — noter que `.env` contient `NO_EXPO_PUBLIC_API_BASE_URL=...` volontairement désactivée.

### Storage
- Clés préfixées `medplustv_` (namespace).
- Toutes les helpers dans `shared/storage.ts` — ne pas appeler `AsyncStorage` directement depuis les screens.

### Types API
- `src/api/types.ts` doit rester synchro avec les DTOs backend (`medplustv-api/src/displays/displays.types.ts` et `videos/`).
- Si un champ change côté API, mettre à jour ici + toutes les utilisations.

### i18n
- Textes en **français** en dur. Pas encore d'i18n.

## Points à connaître

- **`expo-file-system/legacy`** : le legacy est utilisé volontairement. La nouvelle API (imports `expo-file-system`) a une surface différente — ne pas migrer sans discuter.
- **Aucun handling des `slide`** : le code filtre `type === 'video'`. Les slides existent dans le type `LoopItem` mais ne sont pas rendues.
- **Pairing polling** : intervalle 5s, pas de backoff. La cleanup se fait via `AppState` (arrêt du poll quand l'app passe en background).
- **Le `dissociateDisplay`** extrait le `displayId` en splittant l'apiKey sur `.` (format `{displayId}.{secret}`).

## Git

- Branche principale : `main`. Travail sur `dev`.
- Commits en **français**, style Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`).
