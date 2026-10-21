/**
 * Multi-Tenant Core Utility for POS & Inventory System
 * Ensures complete data isolation between different business tenants/stores.
 */

export type StaffType = 'admin' | 'store' | 'field' | 'warehouse';

export interface TenantInfo {
  id: string;
  name: string;
  code?: string;
  status: 'active' | 'suspended' | 'trial' | 'inactive';
  package?: 'standart' | 'pro' | 'enterprise';
  expiresAt?: string; // ISO date string
  adminUsername?: string;
  phone?: string;
  address?: string;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  lastPaymentMethod?: 'Nakit' | 'Havale' | 'Kredi Kartı';
  enabledModules?: Record<string, boolean>;
  modules?: Record<string, boolean>; // Sectoral modules (kirtasiye_modulu, bakkal_market_modulu, tekstil_modulu, esarp_sal_modulu, kozmetik_modulu, tuhafiye_modulu)
  sectoralSettings?: Record<string, any>; // Persistent pricing & config for sectoral modules
  depoYonetimiAktif?: boolean; // Depo Yönetimi Modülü Aktif mi?
  createdAt?: string;
}

export interface ProductVariant {
  id: string;
  name: string; // e.g. "Beden: L, Renk: Siyah" or "90x90 İpek - Pudra"
  type?: 'size' | 'color' | 'fabric' | 'shade' | 'custom';
  barcode?: string;
  price?: number; // Optional custom price for this variant
  purchasePrice?: number;
  stock: number;
}

export interface TenantFeature {
  id: string;
  name: string;
  description: string;
  category: 'Satış & Kasa' | 'Stok & Barkod' | 'Cari & Operasyon' | 'Gelişmiş Araçlar' | 'Sektörel Modüller';
  defaultEnabled: boolean;
  recommendedPackages?: ('standart' | 'pro' | 'enterprise')[];
}

export const AVAILABLE_TENANT_FEATURES: TenantFeature[] = [
  {
    id: 'barcode',
    name: 'Barkod Oluştur & Etiket Basımı',
    description: 'Özel ürün barkodu üretme, etiket şablonları tasarlama ve yazıcıdan doğrudan barkod basma modülü.',
    category: 'Stok & Barkod',
    defaultEnabled: true,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'pos',
    name: 'Hızlı Satış (POS) Ekranı',
    description: 'Barkod okutarak hızlı perakende satış, nakit/kart/veresiye tahsilat ve fiş kesme ekranı.',
    category: 'Satış & Kasa',
    defaultEnabled: true,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'mobile_pos_sync',
    name: 'Mobilden Satış & Masaüstü Kasaya Gönderme',
    description: 'Mobilden yapılan satışların veya oluşturulan sepetlerin bütün kullanıcılar için PC masaüstü ana kasaya anlık bildirim ve sesli uyarı ile gönderilmesi.',
    category: 'Satış & Kasa',
    defaultEnabled: true,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'kasa',
    name: 'Kasa Yönetimi & Döviz',
    description: 'Nakit, banka ve döviz (USD/EUR) kasa hareketleri, gün sonu devir ve kasa raporları.',
    category: 'Satış & Kasa',
    defaultEnabled: true,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'field_orders',
    name: 'Saha Satış & Sipariş Dağıtımı',
    description: 'Saha plasiyerlerinin müşterilerden sipariş alması, merkeze anlık bildirim ve sipariş hazırlama akışı.',
    category: 'Satış & Kasa',
    defaultEnabled: true,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'quotations',
    name: 'Resmi Teklif Hazırlama',
    description: 'Kurumsal resmi fiyat teklifleri hazırlama, PDF indirme ve resmi teklif çıktısı alma modülü.',
    category: 'Satış & Kasa',
    defaultEnabled: true,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'inventory',
    name: 'Stok & Ürün Yönetimi',
    description: 'Ürün kataloğu, alış/satış fiyatları, kritik stok uyarıları ve ürün düzenleme ekranı.',
    category: 'Stok & Barkod',
    defaultEnabled: true,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'excel_import',
    name: 'Excel ile Toplu Ürün İçe Aktarma',
    description: 'Excel (.xlsx/.xls) tablolarından tek tıkla binlerce ürünü sisteme aktarma desteği.',
    category: 'Stok & Barkod',
    defaultEnabled: true,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'stock_reset',
    name: 'Toplu Stok Sıfırlama Yetkisi',
    description: 'Sayım öncesi tüm stokları veya seçili depoları tek seferde sıfırlama aracı.',
    category: 'Stok & Barkod',
    defaultEnabled: false,
    recommendedPackages: ['enterprise']
  },
  {
    id: 'camera_scanner',
    name: 'Kamera ile Canlı Barkod Okuma',
    description: 'Cihazın kamerası veya web kamerası ile optik barkod okuma özelliği.',
    category: 'Gelişmiş Araçlar',
    defaultEnabled: true,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'product_image',
    name: 'Ürün Görseli Ekleme (Mini Boy)',
    description: 'Stok kartlarına mini ürün görseli ekleme ve opsiyonel kapatma/açma yönetimi.',
    category: 'Stok & Barkod',
    defaultEnabled: true,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'customers',
    name: 'Müşteriler & Cari Hesaplar',
    description: 'Müşteri bakiyeleri, veresiye takibi, cari ekstre ve borç tahsilat işlemleri.',
    category: 'Cari & Operasyon',
    defaultEnabled: true,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'suppliers',
    name: 'Tedarikçiler & Alış Faturaları',
    description: 'Tedarikçi borç/alacak takibi, toptancı cari ekstreleri ve mal kabul ödemeleri.',
    category: 'Cari & Operasyon',
    defaultEnabled: true,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'expenses',
    name: 'Giderler & Masraf Takibi',
    description: 'Kira, fatura, personel avansı gibi dükkan masraflarının takibi ve kasa düşümü.',
    category: 'Cari & Operasyon',
    defaultEnabled: true,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'dashboard',
    name: 'Raporlar & Ciro Grafikleri',
    description: 'Günlük/aylık ciro analizleri, en çok satanlar ve kâr-zarar raporlama ekranı.',
    category: 'Gelişmiş Araçlar',
    defaultEnabled: true,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'personnel',
    name: 'Personel & Kasiyer Yönetimi',
    description: 'İşletme bünyesinde kasiyer ve saha elemanı ekleme, şifre ve yetki sınırlandırma.',
    category: 'Gelişmiş Araçlar',
    defaultEnabled: true,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'personnel_tracking',
    name: 'Personel İzin & Devamsızlık Takibi',
    description: 'Personel izin günü hesaplama, işe gelmediği gün ve sağlık raporu takibi.',
    category: 'Gelişmiş Araçlar',
    defaultEnabled: true,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'marketplace',
    name: 'Pazaryeri Entegrasyonları (Trendyol vb.)',
    description: 'Trendyol, Hepsiburada, Çiçeksepeti, Pazarama, N11 ve Amazon pazaryeri API entegrasyonu.',
    category: 'Gelişmiş Araçlar',
    defaultEnabled: true,
    recommendedPackages: ['pro', 'enterprise']
  },
  // SEKTÖREL MODÜLLER (Feature Switches)
  {
    id: 'kirtasiye_modulu',
    name: 'Kırtasiye Modülü',
    description: 'Fotokopi/baskı ücreti hesabı, sayfa başı çekim, kitap/okul listesi paketleme, gelişmiş raf/ürün etiket basımı.',
    category: 'Sektörel Modüller',
    defaultEnabled: false,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'bakkal_market_modulu',
    name: 'Bakkal & Market Modülü',
    description: 'Elektronik terazi ve kilogramlı barkod okuma/ayrıştırma, hızlı gramajlı satış, SKT takibi.',
    category: 'Sektörel Modüller',
    defaultEnabled: false,
    recommendedPackages: ['standart', 'pro', 'enterprise']
  },
  {
    id: 'tekstil_modulu',
    name: 'Tekstil Modülü',
    description: 'Beden ve renk varyant takibi, askı/beden etiket basımı.',
    category: 'Sektörel Modüller',
    defaultEnabled: false,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'esarp_sal_modulu',
    name: 'Eşarp & Şal Modülü',
    description: 'Renk varyantı takibi, desen/baskı kodu, kumaş türü [İpek, Medine İpeği, Pamuk, Bambu, Tafta, Şifon vb.], ebat/model kategorisi, seri/paket satış.',
    category: 'Sektörel Modüller',
    defaultEnabled: false,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'kozmetik_modulu',
    name: 'Kozmetik Modülü',
    description: 'Renk/numara/ton varyantları, set/paket ürünler, tester/numune stok takibi, son kullanma/açıldıktan sonraki kullanım süresi takibi.',
    category: 'Sektörel Modüller',
    defaultEnabled: false,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'tuhafiye_modulu',
    name: 'Tuhafiye Modülü',
    description: 'Metre/makara/desen bazlı ürün takibi, iplik/kumaş kodlama, parça/küsüratlı stok satışı.',
    category: 'Sektörel Modüller',
    defaultEnabled: false,
    recommendedPackages: ['pro', 'enterprise']
  },
  {
    id: 'kafe_restoran_modulu',
    name: 'Kafe & Restoran Modülü',
    description: 'Masa düzenleme, kat planı, adisyon açma, porsiyon/not seçimi, mutfak KDS ekranı ve parçalı ödeme.',
    category: 'Sektörel Modüller',
    defaultEnabled: false,
    recommendedPackages: ['pro', 'enterprise']
  }
];

export type SectoralModuleId = 
  | 'kirtasiye_modulu' 
  | 'bakkal_market_modulu' 
  | 'tekstil_modulu' 
  | 'esarp_sal_modulu' 
  | 'kozmetik_modulu' 
  | 'tuhafiye_modulu'
  | 'kafe_restoran_modulu';

export interface SectoralModuleDefinition {
  id: SectoralModuleId;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  iconName: 'Printer' | 'Scale' | 'Shirt' | 'Sparkles' | 'Palette' | 'Scissors' | 'Utensils';
  badgeColor: string;
  features: string[];
}

export const SECTORAL_MODULES: SectoralModuleDefinition[] = [
  {
    id: 'kirtasiye_modulu',
    name: 'Kırtasiye Modülü',
    shortName: 'Kırtasiye & Baskı',
    tagline: 'Fotokopi, Baskı, Okul Paketi ve Raf Etiketi',
    description: 'Fotokopi/baskı ücreti hesabı, sayfa başı çekim, kitap/okul listesi paketleme, gelişmiş raf/ürün etiket basımı.',
    iconName: 'Printer',
    badgeColor: 'blue',
    features: [
      'Fotokopi ve sayfa başı dijital çekim ücreti hesabı (A4/A3, Renkli/Siyah-Beyaz, Çift Yüz)',
      'Kitap ve okul listesi paketleme (Sınıf bazlı set oluşturma & tek tıkla toplu satış)',
      'Gelişmiş raf ve mini kırtasiye ürün etiket basımı (Barkodsuz kalem, silgi etiketleri)',
      'Ciltleme, spiral, laminasyon ve PVC kaplama ek hizmet hesaplayıcısı'
    ]
  },
  {
    id: 'bakkal_market_modulu',
    name: 'Bakkal & Market Modülü',
    shortName: 'Market & Terazi',
    tagline: 'Terazi Barkod Çözümleme, Gramajlı Satış & SKT',
    description: 'Elektronik terazi ve kilogramlı barkod okuma/ayrıştırma, hızlı gramajlı satış, SKT takibi.',
    iconName: 'Scale',
    badgeColor: 'amber',
    features: [
      '27, 28 ve 29 ile başlayan EAN-13 terazi gramajlı barkodlarını otomatik ayrıştırma',
      'Hızlı gramajlı / tartılı satış ekranı (Manav, şarküteri, kuruyemiş, bakliyat)',
      'Son kullanma tarihi (SKT) takibi ve kritik gün kalan parti uyarıları',
      'Hızlı temel gıda & tekel sepet butonları'
    ]
  },
  {
    id: 'tekstil_modulu',
    name: 'Tekstil Modülü',
    shortName: 'Tekstil & Beden',
    tagline: 'Beden & Renk Matrisi, Askı Etiket Basımı',
    description: 'Beden ve renk varyant takibi, askı/beden etiket basımı.',
    iconName: 'Shirt',
    badgeColor: 'indigo',
    features: [
      'Beden & Renk Varyant Matrisi (XS, S, M, L, XL, XXL, 36-46 beden kombinasyonları)',
      'Tekstil askı & sallantı etiket basımı (Beden kutusu, renk kodu ve barkod baskısı)',
      'Beden bazlı stok analizi ve en çok tükenen beden raporu',
      'Sezonluk tekstil grubu ve koleksiyon sınıflandırması'
    ]
  },
  {
    id: 'esarp_sal_modulu',
    name: 'Eşarp & Şal Modülü',
    shortName: 'Eşarp & Şal',
    tagline: 'Kumaş Türü, Desen No, Ebat & Seri Satış',
    description: 'Renk varyantı takibi, desen/baskı kodu, kumaş türü [İpek, Medine İpeği, Pamuk, Bambu, Tafta, Şifon vb.], ebat/model kategorisi, seri/paket satış.',
    iconName: 'Sparkles',
    badgeColor: 'rose',
    features: [
      'Kumaş türü seçimi (İpek, Medine İpeği, Pamuk, Bambu, Tafta, Şifon, Viskon, Kaşmir, Modal, Krep)',
      'Desen no, baskı kodu ve zemin renk varyantları (Örn: DSN-102 Gül Kurusu)',
      'Ebat & Model Kategorisi (90x90 Eşarp, 100x100 Büyük Eşarp, 75x190 Şal, 80x200 Şal, Bone)',
      'Toptan seri & paket satış (12\'li renk asorti paket fiyatı, yarım seri, tekli perakende bozum)'
    ]
  },
  {
    id: 'kozmetik_modulu',
    name: 'Kozmetik Modülü',
    shortName: 'Kozmetik & Tester',
    tagline: 'Renk/Ton No, Hediye Seti, Tester & PAO Takibi',
    description: 'Renk/numara/ton varyantları, set/paket ürünler, tester/numune stok takibi, son kullanma/açıldıktan sonraki kullanım süresi takibi.',
    iconName: 'Palette',
    badgeColor: 'purple',
    features: [
      'Renk, ton ve numara varyantları (Ruj tonu, fondöten numarası 01/02/03, oje kodu)',
      'Hediye seti ve paket ürün yönetimi (Parfüm kiti, makyaj sandığı paketleme)',
      'Tester ve numune stok takibi (Müşteri deneme ürünleri ve promosyon stokları)',
      'Açıldıktan sonra kullanım süresi (PAO: 6M, 12M, 24M) ve SKT uyarıları'
    ]
  },
  {
    id: 'tuhafiye_modulu',
    name: 'Tuhafiye Modülü',
    shortName: 'Tuhafiye & Dikiş',
    tagline: 'Metre/Makara Satış, İplik Lot & Dikiş Aksesuarı',
    description: 'Metre/makara/desen bazlı ürün takibi, iplik/kumaş kodlama, parça/küsüratlı stok satışı.',
    iconName: 'Scissors',
    badgeColor: 'emerald',
    features: [
      'Metre & makara bazlı küsüratlı satış (Kurdela, güpür, dantel, lastik, fermuar, tela)',
      'İplik ve yumak lot / renk kodu eşleştirme (Örgüde aynı parti lot takibi)',
      'Parça kumaş, hurda metraj ve küsüratlı stok düşümü',
      'Düğme, çıtçıt, broş ve hobi aksesuarı sayım aracı'
    ]
  },
  {
    id: 'kafe_restoran_modulu',
    name: 'Kafe & Restoran Modülü',
    shortName: 'Kafe & Restoran',
    tagline: 'Masa, Kat Planı, Adisyon & Mutfak (KDS)',
    description: 'Masa düzenleme, kat planı, adisyon açma, porsiyon/not seçimi, mutfak KDS ekranı ve parçalı ödeme.',
    iconName: 'Utensils',
    badgeColor: 'orange',
    features: [
      'Salon, Teras, Bahçe gibi dinamik alanlar ve masa renk durumları',
      'Masaya özel hızlı adisyon, porsiyon/variant seçimi, adisyon notu',
      'Mutfağa sipariş gönderme ve anlık KDS mutfak takip ekranı',
      'Parçalı ödeme, kişi başı hesap, ikram/iskonto ve adisyon kapatma'
    ]
  }
];

export const isTenantSectorModuleEnabled = (
  tenant: TenantInfo | null | undefined, 
  moduleId: string
): boolean => {
  if (!tenant) return false;
  // Primary check: tenant.modules object
  if (tenant.modules && typeof tenant.modules[moduleId] === 'boolean') {
    return tenant.modules[moduleId];
  }
  // Secondary check: enabledModules
  if (tenant.enabledModules && typeof tenant.enabledModules[moduleId] === 'boolean') {
    return tenant.enabledModules[moduleId];
  }
  // Default fallback for legacy primary tenant (Beyoğlu Kırtasiye)
  if (tenant.id === PRIMARY_TENANT_ID && moduleId === 'kirtasiye_modulu') {
    return true;
  }
  return false;
};

export const isTenantFeatureEnabled = (
  tenant: TenantInfo | null | undefined, 
  featureId: string
): boolean => {
  if (!tenant) return true;
  // If it's a sectoral module, check via isTenantSectorModuleEnabled
  if (SECTORAL_MODULES.some(m => m.id === featureId)) {
    return isTenantSectorModuleEnabled(tenant, featureId);
  }
  if (!tenant.enabledModules) return true;
  return tenant.enabledModules[featureId] !== false;
};

export const getDefaultModulesForPackage = (pkg: 'standart' | 'pro' | 'enterprise'): Record<string, boolean> => {
  const result: Record<string, boolean> = {};
  AVAILABLE_TENANT_FEATURES.forEach(f => {
    if (f.category === 'Sektörel Modüller') {
      result[f.id] = false; // Sectoral modules are toggled explicitly
    } else if (pkg === 'enterprise') {
      result[f.id] = true;
    } else if (pkg === 'pro') {
      result[f.id] = f.id !== 'stock_reset';
    } else {
      // standart package
      const standartAllowed = ['pos', 'mobile_pos_sync', 'kasa', 'inventory', 'customers', 'barcode', 'expenses', 'camera_scanner'];
      result[f.id] = standartAllowed.includes(f.id);
    }
  });
  return result;
};

export const PRIMARY_TENANT_ID = 'tenant-beyoglu';

export const DEFAULT_TENANT: TenantInfo = {
  id: PRIMARY_TENANT_ID,
  name: 'Beyoğlu Kırtasiye',
  code: 'BEYOGLU',
  status: 'active',
  package: 'enterprise',
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  adminUsername: 'admin_beyoglu',
  phone: '0555 123 45 67',
  address: 'Beyoğlu / İstanbul',
  depoYonetimiAktif: true,
  enabledModules: getDefaultModulesForPackage('enterprise'),
  modules: {
    kirtasiye_modulu: true,
    bakkal_market_modulu: false,
    tekstil_modulu: false,
    esarp_sal_modulu: false,
    kozmetik_modulu: false,
    tuhafiye_modulu: false
  }
};

const STORAGE_TENANT_KEY = 'sep_current_tenant_id';

export const SEPETAY_LEGACY_APPLET_ID = '36ef09c0-0dc2-48a5-8551-5f7ed5163106';

/**
 * Checks if the given tenant identifier corresponds to Sepetay (legacy or current alias)
 */
export const isSepetayTenant = (tenantId?: string | null): boolean => {
  if (!tenantId) return false;
  const clean = tenantId.trim().toLowerCase();
  return (
    clean === 'sepetay' ||
    clean === 'tenant-sepet' ||
    clean === SEPETAY_LEGACY_APPLET_ID ||
    clean === '67bf23d0-0b63-4e46-8306-a4416516043b' ||
    clean === 'ai-studio-sepetaykrtasiyep-36ef09c0-0dc2-48a5-8551-5f7ed5163106' ||
    clean === 'ai-studio-sepetaykrtasiyep-67bf23d0-0b63-4e46-8306-a4416516043b'
  );
};

export const getActiveTenantId = (): string => {
  if (typeof window === 'undefined') return PRIMARY_TENANT_ID;
  return localStorage.getItem(STORAGE_TENANT_KEY) || PRIMARY_TENANT_ID;
};

export const setActiveTenantId = (tenantId: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_TENANT_KEY, tenantId);
};

/**
 * Checks if a document belongs to the target tenant.
 * When Sepetay tenant is active:
 * - Directly maps to products, customers, and sales belonging to Sepetay and legacy database (36ef09c0-0dc2-48a5-8551-5f7ed5163106).
 * Other tenants remain strictly isolated in their own collections.
 */
export const isDocInTenant = (docData: any, targetTenantId: string = getActiveTenantId()): boolean => {
  if (!docData) return false;

  const isSepetayActive = isSepetayTenant(targetTenantId);

  // SEPETAY DIRECT FIREBASE MAPPING MODE:
  if (isSepetayActive) {
    const docTId = String(docData.tenantId || docData.tenant_id || '').trim();
    if (!docTId) {
      // Untagged legacy documents (customers, products, transactions) belong to Sepetay
      return true;
    }
    // If a tenantId is explicitly present, it must be a Sepetay alias (never another tenant's document)
    return isSepetayTenant(docTId);
  }

  // OTHER TENANTS (Strict isolation):
  const docTId = String(docData.tenantId || docData.tenant_id || '').trim();
  if (docTId) {
    // Never allow Sepetay documents to leak into other tenants
    if (
      isSepetayTenant(docTId) ||
      docData.legacy_applet_id === SEPETAY_LEGACY_APPLET_ID ||
      docData.legacyAppletId === SEPETAY_LEGACY_APPLET_ID ||
      docData.firebase_mapping === SEPETAY_LEGACY_APPLET_ID ||
      docData.direct_firebase_mapping === true
    ) {
      return false;
    }
    return docTId === targetTenantId;
  }

  // Legacy documents without tenantId belong strictly to Sepetay, NOT to other tenants
  return false;
};

/**
 * Strictly checks if a user document in 'users' collection belongs to the given tenant's personnel.
 * Excludes Super Admin accounts and untagged auth records so only the tenant's own personnel can be selected.
 */
export const isTenantPersonnel = (userDoc: any, targetTenantId: string = getActiveTenantId()): boolean => {
  if (!userDoc) return false;

  const email = String(userDoc.email || '').toLowerCase();
  const username = String(userDoc.username || '').toLowerCase();

  // Never include platform Super Admin / master accounts as tenant personnel
  if (
    userDoc.isSuperAdmin === true ||
    userDoc.id === 'admin-master' ||
    email.includes('ilyasyksel') ||
    email.includes('sepetaykrtasiyep') ||
    username === 'admin'
  ) {
    return false;
  }

  const docTId = String(userDoc.tenantId || userDoc.tenant_id || '').trim();
  if (!docTId) {
    return false;
  }

  if (isSepetayTenant(targetTenantId)) {
    return isSepetayTenant(docTId);
  }

  return docTId === targetTenantId;
};

/**
 * Injects tenantId and legacy Firebase mapping tags into an object.
 */
export const withTenant = <T extends Record<string, any>>(data: T, targetTenantId: string = getActiveTenantId()): T & { tenantId: string; tenant_id?: string; legacy_applet_id?: string } => {
  const isSep = isSepetayTenant(targetTenantId);
  const finalTenantId = isSep ? 'sepetay' : targetTenantId;
  return {
    ...data,
    tenantId: (data as any).tenantId || finalTenantId,
    ...(isSep ? {
      tenant_id: 'sepetay',
      legacy_applet_id: SEPETAY_LEGACY_APPLET_ID,
      legacyAppletId: SEPETAY_LEGACY_APPLET_ID,
      firebase_project: SEPETAY_LEGACY_APPLET_ID,
      direct_firebase_mapping: true
    } : {})
  };
};

export const getStaffTypeBadge = (staffType?: StaffType | string) => {
  switch (staffType) {
    case 'admin':
      return { label: 'İşletme Yöneticisi', badge: 'Yönetici (Tam Yetkili)', color: 'purple' };
    case 'warehouse':
      return { label: 'Depo Görevlisi', badge: 'Depo & Sevkiyat (Stok & Transfer)', color: 'amber' };
    case 'field':
      return { label: 'Saha Satış Personeli', badge: 'Saha Elemanı (Sipariş & Cari)', color: 'emerald' };
    case 'store':
    default:
      return { label: 'Mağaza Personeli', badge: 'Kasiyer (POS & Kasa)', color: 'blue' };
  }
};

/**
 * Calculates remaining membership period breakdown (years, months, days) precisely
 */
export interface RemainingDurationInfo {
  isExpired: boolean;
  isUnlimited: boolean;
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalDaysPast?: number;
  formattedText: string;
  badgeColor: 'emerald' | 'amber' | 'rose' | 'blue';
}

export const getRemainingDuration = (expiresAt?: string): RemainingDurationInfo => {
  if (!expiresAt) {
    return {
      isExpired: false,
      isUnlimited: true,
      years: 0,
      months: 0,
      days: 0,
      totalDays: 9999,
      formattedText: 'Sınırsız / Süresiz Üyelik',
      badgeColor: 'blue'
    };
  }

  const expiryDate = new Date(expiresAt);
  const now = new Date();

  // If expired
  if (now.getTime() > expiryDate.getTime()) {
    const totalDaysPast = Math.max(1, Math.ceil((now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24)));
    return {
      isExpired: true,
      isUnlimited: false,
      years: 0,
      months: 0,
      days: 0,
      totalDays: -totalDaysPast,
      totalDaysPast,
      formattedText: `Süresi Doldu (${totalDaysPast} gün önce)`,
      badgeColor: 'rose'
    };
  }

  // Exact calendar difference calculation (years, months, days)
  let y = expiryDate.getFullYear() - now.getFullYear();
  let m = expiryDate.getMonth() - now.getMonth();
  let d = expiryDate.getDate() - now.getDate();

  if (d < 0) {
    // Borrow days from previous month
    const prevMonthLastDay = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), 0).getDate();
    d += prevMonthLastDay;
    m -= 1;
  }

  if (m < 0) {
    m += 12;
    y -= 1;
  }

  const totalDays = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const parts: string[] = [];
  if (y > 0) parts.push(`${y} yıl`);
  if (m > 0) parts.push(`${m} ay`);
  if (d > 0 || parts.length === 0) parts.push(`${d} gün`);

  const formattedText = `${parts.join(' ')} kaldı`;
  const badgeColor = totalDays <= 7 ? 'rose' : totalDays <= 30 ? 'amber' : 'emerald';

  return {
    isExpired: false,
    isUnlimited: false,
    years: Math.max(0, y),
    months: Math.max(0, m),
    days: Math.max(0, d),
    totalDays,
    formattedText,
    badgeColor
  };
};
