import React, { useState, useEffect, useContext } from 'react';
import { Alert } from 'react-native';
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
import CustomerBillHistoryPage from '../screens/CustomerBillHistoryPage';
import B2BReportPage from '../screens/B2BReportPage';

const AuthStack = createStackNavigator();
const HomeStack = createStackNavigator();

// ── Old module key → granular key migration ───────────────────
// Workers saved with old 6-module keys still get access to their screens.
const OLD_MODULE_MIGRATION = {
  b2b:           ['b2b_calculation', 'customer_list', 'bill_history', 'mini_statement', 'b2b_reports'],
  gst:           ['gst_customer', 'gst_settings', 'gst_history'],
  payment:       ['payment', 'payment_history'],
  daily_expense: ['daily_expense'],
  kadai_document:['kadai_document'],
  settings:      ['settings'],
};

// Returns null (preserve legacy sentinel) or an expanded array that includes
// both the original keys AND their granular equivalents.
const expandPages = (pages) => {
  if (!Array.isArray(pages)) return null;
  const expanded = new Set(pages);
  pages.forEach((k) => {
    if (OLD_MODULE_MIGRATION[k]) OLD_MODULE_MIGRATION[k].forEach((gk) => expanded.add(gk));
  });
  return [...expanded];
};

// ── Permission guard HOC ──────────────────────────────────────
// IMPORTANT: call withPermission() at MODULE LEVEL only (not inside a render function).
// Calling it inside a component creates a new reference each render and breaks React Navigation.
//
// permKeys: string[] — user needs ANY one of these keys
//           null    — admin-only screen
const withPermission = (Component, permKeys) => {
  const PermissionWrapper = (props) => {
    const ctx = useContext(AuthContext) || {};
    const { isAdmin, allowedPages } = ctx;
    const expanded = expandPages(allowedPages);

    const allowed = (() => {
      if (isAdmin) return true;
      if (permKeys === null) return false;           // admin-only screen
      // expanded === null means the user has no permission record yet (legacy/pre-system user)
      // expanded === [] (empty array) means admin explicitly set zero pages → no access
      if (expanded === null || expanded === undefined) return true; // legacy: full access
      if (expanded.length === 0) return false;       // explicitly no pages granted
      return permKeys.some((k) => expanded.includes(k));
    })();

    useEffect(() => {
      if (!allowed) {
        Alert.alert(
          'Access Denied',
          'You do not have permission to access this page.',
          [{ text: 'OK', onPress: () => props.navigation.goBack() }],
        );
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!allowed) return null;
    return <Component {...props} />;
  };
  PermissionWrapper.displayName = `Perm(${Component.displayName || Component.name || '?'})`;
  return PermissionWrapper;
};

// ── Guarded screens — defined at MODULE LEVEL so references are stable ──────
//
// GRANULAR KEY MAPPING (must match WorkListPage PAGE_CATEGORIES page keys):
//   'b2b_calculation' → B2B Calculation screen
//   'customer_list'   → Customer Data List
//   'bill_history'    → Bill History
//   'mini_statement'  → Mini Statement
//   'b2b_reports'     → Reports
//   'gst_customer'    → GST Customer
//   'gst_settings'    → GST Settings
//   'gst_history'     → GST Bill History
//   'payment'         → Payment Entry
//   'payment_history' → Payment History
//   'daily_expense'   → Daily Expense
//   'kadai_document'  → Kadai Document
//   'settings'        → Settings
//
// Sub-screens (BillPreview, GSTBillPreview, PaymentBillPreview) accept multiple parent keys
// so navigating to a preview from any allowed list screen never triggers "Access Denied".
// Old module keys ('b2b', 'gst', etc.) are expanded by expandPages() for backward compat.

const GuardedB2BCalculation     = withPermission(B2BCalculationPage,    ['b2b_calculation']);
const GuardedCustomerDataList   = withPermission(CustomerDataListPage,   ['customer_list']);
const GuardedBillHistory        = withPermission(BillHistoryPage,        ['bill_history']);
const GuardedBillPreview        = withPermission(BillPreviewPage,        ['bill_history', 'b2b_calculation', 'customer_list']); // sub-screen
const GuardedMiniStatement      = withPermission(MiniStatementPage,      ['mini_statement']);
const GuardedReport             = withPermission(ReportScreen,           ['b2b_reports', 'gst_history']);
const GuardedB2BReport          = withPermission(B2BReportPage,          ['b2b_reports']);
const GuardedGSTCustomer        = withPermission(GSTCustomerPage,        ['gst_customer']);
const GuardedGSTBillPreview     = withPermission(GstBillpreview,         ['gst_customer', 'gst_history']); // sub-screen
const GuardedGSTBillHistory     = withPermission(GstBillhistory,         ['gst_history']);
const GuardedGSTSettings        = withPermission(GSTSettingsPage,        ['gst_settings']);
const GuardedPayment            = withPermission(PaymentPage,            ['payment']);
const GuardedPaymentHistory     = withPermission(PaymentHistoryPage,     ['payment_history']);
const GuardedPaymentBillPreview     = withPermission(PaymentBillPreviewPage,     ['payment', 'payment_history']); // sub-screen
const GuardedCustomerBillHistory    = withPermission(CustomerBillHistoryPage,    ['customer_list', 'bill_history']);
const GuardedDailyExpense       = withPermission(DailyExpense,           ['daily_expense']);
const GuardedKadaiDocument      = withPermission(KadaiDocument,          ['kadai_document']);
const GuardedSettings           = withPermission(SettingsPage,           ['settings']);
const GuardedWorkList           = withPermission(WorkListPage,           null); // admin-only
const GuardedKadaiProfile       = withPermission(KadaiProfilePage,       null); // admin-only
const GuardedAppPreferences     = withPermission(AppPreferencesPage,     null); // admin-only
const GuardedProfileSettings    = withPermission(ProfileSettingPage,     null); // admin-only

// ── Navigators ────────────────────────────────────────────────
const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
  </AuthStack.Navigator>
);

const noHeader = { headerShown: false };

const MainNavigator = () => (
  <HomeStack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: '#1E3A8A' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
    }}
  >
    <HomeStack.Screen name="Home"               component={HomeScreen}                options={noHeader} />
    <HomeStack.Screen name="B2BCalculation"     component={GuardedB2BCalculation}     options={noHeader} />
    <HomeStack.Screen name="CustomerDataList"   component={GuardedCustomerDataList}   options={noHeader} />
    <HomeStack.Screen name="BillHistory"        component={GuardedBillHistory}        options={noHeader} />
    <HomeStack.Screen name="BillPreview"        component={GuardedBillPreview}        options={noHeader} />
    <HomeStack.Screen name="MiniStatement"      component={GuardedMiniStatement}      options={noHeader} />
    <HomeStack.Screen name="Report"             component={GuardedReport}             options={noHeader} />
    <HomeStack.Screen name="B2BReport"          component={GuardedB2BReport}          options={noHeader} />
    <HomeStack.Screen name="GSTCustomer"        component={GuardedGSTCustomer}        options={noHeader} />
    <HomeStack.Screen name="GSTBillPreview"     component={GuardedGSTBillPreview}     options={noHeader} />
    <HomeStack.Screen name="GSTBillHistory"     component={GuardedGSTBillHistory}     options={noHeader} />
    <HomeStack.Screen name="GSTSettings"        component={GuardedGSTSettings}        options={noHeader} />
    <HomeStack.Screen name="Payment"            component={GuardedPayment}            options={noHeader} />
    <HomeStack.Screen name="PaymentHistory"     component={GuardedPaymentHistory}     options={noHeader} />
    <HomeStack.Screen name="PaymentBillPreview"  component={GuardedPaymentBillPreview}  options={noHeader} />
    <HomeStack.Screen name="CustomerBillHistory" component={GuardedCustomerBillHistory} options={noHeader} />
    <HomeStack.Screen name="DailyExpense"       component={GuardedDailyExpense}       options={noHeader} />
    <HomeStack.Screen name="KadaiDocument"      component={GuardedKadaiDocument}      options={noHeader} />
    <HomeStack.Screen name="Settings"           component={GuardedSettings}           options={noHeader} />
    <HomeStack.Screen name="WorkList"           component={GuardedWorkList}           options={noHeader} />
    <HomeStack.Screen name="KadaiProfile"       component={GuardedKadaiProfile}       options={noHeader} />
    <HomeStack.Screen name="AppPreferences"     component={GuardedAppPreferences}     options={noHeader} />
    <HomeStack.Screen name="ProfileSettings"    component={GuardedProfileSettings}    options={noHeader} />
  </HomeStack.Navigator>
);

// ── Root navigator ────────────────────────────────────────────
const AppNavigator = () => {
  const [isLoading, setIsLoading]         = useState(true);
  const [isLoggedIn, setIsLoggedIn]       = useState(false);
  const [gstBillEnabled, setGstBillEnabled] = useState(true);
  const [isAdmin, setIsAdmin]             = useState(false);
  const [currentUser, setCurrentUser]     = useState(null);
  const [allowedPages, setAllowedPages]   = useState(null); // null = legacy (no record), [] = zero pages

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
          'allowedPages',
        ]);
        const loggedIn = results[0][1] === 'true';
        setIsLoggedIn(loggedIn);
        setGstBillEnabled(results[1][1] !== 'false');
        setIsAdmin(results[2][1] === 'admin');
        if (loggedIn) {
          setCurrentUser({
            userId:   results[3][1] || '',
            email:    results[4][1] || '',
            userName: results[5][1] || '',
            role:     results[2][1] || 'user',
          });
          // null in storage → legacy user (no permission record) → full non-admin access
          if (results[6][1] === null || results[6][1] === undefined) {
            setAllowedPages(null);
          } else {
            try { setAllowedPages(JSON.parse(results[6][1])); }
            catch { setAllowedPages(null); }
          }
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
          gstBillEnabled: nextGst = true,
          role         = 'user',
          userId       = '',
          email        = '',
          userName     = '',
          allowedPages: pages = [],
        } = session || {};
        // pages === undefined/null → legacy sentinel; array (incl. empty) → permission record
        const hasPageRecord = Array.isArray(pages);
        const safePages     = hasPageRecord ? pages : null;
        await AsyncStorage.multiSet([
          ['isLoggedIn',     'true'],
          ['gstBillEnabled', String(nextGst)],
          ['userRole',       role],
          ['userId',         String(userId)],
          ['userEmail',      email],
          ['userName',       userName],
          ['allowedPages',   hasPageRecord ? JSON.stringify(safePages) : ''],
        ]);
        setIsLoggedIn(true);
        setGstBillEnabled(nextGst);
        setIsAdmin(role === 'admin');
        setCurrentUser({ userId, email, userName, role });
        setAllowedPages(safePages);
      } catch (e) {
        console.error('Failed to save login status', e);
      }
    },

    updateCurrentUser: async (updates = {}) => {
      try {
        setCurrentUser((prev) => {
          const next = { ...(prev || {}), ...updates };
          AsyncStorage.multiSet([
            ['userId',    next.userId   || ''],
            ['userEmail', next.email    || ''],
            ['userName',  next.userName || ''],
            ['userRole',  next.role     || 'user'],
          ]).catch(() => {});
          return next;
        });
      } catch (e) {
        console.error('Failed to update current user', e);
      }
    },

    logout: async () => {
      try {
        await AsyncStorage.multiRemove([
          'isLoggedIn', 'gstBillEnabled', 'userRole',
          'userId', 'userEmail', 'userName', 'allowedPages',
        ]);
        setIsLoggedIn(false);
        setGstBillEnabled(true);
        setIsAdmin(false);
        setCurrentUser(null);
        setAllowedPages(null);
      } catch (e) {
        console.error('Failed to remove login status', e);
      }
    },

    gstBillEnabled,
    isAdmin,
    currentUser,
    allowedPages,
  }), [gstBillEnabled, isAdmin, currentUser, allowedPages]);

  if (isLoading) return <SplashScreen />;

  return (
    <AuthContext.Provider value={authContext}>
      <NavigationContainer>
        {isLoggedIn ? <MainNavigator /> : <AuthNavigator />}
      </NavigationContainer>
    </AuthContext.Provider>
  );
};

export default AppNavigator;
