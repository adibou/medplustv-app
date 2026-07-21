import { AppBootstrap } from './src/components/AppBootstrap';
import { AuthProvider } from './src/contexts/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
    return (
        <AppBootstrap>
            <AuthProvider>
                <RootNavigator />
            </AuthProvider>
        </AppBootstrap>
    );
}
