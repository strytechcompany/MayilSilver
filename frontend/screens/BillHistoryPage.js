import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  StyleSheet, Text, View, FlatList,
  TouchableOpacity, ActivityIndicator, Alert, RefreshControl, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../components/Header';
import Card from '../components/Card';
import { AuthContext } from '../context/AuthContext';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const BillHistoryPage = ({ navigation }) => {
  const { gstBillEnabled, isAdmin } = useContext(AuthContext);

  if (gstBillEnabled && !isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Header title="Bill History" showBack onBackPress={() => navigation.goBack()} />
        <View style={styles.accessDenied}>
          <MaterialCommunityIcons name="lock-outline" size={52} color="#C4B5FD" />
          <Text style={styles.accessDeniedTitle}>GST Access Only</Text>
          <Text style={styles.accessDeniedText}>Your account is configured for GST billing. Use GST History to view your bills.</Text>
          <TouchableOpacity style={styles.accessBtn} onPress={() => navigation.navigate('GSTBillHistory')}>
            <Text style={styles.accessBtnText}>Go to GST History</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const [bills, setBills] = useState([]);
  const [filteredBills, setFilteredBills] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLocalBills = async () => {
    try {
      const storedBills = await AsyncStorage.getItem('bills');
      if (storedBills !== null) {
        // Sort by date (newest first), show only regular bills (not GST)
        const parsed = JSON.parse(storedBills);
        const regular = parsed.filter(b => !b.billType || b.billType === 'REGULAR');
        regular.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setBills(regular);
        setFilteredBills(regular);
      } else {
        setBills([]);
        setFilteredBills([]);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load local bill history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Reload bills every time the screen is focused
    const unsubscribe = navigation.addListener('focus', () => {
      setLoading(true);
      loadLocalBills();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setSearchQuery('');
    loadLocalBills();
  }, []);

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setFilteredBills(bills);
      return;
    }
    const lowerText = text.toLowerCase();
    const filtered = bills.filter(b => 
      b.customerName?.toLowerCase().includes(lowerText) || 
      String(b.billNo).includes(lowerText)
    );
    setFilteredBills(filtered);
  };

  const deleteBill = async (billNo) => {
    Alert.alert(
      'Delete Bill',
      `Are you sure you want to delete Bill #${billNo} from history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedBills = bills.filter(b => b.billNo !== billNo);
              await AsyncStorage.setItem('bills', JSON.stringify(updatedBills));
              setBills(updatedBills);
              setFilteredBills(updatedBills.filter(b => 
                b.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                String(b.billNo).includes(searchQuery.toLowerCase())
              ));
            } catch (e) {
              Alert.alert('Error', 'Failed to delete bill.');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const renderBillItem = ({ item }) => (
    <Card style={styles.billCard}>
      <TouchableOpacity 
        style={styles.cardContent}
        onPress={() => navigation.navigate('BillPreview', { billData: item })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.billNo}>Bill #{String(item.billNo).padStart(5, '0')}</Text>
          <Text style={styles.billDate}>{formatDate(item.createdAt)}</Text>
        </View>

        <Text style={styles.customerName}>{item.customerName}</Text>
        <Text style={styles.transType}>{item.transactionType || 'B2B'}</Text>

        <View style={styles.divider} />

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.balanceLabel}>Final Balance</Text>
            <Text style={[styles.balanceValue, { color: item.finalBalance >= 0 ? '#EF4444' : '#10B981' }]}>
              {item.finalBalance >= 0 ? 'OB' : 'AB'}: {Math.abs(item.finalBalance).toFixed(3)}g
            </Text>
          </View>
          <TouchableOpacity onPress={() => deleteBill(item.billNo)} style={styles.deleteBtn}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header 
        title="Local Bill History"
        showBack={true}
        onBackPress={() => navigation.goBack()}
      />

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={24} color="#9CA3AF" />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search by name or bill no..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={filteredBills}
            keyExtractor={(item, index) => `${item.billNo}-${index}`}
            renderItem={renderBillItem}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="file-document-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyText}>No bills available</Text>
                <Text style={styles.emptySubText}>Bills saved locally will appear here.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  accessDenied: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12,
  },
  accessDeniedTitle: {
    fontSize: moderateScale(18), fontWeight: '800', color: '#7C3AED',
  },
  accessDeniedText: {
    fontSize: moderateScale(13), color: '#6B7280', textAlign: 'center', lineHeight: 20,
  },
  accessBtn: {
    marginTop: 8, backgroundColor: '#7C3AED', paddingHorizontal: 24,
    paddingVertical: 12, borderRadius: 10,
  },
  accessBtnText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14) },
  content: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: horizontalPadding,
    marginBottom: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: moderateScale(16),
    color: '#111827',
  },
  listContent: {
    padding: horizontalPadding,
    paddingBottom: 40,
  },
  billCard: {
    marginBottom: spacing.md,
    padding: 0,
    overflow: 'hidden',
  },
  cardContent: {
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  billNo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  billDate: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  transType: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4B5563',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
});

export default BillHistoryPage;
