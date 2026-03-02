import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FadeInView } from '../components/FadeInView';
import { GradientScreen } from '../components/GradientScreen';
import { PremiumCard } from '../components/PremiumCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAppContext } from '../state/AppContext';
import { SessionInput, SessionSubtype, SportType } from '../types/models';
import { colors } from '../ui/theme';

const DEFAULT_FORM: SessionInput = {
  sportType: 'RUNNING',
  subtype: 'EF',
  durationMin: 45,
  distanceKm: 8,
  feelings: { feltState: 3, rpe: 5, fatigue: 3 },
  comment: ''
};

export function AddSessionScreen(): JSX.Element {
  const { addSession } = useAppContext();
  const [form, setForm] = useState<SessionInput>(DEFAULT_FORM);
  const [busy, setBusy] = useState(false);

  const subtypes = useMemo(
    () =>
      (form.sportType === 'RUNNING'
        ? ['EF', 'SEUIL', 'VMA', 'SORTIE_LONGUE']
        : ['RENFO', 'VELO', 'NATATION', 'MOBILITE']) as SessionSubtype[],
    [form.sportType]
  );

  const onSubmit = async (): Promise<void> => {
    const duration = Number(form.durationMin);
    const distance = Number(form.distanceKm ?? 0);

    if (!Number.isFinite(duration) || duration <= 0) {
      Alert.alert('Validation', 'Durée invalide.');
      return;
    }

    if (form.sportType === 'RUNNING' && (!Number.isFinite(distance) || distance <= 0)) {
      Alert.alert('Validation', 'Distance requise pour RUNNING.');
      return;
    }

    setBusy(true);
    const result = await addSession({
      ...form,
      durationMin: Math.round(duration),
      distanceKm: form.sportType === 'RUNNING' ? Number(distance.toFixed(2)) : undefined
    });
    setBusy(false);

    if (!result.ok) {
      Alert.alert('Synchronisation', result.error ?? 'Erreur lors de la sauvegarde cloud.');
      return;
    }

    Alert.alert('Séance ajoutée', 'La séance a été sauvegardée en local et dans le cloud.');
    setForm(DEFAULT_FORM);
  };

  return (
    <GradientScreen>
      <FadeInView>
        <PremiumCard>
          <Text style={styles.title}>Nouvelle séance</Text>

          <Text style={styles.label}>Sport</Text>
          <View style={styles.rowWrap}>
            {(['RUNNING', 'OTHER'] as SportType[]).map((sport) => (
              <Chip
                key={sport}
                active={form.sportType === sport}
                label={sport}
                onPress={() => setForm((prev) => ({ ...prev, sportType: sport, subtype: sport === 'RUNNING' ? 'EF' : 'RENFO' }))}
              />
            ))}
          </View>

          <Text style={styles.label}>Type de séance</Text>
          <View style={styles.rowWrap}>
            {subtypes.map((sub) => (
              <Chip
                key={sub}
                active={form.subtype === sub}
                label={sub}
                onPress={() => setForm((prev) => ({ ...prev, subtype: sub }))}
              />
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={String(form.durationMin)}
            onChangeText={(value) => setForm((prev) => ({ ...prev, durationMin: Number(value) || 0 }))}
            keyboardType="numeric"
            placeholder="Durée (min)"
            placeholderTextColor="#7d95a4"
          />

          <TextInput
            style={styles.input}
            value={String(form.distanceKm ?? '')}
            onChangeText={(value) => setForm((prev) => ({ ...prev, distanceKm: Number(value) || 0 }))}
            keyboardType="decimal-pad"
            placeholder="Distance (km)"
            placeholderTextColor="#7d95a4"
            editable={form.sportType === 'RUNNING'}
          />

          <TextInput
            style={styles.input}
            value={String(form.feelings.rpe)}
            onChangeText={(value) =>
              setForm((prev) => ({
                ...prev,
                feelings: {
                  ...prev.feelings,
                  rpe: Math.max(1, Math.min(10, Number(value) || 1))
                }
              }))
            }
            keyboardType="numeric"
            placeholder="RPE (1-10)"
            placeholderTextColor="#7d95a4"
          />

          <PrimaryButton label="Valider la séance" onPress={onSubmit} loading={busy} />
        </PremiumCard>
      </FadeInView>
    </GradientScreen>
  );
}

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function Chip({ label, active, onPress }: ChipProps): JSX.Element {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  label: { color: '#c4dee9', fontWeight: '700', fontSize: 13, marginTop: 2 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    color: colors.text,
    backgroundColor: 'rgba(10,18,28,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16
  },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(136,196,204,0.35)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  chipActive: { borderColor: '#f4c071', backgroundColor: 'rgba(244,177,92,0.2)' },
  chipText: { color: '#e8f6fb', fontWeight: '700', fontSize: 12 }
});
