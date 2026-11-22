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
    <div dir={isEn ? 'ltr' : 'rtl'} className="min-h-screen bg-slate-50/70 dark:bg-slate-950 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-3xl p-4 border border-orange-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onBackDashboard}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#FF6A00]"
          >
            {isEn ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            {tx(isEn, 'لوحة التحكم', 'Dashboard')}
          </button>
          <h1 className="text-lg sm:text-xl font-extrabold">
            {tx(isEn, 'مشاركة المنيو', 'Share Menu & QR')}
          </h1>
          <div className="w-20" />
        </div>

        <p className="text-center text-sm sm:text-base font-bold text-slate-600 dark:text-slate-300">
          {tx(
            isEn,
            'رمز QR للمنيو لكل طاولة، رمز طاولة، ربط الطلب بالطاولة',
            'Generate menu QR codes and per-table dine-in ordering links'
          )}
        </p>

        {/* Main Menu QR Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-orange-100 dark:border-slate-800 shadow-xs text-center space-y-4">
          <div className="flex justify-center">
            <QrCodeImage value={baseMenuUrl} size={200} />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold">{tx(isEn, 'المنيو', 'Digital Menu')}</h2>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {tx(isEn, 'امسح لفتح المنيو', 'Scan to open menu')}
            </p>
          </div>
          <div className="max-w-md mx-auto space-y-2.5">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="px-4 py-2.5 rounded-2xl bg-[#FF6A00] hover:bg-[#e55f00] text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
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
                className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
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
              className="w-full px-3 py-2 rounded-xl bg-orange-50/50 dark:bg-slate-800 border border-orange-100 dark:border-slate-700 text-xs font-mono-num text-center text-[#FF6A00]"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto pt-2">
            <button
              type="button"
              onClick={() => void downloadQrPng(baseMenuUrl, `${shop.nameAr}-qr.png`)}
              className="py-3 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-extrabold text-sm"
            >
              PNG
            </button>
            <button
              type="button"
              onClick={() => void downloadQrSvg(baseMenuUrl, `${shop.nameAr}-qr.svg`)}
              className="py-3 rounded-2xl bg-white dark:bg-slate-800 border border-orange-200 dark:border-slate-700 font-extrabold text-sm"
            >
              SVG
            </button>
            <button
              type="button"
              onClick={() => void downloadQrPdf(baseMenuUrl, shop.nameEn || shop.nameAr)}
              className="py-3 rounded-2xl bg-white dark:bg-slate-800 border border-orange-200 dark:border-slate-700 font-extrabold text-sm"
            >
              PDF
            </button>
          </div>
        </div>

        {/* Tables Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-orange-100 dark:border-slate-800 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold">{tx(isEn, 'رموز الطاولات', 'Table QR Codes')}</h2>
            <form onSubmit={handleAddTable} className="flex items-center gap-2">
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder={tx(isEn, 'مثال: طاولة 1', 'e.g. Table 1')}
                className="px-3.5 py-2 rounded-2xl border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
              />
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 rounded-2xl bg-[#FF6A00] hover:bg-[#e85f00] text-white font-bold text-sm inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                {tx(isEn, 'إضافة طاولة', 'Add Table')}
              </button>
            </form>
          </div>

          {tables.length === 0 ? (
            <div className="text-center py-8 text-sm font-bold text-slate-500 dark:text-slate-400">
              {tx(isEn, 'لا توجد طاولات بعد', 'No tables added yet')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tables.map((tbl) => {
                const tableUrl = `${baseMenuUrl}?table=${encodeURIComponent(tbl.label)}`;
                return (
                  <div
                    key={tbl.id}
                    className="rounded-2xl p-4 border border-orange-100 dark:border-slate-800 bg-orange-50/30 dark:bg-slate-800/50 text-center space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm">{tbl.label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onLocalTableDelete
                            ? onLocalTableDelete(tbl.id)
                            : void deleteShopTable(shop.id, tbl.id)
                        }
                        className="text-slate-400 hover:text-amber-600"
                        aria-label={tx(isEn, 'حذف الطاولة', 'Delete table')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex justify-center">
                      <QrCodeImage value={tableUrl} size={130} />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadQrPng(tableUrl, `${tbl.label}-qr.png`)}
                        className="flex-1 py-2 rounded-xl bg-[#FF6A00] text-white font-bold text-xs"
                      >
                        PNG
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenStorefront(tbl.label)}
                        className="flex-1 py-2 rounded-xl bg-white dark:bg-slate-900 border border-orange-200 dark:border-slate-700 font-bold text-xs"
                      >
                        {tx(isEn, 'فتح', 'Open')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
