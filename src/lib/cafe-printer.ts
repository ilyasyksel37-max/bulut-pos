import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface CafePrinterConfig {
  // 1. Yazıcı Donanım & Çıktı Biçimi
  paperWidth: '80mm' | '58mm' | '72mm';
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: 'monospace' | 'sans-serif' | 'courier';
  dividerStyle: 'dashed' | 'dotted' | 'solid';
  marginMm: number;
  autoClosePrintWindow: boolean;
  openCashDrawerOnPayment: boolean;
  printMethod: 'iframe' | 'popup';

  // 2. Masa Adisyon & Ön Hesap Fişi Şablonu
  billTitle: string;
  billHeaderNote: string;
  billShowLogoBadge: boolean;
  billLogoText: string;
  billCustomStoreTitle: string;
  billShowTableName: boolean;
  billShowAreaName: boolean;
  billShowWaiterName: boolean;
  billShowDateTime: boolean;
  billShowItemPortions: boolean;
  billShowItemNotes: boolean;
  billShowItemPrices: boolean;
  billShowVatBreakdown: boolean;
  billVatRate: number;
  billShowCoverCharge: boolean;
  billCoverChargeRate: number;
  billShowWifiInfo: boolean;
  billWifiSSID: string;
  billWifiPassword: string;
  billShowSocialMedia: boolean;
  billSocialHandle: string;
  billShowQrCode: boolean;
  billQrUrl: string;
  billFooterText: string;
  billCopies: number;

  // 3. Mutfak & Bar Sipariş Fişi Şablonu (KDS)
  kitchenTitle: string;
  kitchenShowLargeTable: boolean;
  kitchenShowArea: boolean;
  kitchenShowWaiter: boolean;
  kitchenShowTime: boolean;
  kitchenShowPortions: boolean;
  kitchenShowItemNotes: boolean;
  kitchenHighlightNotes: boolean;
  kitchenShowOrderNo: boolean;
  kitchenAutoPrintOnSend: boolean;
  kitchenCopies: number;

  // 4. Tahsilat & Kasa Kapanış Fişi
  paymentReceiptTitle: string;
  paymentAutoPrintOnClose: boolean;
  paymentShowCashier: boolean;
  paymentFooterNote: string;
}

export const DEFAULT_CAFE_PRINTER_CONFIG: CafePrinterConfig = {
  paperWidth: '80mm',
  fontSize: 'medium',
  fontFamily: 'monospace',
  dividerStyle: 'dashed',
  marginMm: 4,
  autoClosePrintWindow: false,
  openCashDrawerOnPayment: true,
  printMethod: 'iframe',

  billTitle: 'ADİSYON & HESAP BİLGİ FİŞİ',
  billHeaderNote: 'Ön Hesap Bilgilendirmesi',
  billShowLogoBadge: true,
  billLogoText: '★ KAFE & RESTORAN ★',
  billCustomStoreTitle: '',
  billShowTableName: true,
  billShowAreaName: true,
  billShowWaiterName: true,
  billShowDateTime: true,
  billShowItemPortions: true,
  billShowItemNotes: true,
  billShowItemPrices: true,
  billShowVatBreakdown: true,
  billVatRate: 10,
  billShowCoverCharge: false,
  billCoverChargeRate: 0,
  billShowWifiInfo: true,
  billWifiSSID: 'Misafir_Wifi',
  billWifiPassword: 'afiyetolsun',
  billShowSocialMedia: true,
  billSocialHandle: '@restorankafe',
  billShowQrCode: false,
  billQrUrl: '',
  billFooterText: 'Afiyet olsun, yine bekleriz!\nBu belge 213 sayılı V.U.K. hükümlerine göre bilgi amaçlıdır.',
  billCopies: 1,

  kitchenTitle: 'MUTFAK SİPARİŞ FİŞİ',
  kitchenShowLargeTable: true,
  kitchenShowArea: true,
  kitchenShowWaiter: true,
  kitchenShowTime: true,
  kitchenShowPortions: true,
  kitchenShowItemNotes: true,
  kitchenHighlightNotes: true,
  kitchenShowOrderNo: true,
  kitchenAutoPrintOnSend: false,
  kitchenCopies: 1,

  paymentReceiptTitle: 'KASA TAHSİLAT MAKBUZU',
  paymentAutoPrintOnClose: false,
  paymentShowCashier: true,
  paymentFooterNote: 'Ödemeniz için teşekkür ederiz. İyi günler dileriz.'
};

export function getCafePrinterStorageKey(tenantId?: string | null): string {
  return `cafe_printer_settings_${tenantId || 'default'}`;
}

export function loadCafePrinterSettings(tenantId?: string | null): CafePrinterConfig {
  try {
    const key = getCafePrinterStorageKey(tenantId);
    const raw = localStorage.getItem(key) || localStorage.getItem('cafe_printer_settings_default');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CAFE_PRINTER_CONFIG, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to parse local cafe printer settings:', e);
  }
  return { ...DEFAULT_CAFE_PRINTER_CONFIG };
}

export async function saveCafePrinterSettings(
  config: CafePrinterConfig,
  tenantId?: string | null
): Promise<void> {
  const key = getCafePrinterStorageKey(tenantId);
  try {
    localStorage.setItem(key, JSON.stringify(config));
    localStorage.setItem('cafe_printer_settings_default', JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }

  try {
    const docRef = doc(db, 'cafe_printer_settings', tenantId || 'default');
    await setDoc(docRef, {
      ...config,
      tenantId: tenantId || 'default',
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn('Failed to sync cafe printer settings to Firestore:', e);
  }
}

export function printCafeHtml(
  html: string,
  options?: { autoClose?: boolean; method?: 'iframe' | 'popup' }
): void {
  // 1. Immediately clean up any corrupted style or mount elements if they exist
  try {
    const staleStyle = document.getElementById('cafe-print-style');
    if (staleStyle) staleStyle.remove();
    const staleMount = document.getElementById('cafe-print-mount');
    if (staleMount) staleMount.remove();
  } catch (e) {}

  // 2. Primary Method: Dedicated clean print popup/window (Standard for Thermal POS Printers)
  // This NEVER touches the main window DOM or styles!
  try {
    const printWindow = window.open('', '_blank', 'width=420,height=680,scrollbars=yes,resizable=yes');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      return;
    }
  } catch (winErr) {
    console.warn('Popup blocked or window.open error:', winErr);
  }

  // 3. Fallback Method: Isolated Hidden Iframe
  // Styles inside iframe.contentDocument are completely scoped and CANNOT leak into the host page
  try {
    const existingFrame = document.getElementById('cafe-isolated-print-iframe');
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'cafe-isolated-print-iframe';
    iframe.setAttribute(
      'style',
      'position:fixed; right:0; bottom:0; width:10px; height:10px; border:none; opacity:0.01; pointer-events:none; z-index:-1;'
    );
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print error:', e);
        } finally {
          setTimeout(() => {
            try {
              iframe.remove();
            } catch (e) {}
          }, 4000);
        }
      }, 350);
    }
  } catch (err) {
    console.warn('printCafeHtml iframe fallback error:', err);
  }
}

export function buildCafeBillHtml(
  table: any,
  config: CafePrinterConfig,
  storeInfo: { name: string; phone?: string; address?: string }
): string {
  const storeName = config.billCustomStoreTitle?.trim() || storeInfo.name || 'RESTORAN & KAFE';
  const widthMm = config.paperWidth === '58mm' ? '54mm' : config.paperWidth === '72mm' ? '68mm' : '76mm';
  const baseFontPx = config.fontSize === 'small' ? '11px' : config.fontSize === 'large' ? '14px' : '12px';
  const borderStyle = config.dividerStyle || 'dashed';
  const borderCss = `border-bottom: 1px ${borderStyle} #000;`;
  
  const items = table?.bill?.items || [];
  const rawTotal = table?.bill?.total || items.reduce((s: number, i: any) => s + (Number(i.price || 0) * Number(i.qty || i.quantity || 1)), 0);
  
  // Kuver / Servis Bedeli hesabı
  let coverCharge = 0;
  if (config.billShowCoverCharge && config.billCoverChargeRate > 0) {
    coverCharge = Math.round(rawTotal * (config.billCoverChargeRate / 100));
  }
  const grandTotal = rawTotal + coverCharge;

  // KDV Dağılımı
  const vatAmount = (grandTotal * (config.billVatRate / (100 + config.billVatRate)));
  const subtotalBeforeVat = grandTotal - vatAmount;

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeFormatted = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8">
      <title>${config.billTitle} - ${table?.name || 'Masa'}</title>
      <style>
        @page { size: auto; margin: ${config.marginMm}mm; }
        body {
          font-family: ${config.fontFamily === 'sans-serif' ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial' : config.fontFamily === 'courier' ? '"Courier New", Courier, monospace' : '"Courier New", Courier, monospace'};
          width: ${widthMm};
          margin: 0 auto;
          padding: 6px;
          color: #000;
          background: #fff;
          font-size: ${baseFontPx};
          line-height: 1.35;
        }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: 900; }
        .row { display: flex; justify-content: space-between; align-items: flex-start; margin: 3px 0; }
        .divider { ${borderCss} margin: 7px 0; }
        .double-divider { border-bottom: 2px double #000; margin: 8px 0; }
        .badge {
          display: inline-block;
          border: 1px solid #000;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .item-row { margin: 4px 0; }
        .note { font-size: 10px; font-style: italic; margin-left: 10px; opacity: 0.85; }
        .total-box { font-size: 1.25em; font-weight: 900; }
        @media print {
          body { width: 100%; margin: 0; padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="center">
        ${config.billShowLogoBadge && config.billLogoText ? `<div class="badge">${config.billLogoText}</div>` : ''}
        <div class="bold" style="font-size: 1.2em; text-transform: uppercase; letter-spacing: 0.5px;">${storeName}</div>
        ${storeInfo.address ? `<div style="font-size: 10px; margin-top: 2px;">${storeInfo.address}</div>` : ''}
        ${storeInfo.phone ? `<div style="font-size: 10px;">Tel: ${storeInfo.phone}</div>` : ''}
        <div class="bold" style="font-size: 1.05em; margin-top: 4px; text-transform: uppercase; text-decoration: underline;">${config.billTitle}</div>
        ${config.billHeaderNote ? `<div style="font-size: 10px; font-style: italic;">${config.billHeaderNote}</div>` : ''}
      </div>

      <div class="divider"></div>

      <div>
        ${config.billShowTableName ? `<div class="row"><span class="bold">MASA:</span><span class="bold" style="font-size: 1.15em;">${table?.name || 'Masa'}${config.billShowAreaName && table?.area ? ` (${table.area})` : ''}</span></div>` : ''}
        ${config.billShowWaiterName ? `<div class="row"><span>Garson:</span><span class="bold">${table?.bill?.waiter || 'Personel'}</span></div>` : ''}
        ${config.billShowDateTime ? `<div class="row"><span>Tarih & Saat:</span><span>${dateFormatted} ${timeFormatted}</span></div>` : ''}
        <div class="row"><span>Adisyon No:</span><span style="font-family: monospace;">#${(table?.bill?.id || `B-${Date.now().toString().slice(-6)}`).toUpperCase()}</span></div>
      </div>

      <div class="divider"></div>

      <div class="bold row" style="font-size: 0.9em; text-transform: uppercase;">
        <span>ÜRÜN / AÇIKLAMA</span>
        ${config.billShowItemPrices ? `<span>TUTAR</span>` : ''}
      </div>
      <div class="divider"></div>

      <div>
        ${items.map((it: any) => {
          const qty = Number(it.qty || it.quantity || 1);
          const price = Number(it.price || 0);
          const lineTotal = price * qty;
          const portionStr = (config.billShowItemPortions && it.portion && it.portion !== 'Standart') ? ` [${it.portion}]` : '';
          return `
            <div class="item-row">
              <div class="row">
                <span style="flex: 1; padding-right: 6px;">
                  <span class="bold">${qty}x</span> ${it.name}${portionStr}
                </span>
                ${config.billShowItemPrices ? `<span class="bold" style="white-space: nowrap;">${lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>` : ''}
              </div>
              ${config.billShowItemNotes && it.notes ? `<div class="note">↳ Not: ${it.notes}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>

      <div class="divider"></div>

      <div>
        ${(coverCharge > 0 || config.billShowVatBreakdown) ? `
          <div class="row"><span>Ara Toplam:</span><span>${rawTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span></div>
        ` : ''}
        ${coverCharge > 0 ? `
          <div class="row"><span>Servis / Kuver Bedeli (%${config.billCoverChargeRate}):</span><span>${coverCharge.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span></div>
        ` : ''}
        ${config.billShowVatBreakdown ? `
          <div class="row" style="font-size: 10px; opacity: 0.9;"><span>KDV Hariç Tutar:</span><span>${subtotalBeforeVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span></div>
          <div class="row" style="font-size: 10px; opacity: 0.9;"><span>Hesaplanan KDV (%${config.billVatRate}):</span><span>${vatAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span></div>
        ` : ''}
        
        <div class="double-divider"></div>
        <div class="row total-box">
          <span>TOPLAM TUTAR:</span>
          <span>${grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
        </div>
      </div>

      <div class="divider"></div>

      ${(config.billShowWifiInfo && (config.billWifiSSID || config.billWifiPassword)) ? `
        <div class="center" style="margin: 6px 0; font-size: 10.5px; border: 1px dotted #000; padding: 4px;">
          <div class="bold">📶 MİSAFİR WI-FI AĞI</div>
          ${config.billWifiSSID ? `<div>Ağ: <span class="bold">${config.billWifiSSID}</span></div>` : ''}
          ${config.billWifiPassword ? `<div>Şifre: <span class="bold">${config.billWifiPassword}</span></div>` : ''}
        </div>
      ` : ''}

      ${config.billShowSocialMedia && config.billSocialHandle ? `
        <div class="center bold" style="font-size: 10px; margin-top: 4px;">
          📷 Bizi takip edin: ${config.billSocialHandle}
        </div>
      ` : ''}

      ${config.billShowQrCode && config.billQrUrl ? `
        <div class="center" style="margin: 6px auto; padding: 4px; border: 1px dotted #000; width: fit-content; font-size: 9.5px;">
          <div class="bold">[ DİJİTAL MENÜ & PUAN ]</div>
          <div style="font-family: monospace;">${config.billQrUrl.slice(0, 32)}</div>
        </div>
      ` : ''}

      ${config.billFooterText ? `
        <div class="center" style="font-size: 10px; margin-top: 7px; white-space: pre-wrap;">${config.billFooterText}</div>
      ` : ''}

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            ${config.autoClosePrintWindow ? 'setTimeout(function() { window.close(); }, 600);' : ''}
          }, 250);
        };
      </script>
    </body>
    </html>
  `;
}

export function buildCafeKitchenOrderHtml(
  order: any,
  config: CafePrinterConfig,
  storeInfo: { name: string }
): string {
  const widthMm = config.paperWidth === '58mm' ? '54mm' : config.paperWidth === '72mm' ? '68mm' : '76mm';
  const baseFontPx = config.fontSize === 'small' ? '12px' : config.fontSize === 'large' ? '15px' : '13px';
  const borderStyle = config.dividerStyle || 'dashed';
  const borderCss = `border-bottom: 2px ${borderStyle} #000;`;

  const items = order?.items || [];
  const orderTime = order?.time || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const tableName = order?.tableName || order?.name || 'Masa Bilgisi Yok';
  const areaName = order?.area || '';
  const waiter = order?.waiter || 'Garson';
  const orderId = order?.id ? String(order.id).slice(-5).toUpperCase() : Math.floor(1000 + Math.random() * 9000).toString();

  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8">
      <title>${config.kitchenTitle} - ${tableName}</title>
      <style>
        @page { size: auto; margin: ${config.marginMm}mm; }
        body {
          font-family: ${config.fontFamily === 'sans-serif' ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial' : '"Courier New", Courier, monospace'};
          width: ${widthMm};
          margin: 0 auto;
          padding: 6px;
          color: #000;
          background: #fff;
          font-size: ${baseFontPx};
          line-height: 1.3;
        }
        .center { text-align: center; }
        .bold { font-weight: 900; }
        .row { display: flex; justify-content: space-between; align-items: flex-start; margin: 3px 0; }
        .divider { ${borderCss} margin: 8px 0; }
        .kitchen-box {
          border: 3px solid #000;
          padding: 8px 6px;
          margin: 6px 0;
          text-align: center;
        }
        .table-huge {
          font-size: 2.2em;
          font-weight: 900;
          letter-spacing: 1px;
          text-transform: uppercase;
          line-height: 1.1;
        }
        .item-line {
          margin: 8px 0;
          padding-bottom: 5px;
          border-bottom: 1px dotted #777;
        }
        .qty-huge {
          font-size: 1.35em;
          font-weight: 900;
          margin-right: 6px;
        }
        .item-name {
          font-size: 1.15em;
          font-weight: 900;
        }
        .item-portion {
          font-size: 0.95em;
          font-weight: bold;
          text-decoration: underline;
        }
        .item-note {
          margin-top: 3px;
          padding: 3px 5px;
          border: 1.5px solid #000;
          background: #f0f0f0;
          font-weight: 900;
          font-size: 0.95em;
        }
        @media print {
          body { width: 100%; margin: 0; padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="center">
        <div class="bold" style="font-size: 1.25em; text-transform: uppercase; letter-spacing: 1px;">
          👨‍🍳 ${config.kitchenTitle}
        </div>
        <div style="font-size: 10px; font-weight: bold;">${storeInfo.name || 'MUTFAK BİRİMİ'}</div>
      </div>

      <div class="kitchen-box">
        <div class="table-huge">${tableName}</div>
        ${(config.kitchenShowArea && areaName) ? `<div style="font-weight: 900; font-size: 1.1em; text-transform: uppercase;">[ ${areaName} ]</div>` : ''}
      </div>

      <div>
        ${config.kitchenShowTime ? `<div class="row"><span class="bold">Sipariş Saati:</span><span class="bold" style="font-size: 1.1em;">${orderTime}</span></div>` : ''}
        ${config.kitchenShowWaiter ? `<div class="row"><span>Garson:</span><span class="bold">${waiter}</span></div>` : ''}
        ${config.kitchenShowOrderNo ? `<div class="row"><span>Sipariş Sıra No:</span><span class="bold" style="font-family: monospace;">#${orderId}</span></div>` : ''}
      </div>

      <div class="divider"></div>

      <div class="bold" style="font-size: 1em; text-transform: uppercase; margin-bottom: 4px;">
        HAZIRLANACAK SİPARİŞLER:
      </div>

      <div>
        ${items.map((it: any) => {
          const qty = Number(it.qty || it.quantity || 1);
          const portionStr = (config.kitchenShowPortions && it.portion && it.portion !== 'Standart') ? ` [${it.portion}]` : '';
          return `
            <div class="item-line">
              <div style="display: flex; align-items: baseline;">
                <span class="qty-huge">${qty}x</span>
                <span class="item-name">${it.name}</span>
                ${portionStr ? `<span class="item-portion" style="margin-left: 4px;">${portionStr}</span>` : ''}
              </div>
              ${(config.kitchenShowItemNotes && it.notes) ? `
                <div class="item-note">
                  ⚠️ NOT: ${it.notes}
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>

      <div class="divider"></div>
      <div class="center bold" style="font-size: 11px;">
        *** SİPARİŞİ EKSİKSİZ VE SICAK ÇIKARINIZ ***
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            ${config.autoClosePrintWindow ? 'setTimeout(function() { window.close(); }, 600);' : ''}
          }, 250);
        };
      </script>
    </body>
    </html>
  `;
}

export function buildCafePaymentReceiptHtml(
  table: any,
  paymentMethod: string,
  config: CafePrinterConfig,
  storeInfo: { name: string },
  cashierName?: string
): string {
  const storeName = config.billCustomStoreTitle?.trim() || storeInfo.name || 'RESTORAN & KAFE';
  const widthMm = config.paperWidth === '58mm' ? '54mm' : config.paperWidth === '72mm' ? '68mm' : '76mm';
  const baseFontPx = config.fontSize === 'small' ? '11px' : config.fontSize === 'large' ? '14px' : '12px';
  const items = table?.bill?.items || [];
  const total = table?.bill?.total || items.reduce((s: number, i: any) => s + (Number(i.price || 0) * Number(i.qty || i.quantity || 1)), 0);

  const methodLabel = paymentMethod === 'cash' ? '💵 NAKİT' : paymentMethod === 'card' ? '💳 KREDİ KARTI' : '🔀 PARÇALI ÖDEME';

  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8">
      <title>${config.paymentReceiptTitle} - ${table?.name}</title>
      <style>
        @page { size: auto; margin: ${config.marginMm}mm; }
        body {
          font-family: ${config.fontFamily === 'sans-serif' ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial' : '"Courier New", Courier, monospace'};
          width: ${widthMm};
          margin: 0 auto;
          padding: 6px;
          color: #000;
          font-size: ${baseFontPx};
          line-height: 1.35;
        }
        .center { text-align: center; }
        .bold { font-weight: 900; }
        .row { display: flex; justify-content: space-between; margin: 3px 0; }
        .divider { border-bottom: 1px dashed #000; margin: 7px 0; }
        .total-box { font-size: 1.25em; font-weight: 900; border-top: 2px solid #000; padding-top: 5px; }
      </style>
    </head>
    <body>
      <div class="center">
        <div class="bold" style="font-size: 1.2em; text-transform: uppercase;">${storeName}</div>
        <div class="bold" style="font-size: 1.05em; margin-top: 3px;">${config.paymentReceiptTitle}</div>
        <div style="font-size: 10px;">Tarih: ${new Date().toLocaleString('tr-TR')}</div>
      </div>

      <div class="divider"></div>

      <div class="row"><span class="bold">Masa:</span><span class="bold">${table?.name || 'Masa'}</span></div>
      ${config.paymentShowCashier ? `<div class="row"><span>Kasiyer:</span><span class="bold">${cashierName || 'Kasa Görevlisi'}</span></div>` : ''}
      <div class="row"><span>Ödeme Türü:</span><span class="bold">${methodLabel}</span></div>

      <div class="divider"></div>

      <div>
        ${items.map((it: any) => `
          <div class="row">
            <span>${it.qty || it.quantity || 1}x ${it.name}</span>
            <span class="bold">${((it.price || 0) * (it.qty || it.quantity || 1)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
        `).join('')}
      </div>

      <div class="divider"></div>

      <div class="row total-box">
        <span>TAHSİL EDİLEN:</span>
        <span>${Number(total).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
      </div>

      <div class="divider"></div>
      <div class="center" style="font-size: 10.5px; margin-top: 6px;">
        ${config.paymentFooterNote}
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            ${config.autoClosePrintWindow ? 'setTimeout(function() { window.close(); }, 600);' : ''}
          }, 250);
        };
      </script>
    </body>
    </html>
  `;
}
