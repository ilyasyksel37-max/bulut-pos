import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export const trToLatin = (str: string) => {
  if (!str) return '';
  return String(str)
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    .replace(/₺/g, 'TL');
};

interface StatementItem {
  date: Date;
  title: string;
  amount: number;
  type: 'DEBT' | 'PAYMENT' | 'PURCHASE';
  balanceAfter?: number;
  details?: any;
}

export const generateCustomerPDF = (customer: any, transactions: any[], txDetails: Record<string, any> = {}) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header / Brand
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text(trToLatin('CARİ HESAP EKSTRESİ'), 15, 18);
  
  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229); // Indigo-600
  doc.text(trToLatin('MÜŞTERİ HESAP ÖZETİ'), 15, 24);
  
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text(trToLatin(`Rapor Tarihi: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`), pageWidth - 15, 18, { align: 'right' });

  // Customer Info Box
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setFillColor(248, 250, 252); // Slate-50
  doc.roundedRect(15, 32, 90, 35, 3, 3, 'FD');
  
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text(trToLatin('MÜŞTERİ BİLGİLERİ'), 20, 39);
  
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.text(trToLatin(customer.name || '-'), 20, 47);
  
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text(trToLatin(`Tel: ${customer.phone || '-'}`), 20, 54);
  if (customer.address) {
    const splitAddress = doc.splitTextToSize(trToLatin(customer.address), 80);
    doc.text(splitAddress, 20, 60);
  }

  // Calculate total statement discounts if any
  let totalStatementDiscount = 0;
  Object.values(txDetails).forEach((sale: any) => {
    if (sale?.discount) {
      totalStatementDiscount += Number(sale.discount);
    } else if (sale?.items) {
      sale.items.forEach((it: any) => {
        if (it?.discount) totalStatementDiscount += Number(it.discount);
      });
    }
  });

  const hasStatementDiscount = totalStatementDiscount > 0;
  const summaryBoxHeight = hasStatementDiscount ? 40 : 35;

  // Summary Box
  doc.roundedRect(110, 32, 85, summaryBoxHeight, 3, 3, 'FD');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(trToLatin('HESAP OZETI'), 115, 38);

  const totalDebt = transactions
    .filter(t => t.type === 'DEBT' || t.type === 'PURCHASE')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalPayment = transactions
    .filter(t => t.type === 'PAYMENT')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const currentBalance = Number(customer.debt || 0);

  let sumY = 44;
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(trToLatin('Toplam Borc:'), 115, sumY);
  doc.setTextColor(220, 38, 38); // Red-600
  doc.text(`${totalDebt.toLocaleString('tr-TR')} TL`, 150, sumY);

  sumY += 5.5;
  doc.setTextColor(71, 85, 105);
  doc.text(trToLatin('Toplam Odeme:'), 115, sumY);
  doc.setTextColor(22, 163, 74); // Emerald-600
  doc.text(`${totalPayment.toLocaleString('tr-TR')} TL`, 150, sumY);

  if (hasStatementDiscount) {
    sumY += 5.5;
    doc.setTextColor(71, 85, 105);
    doc.text(trToLatin('Toplam Iskonto:'), 115, sumY);
    doc.setTextColor(220, 38, 38);
    doc.text(`-${totalStatementDiscount.toLocaleString('tr-TR')} TL`, 150, sumY);
  }

  sumY += 3;
  doc.setDrawColor(203, 213, 225);
  doc.line(115, sumY, 190, sumY);

  sumY += 5.5;
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(trToLatin('GUNCEL BAKIYE:'), 115, sumY);
  doc.setFontSize(11);
  doc.text(`${currentBalance.toLocaleString('tr-TR')} TL`, 150, sumY);

  // Table
  const tableData = transactions.map(tx => {
    const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
    const isPayment = tx.type === 'PAYMENT';
    
    let details = '-';
    if (tx.saleId && txDetails[tx.saleId]) {
      const sale = txDetails[tx.saleId];
      if (sale.items && sale.items.length > 0) {
        details = sale.items.map((item: any) => {
          const qty = Number(item.quantity || 1);
          const price = Number(item.price || 0);
          const disc = Number(item.discount || 0);
          const itemTotal = (price * qty) - disc;
          return `${item.name} (${qty} Ad x ${price.toLocaleString('tr-TR')} TL = ${itemTotal.toLocaleString('tr-TR')} TL)`;
        }).join('\n');
      }
    } else if (tx.title && tx.title !== 'Tahsilat' && tx.title !== 'Veresiye Satış') {
      details = tx.title;
    }

    return [
      format(txDate, 'dd.MM.yyyy'),
      isPayment ? 'Tahsilat' : 'Satis',
      trToLatin(details),
      !isPayment ? `${Number(tx.amount || 0).toLocaleString('tr-TR')} TL` : '-',
      isPayment ? `${Number(tx.amount || 0).toLocaleString('tr-TR')} TL` : '-',
      `${Number(tx.balanceAfter || 0).toLocaleString('tr-TR')} TL`
    ];
  });

  autoTable(doc, {
    startY: 75,
    head: [['Tarih', 'Islem', 'Detay', 'Borc (+)', 'Alacak (-)', 'Bakiye']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 3, textColor: 50 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 20 },
      2: { cellWidth: 60 },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
    }
  });

  // Signature Area
  const finalY = (doc as any).lastAutoTable.finalY || 150;
  if (finalY < 250) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(trToLatin('Teslim Eden (Kase / Imza)'), 15, finalY + 20);
    doc.text(trToLatin('Teslim Alan (Musteri)'), pageWidth - 15, finalY + 20, { align: 'right' });
    
    doc.line(15, finalY + 45, 60, finalY + 45);
    doc.line(pageWidth - 60, finalY + 45, pageWidth - 15, finalY + 45);
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(trToLatin(`Sayfa ${i} / ${pageCount} - POS & Stok Yonetim Sistemi`), pageWidth / 2, 285, { align: 'center' });
  }

  const fileName = `${trToLatin(customer.name)}_Ekstre_${format(new Date(), 'ddMMyyyy')}.pdf`;
  try {
    doc.save(fileName);
  } catch (err) {
    console.error("PDF Save error:", err);
  }
};

export const generateSaleInvoicePDF = (
  customer: any,
  tx: any,
  details: any,
  action: 'open' | 'download' = 'open'
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
  const saleId = tx.saleId || tx.id || '-';
  const paymentMethod = tx.paymentMethod || 'Nakit';

  // Brand Header
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text(trToLatin('SATIS BILGI FATURASI'), 15, 18);

  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229); // Indigo-600
  doc.text(trToLatin('BULUT POS & STOK YONETIM SISTEMI'), 15, 24);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text(trToLatin(`Tarih: ${format(txDate, 'dd.MM.yyyy HH:mm')}`), pageWidth - 15, 18, { align: 'right' });
  doc.text(trToLatin(`Fis No: ${saleId}`), pageWidth - 15, 24, { align: 'right' });

  // Customer Info Box (Left)
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, 32, 90, 43, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(trToLatin('MUSTERI BILGILERI'), 20, 38.5);

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(trToLatin(customer?.name || 'Perakende Musteri'), 20, 46);

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(trToLatin(`Telefon: ${customer?.phone || 'Kayitli Degil'}`), 20, 52);
  if (customer?.address) {
    const splitAddr = doc.splitTextToSize(trToLatin(`Adres: ${customer.address}`), 80);
    doc.text(splitAddr, 20, 58);
  } else {
    doc.text(trToLatin('Adres: -'), 20, 58);
  }

  // Transaction Summary Box (Right)
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(110, 32, 85, 43, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(trToLatin('SATIS VE BAKIYE OZETI'), 115, 38.5);

  const calcItemsSum = (details?.items || []).reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
  const saleAmount = Number(details?.total || tx.amount || tx.total || calcItemsSum || 0);
  const newBalance = Number(tx.balanceAfter !== undefined && tx.balanceAfter !== null ? tx.balanceAfter : customer?.debt || 0);
  
  let oldBalance = 0;
  if (tx.previousBalance !== undefined && tx.previousBalance !== null) {
    oldBalance = Number(tx.previousBalance);
  } else if (tx.type === 'DEBT') {
    oldBalance = Math.max(0, newBalance - saleAmount);
  } else if (tx.type === 'PAYMENT') {
    oldBalance = newBalance + saleAmount;
  } else {
    oldBalance = newBalance;
  }
  if (Math.abs(oldBalance) < 0.001) oldBalance = 0;

  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(trToLatin('Odeme Turu:'), 115, 45);
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(trToLatin(paymentMethod), 190, 45, { align: 'right' });

  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(trToLatin('Eski Bakiye:'), 115, 50.5);
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`${oldBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, 190, 50.5, { align: 'right' });

  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(trToLatin('Satis Tutari:'), 115, 56);
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`${saleAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, 190, 56, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.line(115, 60.5, 190, 60.5);

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(trToLatin('Guncel Bakiye:'), 115, 68);
  doc.setFontSize(10.5);
  if (newBalance > 0) {
    doc.setTextColor(220, 38, 38);
  } else {
    doc.setTextColor(22, 163, 74);
  }
  doc.text(`${newBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, 190, 68, { align: 'right' });

  // Items table
  const items = details?.items || [];
  const tableData = items.length > 0 ? items.map((item: any, idx: number) => {
    const qty = Number(item.quantity || 1);
    const unitPrice = Number(item.price || 0);
    const itemDiscount = Number(item.discount || 0);
    const itemTotal = (unitPrice * qty) - itemDiscount;
    let nameText = trToLatin(item.name || 'Urun');
    if (itemDiscount > 0) {
      nameText += ` (Isk: -${itemDiscount.toLocaleString('tr-TR')} TL)`;
    }
    return [
      String(idx + 1),
      nameText,
      String(qty),
      `${unitPrice.toLocaleString('tr-TR')} TL`,
      `${itemTotal.toLocaleString('tr-TR')} TL`
    ];
  }) : [
    ['1', trToLatin(tx.title || 'Satis'), '1', `${Number(tx.amount || 0).toLocaleString('tr-TR')} TL`, `${Number(tx.amount || 0).toLocaleString('tr-TR')} TL`]
  ];

  autoTable(doc, {
    startY: 80,
    head: [['#', 'Urun Adi', 'Adet', 'Birim Fiyat', 'Toplam']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3.5, textColor: 50 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 85 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
    }
  });

  const total = Number(details?.total || tx.amount || 0);
  const itemDiscountsSum = items.reduce((sum: number, it: any) => sum + Number(it.discount || 0), 0);
  const totalDiscount = Number(details?.discount ?? details?.totalDiscount ?? itemDiscountsSum);
  const hasDiscount = totalDiscount > 0;

  const itemsSum = items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
  const rawSubtotal = itemsSum > 0 ? itemsSum : (details?.subtotal ? Number(details.subtotal) + totalDiscount : total + totalDiscount);
  const subtotal = Number(details?.subtotal || (rawSubtotal - totalDiscount));
  const tax = Number(details?.taxAmount || (details?.taxRate ? subtotal * details.taxRate : 0));
  const finalY = (doc as any).lastAutoTable?.finalY || 130;

  // Totals Box
  const totalsY = finalY + 6;
  const boxHeight = 22 + (hasDiscount ? 6 : 0) + (tax > 0 ? 6 : 0);
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(pageWidth - 95, totalsY, 80, boxHeight, 2, 2, 'FD');

  let curY = totalsY + 6;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(trToLatin('Ara Toplam:'), pageWidth - 90, curY);
  doc.text(`${rawSubtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, pageWidth - 20, curY, { align: 'right' });

  // Varsa Iskonto
  if (hasDiscount) {
    curY += 6;
    doc.setTextColor(220, 38, 38); // Red-600 for discount
    doc.text(trToLatin('Iskonto:'), pageWidth - 90, curY);
    doc.text(`-${totalDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, pageWidth - 20, curY, { align: 'right' });
  }

  // KDV if applicable
  if (tax > 0) {
    curY += 6;
    doc.setTextColor(100, 116, 139);
    doc.text(trToLatin('KDV (%10):'), pageWidth - 90, curY);
    doc.text(`${tax.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, pageWidth - 20, curY, { align: 'right' });
  }

  curY += 3;
  doc.setDrawColor(203, 213, 225);
  doc.line(pageWidth - 90, curY, pageWidth - 20, curY);

  // En alta GENEL TOPLAM
  curY += 5;
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(trToLatin('GENEL TOPLAM:'), pageWidth - 90, curY);
  doc.text(`${total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, pageWidth - 20, curY, { align: 'right' });

  // Signature Area
  const sigY = totalsY + boxHeight + 10;
  if (sigY < 265) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(trToLatin('Teslim Eden (Firma / Kase)'), 15, sigY);
    doc.text(trToLatin('Teslim Alan (Musteri)'), pageWidth - 15, sigY, { align: 'right' });

    doc.line(15, sigY + 20, 65, sigY + 20);
    doc.line(pageWidth - 65, sigY + 20, pageWidth - 15, sigY + 20);
  }

  // Footer note
  doc.setFontSize(7);
  doc.setTextColor(160);
  doc.text(trToLatin('Bu belge bilgi amaclidir, mali degeri yoktur. - Bulut POS'), pageWidth / 2, 287, { align: 'center' });

  const fileName = `Satis_${saleId}_${format(new Date(), 'ddMMyyyy')}.pdf`;
  if (action === 'open') {
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank');
  } else {
    doc.save(fileName);
  }
};

export const shareSaleOnWhatsApp = (
  customer: any,
  tx: any,
  details: any
) => {
  const phone = customer?.phone || '';
  if (!phone) {
    alert("Müşterinin telefon numarası kayıtlı değil.");
    return;
  }
  const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
  const dateStr = format(txDate, 'dd.MM.yyyy HH:mm');
  const saleId = tx.saleId || tx.id || '-';
  const items = details?.items || [];
  const total = Number(details?.total || tx.amount || 0);
  const itemDiscountsSum = items.reduce((sum: number, it: any) => sum + Number(it.discount || 0), 0);
  const totalDiscount = Number(details?.discount ?? details?.totalDiscount ?? itemDiscountsSum);
  const itemsSum = items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
  const rawSubtotal = itemsSum > 0 ? itemsSum : (total + totalDiscount);

  let message = `*🧾 SATIŞ BİLGİ FİŞİ*\n`;
  message += `*Fiş No:* ${saleId}\n`;
  message += `*Tarih:* ${dateStr}\n`;
  message += `*Müşteri:* ${customer?.name || 'Değerli Müşterimiz'}\n`;
  if (customer?.address) {
    message += `*Adres:* ${customer.address}\n`;
  }
  message += `*Ödeme Türü:* ${tx.paymentMethod || 'Nakit'}\n\n`;
  message += `*ÜRÜNLER:*\n`;

  if (items.length > 0) {
    items.forEach((item: any, idx: number) => {
      const itPrice = Number(item.price || 0);
      const itQty = Number(item.quantity || 1);
      const itDiscount = Number(item.discount || 0);
      const itTotal = (itPrice * itQty) - itDiscount;
      message += `${idx + 1}. *${item.name}* - ${itQty} Adet x ${itPrice.toLocaleString('tr-TR')} ₺ = ${itTotal.toLocaleString('tr-TR')} ₺\n`;
      if (itDiscount > 0) {
        message += `   _(İskonto: -${itDiscount.toLocaleString('tr-TR')} ₺)_\n`;
      }
    });
  } else {
    message += `• ${tx.title || 'Satış'} - ${total.toLocaleString('tr-TR')} ₺\n`;
  }

  message += `\n`;
  message += `*Ara Toplam:* ${rawSubtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
  if (totalDiscount > 0) {
    message += `*İskonto:* -${totalDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
  }
  message += `*GENEL TOPLAM:* ${total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n\n`;

  const newBal = Number(tx.balanceAfter !== undefined ? tx.balanceAfter : customer?.debt || 0);
  let prevBal = 0;
  if (tx.previousBalance !== undefined) {
    prevBal = Number(tx.previousBalance);
  } else if (tx.type === 'DEBT') {
    prevBal = newBal - total;
  } else if (tx.type === 'PAYMENT') {
    prevBal = newBal + total;
  } else {
    prevBal = newBal;
  }
  if (Math.abs(prevBal) < 0.001) prevBal = 0;

  message += `*BAKİYE DURUMU:*\n`;
  message += `• *Eski Bakiye:* ${prevBal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
  message += `• *Satış Tutarı:* +${total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
  message += `• *Güncel Kalan Borç:* ${newBal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
  message += `\nBizi tercih ettiğiniz için teşekkür ederiz.`;

  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
};

export const generateSupplierPDF = (supplier: any, transactions: any[], products: any[]) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header / Brand
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text(trToLatin('TEDARIKCI HESAP EKSTRESI'), 15, 18);
  
  doc.setFontSize(10);
  doc.setTextColor(217, 119, 6); // Amber-600
  doc.text(trToLatin('CARI HESAP OZETI'), 15, 24);
  
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(trToLatin(`Rapor Tarihi: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`), pageWidth - 15, 18, { align: 'right' });

  // Supplier Info Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, 32, 90, 35, 3, 3, 'FD');
  
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(trToLatin('TEDARIKCI BILGILERI'), 20, 39);
  
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(trToLatin(supplier.name || '-'), 20, 47);
  
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(trToLatin(`Tel: ${supplier.phone || '-'}`), 20, 54);

  // Summary Box
  doc.roundedRect(110, 32, 85, 35, 3, 3, 'FD');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(trToLatin('HESAP OZETI'), 115, 39);

  const totalPurchase = transactions
    .filter(t => t.type === 'PURCHASE')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalPayment = transactions
    .filter(t => t.type === 'PAYMENT')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const currentBalance = Number(supplier.balance || 0);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(trToLatin('Toplam Alis:'), 115, 47);
  doc.text(`${totalPurchase.toLocaleString('tr-TR')} TL`, 150, 47);

  doc.text(trToLatin('Toplam Odeme:'), 115, 53);
  doc.text(`${totalPayment.toLocaleString('tr-TR')} TL`, 150, 53);

  doc.setDrawColor(203, 213, 225);
  doc.line(115, 57, 190, 57);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(trToLatin('GUNCEL BAKIYE:'), 115, 63);
  doc.setFontSize(12);
  doc.text(`${currentBalance.toLocaleString('tr-TR')} TL`, 150, 63);

  // Table
  const tableData = transactions.map(tx => {
    const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
    const isPurchase = tx.type === 'PURCHASE';
    
    let details = tx.title || (isPurchase ? 'Mal Alimi' : 'Odeme');
    if (tx.productId && tx.quantity) {
      const product = products.find(p => p.id === tx.productId);
      if (product) {
        details = `${product.name} (x${tx.quantity})`;
      }
    }

    return [
      format(txDate, 'dd.MM.yyyy'),
      isPurchase ? 'Alis' : 'Odeme',
      trToLatin(details),
      isPurchase ? `${Number(tx.amount || 0).toLocaleString('tr-TR')} TL` : '-',
      !isPurchase ? `${Number(tx.amount || 0).toLocaleString('tr-TR')} TL` : '-',
      `${Number(tx.balanceAfter || 0).toLocaleString('tr-TR')} TL`
    ];
  });

  autoTable(doc, {
    startY: 75,
    head: [['Tarih', 'Islem', 'Detay', 'Alis (+)', 'Odeme (-)', 'Bakiye']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' }
    }
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(trToLatin(`Sayfa ${i} / ${pageCount} - POS & Stok Yonetim Sistemi`), pageWidth / 2, 285, { align: 'center' });
  }

  const fileName = `${trToLatin(supplier.name)}_Tedarikci_Ekstre_${format(new Date(), 'ddMMyyyy')}.pdf`;
  try {
    doc.save(fileName);
  } catch (err) {
    console.error("PDF Save error:", err);
  }
};

export const shareOnWhatsApp = (name: string, phone: string, balance: number, transactions: any[], type: 'customer' | 'supplier', products: any[] = [], txDetails: any = {}) => {
  const balanceLabel = type === 'customer' ? 'Güncel Borcunuz' : 'Güncel Bakiyemiz';
  const title = type === 'customer' ? 'Müşteri Hesap Ekstresi' : 'Tedarikçi Hesap Ekstresi';
  
  let message = `*${title}*\n\n`;
  message += `Sayın *${name}*,\n`;
  message += `Hesap özetiniz aşağıdadır:\n\n`;
  message += `*${balanceLabel}:* ${balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n\n`;
  message += `*Son İşlemler:*\n`;
  
  transactions.slice(0, 15).forEach(tx => {
    const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
    const dateStr = format(txDate, 'dd.MM.yyyy');
    const amountStr = `${Number(tx.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
    const typeStr = tx.type === 'PAYMENT' ? '(Ödeme)' : (tx.type === 'DEBT' || tx.type === 'PURCHASE' ? '(Borç/Alım)' : '');
    
    let description = tx.title || (tx.type === 'PAYMENT' ? 'Tahsilat' : 'İşlem');
    
    if (type === 'customer' && tx.saleId && txDetails[tx.saleId]) {
      const sale = txDetails[tx.saleId];
      if (sale.items && sale.items.length > 0) {
        const itemsStr = sale.items.map((it: any) => it.name).join(', ');
        description += ` [${itemsStr}]`;
      }
    }
    
    if (type === 'supplier' && tx.productId && products.length) {
      const product = products.find((p: any) => p.id === tx.productId);
      if (product) {
        description += ` (${product.name} x${tx.quantity})`;
      }
    }

    message += `• ${dateStr}: ${description} - ${amountStr} ${typeStr}\n`;
  });
  
  message += `\nDetaylı bilgi için bizimle iletişime geçebilirsiniz.`;
  
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
};
