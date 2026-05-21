import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import Header from '../components/Header';
import {
  createDocument,
  deleteDocument,
  fetchDocuments,
  updateDocument,
} from '../services/api';
import { base_url } from '../config';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const DOC_TYPES = [
  { value: 'GST', label: 'GST Document', icon: 'file-certificate-outline', color: '#7C3AED' },
  { value: 'LICENSE', label: 'License', icon: 'license', color: '#2563EB' },
  { value: 'ID_PROOF', label: 'ID Proof', icon: 'card-account-details-outline', color: '#059669' },
  { value: 'SHOP', label: 'Shop Document', icon: 'store-outline', color: '#D97706' },
  { value: 'OTHER', label: 'Other', icon: 'file-document-outline', color: '#64748B' },
];

const EMPTY_FORM = {
  title: '',
  type: 'OTHER',
  notes: '',
  uploadDate: new Date().toISOString().slice(0, 10),
};

const todayString = () => new Date().toISOString().slice(0, 10);
const backend_url = base_url.replace(/\/api\/?$/, '');

const typeInfo = (value) => DOC_TYPES.find((item) => item.value === value) || DOC_TYPES[DOC_TYPES.length - 1];

const formatDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || '-';
  return `${String(parsed.getDate()).padStart(2, '0')}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${parsed.getFullYear()}`;
};

const getRemoteUrl = (fileUrl = '') => {
  if (!fileUrl) return '';
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;
  return `${backend_url}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
};

const getDocumentExtension = (doc) => {
  if (!doc) return '';
  const fromName = String(doc.fileName || '').split('.').pop()?.toLowerCase();
  if (fromName && fromName !== String(doc.fileName || '').toLowerCase()) return fromName;
  const mime = String(doc.mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return '';
};

const isPdfDocument = (doc) => {
  if (!doc) return false;
  const extension = getDocumentExtension(doc);
  return String(doc.mimeType || '').toLowerCase().includes('pdf') || extension === 'pdf';
};

const isImageDocument = (doc) => {
  if (!doc) return false;
  const extension = getDocumentExtension(doc);
  const mime = String(doc.mimeType || '').toLowerCase();
  return mime.startsWith('image/') || ['jpg', 'jpeg', 'png'].includes(extension);
};

const KadaiDocument = ({ navigation }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [busyDocId, setBusyDocId] = useState('');
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  const documentCountLabel = useMemo(
    () => `${documents.length} document${documents.length === 1 ? '' : 's'}`,
    [documents.length]
  );

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const res = await fetchDocuments();
    setDocuments(res.success ? (res.documents || []) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadDocuments);
    return unsubscribe;
  }, [navigation, loadDocuments]);

  const resetForm = () => {
    setEditingDoc(null);
    setForm({ ...EMPTY_FORM, uploadDate: todayString() });
    setSelectedFile(null);
  };

  const openCreate = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (doc) => {
    setEditingDoc(doc);
    setForm({
      title: doc.title || '',
      type: doc.type || 'OTHER',
      notes: doc.notes || '',
      uploadDate: doc.uploadDate ? String(doc.uploadDate).slice(0, 10) : todayString(),
    });
    setSelectedFile(null);
    setModalVisible(true);
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
      setSelectedFile({
        name: asset.name || `document_${Date.now()}`,
        mimeType: asset.mimeType || 'application/octet-stream',
        base64,
      });
    } catch {
      Alert.alert('Error', 'Could not pick file. Please try again.');
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('Validation', 'Document title is required');
      return;
    }
    if (!editingDoc && !selectedFile) {
      Alert.alert('Validation', 'Please upload a PDF or image');
      return;
    }

    const payload = {
      title: form.title.trim(),
      type: form.type,
      notes: form.notes.trim(),
      uploadDate: form.uploadDate,
    };
    if (selectedFile) {
      payload.fileData = selectedFile.base64;
      payload.fileName = selectedFile.name;
      payload.mimeType = selectedFile.mimeType;
    }

    setSaving(true);
    const res = editingDoc
      ? await updateDocument(editingDoc._id, payload)
      : await createDocument(payload);
    setSaving(false);

    if (!res.success) {
      Alert.alert('Error', res.message || 'Failed to save document');
      return;
    }

    setModalVisible(false);
    resetForm();
    loadDocuments();
  };

  const handleDelete = (doc) => {
    Alert.alert(
      'Delete Document',
      `Delete "${doc.title}" from MongoDB and storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteDocument(doc._id);
            if (res.success) loadDocuments();
            else Alert.alert('Error', res.message || 'Failed to delete document');
          },
        },
      ]
    );
  };

  const handleView = async (doc) => {
    const remoteUrl = getRemoteUrl(doc.fileUrl);
    if (!remoteUrl) {
      Alert.alert('Error', 'Document file URL is missing');
      return;
    }

    if (!isPdfDocument(doc) && !isImageDocument(doc)) {
      Alert.alert('Unsupported File', 'Only PDF, JPG, JPEG, and PNG files can be previewed inside the app.');
      return;
    }

    setBusyDocId(doc._id);
    setViewerLoading(true);
    setViewerDoc({ ...doc, remoteUrl });
    setViewerVisible(true);
  };

  const handleShare = async (doc) => {
    const remoteUrl = getRemoteUrl(doc.fileUrl);
    if (!remoteUrl) {
      Alert.alert('Error', 'Document file URL is missing');
      return;
    }

    setBusyDocId(doc._id);
    try {
      const localPath = `${FileSystem.cacheDirectory}${doc.fileName || `document_${doc._id}`}`;
      const download = await FileSystem.downloadAsync(remoteUrl, localPath);
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Share Unavailable', download.uri);
        return;
      }
      await Sharing.shareAsync(download.uri, {
        mimeType: doc.mimeType || 'application/octet-stream',
        dialogTitle: doc.title,
      });
    } catch {
      Alert.alert('Error', 'Could not share document');
    } finally {
      setBusyDocId('');
    }
  };

  const closeViewer = () => {
    setViewerVisible(false);
    setViewerDoc(null);
    setViewerLoading(false);
    setBusyDocId('');
  };

  const handleViewerEdit = () => {
    const doc = viewerDoc;
    closeViewer();
    if (doc) openEdit(doc);
  };

  const handleViewerDelete = () => {
    const doc = viewerDoc;
    closeViewer();
    if (doc) handleDelete(doc);
  };

  const renderDocument = ({ item }) => {
    const info = typeInfo(item.type);
    const busy = busyDocId === item._id;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.iconWrap, { backgroundColor: `${info.color}18` }]}>
            <MaterialCommunityIcons name={info.icon} size={22} color={info.color} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardMeta}>{info.label}</Text>
            <Text style={styles.cardDate}>Uploaded: {formatDate(item.uploadDate || item.createdAt)}</Text>
          </View>
        </View>

        {item.notes ? <Text style={styles.notesText}>{item.notes}</Text> : null}

        <View style={styles.actionRow}>
          <ActionButton label="View" icon="eye-outline" color="#2563EB" bg="#EFF6FF" onPress={() => handleView(item)} />
          <ActionButton
            label={busy ? 'Sharing...' : 'Share'}
            icon={busy ? 'progress-clock' : 'share-variant-outline'}
            color="#059669"
            bg="#ECFDF5"
            onPress={() => handleShare(item)}
            disabled={busy}
          />
          <ActionButton label="Edit" icon="pencil-outline" color="#D97706" bg="#FFFBEB" onPress={() => openEdit(item)} />
          <ActionButton label="Delete" icon="trash-can-outline" color="#DC2626" bg="#FEF2F2" onPress={() => handleDelete(item)} />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="Kadai Documents"
        subtitle="Upload and manage shop documents"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <View style={styles.toolbar}>
        <Text style={styles.countText}>{documentCountLabel}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.85}>
          <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Upload Document</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading documents...</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item._id}
          renderItem={renderDocument}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="folder-open-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Documents Yet</Text>
              <Text style={styles.emptySubtitle}>Upload GST, license, ID, or shop files to manage them here.</Text>
            </View>
          }
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingDoc ? 'Edit Document' : 'Upload Document'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Field
                label="Document Title"
                value={form.title}
                onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
                placeholder="e.g. GST Registration Certificate"
              />

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Document Type</Text>
                <View style={styles.typeWrap}>
                  {DOC_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.typeChip,
                        form.type === type.value && { backgroundColor: type.color, borderColor: type.color },
                      ]}
                      onPress={() => setForm((prev) => ({ ...prev, type: type.value }))}
                    >
                      <Text style={[styles.typeChipText, form.type === type.value && styles.typeChipTextActive]}>
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Field
                label="Upload Date"
                value={form.uploadDate}
                onChangeText={(value) => setForm((prev) => ({ ...prev, uploadDate: value }))}
                placeholder="YYYY-MM-DD"
              />

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>{editingDoc ? 'Replace File (optional)' : 'Upload File'}</Text>
                <TouchableOpacity style={styles.filePicker} onPress={pickFile} activeOpacity={0.85}>
                  <MaterialCommunityIcons
                    name={selectedFile ? 'file-check-outline' : 'upload-outline'}
                    size={22}
                    color={selectedFile ? '#059669' : '#64748B'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fileTitle, selectedFile && { color: '#059669' }]}>
                      {selectedFile ? selectedFile.name : 'Tap to upload PDF or Image'}
                    </Text>
                    <Text style={styles.fileSub}>
                      {selectedFile ? selectedFile.mimeType : 'PDF, JPG, PNG, WEBP supported'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              <Field
                label="Notes"
                value={form.notes}
                onChangeText={(value) => setForm((prev) => ({ ...prev, notes: value }))}
                placeholder="Optional notes"
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>{editingDoc ? 'Update' : 'Save'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={viewerVisible} animationType="slide" onRequestClose={closeViewer}>
        <SafeAreaView style={styles.viewerShell} edges={['top', 'left', 'right', 'bottom']}>
          <View style={styles.viewerHeader}>
            <TouchableOpacity style={styles.viewerIconBtn} onPress={closeViewer} activeOpacity={0.85}>
              <MaterialCommunityIcons name="close" size={22} color="#E2E8F0" />
            </TouchableOpacity>
            <View style={styles.viewerTitleWrap}>
              <Text style={styles.viewerTitle} numberOfLines={1}>{viewerDoc?.title || 'Document Viewer'}</Text>
              <Text style={styles.viewerSubtitle} numberOfLines={1}>
                {isPdfDocument(viewerDoc) ? 'PDF Preview' : 'Image Preview'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.viewerIconBtn}
              onPress={() => viewerDoc && handleShare(viewerDoc)}
              activeOpacity={0.85}
              disabled={!viewerDoc}
            >
              <MaterialCommunityIcons name="share-variant-outline" size={20} color="#E2E8F0" />
            </TouchableOpacity>
          </View>

          <View style={styles.viewerBody}>
            {viewerDoc ? (
              <>
                {viewerLoading ? (
                  <View style={styles.viewerLoading}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.viewerLoadingText}>Opening document...</Text>
                  </View>
                ) : null}

                {isPdfDocument(viewerDoc) ? (
                  <WebView
                    source={{ uri: viewerDoc.remoteUrl }}
                    style={styles.viewerFrame}
                    originWhitelist={['*']}
                    startInLoadingState
                    onLoadStart={() => setViewerLoading(true)}
                    onLoadEnd={() => {
                      setViewerLoading(false);
                      setBusyDocId('');
                    }}
                    onError={() => {
                      setViewerLoading(false);
                      setBusyDocId('');
                      Alert.alert('Error', 'Could not load this PDF inside the app.');
                    }}
                  />
                ) : (
                  <ScrollView
                    style={styles.viewerScroll}
                    contentContainerStyle={styles.viewerImageWrap}
                    maximumZoomScale={3}
                    minimumZoomScale={1}
                    centerContent
                  >
                    <Image
                      source={{ uri: viewerDoc.remoteUrl }}
                      style={styles.viewerImage}
                      resizeMode="contain"
                      onLoadStart={() => setViewerLoading(true)}
                      onLoadEnd={() => {
                        setViewerLoading(false);
                        setBusyDocId('');
                      }}
                      onError={() => {
                        setViewerLoading(false);
                        setBusyDocId('');
                        Alert.alert('Error', 'Could not load this image inside the app.');
                      }}
                    />
                  </ScrollView>
                )}
              </>
            ) : null}
          </View>

          <View style={styles.viewerActions}>
            <TouchableOpacity style={styles.viewerActionBtn} onPress={handleViewerEdit} activeOpacity={0.85}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#F59E0B" />
              <Text style={[styles.viewerActionText, { color: '#F59E0B' }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.viewerActionBtn} onPress={() => viewerDoc && handleShare(viewerDoc)} activeOpacity={0.85}>
              <MaterialCommunityIcons name="share-variant-outline" size={18} color="#10B981" />
              <Text style={[styles.viewerActionText, { color: '#10B981' }]}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.viewerActionBtn} onPress={handleViewerDelete} activeOpacity={0.85}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#EF4444" />
              <Text style={[styles.viewerActionText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94A3B8"
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  </View>
);

const ActionButton = ({ label, icon, color, bg, onPress, disabled = false }) => (
  <TouchableOpacity
    style={[styles.actionBtn, { backgroundColor: bg }, disabled && styles.actionBtnDisabled]}
    onPress={onPress}
    disabled={disabled}
  >
    <MaterialCommunityIcons name={icon} size={16} color={color} />
    <Text style={[styles.actionText, { color }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalPadding,
    paddingVertical: spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  countText: { color: '#475569', fontSize: moderateScale(13), fontWeight: '700' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: moderateScale(13) },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: spacing.md, color: '#64748B', fontSize: moderateScale(14) },
  list: { padding: horizontalPadding, paddingBottom: spacing.xl * 2 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: moderateScale(15), fontWeight: '800', color: '#0F172A' },
  cardMeta: { marginTop: 3, fontSize: moderateScale(12), color: '#475569', fontWeight: '700' },
  cardDate: { marginTop: 3, fontSize: moderateScale(11), color: '#64748B' },
  notesText: { marginTop: spacing.sm, color: '#475569', fontSize: moderateScale(12), lineHeight: 18 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  actionBtn: {
    minWidth: '23%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  actionBtnDisabled: { opacity: 0.7 },
  actionText: { fontSize: moderateScale(11), fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingTop: spacing.xl * 2 },
  emptyTitle: { marginTop: spacing.md, fontSize: moderateScale(18), fontWeight: '800', color: '#334155' },
  emptySubtitle: {
    marginTop: 6,
    fontSize: moderateScale(13),
    color: '#94A3B8',
    textAlign: 'center',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: horizontalPadding,
    paddingBottom: spacing.xl,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: moderateScale(18), fontWeight: '900', color: '#0F172A' },
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: {
    marginBottom: 8,
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontSize: moderateScale(14),
  },
  inputMultiline: { minHeight: 90, paddingTop: 12 },
  typeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
  },
  typeChipText: { fontSize: moderateScale(11), color: '#475569', fontWeight: '700' },
  typeChipTextActive: { color: '#FFFFFF' },
  filePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    padding: 14,
  },
  fileTitle: { color: '#334155', fontSize: moderateScale(13), fontWeight: '700' },
  fileSub: { color: '#94A3B8', fontSize: moderateScale(11), marginTop: 2 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: spacing.lg },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  cancelBtnText: { color: '#334155', fontWeight: '800', fontSize: moderateScale(14) },
  saveBtn: {
    flex: 1.4,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: moderateScale(14) },
  viewerShell: { flex: 1, backgroundColor: '#0F172A' },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: horizontalPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#020617',
  },
  viewerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  viewerTitleWrap: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  viewerTitle: {
    color: '#F8FAFC',
    fontSize: moderateScale(15),
    fontWeight: '800',
  },
  viewerSubtitle: {
    marginTop: 2,
    color: '#94A3B8',
    fontSize: moderateScale(11),
    fontWeight: '600',
  },
  viewerBody: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  viewerFrame: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  viewerScroll: {
    flex: 1,
  },
  viewerImageWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  viewerImage: {
    width: '100%',
    height: 560,
    maxWidth: 960,
  },
  viewerLoading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
  },
  viewerLoadingText: {
    marginTop: spacing.md,
    color: '#E2E8F0',
    fontSize: moderateScale(13),
    fontWeight: '700',
  },
  viewerActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: horizontalPadding,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#020617',
  },
  viewerActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: '#111827',
  },
  viewerActionText: {
    fontSize: moderateScale(13),
    fontWeight: '800',
  },
});

export default KadaiDocument;
