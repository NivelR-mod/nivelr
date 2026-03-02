import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { FadeInView } from '../components/FadeInView';
import { GradientScreen } from '../components/GradientScreen';
import { PremiumCard } from '../components/PremiumCard';
import { useAppContext } from '../state/AppContext';
import { colors } from '../ui/theme';

export function SessionsScreen(): JSX.Element {
  const { appState, deleteSession } = useAppContext();

  const onDelete = async (id: string): Promise<void> => {
    const result = await deleteSession(id);
    if (!result.ok) Alert.alert('Suppression', result.error ?? 'Erreur lors de la suppression');
  };

  return (
    <GradientScreen>
      <FadeInView>
        <PremiumCard>
          <Text style={styles.title}>Mes séances</Text>
          {appState.sessions.length === 0 ? <Text style={styles.empty}>Aucune séance enregistrée.</Text> : null}

          {appState.sessions.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.content}>
                <Text style={styles.name}>
                  {item.subtype} · {item.durationMin} min
                </Text>
                <Text style={styles.meta}>
                  {item.distanceKm ? `${item.distanceKm} km · ` : ''}+{item.xp} XP
                </Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
              <Pressable onPress={() => onDelete(item.id)}>
                <Text style={styles.delete}>Supprimer</Text>
              </Pressable>
            </View>
          ))}
        </PremiumCard>
      </FadeInView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  empty: { color: colors.muted, fontSize: 14 },
  row: {
    borderWidth: 1,
    borderColor: 'rgba(135,197,205,0.24)',
    borderRadius: 12,
    padding: 10,
    backgroundColor: 'rgba(12,20,30,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  content: { flex: 1, gap: 2 },
  name: { color: '#eef9fd', fontWeight: '800' },
  meta: { color: '#cae3ec', fontSize: 13 },
  date: { color: colors.muted, fontSize: 12 },
  delete: { color: colors.danger, fontWeight: '700' }
});
