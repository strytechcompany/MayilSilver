import React, { useState, useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../context/AuthContext';

// Import Screens
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import B2BCalculationPage from '../screens/B2BCalculationPage';
import WorkListPage from '../screens/WorkListPage';
import GSTCustomerPage from '../screens/GSTCustomerPage';
import SettingsPage from '../screens/SettingsPage';
import GSTSettingsPage from '../screens/GSTSettingsPage';
import BillHistoryPage from '../screens/BillHistoryPage';
import MiniStatementPage from '../screens/MiniStatementPage';
import CustomerDataListPage from '../screens/CustomerDataListPage';
import BillPreviewPage from '../screens/BillPreviewPage';
import ReportScreen from '../screens/ReportScreen';
import GstBillpreview from '../screens/GstBillpreview';
import GstBillhistory from '../screens/GstBillhistory';
import KadaiProfilePage from '../screens/KadaiProfilePage';
import AppPreferencesPage from '../screens/AppPreferencesPage';
import ProfileSettingPage from '../screens/ProfileSettingPage';
import DailyExpense from '../screens/DailyExpense';
import KadaiDocument from '../screens/KadaiDocument';
import PaymentPage from '../screens/PaymentPage';
import PaymentHistoryPage from '../screens/PaymentHistoryPage';
import PaymentBillPreviewPage from '../screens/PaymentBillPreviewPage';

const AuthStack = createStackNavigator();
const HomeStack = createStackNavigator();

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
  </AuthStack.Navigator>
);

const MainNavigator = () => (
  <HomeStack.Navigator 
    screenOptions={{
      headerStyle: {
        backgroundColor: '#1E3A8A',
      },
      headerTintColor: '#fff',
      headerTitleStyle: {
        fontWeight: 'bold',
      },
    }}
  >
    <HomeStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
    <HomeStack.Screen name="B2BCalculation" component={B2BCalculationPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="WorkList" component={WorkListPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="GSTCustomer" component={GSTCustomerPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="Settings" component={SettingsPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="GSTSettings" component={GSTSettingsPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="BillHistory" component={BillHistoryPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="MiniStatement" component={MiniStatementPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="CustomerDataList" component={CustomerDataListPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="BillPreview" component={BillPreviewPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="GSTBillPreview" component={GstBillpreview} options={{ headerShown: false }} />
    <HomeStack.Screen name="GSTBillHistory" component={GstBillhistory} options={{ headerShown: false }} />
    <HomeStack.Screen name="Report" component={ReportScreen} options={{ headerShown: false }} />
    <HomeStack.Screen name="KadaiProfile" component={KadaiProfilePage} options={{ headerShown: false }} />
    <HomeStack.Screen name="AppPreferences" component={AppPreferencesPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="ProfileSettings" component={ProfileSettingPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="DailyExpense" component={DailyExpense} options={{ headerShown: false }} />
    <HomeStack.Screen name="KadaiDocument" component={KadaiDocument} options={{ headerShown: false }} />
    <HomeStack.Screen name="Payment" component={PaymentPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="PaymentHistory" component={PaymentHistoryPage} options={{ headerShown: false }} />
    <HomeStack.Screen name="PaymentBillPreview" component={PaymentBillPreviewPage} options={{ headerShown: false }} />
  </HomeStack.Navigator>
);

const AppNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [gstBillEnabled, setGstBillEnabled] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const results = await AsyncStorage.multiGet([
          'isLoggedIn',
          'gstBillEnabled',
          'userRole',
          'userId',
          'userEmail',
          'userName',
        ]);
        setIsLoggedIn(results[0][1] === 'true');
        setGstBillEnabled(results[1][1] !== 'false');
        setIsAdmin(results[2][1] === 'admin');
        if (results[0][1] === 'true') {
          setCurrentUser({
            userId: results[3][1] || '',
            email: results[4][1] || '',
            userName: results[5][1] || '',
            role: results[2][1] || 'user',
          });
        }
      } catch (e) {
        console.error('Failed to load login status', e);
      } finally {
        setIsLoading(false);
      }
    };
    checkLoginStatus();
  }, []);

  const authContext = React.useMemo(() => ({
    login: async (session = {}) => {
      try {
        const {
          gstBillEnabled: nextGstEnabled = true,
          role = 'user',
          userId = '',
          email = '',
          userName = '',
        } = session || {};
        await AsyncStorage.multiSet([
          ['isLoggedIn', 'true'],
          ['gstBillEnabled', String(nextGstEnabled)],
          ['userRole', role],
          ['userId', userId],
          ['userEmail', email],
          ['userName', userName],
        ]);
        setIsLoggedIn(true);
        setGstBillEnabled(nextGstEnabled);
        setIsAdmin(role === 'admin');
        setCurrentUser({ userId, email, userName, role });
      } catch (e) {
        console.error('Failed to save login status', e);
      }
    },
    updateCurrentUser: async (updates = {}) => {
      try {
        setCurrentUser((prev) => {
          const next = { ...(prev || {}), ...updates };
          AsyncStorage.multiSet([
            ['userId', next.userId || ''],
            ['userEmail', next.email || ''],
            ['userName', next.userName || ''],
            ['userRole', next.role || 'user'],
          ]).catch(() => {});
          return next;
        });
      } catch (e) {
        console.error('Failed to update current user', e);
      }
    },
    logout: async () => {
      try {
        await AsyncStorage.multiRemove(['isLoggedIn', 'gstBillEnabled', 'userRole', 'userId', 'userEmail', 'userName']);
        setIsLoggedIn(false);
        setGstBillEnabled(true);
        setIsAdmin(false);
        setCurrentUser(null);
      } catch (e) {
        console.error('Failed to remove login status', e);
      }
    },
    gstBillEnabled,
    isAdmin,
    currentUser,
  }), [gstBillEnabled, isAdmin, currentUser]);

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <AuthContext.Provider value={authContext}>
      <NavigationContainer>
        {isLoggedIn ? <MainNavigator /> : <AuthNavigator />}
      </NavigationContainer>
    </AuthContext.Provider>
  );
};

export default AppNavigator;
