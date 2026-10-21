import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export interface GlobalProduct {
  barcode: string;
  name: string;
  category: string;
  imageUrl?: string;
  suggestedPrice?: number;
  suggestedPurchasePrice?: number;
  source?: 'firestore' | 'preset';
}

// Built-in curated popular Turkish market, grocery & stationery barcodes for instant offline/zero-latency match
export const PRESET_GLOBAL_PRODUCTS: Record<string, Omit<GlobalProduct, 'barcode'>> = {
  // Gıda & Atıştırmalık
  '8690504112103': { name: 'Ülker Çikolatalı Gofret 35g', category: 'Gıda & Atıştırmalık', suggestedPrice: 12.50, suggestedPurchasePrice: 8.50 },
  '8690504018153': { name: 'Ülker Biskrem Kakaolu 100g', category: 'Gıda & Atıştırmalık', suggestedPrice: 18.00, suggestedPurchasePrice: 12.00 },
  '8690504032104': { name: 'Ülker Halley Çikolata Kaplamalı Bisküvi 66g', category: 'Gıda & Atıştırmalık', suggestedPrice: 20.00, suggestedPurchasePrice: 14.00 },
  '8690504052300': { name: 'Ülker Dido Çikolatalı Gofret 35g', category: 'Gıda & Atıştırmalık', suggestedPrice: 18.00, suggestedPurchasePrice: 12.50 },
  '8690526010015': { name: 'Eti Karam Gurme Bitter 50g', category: 'Gıda & Atıştırmalık', suggestedPrice: 20.00, suggestedPurchasePrice: 14.00 },
  '8690526023152': { name: 'Eti Crax Çubuk Kraker Baharatlı 50g', category: 'Gıda & Atıştırmalık', suggestedPrice: 10.00, suggestedPurchasePrice: 6.50 },
  '8690526065121': { name: 'Eti Canga Yer Fıstıklı Karamel Bar 45g', category: 'Gıda & Atıştırmalık', suggestedPrice: 16.00, suggestedPurchasePrice: 11.00 },
  '8690526011401': { name: 'Eti Browni İntense Çikolatalı Kek 50g', category: 'Gıda & Atıştırmalık', suggestedPrice: 18.00, suggestedPurchasePrice: 12.50 },
  '8690526074253': { name: 'Eti Hoşbeş Fındıklı Gofret 142g', category: 'Gıda & Atıştırmalık', suggestedPrice: 32.00, suggestedPurchasePrice: 22.00 },
  '8690526042108': { name: 'Eti Burçak Bisküvi 131g', category: 'Gıda & Atıştırmalık', suggestedPrice: 22.00, suggestedPurchasePrice: 15.00 },

  // İçecek & Su & Meşrubat
  '5449000000996': { name: 'Coca-Cola Orijinal Kutu 330ml', category: 'İçecek', suggestedPrice: 35.00, suggestedPurchasePrice: 24.00 },
  '5449000014535': { name: 'Fanta Portakal Kutu 330ml', category: 'İçecek', suggestedPrice: 35.00, suggestedPurchasePrice: 24.00 },
  '5449000131805': { name: 'Sprite Kutu 330ml', category: 'İçecek', suggestedPrice: 35.00, suggestedPurchasePrice: 24.00 },
  '5449000052926': { name: 'Coca-Cola Zero Sugar Kutu 330ml', category: 'İçecek', suggestedPrice: 35.00, suggestedPurchasePrice: 24.00 },
  '8690637010253': { name: 'Hayat Doğal Kaynak Suyu 0.5L', category: 'İçecek', suggestedPrice: 10.00, suggestedPurchasePrice: 5.00 },
  '8690637010260': { name: 'Hayat Doğal Kaynak Suyu 1.5L', category: 'İçecek', suggestedPrice: 18.00, suggestedPurchasePrice: 10.00 },
  '8690766060128': { name: 'Kızılay Doğal Maden Suyu 200ml', category: 'İçecek', suggestedPrice: 10.00, suggestedPurchasePrice: 5.50 },
  '8690766060142': { name: 'Beypazarı Doğal Maden Suyu 200ml', category: 'İçecek', suggestedPrice: 10.00, suggestedPurchasePrice: 5.50 },
  '8690637000025': { name: 'Lipton Ice Tea Şeftali 330ml Kutu', category: 'İçecek', suggestedPrice: 30.00, suggestedPurchasePrice: 20.00 },
  '8690637000032': { name: 'Lipton Ice Tea Limon 330ml Kutu', category: 'İçecek', suggestedPrice: 30.00, suggestedPurchasePrice: 20.00 },

  // Süt & Şarküteri
  '8690565001019': { name: 'Sütaş Tam Yağlı Ayran 285ml', category: 'Süt & Şarküteri', suggestedPrice: 15.00, suggestedPurchasePrice: 9.50 },
  '8690565003020': { name: 'Sütaş Günlük Süt 1L', category: 'Süt & Şarküteri', suggestedPrice: 42.00, suggestedPurchasePrice: 31.00 },
  '8690565004058': { name: 'Sütaş Kaşar Peyniri 400g', category: 'Süt & Şarküteri', suggestedPrice: 145.00, suggestedPurchasePrice: 110.00 },
  '8690565002016': { name: 'Sütaş Kaymaklı Yoğurt 1kg', category: 'Süt & Şarküteri', suggestedPrice: 65.00, suggestedPurchasePrice: 48.00 },
  '8690565005017': { name: 'Pınar Doğal Süt 1L', category: 'Süt & Şarküteri', suggestedPrice: 44.00, suggestedPurchasePrice: 32.00 },

  // Temizlik & Kişisel Bakım
  '8690506085108': { name: 'Duru Güzellik Sabunu 4x150g Klasik', category: 'Temizlik & Kişisel Bakım', suggestedPrice: 65.00, suggestedPurchasePrice: 45.00 },
  '8690530018151': { name: 'Selpak Cep Mendil 10lu Paket', category: 'Temizlik & Kişisel Bakım', suggestedPrice: 12.00, suggestedPurchasePrice: 7.50 },
  '8690530021014': { name: 'Solo Kağıt Havlu 2li Paket', category: 'Temizlik & Kişisel Bakım', suggestedPrice: 45.00, suggestedPurchasePrice: 30.00 },
  '8690506012012': { name: 'Eyüp Sabri Tuncer Kolonya Klasik Limon 400ml', category: 'Temizlik & Kişisel Bakım', suggestedPrice: 75.00, suggestedPurchasePrice: 52.00 },

  // Kırtasiye & Ofis Malzemeleri
  '8690844101016': { name: 'Faber-Castell 12li Klasik Kuru Boya Kalemi', category: 'Kırtasiye', suggestedPrice: 125.00, suggestedPurchasePrice: 85.00 },
  '8690844201013': { name: 'Faber-Castell Kırmızı Kurşun Kopya Kalemi', category: 'Kırtasiye', suggestedPrice: 15.00, suggestedPurchasePrice: 9.00 },
  '8690844301010': { name: 'Faber-Castell Sınav Silgisi Büyük Boy', category: 'Kırtasiye', suggestedPrice: 20.00, suggestedPurchasePrice: 12.00 },
  '8690844401017': { name: 'Faber-Castell Metal Çiftli Kalemtıraş', category: 'Kırtasiye', suggestedPrice: 35.00, suggestedPurchasePrice: 22.00 },
  '8690844501014': { name: 'Faber-Castell 0.7mm 2B Kalem Ucu 24lü', category: 'Kırtasiye', suggestedPrice: 22.00, suggestedPurchasePrice: 13.00 },
  '8690844501021': { name: 'Faber-Castell 0.5mm 2B Kalem Ucu 24lü', category: 'Kırtasiye', suggestedPrice: 22.00, suggestedPurchasePrice: 13.00 },
  '8690826010015': { name: 'Adel 2B Dereceli Kurşun Kalem', category: 'Kırtasiye', suggestedPrice: 12.00, suggestedPurchasePrice: 7.00 },
  '8690826020014': { name: 'Adel Başlık Kalemi Kırmızı', category: 'Kırtasiye', suggestedPrice: 14.00, suggestedPurchasePrice: 8.00 },
  '4006856001234': { name: 'Rotring Tikky 0.7mm Mekanik Kurşun Kalem', category: 'Kırtasiye', suggestedPrice: 165.00, suggestedPurchasePrice: 110.00 },
  '4006856001241': { name: 'Rotring Tikky 0.5mm Mekanik Kurşun Kalem', category: 'Kırtasiye', suggestedPrice: 165.00, suggestedPurchasePrice: 110.00 },
  '4015000412345': { name: 'Pritt Stick Yapıştırıcı 22g', category: 'Kırtasiye', suggestedPrice: 45.00, suggestedPurchasePrice: 28.00 },
  '4015000412352': { name: 'Pritt Stick Yapıştırıcı 43g Büyük', category: 'Kırtasiye', suggestedPrice: 75.00, suggestedPurchasePrice: 48.00 },
  '8691234567890': { name: 'Gıpta A4 80 Yaprak Spiralli Kareli Defter', category: 'Kırtasiye', suggestedPrice: 55.00, suggestedPurchasePrice: 35.00 },
  '8691234567891': { name: 'Gıpta A4 80 Yaprak Spiralli Çizgili Defter', category: 'Kırtasiye', suggestedPrice: 55.00, suggestedPurchasePrice: 35.00 },
  '8697412850012': { name: 'Copier Bond A4 80gr 500lü Fotokopi Kağıdı', category: 'Fotokopi & Kağıt', suggestedPrice: 195.00, suggestedPurchasePrice: 155.00 },
  '8690826090017': { name: 'Bic Round Stic Mavi Tükenmez Kalem', category: 'Kırtasiye', suggestedPrice: 12.00, suggestedPurchasePrice: 7.00 },
  '8690826090024': { name: 'Bic Round Stic Siyah Tükenmez Kalem', category: 'Kırtasiye', suggestedPrice: 12.00, suggestedPurchasePrice: 7.00 },
  '8690826090031': { name: 'Bic Round Stic Kırmızı Tükenmez Kalem', category: 'Kırtasiye', suggestedPrice: 12.00, suggestedPurchasePrice: 7.00 },
  '8691888001015': { name: 'Pensan My Tech 0.7 Jel Tükenmez Kalem', category: 'Kırtasiye', suggestedPrice: 18.00, suggestedPurchasePrice: 11.00 },
  '8697401540019': { name: 'Vege Şeffaf Koli Bandı 45x100m', category: 'Ambalaj & Koli', suggestedPrice: 45.00, suggestedPurchasePrice: 28.00 },
  '8697401540026': { name: 'Vege Şeffaf Para Bandı 12x33m', category: 'Kırtasiye', suggestedPrice: 15.00, suggestedPurchasePrice: 8.50 },
};

/**
 * Sanitize barcode string to be safe for Firestore document IDs (no forward slashes)
 */
export function getSafeBarcodeDocId(barcode: string): string {
  const trimmed = (barcode || '').trim();
  return trimmed.replace(/\//g, '_slash_').replace(/\\/g, '_bslash_');
}

/**
 * Look up product details from the shared global catalog (Firestore or preloaded catalog).
 */
export async function lookupGlobalProduct(barcode: string): Promise<GlobalProduct | null> {
  const clean = (barcode || '').trim();
  if (!clean) return null;
  const safeId = getSafeBarcodeDocId(clean);

  // 1. Check Firestore global_products collection by direct safe document ID (most efficient)
  try {
    const docRef = doc(db, 'global_products', safeId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.name) {
        return {
          barcode: data.barcode || clean,
          name: data.name,
          category: data.category || 'Genel',
          imageUrl: data.imageUrl || '',
          suggestedPrice: typeof data.suggestedPrice === 'number' ? data.suggestedPrice : (typeof data.price === 'number' ? data.price : undefined),
          suggestedPurchasePrice: typeof data.suggestedPurchasePrice === 'number' ? data.suggestedPurchasePrice : (typeof data.purchasePrice === 'number' ? data.purchasePrice : undefined),
          source: 'firestore'
        };
      }
    }

    // 2. Fallback query by barcode field if doc ID differed
    const q = query(collection(db, 'global_products'), where('barcode', '==', clean));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const first = querySnap.docs[0];
      const data = first.data();
      if (data && data.name) {
        return {
          barcode: data.barcode || clean,
          name: data.name,
          category: data.category || 'Genel',
          imageUrl: data.imageUrl || '',
          suggestedPrice: typeof data.suggestedPrice === 'number' ? data.suggestedPrice : (typeof data.price === 'number' ? data.price : undefined),
          suggestedPurchasePrice: typeof data.suggestedPurchasePrice === 'number' ? data.suggestedPurchasePrice : (typeof data.purchasePrice === 'number' ? data.purchasePrice : undefined),
          source: 'firestore'
        };
      }
    }
  } catch (err) {
    console.warn("Global catalog Firestore lookup warning:", err);
  }

  // 3. Fallback to built-in presets (works instantly offline / before any tenant created products)
  if (PRESET_GLOBAL_PRODUCTS[clean]) {
    const preset = PRESET_GLOBAL_PRODUCTS[clean];
    return {
      barcode: clean,
      name: preset.name,
      category: preset.category,
      imageUrl: preset.imageUrl,
      suggestedPrice: preset.suggestedPrice,
      suggestedPurchasePrice: preset.suggestedPurchasePrice,
      source: 'preset'
    };
  }

  return null;
}

/**
 * Save product details into the shared global pool so other tenants won't need to retype product name/category.
 */
export async function saveToGlobalCatalog(product: {
  barcode: string;
  name: string;
  category?: string;
  imageUrl?: string;
  price?: number;
  purchasePrice?: number;
  sourceTenantName?: string;
}): Promise<void> {
  const cleanBarcode = (product.barcode || '').trim();
  const cleanName = (product.name || '').trim();
  if (!cleanBarcode || !cleanName) return;

  try {
    const safeId = getSafeBarcodeDocId(cleanBarcode);
    const docRef = doc(db, 'global_products', safeId);
    await setDoc(docRef, {
      barcode: cleanBarcode,
      name: cleanName,
      category: product.category || 'Genel',
      imageUrl: product.imageUrl || '',
      suggestedPrice: Number(product.price) || 0,
      suggestedPurchasePrice: Number(product.purchasePrice) || 0,
      sourceTenantName: product.sourceTenantName || '',
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("Could not save to global_products pool:", err);
  }
}

export interface GlobalSyncResult {
  totalScanned: number;
  syncedCount: number;
  skippedNoBarcode: number;
  errorCount: number;
  totalInGlobal: number;
}

/**
 * Sync all existing products from the system's 'products' collection into the shared 'global_products' pool.
 */
export async function syncAllExistingProductsToGlobal(
  onProgress?: (progress: { current: number; total: number; synced: number }) => void
): Promise<GlobalSyncResult> {
  const { writeBatch } = await import('firebase/firestore');
  
  // 1. Seed built-in preset products
  let batch = writeBatch(db);
  let batchCount = 0;

  for (const [barcode, p] of Object.entries(PRESET_GLOBAL_PRODUCTS)) {
    const safeId = getSafeBarcodeDocId(barcode);
    const docRef = doc(db, 'global_products', safeId);
    batch.set(docRef, {
      barcode,
      name: p.name,
      category: p.category || 'Genel',
      suggestedPrice: p.suggestedPrice || 0,
      suggestedPurchasePrice: p.suggestedPurchasePrice || 0,
      sourceTenantName: 'Sistem Standart Kataloğu',
      source: 'preset',
      updatedAt: serverTimestamp()
    }, { merge: true });
    batchCount++;
  }
  await batch.commit();

  // 2. Read all products in products collection
  const snap = await getDocs(collection(db, 'products'));
  const total = snap.size;

  batch = writeBatch(db);
  batchCount = 0;
  let synced = 0;
  let skipped = 0;
  let errors = 0;
  let scanned = 0;

  for (const pDoc of snap.docs) {
    scanned++;
    const data = pDoc.data();
    const barcode = String(data.barcode || data.barkod || data.code || '').trim();
    const name = String(data.name || data.ad || data.urunAdi || data.title || '').trim();

    if (!barcode || !name || barcode.length < 2) {
      skipped++;
      continue;
    }

    const safeId = getSafeBarcodeDocId(barcode);
    const category = data.category || data.kategori || 'Genel';
    const imageUrl = data.imageUrl || data.image || data.resim || '';
    const suggestedPrice = Number(data.salePrice ?? data.price ?? data.satisFiyati ?? data.fiyat ?? 0);
    const suggestedPurchasePrice = Number(data.purchasePrice ?? data.costPrice ?? data.alisFiyati ?? data.buyingPrice ?? 0);
    const tenantName = data.tenant_name || data.tenantName || data.shopName || '';

    const globalRef = doc(db, 'global_products', safeId);
    batch.set(globalRef, {
      barcode,
      name,
      category,
      imageUrl,
      suggestedPrice,
      suggestedPurchasePrice,
      sourceTenantName: tenantName,
      source: 'existing_products_sync',
      updatedAt: serverTimestamp()
    }, { merge: true });

    batchCount++;
    synced++;

    if (batchCount >= 400) {
      try {
        await batch.commit();
      } catch (err) {
        console.warn("Batch commit error in global sync:", err);
        errors++;
      }
      batch = writeBatch(db);
      batchCount = 0;
    }

    if (onProgress && scanned % 30 === 0) {
      onProgress({ current: scanned, total, synced });
    }
  }

  if (batchCount > 0) {
    try {
      await batch.commit();
    } catch (err) {
      console.warn("Final batch commit error in global sync:", err);
      errors++;
    }
  }

  if (onProgress) {
    onProgress({ current: total, total, synced });
  }

  // Count total in global_products
  let totalInGlobal = synced;
  try {
    const globalSnap = await getDocs(collection(db, 'global_products'));
    totalInGlobal = globalSnap.size;
  } catch {
    // ignore
  }

  return {
    totalScanned: scanned,
    syncedCount: synced,
    skippedNoBarcode: skipped,
    errorCount: errors,
    totalInGlobal
  };
}
