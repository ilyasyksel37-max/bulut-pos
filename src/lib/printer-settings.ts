export interface PrinterSettingsConfig {
  // 1. Genel Yazıcı & Otomasyon Ayarları
  defaultFormat: 'ask' | 'a4' | 'thermal';
  autoPrintOnSale: boolean;
  copyCount: number;
  autoClosePrintWindow: boolean;
  openCashDrawer: boolean;
  autoCutPaper: boolean;
  printMethod: 'popup' | 'inline';

  // 2. Termal Fiş Yazıcı Ayarları & Şablon
  thermalPaperWidth: '80mm' | '58mm' | '72mm';
  thermalFontSize: 'small' | 'medium' | 'large';
  thermalFontFamily: 'monospace' | 'sans-serif' | 'courier';
  thermalHeaderAlignment: 'left' | 'center' | 'right';
  thermalDividerStyle: 'dashed' | 'dotted' | 'solid';
  thermalLineSpacing: 'compact' | 'normal' | 'relaxed';
  thermalMarginMm: number;
  thermalShowLogoBadge: boolean;
  thermalLogoBadgeText: string;
  thermalCustomTitle: string;
  thermalCustomSubtitle: string;
  thermalShowOrderNumberBox: boolean;
  thermalShowStoreAddress: boolean;
  thermalShowStorePhone: boolean;
  thermalShowCustomerInfo: boolean;
  thermalShowSellerInfo: boolean;
  thermalShowItemBarcodes: boolean;
  thermalShowDiscountDetails: boolean;
  thermalShowTaxBreakdown: boolean;
  thermalShowCustomerBalance: boolean;
  thermalShowBottomBarcode: boolean;
  thermalShowQrCode: boolean;
  thermalQrCodeText: string;
  thermalSocialHandle: string;
  thermalFooterText: string;

  // 3. A4 Fatura / Teslim Formu Şablon Ayarları
  a4PaperSize: 'A4-portrait' | 'A4-landscape' | 'A5-portrait';
  a4ColorTheme: 'blue' | 'slate' | 'emerald' | 'indigo' | 'rose' | 'amber';
  a4HeaderLayout: 'classic' | 'centered' | 'modern-banner';
  a4TableStyle: 'grid' | 'striped' | 'minimal';
  a4ShowLogoBadge: boolean;
  a4LogoBadgeText: string;
  a4CustomStoreTitle: string;
  a4DocumentTitle: string;
  a4TaxOffice: string;
  a4TaxNumber: string;
  a4ShowStoreAddress: boolean;
  a4ShowCustomerBalanceBox: boolean;
  a4ShowItemBarcodes: boolean;
  a4ShowUnitColumn: boolean;
  a4ShowDiscountColumn: boolean;
  a4ShowTaxDetails: boolean;
  a4ShowBankIban: boolean;
  a4CustomIbanText: string;
  a4ShowSignatures: boolean;
  a4StampTitle: string;
  a4ShowWatermark: boolean;
  a4WatermarkText: string;
  a4ShowQrCode: boolean;
  a4ShowLegalNote: boolean;
  a4LegalNoteText: string;
  a4FooterText: string;

  // 4. Barkod & Raf Etiketi Yazıcı Ayarları
  labelSize: '40x20mm' | '50x30mm' | '60x40mm' | '38x25mm';
  labelShowStoreName: boolean;
  labelShowKdvIncluded: boolean;
  labelShowDate: boolean;
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettingsConfig = {
  defaultFormat: 'ask',
  autoPrintOnSale: true,
  copyCount: 1,
  autoClosePrintWindow: false,
  openCashDrawer: true,
  autoCutPaper: true,
  printMethod: 'inline',

  thermalPaperWidth: '80mm',
  thermalFontSize: 'medium',
  thermalFontFamily: 'monospace',
  thermalHeaderAlignment: 'center',
  thermalDividerStyle: 'dashed',
  thermalLineSpacing: 'normal',
  thermalMarginMm: 4,
  thermalShowLogoBadge: true,
  thermalLogoBadgeText: '★ KURUMSAL MAĞAZA ★',
  thermalCustomTitle: '',
  thermalCustomSubtitle: 'PERAKENDE SATIŞ FİŞİ',
  thermalShowOrderNumberBox: true,
  thermalShowStoreAddress: true,
  thermalShowStorePhone: true,
  thermalShowCustomerInfo: true,
  thermalShowSellerInfo: true,
  thermalShowItemBarcodes: false,
  thermalShowDiscountDetails: true,
  thermalShowTaxBreakdown: true,
  thermalShowCustomerBalance: true,
  thermalShowBottomBarcode: true,
  thermalShowQrCode: false,
  thermalQrCodeText: 'https://pos.beyoglukirtasiye.tr',
  thermalSocialHandle: '',
  thermalFooterText: 'Teşekkür ederiz. İyi günlerde kullanınız.\nDeğişim süresi fiş ile 7 gündür.',

  a4PaperSize: 'A4-portrait',
  a4ColorTheme: 'blue',
  a4HeaderLayout: 'classic',
  a4TableStyle: 'grid',
  a4ShowLogoBadge: true,
  a4LogoBadgeText: 'KURUMSAL SATIŞ BELGESİ',
  a4CustomStoreTitle: '',
  a4DocumentTitle: 'PERAKENDE SATIŞ & TESLİM BİLGİ FORMU',
  a4TaxOffice: '',
  a4TaxNumber: '',
  a4ShowStoreAddress: true,
  a4ShowCustomerBalanceBox: true,
  a4ShowItemBarcodes: true,
  a4ShowUnitColumn: true,
  a4ShowDiscountColumn: true,
  a4ShowTaxDetails: true,
  a4ShowBankIban: false,
  a4CustomIbanText: '',
  a4ShowSignatures: true,
  a4StampTitle: 'Teslim Eden (Firma Kaşe / İmza)',
  a4ShowWatermark: false,
  a4WatermarkText: 'BİLGİ FİŞİ / İRSALİYE',
  a4ShowQrCode: true,
  a4ShowLegalNote: true,
  a4LegalNoteText: 'Bu belge 213 sayılı V.U.K. hükümlerine göre bilgi amaçlı düzenlenmiştir. Maliye onaylı fatura yerine geçmez.',
  a4FooterText: 'Bizi tercih ettiğiniz için teşekkür ederiz. İyi günlerde kullanınız.',

  labelSize: '40x20mm',
  labelShowStoreName: true,
  labelShowKdvIncluded: true,
  labelShowDate: false
};

export function getPrinterSettingsStorageKey(tenantId?: string | null): string {
  return `pos_printer_settings_${tenantId || 'default'}`;
}

export function loadPrinterSettings(tenantId?: string | null): PrinterSettingsConfig {
  try {
    const key = getPrinterSettingsStorageKey(tenantId);
    const raw = localStorage.getItem(key) || localStorage.getItem('pos_printer_settings_default');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PRINTER_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load printer settings:', e);
  }
  return { ...DEFAULT_PRINTER_SETTINGS };
}

export function savePrinterSettings(config: PrinterSettingsConfig, tenantId?: string | null): void {
  try {
    const key = getPrinterSettingsStorageKey(tenantId);
    localStorage.setItem(key, JSON.stringify(config));
    localStorage.setItem('pos_printer_settings_default', JSON.stringify(config));
    if (config.defaultFormat === 'a4' || config.defaultFormat === 'thermal') {
      localStorage.setItem('pos_preferred_receipt_format', config.defaultFormat);
    }
  } catch (e) {
    console.warn('Failed to save printer settings:', e);
  }
}

export interface PrintableReceiptData {
  saleId: string;
  dateFormatted: string;
  items: {
    name: string;
    quantity: number;
    price: number;
    discount?: number;
    barcode?: string;
    unit?: string;
  }[];
  subtotal: number;
  taxRate?: number;
  taxAmount: number;
  total: number;
  paymentMethodLabel: string;
  customerName?: string;
  customerPhone?: string;
  previousDebt?: number;
  newDebt?: number;
  sellerCode?: string;
  sellerName?: string;
  currency?: string;
  exchangeRate?: number;
  foreignAmount?: number;
}

export interface PrintableStoreInfo {
  name: string;
  address?: string;
  phone?: string;
}

export function printHtmlDocument(html: string): void {
  try {
    // 1. Primary method (identical to Z-Raporu): Open dedicated print tab/window synchronously
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      return;
    }

    // 2. Fallback if popup blocker prevented window.open
    const existingFrame = document.getElementById('pos-universal-print-iframe') as HTMLIFrameElement | null;
    if (existingFrame) {
      existingFrame.remove();
    }
    const iframe = document.createElement('iframe');
    iframe.id = 'pos-universal-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(cleanHtml);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          window.print();
        }
      }, 200);
    } else {
      window.print();
    }
  } catch (e) {
    console.warn('Print fallback to window.print:', e);
    window.print();
  }
}

export function buildReceiptPrintHtml(
  formatType: 'a4' | 'thermal',
  receipt: PrintableReceiptData,
  store: PrintableStoreInfo,
  config: PrinterSettingsConfig
): string {
  const themeColors: Record<PrinterSettingsConfig['a4ColorTheme'], { primary: string; bg: string; border: string }> = {
    blue: { primary: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
    slate: { primary: '#0f172a', bg: '#f8fafc', border: '#cbd5e1' },
    emerald: { primary: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
    indigo: { primary: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
    rose: { primary: '#be123c', bg: '#fff1f2', border: '#fecdd3' },
    amber: { primary: '#b45309', bg: '#fffbeb', border: '#fde68a' }
  };

  const theme = themeColors[config.a4ColorTheme || 'blue'] || themeColors.blue;
  const totalDiscount = receipt.items.reduce((acc, it) => acc + (Number(it.discount) || 0), 0);

  if (formatType === 'a4') {
    const storeHeading = config.a4CustomStoreTitle?.trim() || store.name;
    const pageOrientation =
      config.a4PaperSize === 'A4-landscape'
        ? 'A4 landscape'
        : config.a4PaperSize === 'A5-portrait'
        ? 'A5 portrait'
        : 'A4 portrait';

    const cellBorder =
      config.a4TableStyle === 'minimal'
        ? 'border-bottom: 1px solid #e2e8f0; border-left: none; border-right: none;'
        : 'border: 1px solid #cbd5e1;';

    const itemsRows = receipt.items
      .map((it, idx) => {
        const lineTotal = it.price * it.quantity - (it.discount || 0);
        const rowBg = config.a4TableStyle === 'striped' && idx % 2 === 1 ? 'background: #f8fafc;' : '';
        return `
        <tr style="${rowBg}">
          <td style="padding: 7px 6px; ${cellBorder} text-align: center; font-family: monospace;">${idx + 1}</td>
          <td style="padding: 7px 8px; ${cellBorder} font-weight: bold;">
            ${it.name}
            ${config.a4ShowItemBarcodes && it.barcode ? `<div style="font-size: 9px; color: #64748b; font-family: monospace; font-weight: normal;">Barkod: ${it.barcode}</div>` : ''}
          </td>
          <td style="padding: 7px 6px; ${cellBorder} text-align: center; font-weight: bold;">
            ${it.quantity} ${config.a4ShowUnitColumn ? `<span style="font-size: 9px; color: #64748b; font-weight: normal;">${it.unit || 'Adet'}</span>` : ''}
          </td>
          <td style="padding: 7px 8px; ${cellBorder} text-align: right; font-family: monospace;">
            ${it.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </td>
          ${
            config.a4ShowDiscountColumn
              ? `<td style="padding: 7px 6px; ${cellBorder} text-align: right; font-family: monospace; color: ${it.discount && it.discount > 0 ? '#dc2626' : '#94a3b8'};">
                  ${it.discount && it.discount > 0 ? `-${it.discount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺` : '0,00 ₺'}
                </td>`
              : ''
          }
          <td style="padding: 7px 8px; ${cellBorder} text-align: right; font-family: monospace; font-weight: bold;">
            ${lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </td>
        </tr>
      `;
      })
      .join('');

    const headerHtml =
      config.a4HeaderLayout === 'centered'
        ? `
        <div style="text-align: center; border-bottom: 2px solid ${theme.primary}; padding-bottom: 14px; margin-bottom: 18px;">
          ${config.a4ShowLogoBadge && config.a4LogoBadgeText ? `<div style="font-size: 10px; font-weight: 900; color: ${theme.primary}; letter-spacing: 1.5px; margin-bottom: 4px;">${config.a4LogoBadgeText}</div>` : ''}
          <h1 style="margin: 0; font-size: 24px; text-transform: uppercase; color: #0f172a;">${storeHeading}</h1>
          ${config.a4ShowStoreAddress && store.address ? `<p style="margin: 3px 0; color: #475569;">${store.address} ${store.phone ? `• Tel: ${store.phone}` : ''}</p>` : ''}
          ${(config.a4TaxOffice || config.a4TaxNumber) ? `<p style="margin: 2px 0; color: #475569; font-size: 11px;">${config.a4TaxOffice ? `V.D.: ${config.a4TaxOffice}` : ''} ${config.a4TaxNumber ? `• V.No: ${config.a4TaxNumber}` : ''}</p>` : ''}
          <div style="margin-top: 8px; display: flex; justify-content: center; gap: 12px; align-items: center;">
            <span class="doc-badge">${config.a4DocumentTitle}</span>
            <span style="font-family: monospace; font-weight: 900; font-size: 12px;">BELGE NO: #${receipt.saleId.slice(0, 10).toUpperCase()}</span>
            <span style="font-size: 11px; color: #475569;">Tarih: <strong>${receipt.dateFormatted}</strong></span>
          </div>
        </div>
      `
        : config.a4HeaderLayout === 'modern-banner'
        ? `
        <div style="background: ${theme.primary}; color: #fff; padding: 16px 20px; border-radius: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            ${config.a4ShowLogoBadge && config.a4LogoBadgeText ? `<div style="font-size: 9px; font-weight: 800; opacity: 0.85; letter-spacing: 1.5px; margin-bottom: 3px;">${config.a4LogoBadgeText}</div>` : ''}
            <h1 style="margin: 0; font-size: 22px; text-transform: uppercase; color: #fff;">${storeHeading}</h1>
            ${config.a4ShowStoreAddress && store.address ? `<p style="margin: 3px 0 0 0; opacity: 0.9; font-size: 11px;">${store.address} ${store.phone ? `• Tel: ${store.phone}` : ''}</p>` : ''}
            ${(config.a4TaxOffice || config.a4TaxNumber) ? `<p style="margin: 2px 0 0 0; opacity: 0.85; font-size: 10px;">${config.a4TaxOffice ? `V.D.: ${config.a4TaxOffice}` : ''} ${config.a4TaxNumber ? `• V.No: ${config.a4TaxNumber}` : ''}</p>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="background: rgba(255,255,255,0.18); padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 10px; text-transform: uppercase; display: inline-block; margin-bottom: 4px;">${config.a4DocumentTitle}</div>
            <p style="margin: 0; font-family: monospace; font-weight: 900; font-size: 14px;">#${receipt.saleId.slice(0, 10).toUpperCase()}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; opacity: 0.9;">${receipt.dateFormatted}</p>
          </div>
        </div>
      `
        : `
        <div class="header">
          <div>
            ${config.a4ShowLogoBadge && config.a4LogoBadgeText ? `<div style="font-size: 9px; font-weight: 900; color: ${theme.primary}; letter-spacing: 1px; margin-bottom: 2px;">${config.a4LogoBadgeText}</div>` : ''}
            <h1>${storeHeading}</h1>
            ${config.a4ShowStoreAddress && store.address ? `<p style="margin: 3px 0; color: #475569;">${store.address}</p>` : ''}
            ${config.a4ShowStoreAddress && store.phone ? `<p style="margin: 2px 0; color: #475569;">Tel: ${store.phone}</p>` : ''}
            ${(config.a4TaxOffice || config.a4TaxNumber) ? `<p style="margin: 2px 0; color: #475569; font-size: 11px;">${config.a4TaxOffice ? `V.D.: ${config.a4TaxOffice}` : ''} ${config.a4TaxNumber ? `• V.No: ${config.a4TaxNumber}` : ''}</p>` : ''}
            <span class="doc-badge">${config.a4DocumentTitle}</span>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-family: monospace; font-weight: 900; font-size: 14px;">BELGE NO: #${receipt.saleId.slice(0, 10).toUpperCase()}</p>
            <p style="margin: 4px 0; color: #475569;">Tarih: <strong>${receipt.dateFormatted}</strong></p>
            ${receipt.sellerCode ? `<p style="margin: 2px 0; font-family: monospace; font-weight: bold;">Satış Elemanı: [${receipt.sellerCode}] ${receipt.sellerName || ''}</p>` : ''}
            ${config.copyCount > 1 ? `<p style="margin: 2px 0; font-size: 10px; color: #64748b;">Kopya Sayısı: ${config.copyCount} Adet</p>` : ''}
          </div>
        </div>
      `;

    return `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="utf-8">
        <title>${config.a4DocumentTitle} - #${receipt.saleId.slice(0, 8).toUpperCase()}</title>
        <style>
          @page { size: ${pageOrientation}; margin: 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 20px; color: #0f172a; font-size: 12px; margin: 0; position: relative; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${theme.primary}; padding-bottom: 14px; margin-bottom: 18px; }
          h1 { margin: 0; font-size: 22px; text-transform: uppercase; color: #0f172a; }
          .doc-badge { display: inline-block; margin-top: 6px; padding: 3px 8px; background: ${theme.bg}; color: ${theme.primary}; border: 1px solid ${theme.border}; border-radius: 4px; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 18px; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; background: #f8fafc; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; }
          th { background: ${theme.bg}; color: #0f172a; font-weight: 800; ${cellBorder} padding: 8px; text-align: left; text-transform: uppercase; font-size: 10px; }
          .bottom-section { margin-top: 18px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
          .notes-col { flex: 1; font-size: 11px; color: #334155; }
          .summary-box { width: 270px; border: 1.5px solid #0f172a; padding: 12px; border-radius: 8px; background: #fff; }
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11.5px; }
          .summary-total { font-weight: 900; font-size: 15px; border-top: 2px solid #0f172a; padding-top: 8px; margin-top: 6px; color: ${theme.primary}; }
          .signatures { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-size: 11px; page-break-inside: avoid; }
          .footer { margin-top: 28px; text-align: center; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          .watermark { position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-28deg); font-size: 54px; font-weight: 900; color: rgba(15, 23, 42, 0.04); white-space: nowrap; pointer-events: none; z-index: 0; text-transform: uppercase; }
          @media print { .no-print { display: none !important; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 18px; padding: 12px 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: #1e40af; font-size: 13px;">🖨️ A4 Satış Fişi & Fatura Önizleme</strong>
            <div style="font-size: 11px; color: #3b82f6;">Yazdırma penceresi otomatik açılmazsa sağdaki "Yazdır / Tekrar Yazdır" butonuna tıklayın.</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button onclick="window.print()" style="background: #2563eb; color: #fff; border: none; padding: 9px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px;">🖨️ Yazdır / Tekrar Yazdır</button>
            <button onclick="window.close()" style="background: #e2e8f0; color: #334155; border: none; padding: 9px 14px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px;">✕ Kapat</button>
          </div>
        </div>
        ${config.a4ShowWatermark && config.a4WatermarkText ? `<div class="watermark">${config.a4WatermarkText}</div>` : ''}
        ${headerHtml}

        <div class="grid">
          <div>
            <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">MÜŞTERİ / CARİ BİLGİLERİ</div>
            <div style="font-size: 13px; font-weight: 900; color: #0f172a;">${receipt.customerName || 'Perakende Müşteri'}</div>
            ${receipt.customerPhone ? `<div style="margin-top: 3px; font-family: monospace;">Tel: ${receipt.customerPhone}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">ÖDEME ŞEKLİ</div>
            <div style="font-size: 13px; font-weight: 900; color: ${theme.primary}; text-transform: uppercase;">${receipt.paymentMethodLabel}</div>
            ${receipt.currency && receipt.currency !== 'TRY' ? `<div style="margin-top: 3px; font-size: 11px;">Döviz: ${receipt.currency} (Kur: ${receipt.exchangeRate?.toFixed(2)} ₺)</div>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 36px; text-align: center;">#</th>
              <th>Ürün / Açıklama</th>
              <th style="width: 75px; text-align: center;">Miktar</th>
              <th style="width: 105px; text-align: right;">Birim Fiyat</th>
              ${config.a4ShowDiscountColumn ? `<th style="width: 90px; text-align: right;">İskonto</th>` : ''}
              <th style="width: 115px; text-align: right;">Toplam</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="bottom-section">
          <div class="notes-col">
            ${config.a4ShowCustomerBalanceBox && receipt.previousDebt !== undefined ? `
              <div style="margin-bottom: 10px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; max-width: 280px; font-family: monospace;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>Önceki Bakiye:</span>
                  <strong>${(receipt.previousDebt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 4px; font-weight: 900;">
                  <span>Güncel Toplam Borç:</span>
                  <span>${(receipt.newDebt !== undefined ? receipt.newDebt : receipt.previousDebt).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
              </div>
            ` : ''}
            ${config.a4ShowBankIban && config.a4CustomIbanText ? `
              <div style="margin-bottom: 8px; padding: 8px 10px; border: 1px dashed #94a3b8; border-radius: 6px; background: #fff;">
                <strong style="display: block; font-size: 10px; text-transform: uppercase; color: #475569;">Banka / IBAN Bilgileri:</strong>
                <div style="white-space: pre-wrap; font-family: monospace; margin-top: 3px; font-weight: bold;">${config.a4CustomIbanText}</div>
              </div>
            ` : ''}
            ${config.a4ShowLegalNote && config.a4LegalNoteText ? `
              <p style="margin: 4px 0; font-style: italic; color: #475569;"><strong>Not:</strong> ${config.a4LegalNoteText}</p>
            ` : ''}
          </div>

          <div class="summary-box">
            ${config.a4ShowTaxDetails ? `
              <div class="summary-row">
                <span>Ara Toplam:</span>
                <span style="font-family: monospace; font-weight: bold;">${receipt.subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
              ${totalDiscount > 0 ? `
                <div class="summary-row" style="color: #dc2626; font-weight: bold;">
                  <span>Toplam İskonto:</span>
                  <span style="font-family: monospace;">-${totalDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
              ` : ''}
              <div class="summary-row">
                <span>KDV (%${receipt.taxRate || 0}):</span>
                <span style="font-family: monospace; font-weight: bold;">${receipt.taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
            ` : ''}
            <div class="summary-row summary-total">
              <span>GENEL TOPLAM:</span>
              <span style="font-family: monospace;">${receipt.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
          </div>
        </div>

        ${config.a4ShowSignatures ? `
          <div class="signatures">
            <div>
              <p style="font-weight: bold; margin-bottom: 42px;">${config.a4StampTitle || 'Teslim Eden (Firma Kaşe / İmza)'}</p>
              <div style="border-bottom: 1px solid #64748b; width: 190px; margin: 0 auto;"></div>
            </div>
            <div>
              <p style="font-weight: bold; margin-bottom: 42px;">Teslim Alan (Müşteri İmza)</p>
              <div style="border-bottom: 1px solid #64748b; width: 190px; margin: 0 auto;"></div>
            </div>
          </div>
        ` : ''}

        ${config.a4FooterText ? `<div class="footer">${config.a4FooterText}</div>` : ''}

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

  // THERMAL RECEIPT HTML
  const widthMm = config.thermalPaperWidth === '58mm' ? '54mm' : config.thermalPaperWidth === '72mm' ? '68mm' : '76mm';
  const baseFontPx = config.thermalFontSize === 'small' ? '10px' : config.thermalFontSize === 'large' ? '13px' : '11px';
  const lineHeightVal = config.thermalLineSpacing === 'compact' ? '1.15' : config.thermalLineSpacing === 'relaxed' ? '1.55' : '1.35';
  const borderStyleVal = config.thermalDividerStyle || 'dashed';
  const headerAlignVal = config.thermalHeaderAlignment || 'center';
  const fontFamilyCss =
    config.thermalFontFamily === 'sans-serif'
      ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif'
      : config.thermalFontFamily === 'courier'
      ? '"Courier New", Courier, monospace'
      : 'monospace';

  const storeHeading = config.thermalCustomTitle?.trim() || store.name;
  const thermalItemsHtml = receipt.items
    .map((it) => {
      const lineTotal = it.price * it.quantity - (it.discount || 0);
      return `
      <div style="margin-bottom: 5px; border-bottom: 1px dotted #999; padding-bottom: 4px;">
        <div style="font-weight: bold; text-transform: uppercase;">${it.name}</div>
        ${config.thermalShowItemBarcodes && it.barcode ? `<div style="font-size: 9px; color: #555;">${it.barcode}</div>` : ''}
        <div style="display: flex; justify-content: space-between; font-size: ${baseFontPx};">
          <span>${it.quantity} x ${it.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          <span style="font-weight: bold;">${lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
        </div>
        ${config.thermalShowDiscountDetails && it.discount && it.discount > 0 ? `<div style="font-size: 9px; text-align: right;">İskonto: -${it.discount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>` : ''}
      </div>
    `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8">
      <title>Fiş - #${receipt.saleId.slice(0, 8).toUpperCase()}</title>
      <style>
        @page { size: ${config.thermalPaperWidth} auto; margin: ${config.thermalMarginMm}mm; }
        body { font-family: ${fontFamilyCss}; padding: ${config.thermalMarginMm}mm; color: #000; font-size: ${baseFontPx}; width: ${widthMm}; margin: 0 auto; line-height: ${lineHeightVal}; }
        .center { text-align: center; }
        .header-box { text-align: ${headerAlignVal}; }
        .bold { font-weight: bold; }
        .dash { border-bottom: 1px ${borderStyleVal} #000; padding-bottom: 6px; margin-bottom: 6px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
        .total { font-size: 14px; font-weight: bold; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 5px 0; margin-top: 6px; margin-bottom: 6px; }
        @media print { .no-print { display: none !important; } }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 12px; padding: 8px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; text-align: center; font-family: sans-serif;">
        <button onclick="window.print()" style="background: #0f172a; color: #fff; border: none; padding: 7px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; width: 100%; margin-bottom: 4px;">🖨️ Fişi Yazdır / Tekrar Yazdır</button>
        <button onclick="window.close()" style="background: #e2e8f0; color: #334155; border: none; padding: 5px 10px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 10px; width: 100%;">✕ Pencereyi Kapat</button>
      </div>
      <div class="header-box dash">
        ${config.thermalShowLogoBadge && config.thermalLogoBadgeText ? `<div style="font-size: 9px; font-weight: bold; letter-spacing: 1px; margin-bottom: 2px;">${config.thermalLogoBadgeText}</div>` : ''}
        <h2 style="margin: 0; font-size: 15px; text-transform: uppercase;">${storeHeading}</h2>
        ${config.thermalShowStoreAddress && store.address ? `<div style="font-size: 10px; margin-top: 2px;">${store.address}</div>` : ''}
        ${config.thermalShowStorePhone && store.phone ? `<div style="font-size: 10px;">Tel: ${store.phone}</div>` : ''}
        ${config.thermalCustomSubtitle ? `<div style="font-weight: bold; margin-top: 4px;">${config.thermalCustomSubtitle}</div>` : ''}
        ${
          config.thermalShowOrderNumberBox
            ? `<div style="margin: 5px auto; padding: 3px 6px; border: 1px solid #000; font-weight: bold; display: inline-block;">FİŞ NO: #${receipt.saleId.slice(0, 8).toUpperCase()}</div>`
            : `<div>Fiş No: #${receipt.saleId.slice(0, 8).toUpperCase()}</div>`
        }
        <div>${receipt.dateFormatted}</div>
      </div>

      <div class="dash">
        ${config.thermalShowCustomerInfo ? `
          <div class="row"><span>Müşteri:</span><span class="bold">${receipt.customerName || 'Perakende'}</span></div>
          ${receipt.customerPhone ? `<div class="row"><span>Tel:</span><span>${receipt.customerPhone}</span></div>` : ''}
        ` : ''}
        ${config.thermalShowSellerInfo && receipt.sellerCode ? `
          <div class="row"><span>Kasiyer:</span><span class="bold">[${receipt.sellerCode}] ${receipt.sellerName || ''}</span></div>
        ` : ''}
        <div class="row"><span>Ödeme:</span><span class="bold">${receipt.paymentMethodLabel}</span></div>
      </div>

      <div class="dash">
        <div class="row bold" style="font-size: 10px;"><span>ÜRÜN</span><span>TUTAR</span></div>
        ${thermalItemsHtml}
      </div>

      <div class="dash">
        ${config.thermalShowTaxBreakdown ? `
          <div class="row"><span>Ara Toplam:</span><span>${receipt.subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span></div>
          ${config.thermalShowDiscountDetails && totalDiscount > 0 ? `<div class="row"><span>İskonto:</span><span>-${totalDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span></div>` : ''}
          <div class="row"><span>KDV (%${receipt.taxRate || 0}):</span><span>${receipt.taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span></div>
        ` : ''}
        <div class="row total"><span>TOPLAM:</span><span>${receipt.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span></div>
        ${config.thermalShowCustomerBalance && receipt.previousDebt !== undefined ? `
          <div class="row" style="font-size: 10px;"><span>Önceki Borç:</span><span>${(receipt.previousDebt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span></div>
          <div class="row bold" style="font-size: 10px;"><span>Güncel Borç:</span><span>${(receipt.newDebt !== undefined ? receipt.newDebt : receipt.previousDebt).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span></div>
        ` : ''}
      </div>

      ${config.thermalShowBottomBarcode ? `
        <div class="center" style="margin: 8px 0;">
          <div style="font-family: monospace; letter-spacing: 3px; font-weight: 900; font-size: 14px;">||| || ||| | |||| |||</div>
          <div style="font-size: 9px; font-family: monospace;">#${receipt.saleId.slice(0, 10).toUpperCase()}</div>
        </div>
      ` : ''}

      ${config.thermalShowQrCode && config.thermalQrCodeText ? `
        <div class="center" style="margin: 8px auto; padding: 6px; border: 1px dotted #000; width: fit-content;">
          <div style="font-family: monospace; font-size: 10px; line-height: 1; font-weight: bold;">[ QR: ${config.thermalQrCodeText.slice(0, 24)} ]</div>
        </div>
      ` : ''}

      ${config.thermalSocialHandle ? `
        <div class="center bold" style="font-size: 10px; margin-top: 4px;">${config.thermalSocialHandle}</div>
      ` : ''}

      ${config.thermalFooterText ? `
        <div class="center" style="font-size: 10px; margin-top: 8px; white-space: pre-wrap;">${config.thermalFooterText}</div>
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
