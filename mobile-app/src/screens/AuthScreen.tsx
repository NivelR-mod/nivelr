import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { FadeInView } from '../components/FadeInView';
import { GradientScreen } from '../components/GradientScreen';
import { PremiumCard } from '../components/PremiumCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAppContext } from '../state/AppContext';
import { colors } from '../ui/theme';

export function AuthScreen(): JSX.Element {
  const { signIn, signUp } = useAppContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSignIn = async (): Promise<void> => {
    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);
    if (!result.ok) Alert.alert('Connexion', result.error ?? 'Erreur inconnue');
  };

  const onSignUp = async (): Promise<void> => {
    setBusy(true);
    const result = await signUp(email, password);
    setBusy(false);
    if (!result.ok) {
      Alert.alert('Inscription', result.error ?? 'Erreur inconnue');
      return;
    }
    Alert.alert('Inscription', 'Compte créé. Connecte-toi maintenant.');
  };

  return (
    <GradientScreen scrollable={false}>
      <View style={styles.wrap}>
        <FadeInView>
          <PremiumCard style={styles.card}>
            <Text style={styles.brand}>NIVELR</Text>
            <Text style={styles.subtitle}>Train. Track. Earn Your Level.</Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#7d95a4"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Mot de passe"
              placeholderTextColor="#7d95a4"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <View style={styles.row}>
              <View style={styles.button}>
                <PrimaryButton label="Connexion" onPress={onSignIn} loading={busy} />
              </View>
              <View style={styles.button}>
                <PrimaryButton label="Inscription" onPress={onSignUp} variant="secondary" loading={busy} />
              </View>
            </View>
          </PremiumCard>
        </FadeInView>
      </View>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 16 },
  card: { width: '100%' },
  brand: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: 1.2 },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    color: colors.text,
    backgroundColor: 'rgba(5, 12, 20, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16
  },
  row: { flexDirection: 'row', gap: 10 },
  button: { flex: 1 }
});
