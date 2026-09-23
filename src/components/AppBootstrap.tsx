import { ReactNode } from 'react';
import { useKeepAwake } from 'expo-keep-awake';
import { useAutomaticUpdates } from '../hooks/useAutomaticUpdates';

type AppBootstrapProps = {
    children: ReactNode;
};

export function AppBootstrap({ children }: AppBootstrapProps) {
    // Affichage en borne : l'écran ne doit jamais s'éteindre ni partir en veille.
    // expo-video ne tient l'écran allumé que pendant la lecture d'une vidéo, donc
    // les slides (images) laissaient le système atteindre son timeout d'inactivité.
    useKeepAwake();
    useAutomaticUpdates();
    return children;
}
