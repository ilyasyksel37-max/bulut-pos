import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const PRESET_GLOBAL_PRODUCTS: Record<string, { name: string; category: string; suggestedPrice?: number; suggestedPurchasePrice?: number }> = {
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

function getSafeBarcodeDocId(barcode: string): string {
  const trimmed = (barcode || '').trim();
  return trimmed.replace(/\//g, '_slash_').replace(/\\/g, '_bslash_');
}

async function runSync() {
  console.log("Starting full sync of existing products to global_products pool...");
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  // 1. Seed presets
  console.log("1. Seeding preset products to global_products...");
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
  console.log(`Seeded ${batchCount} preset catalog items.`);

  // 2. Fetch all products from products collection
  console.log("2. Fetching products from 'products' collection...");
  const snap = await getDocs(collection(db, 'products'));
  console.log(`Found ${snap.size} total products in database.`);

  batch = writeBatch(db);
  batchCount = 0;
  let synced = 0;
  let skipped = 0;
  let batchIndex = 0;

  for (const pDoc of snap.docs) {
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
      batchIndex++;
      console.log(`Committing batch ${batchIndex} (${batchCount} items)... Total synced so far: ${synced}`);
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    batchIndex++;
    console.log(`Committing final batch ${batchIndex} (${batchCount} items)...`);
    await batch.commit();
  }

  console.log("--- SYNC SUMMARY ---");
  console.log(`Total Scanned in 'products': ${snap.size}`);
  console.log(`Total Synced to 'global_products': ${synced}`);
  console.log(`Skipped (missing barcode/name): ${skipped}`);
  console.log("Sync completed successfully!");
}

runSync().then(() => process.exit(0)).catch(err => {
  console.error("Sync error:", err);
  process.exit(1);
});
