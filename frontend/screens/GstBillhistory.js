import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, FlatList,
  TouchableOpacity, ActivityIndicator, Alert, RefreshControl, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import { fetchGstCustomers } from '../services/api';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const GstBillhistory = ({ navigation }) => {
  const [bills, setBills] = useState([]);
  const [filteredBills, setFilteredBills] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGstBills = useCallback(async () => {
    try {
      const items = await fetchGstCustomers();
      // fetchGstCustomers returns only gst-customers (always GST bills)
      const sorted = [...items].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      setBills(sorted);
      setFilteredBills(sorted);
    } catch {
      Alert.alert('Error', 'Failed to load GST bill history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setLoading(true);
      loadGstBills();
    });
    return unsubscribe;
  }, [navigation, loadGstBills]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setSearchQuery('');
    loadGstBills();
  }, [loadGstBills]);

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (!text.trim()) { setFilteredBills(bills); return; }
    const q = text.toLowerCase();
    setFilteredBills(
      bills.filter(b =>
        (b.customerName || '').toLowerCase().includes(q) ||
        (b.invoiceNumber || '').toLowerCase().includes(q) ||
        (b.phone || '').toLowerCase().includes(q)
      )
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('GSTBillPreview', { transactionId: item._id })}
      activeOpacity={0.75}
    >
      <View style={styles.cardTop}>
        <View style={styles.invoiceBadge}>
          <MaterialCommunityIcons name="receipt-text" size={14} color="#7C3AED" />
          <Text style={styles.invoiceNo}>{item.invoiceNumber || '—'}</Text>
        </View>
        <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
      </View>

      <Text style={styles.customerName} numberOfLines={1}>{item.customerName || 'Unknown'}</Text>

      {item.phone ? (
        <Text style={styles.phoneText}>{item.phone}</Text>
      ) : null}

      <View style={styles.cardFooter}>
        <View style={styles.gstBadge}>
          <Text style={styles.gstBadgeText}>GST BILL</Text>
        </View>
        <Text style={styles.totalAmount}>
          ₹{Number(item.totalInvoiceValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="GST Bill History"
        subtitle="All GST invoices"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={22} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, invoice no..."
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
          <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={filteredBills}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#7C3AED']} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="receipt-text-outline" size={64} color="#C4B5FD" />
                <Text style={styles.emptyText}>No GST bills found</Text>
                <Text style={styles.emptySubText}>GST invoices will appear here.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },
  content: { flex: 1 },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: horizontalPadding,
    marginBottom: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: moderateScale(15),
    color: '#111827',
  },

  listContent: {
    padding: horizontalPadding,
    paddingBottom: 40,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#EDE9FE',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  invoiceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  invoiceNo: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    color: '#7C3AED',
  },
  dateText: {
    fontSize: moderateScale(12),
    color: '#6B7280',
    fontWeight: '500',
  },
  customerName: {
    fontSize: moderateScale(16),
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  phoneText: {
    fontSize: moderateScale(12),
    color: '#6B7280',
    marginBottom: 6,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F0FF',
  },
  gstBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  gstBadgeText: {
    fontSize: moderateScale(10),
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  totalAmount: {
    fontSize: moderateScale(16),
    fontWeight: '800',
    color: '#7C3AED',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: moderateScale(17),
    fontWeight: '800',
    color: '#7C3AED',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: moderateScale(13),
    color: '#9CA3AF',
    marginTop: 6,
  },
});

export default GstBillhistory;
