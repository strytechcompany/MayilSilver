import React, { useContext, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import { clearAllData } from '../services/api';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const SettingsPage = ({ navigation }) => {
  const { logout } = useContext(AuthContext);
  const [clearing, setClearing] = useState(false);

  const handleClearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete ALL billing data:\n\n• All customers\n• All bills & transactions\n• All GST invoices\n• Bill counters\n\nUser accounts and app settings will NOT be affected.\n\nThis action CANNOT be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Clear All',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              const res = await clearAllData();
              if (!res.success) {
                Alert.alert('Error', res.message || 'Failed to clear data');
                return;
              }
              // Also clear local AsyncStorage bill cache
              await AsyncStorage.removeItem('bills');
              Alert.alert('Done', 'All billing data has been cleared successfully.');
            } catch {
              Alert.alert('Error', 'Something went wrong. Please try again.');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  const settingsOptions = [
    { title: 'Kadai Profile', icon: 'store-edit-outline', screen: 'KadaiProfile', subtitle: 'GST bill header & shop details' },
    { title: 'GST Settings', icon: 'file-cog-outline', screen: 'GSTSettings', subtitle: 'Tax rates & bank details' },
    { title: 'App Preferences', icon: 'tune', screen: 'AppPreferences', subtitle: 'App name, share link & message' },
    { title: 'Profile Settings', icon: 'account-outline', screen: 'ProfileSettings', subtitle: 'Update name, email & password' },
    { title: 'Daily Expense', icon: 'cash-multiple', screen: 'DailyExpense', subtitle: 'Track daily shop expenses' },
    { title: 'Shop Documents', icon: 'folder-multiple-outline', screen: 'KadaiDocument', subtitle: 'Manage kadai documents' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header 
        title="Settings" 
        showBack={true}
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          {settingsOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.row, index === settingsOptions.length - 1 && styles.rowLast]}
              onPress={() => option.screen ? navigation.navigate(option.screen) : null}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, option.title === 'Kadai Profile' && styles.iconWrapAccent]}>
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={20}
                    color={option.title === 'Kadai Profile' ? '#FFFFFF' : '#4B5563'}
                  />
                </View>
                <View>
                  <Text style={styles.rowTitle}>{option.title}</Text>
                  {option.subtitle ? (
                    <Text style={styles.rowSubtitle}>{option.subtitle}</Text>
                  ) : null}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.row}
            onPress={handleClearAllData}
            disabled={clearing}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, styles.iconWrapDanger]}>
                {clearing
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <MaterialCommunityIcons name="delete-sweep-outline" size={20} color="#EF4444" />
                }
              </View>
              <View>
                <Text style={[styles.rowTitle, { color: '#EF4444' }]}>Clear All Data</Text>
                <Text style={styles.rowSubtitle}>Delete all bills, customers & transactions</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.row} onPress={async () => await logout()}>
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="logout" size={24} color="#EF4444" />
              <Text style={[styles.rowTitle, { color: '#EF4444' }]}>Logout</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: horizontalPadding,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapAccent: {
    backgroundColor: '#1C2B3A',
  },
  iconWrapDanger: {
    backgroundColor: '#FEF2F2',
  },
  rowTitle: {
    fontSize: moderateScale(15),
    fontWeight: '600',
    color: '#111827',
  },
  rowSubtitle: {
    fontSize: moderateScale(11),
    color: '#6B7280',
    marginTop: 1,
  },
});

export default SettingsPage;
