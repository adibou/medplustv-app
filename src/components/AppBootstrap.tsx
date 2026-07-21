import { ReactNode } from 'react';
import { useAutomaticUpdates } from '../hooks/useAutomaticUpdates';

type AppBootstrapProps = {
    children: ReactNode;
};

export function AppBootstrap({ children }: AppBootstrapProps) {
    useAutomaticUpdates();
    return children;
}
