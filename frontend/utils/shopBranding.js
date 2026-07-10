import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { base_url } from '../config';

const BACKEND_URL = (base_url || '').replace(/\/api\/?$/, '');

// ── Company Logo ────────────────────────────────────────────────────────────
// The Company Logo is a fixed brand asset — it is NEVER sourced from MongoDB
// or an Admin upload. It always loads from the bundled file below.
export const LOGO_ASSET = require('../assets/logo.png');

let _logoDataUriPromise = null; // resolved once per app session, then cached

const loadStaticLogoDataUri = async () => {
  console.log('[Logo] loading fixed asset from assets/logo.png');
  try {
    const [asset] = await Asset.loadAsync(LOGO_ASSET);
    const fileUri = asset.localUri || asset.uri;
    console.log('[Logo] resolved asset uri:', fileUri);
    if (!fileUri) throw new Error('Asset.loadAsync returned no localUri/uri');
    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    if (!base64) throw new Error('Read logo file but got empty base64 content');
    console.log(`[Logo] loaded OK (${base64.length} base64 chars)`);
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error('[Logo] FAILED to load assets/logo.png:', error?.message || error);
    return '';
  }
};

// Always returns the fixed assets/logo.png as a data: URI for embedding in
// HTML/PDF templates. Ignores any profile/MongoDB data — kept as a no-op
// param so existing call sites (which pass a shop profile) don't need to change.
export const getLogoDataUri = () => {
  if (!_logoDataUriPromise) _logoDataUriPromise = loadStaticLogoDataUri();
  return _logoDataUriPromise;
};

// ── Authorized Signature ────────────────────────────────────────────────────
// Unlike the logo, the signature is still an Admin-managed upload stored in
// MongoDB (ShopProfile.signatureUrl / signatureBase64).
//
// MongoDB Atlas is a persistent, shared cloud database, but the backend's
// local disk (where signatureUrl-hosted files live) is NOT persistent on
// most hosts (e.g. Render wipes local disk on every restart/redeploy/cold
// start). So signatureBase64 — sitting right there in the same MongoDB
// document — is the reliable source; the URL is a best-effort optimization
// only, tried second, and skipped entirely once base64 is available.
const resolveSignatureDataUri = async (url, base64) => {
  if (base64) {
    console.log(`[Signature] using base64 stored on profile (${base64.length} chars)`);
    return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  }
  if (url) {
    const fullUrl = url.startsWith('http') ? url : `${BACKEND_URL}${url}`;
    console.log('[Signature] no base64 on profile — resolving from URL:', fullUrl);
    try {
      const cacheFile = `${FileSystem.cacheDirectory}shop_signature_cache.png`;
      const { uri: downloadedUri, status } = await FileSystem.downloadAsync(fullUrl, cacheFile);
      // downloadAsync does NOT throw on HTTP error status codes (404/500/etc) —
      // it happily writes the error page body to disk and resolves normally.
      // Without this check a dead URL would silently "succeed" with a page of
      // HTML masquerading as image bytes instead of failing visibly.
      if (status < 200 || status >= 300) {
        console.error(`[Signature] URL returned HTTP ${status} — not a valid image:`, fullUrl);
      } else {
        const b64 = await FileSystem.readAsStringAsync(downloadedUri, { encoding: FileSystem.EncodingType.Base64 });
        if (b64) {
          console.log(`[Signature] loaded OK from URL (${b64.length} base64 chars)`);
          return `data:image/png;base64,${b64}`;
        }
        console.warn('[Signature] download succeeded but file was empty:', fullUrl);
      }
    } catch (error) {
      console.error('[Signature] failed to load from URL:', fullUrl, '-', error?.message || error);
    }
  }
  console.log('[Signature] no image uploaded — hiding image area');
  return '';
};

export const getSignatureDataUri = (profile) => {
  console.log('[Signature] MongoDB profile fields:', {
    signatureUrl: profile?.signatureUrl || '(empty)',
    signatureBase64: profile?.signatureBase64 ? `(set, ${profile.signatureBase64.length} chars)` : '(empty)',
  });
  return resolveSignatureDataUri(profile?.signatureUrl, profile?.signatureBase64);
};
