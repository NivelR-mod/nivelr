import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../ui/theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}

export function PrimaryButton({ label, onPress, variant = 'primary', loading = false }: PrimaryButtonProps): JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed, loading && styles.disabled]}
      onPress={onPress}
      disabled={loading}
    >
      {loading ? <ActivityIndicator color="#e8fafd" size="small" /> : <Text style={styles.label}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 12
  },
  primary: { backgroundColor: '#11958f', borderColor: '#35c4bc' },
  secondary: { backgroundColor: '#1a2f4e', borderColor: '#577fbc' },
  ghost: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: colors.line },
  danger: { backgroundColor: '#692326', borderColor: '#dc7270' },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.74 },
  label: { color: '#e8fafd', fontWeight: '800', fontSize: 15 }
});
