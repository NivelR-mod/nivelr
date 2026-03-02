import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AuthScreen } from '../screens/AuthScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { AddSessionScreen } from '../screens/AddSessionScreen';
import { SessionsScreen } from '../screens/SessionsScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RunnerAssessmentScreen } from '../screens/RunnerAssessmentScreen';
import { useAppContext } from '../state/AppContext';
import { colors } from '../ui/theme';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  RunnerAssessment: undefined;
};

export type MainTabsParamList = {
  Home: undefined;
  Add: undefined;
  Sessions: undefined;
  Stats: undefined;
  Profile: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();

function MainTabsNavigator(): JSX.Element {
  return (
    <Tabs.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#ecfbff',
        tabBarInactiveTintColor: '#89a6b7',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: 'rgba(123,198,214,0.24)',
          backgroundColor: '#0a1422',
          height: 64,
          paddingTop: 6,
          paddingBottom: 8
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color, focused }) => (
          <Text style={{ color, fontSize: focused ? 17 : 15 }}>{iconForRoute(route.name)}</Text>
        )
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: 'Accueil' }} />
      <Tabs.Screen name="Add" component={AddSessionScreen} options={{ title: 'Ajouter' }} />
      <Tabs.Screen name="Sessions" component={SessionsScreen} options={{ title: 'Séances' }} />
      <Tabs.Screen name="Stats" component={StatsScreen} options={{ title: 'Stats' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tabs.Navigator>
  );
}

function iconForRoute(name: keyof MainTabsParamList): string {
  switch (name) {
    case 'Home':
      return '⌂';
    case 'Add':
      return '⊕';
    case 'Sessions':
      return '◍';
    case 'Stats':
      return '◫';
    case 'Profile':
      return '◎';
    default:
      return '•';
  }
}

const appTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: '#0a1422',
    primary: colors.accent,
    text: colors.text,
    border: 'rgba(131, 214, 220, 0.26)'
  }
};

export function AppNavigator(): JSX.Element {
  const { session, runnerAssessment, stateHydrated } = useAppContext();
  const needsAssessment = !runnerAssessment;

  if (session && !stateHydrated) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={appTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <RootStack.Screen name="Auth" component={AuthScreen} />
        ) : needsAssessment ? (
          <RootStack.Screen name="RunnerAssessment" component={RunnerAssessmentScreen} />
        ) : (
          <>
            <RootStack.Screen name="Main" component={MainTabsNavigator} />
            <RootStack.Screen name="RunnerAssessment" component={RunnerAssessmentScreen} />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg
  }
});
