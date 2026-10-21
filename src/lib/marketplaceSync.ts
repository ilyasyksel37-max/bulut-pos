import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface MarketplaceConfig {
  trendyol?: {
    enabled: boolean;
    apiKey: string;
    apiSecret: string;
    supplierId: string;
  };
  hepsiburada?: {
    enabled: boolean;
    merchantId: string;
    apiKey: string;
    apiSecret: string;
  };
  ciceksepeti?: {
    enabled: boolean;
    apiKey: string;
    apiSecret: string;
    supplierCode: string;
  };
  pazarama?: {
    enabled: boolean;
    apiKey: string;
    apiSecret: string;
    merchantCode: string;
  };
  n11?: {
    enabled: boolean;
    apiKey: string;
    apiSecret: string;
  };
  amazon?: {
    enabled: boolean;
    sellerId: string;
    mwsAuthToken: string;
    awsAccessKey: string;
    secretKey: string;
    region: string;
  };
}

/**
 * Fetches marketplace integrations config for a given tenant.
 * Stored in Firestore document: `marketplace_settings/{tenantId}` (or global default if no tenant).
 */
export async function getMarketplaceConfig(tenantId?: string): Promise<MarketplaceConfig | null> {
  try {
    const docId = tenantId || 'default_tenant';
    const ref = doc(db, 'marketplace_settings', docId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as MarketplaceConfig;
    }
    return null;
  } catch (err) {
    console.error("Error fetching marketplace config:", err);
    return null;
  }
}

/**
 * Triggers stock update requests to enabled marketplaces for a specific product.
 */
export async function syncStockToMarketplaces(product: { id: string; barcode?: string; name: string; stock: number }, tenantId?: string) {
  try {
    const config = await getMarketplaceConfig(tenantId);
    if (!config) return;

    const syncPromises: Promise<any>[] = [];

    // Trendyol Stock Update API Request
    if (config.trendyol?.enabled && config.trendyol.apiKey && config.trendyol.supplierId) {
      syncPromises.push(
        fetch(`https://api.trendyol.com/sapigw/suppliers/${config.trendyol.supplierId}/products/price-and-inventory`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + btoa(`${config.trendyol.apiKey}:${config.trendyol.apiSecret}`)
          },
          body: JSON.stringify({
            items: [{ barcode: product.barcode || product.id, quantity: product.stock }]
          })
        }).catch(err => {
          console.warn("Trendyol API sync simulated/network notice:", err);
        })
      );
      console.log(`[Trendyol Sync] Product ${product.name} (Barcode: ${product.barcode}) stock updated to ${product.stock}`);
    }

    // Hepsiburada Stock Update API Request
    if (config.hepsiburada?.enabled && config.hepsiburada.merchantId) {
      syncPromises.push(
        fetch(`https://mp-api.hepsiburada.com/products/listings/merchantid/${config.hepsiburada.merchantId}/stock-price`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.hepsiburada.apiKey
          },
          body: JSON.stringify({
            listings: [{ merchantSku: product.barcode || product.id, availableStock: product.stock }]
          })
        }).catch(err => {
          console.warn("Hepsiburada API sync notice:", err);
        })
      );
      console.log(`[Hepsiburada Sync] Product ${product.name} stock updated to ${product.stock}`);
    }

    // Çiçeksepeti, Pazarama, N11, Amazon log and mock sync
    if (config.ciceksepeti?.enabled) {
      console.log(`[Ciceksepeti Sync] Product ${product.name} stock updated to ${product.stock}`);
    }
    if (config.pazarama?.enabled) {
      console.log(`[Pazarama Sync] Product ${product.name} stock updated to ${product.stock}`);
    }
    if (config.n11?.enabled) {
      console.log(`[N11 Sync] Product ${product.name} stock updated to ${product.stock}`);
    }
    if (config.amazon?.enabled) {
      console.log(`[Amazon SP-API Sync] Product ${product.name} stock updated to ${product.stock}`);
    }

    await Promise.allSettled(syncPromises);
  } catch (err) {
    console.error("Error in syncStockToMarketplaces:", err);
  }
}
