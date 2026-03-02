import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AppProvider, useAppContext } from './src/state/AppContext';
import { supabaseReady } from './src/lib/supabase';
import { colors } from './src/ui/theme';

export default function App(): JSX.Element {
  if (!supabaseReady) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="light" />
        <Text style={styles.title}>NIVELR Mobile</Text>
        <Text style={styles.text}>Configure EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY.</Text>
      </SafeAreaView>
    );
  }

  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

function AppShell(): JSX.Element {
  const { loading } = useAppContext();

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
    gap: 10
  },
  title: { color: colors.text, fontWeight: '900', fontSize: 30 },
  text: { color: colors.muted, textAlign: 'center' }
});
