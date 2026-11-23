import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, MessageCircle, Plus, Trash2 } from 'lucide-react';
import {
  QrCodeImage,
  downloadQrPdf,
  downloadQrPng,
  downloadQrSvg,
} from '../components/QrToolkit';
import { addShopTable, deleteShopTable } from '../services/firestoreService';
import {
  copyMenuLink,
  getAbsoluteMenuUrl,
  getWhatsAppShareUrl,
} from '../utils/menuLink';
import { tx, useUiLang } from '../utils/uiLang';
import type { Shop, ShopTable } from '../types';

interface ShareQrPageProps {
  shop: Shop;
  tables: ShopTable[];
  onBackDashboard: () => void;
  onOpenStorefront: (tableLabel?: string) => void;
  onLocalTableAdd?: (label: string) => void;
  onLocalTableDelete?: (tableId: string) => void;
}

export const ShareQrPage: React.FC<ShareQrPageProps> = ({
  shop,
  tables,
  onBackDashboard,
  onOpenStorefront,
  onLocalTableAdd,
  onLocalTableDelete,
}) => {
  const { isEn } = useUiLang();
  const [newTableName, setNewTableName] = useState('');
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  const baseMenuUrl = getAbsoluteMenuUrl(shop);

  const handleCopy = async () => {
    const ok = await copyMenuLink(baseMenuUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2600);
    }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    setAdding(true);
    try {
      if (onLocalTableAdd) {
        onLocalTableAdd(newTableName.trim());
        setNewTableName('');
        return;
      }
      await addShopTable(shop.id, shop.ownerId, newTableName.trim());
      setNewTableName('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} className="min-h-screen bg-[#F6FBF7] dark:bg-[#0F1712] pb-20">
      <header className="sticky top-0 z-20 bg-[#FFFFFF] dark:bg-[#18231C] border-b border-[#CFE3D5] dark:border-[#2C3D32]">
        <div className="max-w-[560px] mx-auto px-4 py-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBackDashboard}
            className="sf-btn min-h-[40px] px-3 text-xs text-[#15803D] dark:text-[#BBF7D0]"
          >
            {isEn ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            {tx(isEn, 'لوحة التحكم', 'Dashboard')}
          </button>
          <h1 className="text-lg font-extrabold text-[#14201A] dark:text-[#E8F2EB]">
            {tx(isEn, 'رمز QR للمنيو', 'Menu QR Code')}
          </h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-[560px] mx-auto px-4 pt-3.5 space-y-4">
        <p className="text-center text-xs sm:text-sm font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
          {tx(
            isEn,
            'رمز QR للمنيو لكل طاولة · رمز طاولة · ربط الطلب بالطاولة',
            'Generate menu QR codes and per-table dine-in ordering links'
          )}
        </p>

        {/* Main Menu QR Card */}
        <div className="sf-card p-6 text-center space-y-4">
          <div className="flex justify-center">
            <QrCodeImage value={baseMenuUrl} size={200} />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold text-[#14201A] dark:text-[#E8F2EB]">
              {tx(isEn, 'المنيو', 'Digital Menu')}
            </h2>
            <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'امسح لفتح المنيو', 'Scan to open menu')}
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="sf-btn-primary text-xs px-4"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>
                  {copied
                    ? tx(isEn, 'تم نسخ اللينك ✅', 'Link copied ✅')
                    : tx(isEn, 'نسخ لينك المنيو', 'Copy Menu Link')}
                </span>
              </button>
              <a
                href={getWhatsAppShareUrl(baseMenuUrl)}
                target="_blank"
                rel="noreferrer"
                className="sf-btn-mint text-xs px-4"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{tx(isEn, 'مشاركة واتساب', 'Share on WhatsApp')}</span>
              </a>
            </div>
            <input
              type="text"
              readOnly
              dir="ltr"
              value={baseMenuUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="sf-inp min-h-[42px] text-xs font-mono-num text-center text-[#15803D] dark:text-[#BBF7D0]"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void downloadQrPng(baseMenuUrl, `${shop.nameAr}-qr.png`)}
              className="sf-btn-primary text-sm"
            >
              PNG
            </button>
            <button
              type="button"
              onClick={() => void downloadQrSvg(baseMenuUrl, `${shop.nameAr}-qr.svg`)}
              className="sf-btn text-sm"
            >
              SVG
            </button>
            <button
              type="button"
              onClick={() => void downloadQrPdf(baseMenuUrl, shop.nameEn || shop.nameAr)}
              className="sf-btn text-sm"
            >
              PDF
            </button>
          </div>
        </div>

        {/* Tables Card */}
        <div className="sf-card p-5 space-y-4">
          <h2 className="text-base font-extrabold text-[#14201A] dark:text-[#E8F2EB]">
            {tx(isEn, 'الطاولات', 'Tables')}
          </h2>

          {tables.length === 0 ? (
            <div className="text-center py-4 text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'لا توجد طاولات بعد', 'No tables added yet')}
            </div>
          ) : (
            <div className="space-y-2.5">
              {tables.map((tbl) => {
                const tableUrl = `${baseMenuUrl}?table=${encodeURIComponent(tbl.label)}`;
                return (
                  <div
                    key={tbl.id}
                    className="rounded-2xl p-3 border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#0F1712] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 bg-white p-1 rounded-xl border border-[#CFE3D5]">
                        <QrCodeImage value={tableUrl} size={56} />
                      </div>
                      <span className="font-extrabold text-sm truncate">{tbl.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void downloadQrPng(tableUrl, `${tbl.label}-qr.png`)}
                        className="sf-btn min-h-[40px] px-3 text-xs"
                      >
                        PNG
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenStorefront(tbl.label)}
                        className="sf-btn-mint min-h-[40px] px-3 text-xs"
                      >
                        {tx(isEn, 'فتح', 'Open')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onLocalTableDelete
                            ? onLocalTableDelete(tbl.id)
                            : void deleteShopTable(shop.id, tbl.id)
                        }
                        className="sf-btn min-h-[40px] w-10 px-0 text-[#4B5B52] hover:text-amber-700"
                        aria-label={tx(isEn, 'حذف الطاولة', 'Delete table')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={handleAddTable} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder={tx(isEn, 'مثال: طاولة 1', 'e.g. Table 1')}
              className="sf-inp flex-1"
            />
            <button
              type="submit"
              disabled={adding}
              className="sf-btn-primary text-xs px-4 shrink-0"
            >
              <Plus className="w-4 h-4" />
              {tx(isEn, 'إضافة طاولة', 'Add Table')}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
