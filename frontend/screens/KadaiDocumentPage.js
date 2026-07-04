import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, FlatList, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Modal, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Header from '../components/Header';
import {
  fetchDocuments, createDocument, fetchDocumentById,
  updateDocument, deleteDocument,
} from '../services/api';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const DOC_TYPES = [
  { value: 'GST',         label: 'GST Document',   icon: 'file-certificate-outline', color: '#7C3AED' },
  { value: 'LICENSE',     label: 'License',         icon: 'license',                  color: '#2563EB' },
  { value: 'ID_PROOF',    label: 'ID Proof',        icon: 'card-account-details-outline', color: '#059669' },
  { value: 'SHOP',        label: 'Shop Document',   icon: 'store-outline',            color: '#D97706' },
  { value: 'CERTIFICATE', label: 'Certificate',     icon: 'certificate-outline',      color: '#DC2626' },
  { value: 'OTHER',       label: 'Other',           icon: 'file-document-outline',    color: '#6B7280' },
];

const typeInfo = (val) => DOC_TYPES.find((t) => t.value === val) || DOC_TYPES[DOC_TYPES.length - 1];

const formatDate = (d) => {
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
};

const ext = (mimeType = '') => {
  if (mimeType.includes('pdf'))  return '.pdf';
  if (mimeType.includes('png'))  return '.png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  return '';
};

// ── Type Picker ───────────────────────────────────────────────
const TypePicker = ({ value, onChange }) => (
  <View style={styles.typePicker}>
    {DOC_TYPES.map((t) => (
      <TouchableOpacity
        key={t.value}
        style={[styles.typeChip, value === t.value && { backgroundColor: t.color, borderColor: t.color }]}
        onPress={() => onChange(t.value)}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name={t.icon}
          size={13}
          color={value === t.value ? '#fff' : t.color}
        />
        <Text style={[styles.typeChipText, value === t.value && { color: '#fff' }]}>
          {t.label}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

// ── Main Screen ───────────────────────────────────────────────
const KadaiDocumentPage = ({ navigation }) => {
  const [documents, setDocuments]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modalVisible, setModal]    = useState(false);
  const [editingId, setEditingId]   = useState(null);

  // Form state
  const [title, setTitle]           = useState('');
  const [docType, setDocType]       = useState('OTHER');
  const [notes, setNotes]           = useState('');
  const [file, setFile]             = useState(null); // { name, base64, mimeType }
  const [uploading, setUploading]   = useState(false);
  const [viewBusy, setViewBusy]     = useState('');

  const loadDocs = useCallback(async () => {
    setLoading(true);
    const res = await fetchDocuments();
    setDocuments(res.success ? res.documents : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadDocs);
    return unsub;
  }, [navigation, loadDocs]);

  const resetForm = () => {
    setTitle(''); setDocType('OTHER'); setNotes(''); setFile(null); setEditingId(null);
  };

  const openAddModal = () => { resetForm(); setModal(true); };

  const openEditModal = (doc) => {
    setEditingId(doc._id);
    setTitle(doc.title);
    setDocType(doc.type || 'OTHER');
    setNotes(doc.notes || '');
    setFile(null);
    setModal(true);
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
      setFile({ name: asset.name, base64, mimeType: asset.mimeType || 'application/octet-stream' });
    } catch {
      Alert.alert('Error', 'Could not pick file. Try again.');
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Please enter a document title.'); return; }
    if (!editingId && !file) { Alert.alert('Required', 'Please select a file to upload.'); return; }

    setUploading(true);
    let res;
    if (editingId) {
      const payload = { title: title.trim(), type: docType, notes: notes.trim() };
      if (file) { payload.fileData = file.base64; payload.mimeType = file.mimeType; payload.fileName = file.name; }
      res = await updateDocument(editingId, payload);
    } else {
      res = await createDocument({
        title: title.trim(), type: docType, notes: notes.trim(),
        fileData: file.base64, mimeType: file.mimeType, fileName: file.name,
        uploadedBy: 'admin',
      });
    }
    setUploading(false);

    if (res.success) {
      setModal(false);
      resetForm();
      loadDocs();
    } else {
      Alert.alert('Error', 'Failed to save document. Try again.');
    }
  };

  const handleDelete = (doc) => {
    Alert.alert(
      'Delete Document',
      `Delete "${doc.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteDocument(doc._id);
            if (res.success) loadDocs();
            else Alert.alert('Error', 'Failed to delete document.');
          },
        },
      ]
    );
  };

  const handleView = async (doc) => {
    setViewBusy(doc._id);
    try {
      const res = await fetchDocumentById(doc._id);
      if (!res.success || !res.document?.fileData) {
        Alert.alert('Error', 'File data not available.'); return;
      }
      const { fileData, mimeType, fileName } = res.document;
      const extension = fileName ? `.${fileName.split('.').pop()}` : ext(mimeType);
      const cacheUri = `${FileSystem.cacheDirectory}doc_${doc._id}${extension}`;
      await FileSystem.writeAsStringAsync(cacheUri, fileData, { encoding: 'base64' });
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(cacheUri, { mimeType: mimeType || 'application/octet-stream', dialogTitle: doc.title });
      } else {
        Alert.alert('View File', `File saved to: ${cacheUri}`);
      }
    } catch {
      Alert.alert('Error', 'Could not open document.');
    } finally {
      setViewBusy('');
    }
  };

  const handleShareDoc = async (doc) => {
    try {
      await Share.share({ message: `Document: ${doc.title} (${typeInfo(doc.type).label})`, title: doc.title });
    } catch { /* cancelled */ }
  };

  // ── Render document card ──────────────────────────────────
  const renderDoc = ({ item }) => {
    const t = typeInfo(item.type);
    const busy = viewBusy === item._id;
    return (
      <View style={styles.docCard}>
        <View style={styles.docCardTop}>
          <View style={[styles.docIconWrap, { backgroundColor: t.color + '18' }]}>
            <MaterialCommunityIcons name={t.icon} size={22} color={t.color} />
          </View>
          <View style={styles.docInfo}>
            <Text style={styles.docTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.docMeta}>
              <View style={[styles.typeBadge, { backgroundColor: t.color + '18', borderColor: t.color + '40' }]}>
                <Text style={[styles.typeBadgeText, { color: t.color }]}>{t.label}</Text>
              </View>
              <Text style={styles.docDate}>{formatDate(item.createdAt)}</Text>
            </View>
            {item.notes ? <Text style={styles.docNotes} numberOfLines={1}>{item.notes}</Text> : null}
          </View>
        </View>

        <View style={styles.docActions}>
          <TouchableOpacity style={[styles.actionBtn, styles.viewBtn]} onPress={() => handleView(item)} disabled={busy}>
            {busy
              ? <ActivityIndicator size="small" color="#2563EB" />
              : <MaterialCommunityIcons name="eye-outline" size={16} color="#2563EB" />
            }
            <Text style={[styles.actionBtnText, { color: '#2563EB' }]}>View</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.shareDocBtn]} onPress={() => handleShareDoc(item)}>
            <MaterialCommunityIcons name="share-variant-outline" size={16} color="#10B981" />
            <Text style={[styles.actionBtnText, { color: '#10B981' }]}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={() => openEditModal(item)}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color="#D97706" />
            <Text style={[styles.actionBtnText, { color: '#D97706' }]}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDelete(item)}>
            <MaterialCommunityIcons name="trash-can-outline" size={16} color="#EF4444" />
            <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="Shop Documents"
        subtitle="Manage your kadai documents"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <View style={styles.addRow}>
        <Text style={styles.countText}>{documents.length} document{documents.length !== 1 ? 's' : ''}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <MaterialCommunityIcons name="plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Document</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.centerText}>Loading documents…</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item._id}
          renderItem={renderDoc}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="folder-open-outline" size={56} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No Documents Yet</Text>
              <Text style={styles.emptySubtext}>Tap "Add Document" to upload your first file.</Text>
            </View>
          }
        />
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Document' : 'Add Document'}</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Title */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Document Title *</Text>
                <TextInput
                  style={styles.formInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. GST Registration Certificate"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Type */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Document Type *</Text>
                <TypePicker value={docType} onChange={setDocType} />
              </View>

              {/* File Picker */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{editingId ? 'Replace File (optional)' : 'Select File *'}</Text>
                <TouchableOpacity style={styles.filePicker} onPress={pickFile} activeOpacity={0.8}>
                  <MaterialCommunityIcons
                    name={file ? 'file-check-outline' : 'upload-outline'}
                    size={22}
                    color={file ? '#10B981' : '#6B7280'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.filePickerText, file && { color: '#10B981' }]}>
                      {file ? file.name : 'Tap to pick PDF or Image'}
                    </Text>
                    {file ? (
                      <Text style={styles.filePickerSub}>{file.mimeType}</Text>
                    ) : (
                      <Text style={styles.filePickerSub}>PDF, JPG, PNG supported</Text>
                    )}
                  </View>
                  {file && (
                    <TouchableOpacity onPress={() => setFile(null)}>
                      <MaterialCommunityIcons name="close-circle" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <View style={[styles.formField, { marginBottom: 0 }]}>
                <Text style={styles.formLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.formInput, { height: 70, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Additional notes..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                />
              </View>

            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)} disabled={uploading}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, uploading && { opacity: 0.65 }]}
                onPress={handleSave}
                disabled={uploading}
              >
                {uploading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
                }
                <Text style={styles.saveBtnText}>{uploading ? 'Saving…' : editingId ? 'Update' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerText: { fontSize: moderateScale(14), color: '#6B7280' },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalPadding,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  countText: { fontSize: moderateScale(13), color: '#6B7280', fontWeight: '600' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(13) },

  list: { padding: horizontalPadding, paddingBottom: 40 },

  // Document card
  docCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  docCardTop: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: 12,
    alignItems: 'flex-start',
  },
  docIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  docTitle: { fontSize: moderateScale(15), fontWeight: '800', color: '#111827', marginBottom: 6 },
  docMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  typeBadgeText: { fontSize: moderateScale(10), fontWeight: '700' },
  docDate: { fontSize: moderateScale(11), color: '#9CA3AF', fontWeight: '500' },
  docNotes: { fontSize: moderateScale(12), color: '#6B7280', marginTop: 4 },

  docActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  viewBtn:     { borderRightWidth: 1, borderRightColor: '#F3F4F6', backgroundColor: '#EFF6FF' },
  shareDocBtn: { borderRightWidth: 1, borderRightColor: '#F3F4F6', backgroundColor: '#F0FDF4' },
  editBtn:     { borderRightWidth: 1, borderRightColor: '#F3F4F6', backgroundColor: '#FFFBEB' },
  deleteBtn:   { backgroundColor: '#FEF2F2' },
  actionBtnText: { fontSize: moderateScale(11), fontWeight: '700' },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: { fontSize: moderateScale(17), fontWeight: '800', color: '#4B5563' },
  emptySubtext: { fontSize: moderateScale(13), color: '#9CA3AF', textAlign: 'center' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: horizontalPadding,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: { fontSize: moderateScale(18), fontWeight: '800', color: '#111827' },

  formField: { marginBottom: spacing.md },
  formLabel: { fontSize: moderateScale(13), fontWeight: '600', color: '#374151', marginBottom: 8 },
  formInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: moderateScale(14),
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },

  typePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  typeChipText: { fontSize: moderateScale(11), fontWeight: '700', color: '#4B5563' },

  filePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    borderStyle: 'dashed',
    padding: 14,
    backgroundColor: '#F9FAFB',
  },
  filePickerText: { fontSize: moderateScale(13), fontWeight: '600', color: '#6B7280' },
  filePickerSub: { fontSize: moderateScale(11), color: '#9CA3AF', marginTop: 2 },

  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: spacing.xl,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelBtnText: { color: '#374151', fontWeight: '700', fontSize: moderateScale(14) },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#2563EB',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14) },
});

export default KadaiDocumentPage;
