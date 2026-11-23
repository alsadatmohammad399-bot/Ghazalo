import React from 'react';
import { Check, ChefHat, Moon, Plus, Sparkles, Sun, Utensils } from 'lucide-react';
import { getShopThemeHex } from '../utils/calculations';
import { MENU_TEMPLATES } from '../utils/menuTemplates';
import { translateTemplateMeta, tx } from '../utils/uiLang';
import { normalizeMenuTemplateId, type MenuTemplateId } from '../types';

interface MenuTemplateShowcaseProps {
  selectedTemplate: MenuTemplateId;
  onSelectTemplate: (tpl: MenuTemplateId) => void;
  themeColor: string;
  themeMode: 'light' | 'dark';
  shopName?: string;
  logoUrl?: string;
  showLogoOnItems?: boolean;
  coverImage?: string;
  isEn?: boolean;
  sampleItemName?: string;
  sampleItemCategory?: string;
  sampleItemPrice?: number;
}

function TemplateMiniWireframe({
  id,
  accentHex,
  active,
}: {
  id: MenuTemplateId;
  accentHex: string;
  active: boolean;
}) {
  if (id === 'classic') {
    return (
      <div className="h-16 rounded-xl bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] p-1.5 grid grid-cols-2 gap-1.5 overflow-hidden">
        {[0, 1].map((idx) => (
          <div
            key={idx}
            className="rounded-lg bg-[#DCFCE7] dark:bg-[#173323] p-1 flex flex-col justify-between"
          >
            <div className="h-5 rounded bg-white/90 dark:bg-[#18231C]" />
            <div className="flex items-center justify-between gap-1">
              <span className="h-1.5 w-7 rounded-full bg-[#14201A]/30 dark:bg-white/30" />
              <span
                style={{ backgroundColor: accentHex }}
                className="w-3 h-3 rounded-full shrink-0"
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (id === 'modern') {
    return (
      <div className="h-16 rounded-xl bg-[#14201A] border border-[#2C3D32] p-1.5 flex flex-col justify-between overflow-hidden">
        <div
          style={{ backgroundColor: accentHex }}
          className="h-3.5 rounded-md opacity-90 flex items-center px-1.5"
        >
          <span className="h-1 w-8 rounded-full bg-white/80" />
        </div>
        <div className="rounded-lg bg-[#18231C] border border-white/10 p-1 flex items-center justify-between gap-1.5">
          <div className="space-y-1 flex-1">
            <span className="block h-1.5 w-10 rounded-full bg-white/75" />
            <span className="block h-1 w-6 rounded-full bg-[#FACC15]" />
          </div>
          <div className="w-7 h-7 rounded-md bg-white/15 shrink-0" />
        </div>
      </div>
    );
  }

  if (id === 'minimal') {
    return (
      <div className="h-16 rounded-xl bg-white dark:bg-[#18231C] border border-[#CFE3D5] dark:border-[#2C3D32] p-1.5 flex flex-col justify-between overflow-hidden divide-y divide-[#CFE3D5]/70 dark:divide-[#2C3D32]">
        {[0, 1].map((row) => (
          <div key={row} className="flex items-center justify-between gap-1.5 py-1 first:pt-0">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-[#F6FBF7] dark:bg-[#173323] border border-[#CFE3D5] dark:border-[#2C3D32]" />
              <span className="h-1.5 w-12 rounded-full bg-[#14201A]/35 dark:bg-white/35" />
            </div>
            <span
              style={{ borderColor: active ? accentHex : undefined, color: accentHex }}
              className="px-1.5 py-0.5 rounded-full border border-current text-[7px] font-black leading-none"
            >
              +
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (id === 'royal') {
    return (
      <div className="relative h-16 rounded-xl bg-[#0E1526] border border-[#C9A35B]/45 p-1.5 flex flex-col justify-between overflow-hidden">
        <div className="flex items-center justify-between gap-1.5">
          <div className="h-2.5 w-20 rounded bg-[#C9A35B]/25 border border-[#C9A35B]/40 flex items-center px-1">
            <span className="h-1 w-10 rounded-full bg-[#C9A35B]" />
          </div>
          <span className="inline-flex items-center gap-0.5 text-[8px] font-black text-[#C9A35B]">
            <ChefHat className="w-2.5 h-2.5" />
            AI
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((c) => (
            <div
              key={c}
              className="rounded-md bg-[#1B2540] border border-[#2A3550] p-1 flex items-center justify-between gap-1"
            >
              <span className="h-3 w-3 rounded bg-[#0A1120] border border-[#C9A35B]/30 shrink-0" />
              <span className="h-1 flex-1 rounded-full bg-[#F5F1E8]/40" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#C9A35B] shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // compact
  return (
    <div className="h-16 rounded-xl bg-[#F6FBF7] dark:bg-[#0F1712] border border-[#CFE3D5] dark:border-[#2C3D32] p-1.5 grid grid-cols-2 gap-1 overflow-hidden">
      {[0, 1, 2, 3].map((cell) => (
        <div
          key={cell}
          className="rounded-md bg-white dark:bg-[#18231C] border border-[#CFE3D5]/80 dark:border-[#2C3D32] px-1 flex items-center justify-between gap-1"
        >
          <span className="w-2.5 h-2.5 rounded bg-[#DCFCE7] dark:bg-[#173323] shrink-0" />
          <span className="h-1 flex-1 rounded-full bg-[#14201A]/25 dark:bg-white/25" />
          <span
            style={{ backgroundColor: accentHex }}
            className="w-2 h-2 rounded-full shrink-0"
          />
        </div>
      ))}
    </div>
  );
}

export const MenuTemplateShowcase: React.FC<MenuTemplateShowcaseProps> = ({
  selectedTemplate,
  onSelectTemplate,
  themeColor,
  themeMode,
  shopName = 'مطعمك',
  logoUrl = '',
  showLogoOnItems = true,
  coverImage = '',
  isEn = false,
  sampleItemName,
  sampleItemCategory,
  sampleItemPrice = 185,
}) => {
  const accentHex = getShopThemeHex(themeColor);
  const activeId = normalizeMenuTemplateId(selectedTemplate);
  const isDarkPreview = themeMode === 'dark';

  const demoTitle =
    sampleItemName || tx(isEn, 'كباب وكفتة مشوي على الفحم', 'Charcoal Grilled Kebab & Kofta');
  const demoCategory = sampleItemCategory || tx(isEn, 'المشويات', 'Grills');

  return (
    <div className="space-y-3.5">
      {/* Template Cards with Visual Mini Wireframes */}
      <div className="grid grid-cols-2 gap-2.5">
        {MENU_TEMPLATES.map((tpl) => {
          const selected = activeId === tpl.id;
          const tplMeta = translateTemplateMeta(tpl.id, tpl.name, tpl.tagline, isEn);
          const isFeaturedRoyal = tpl.id === 'royal';
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelectTemplate(tpl.id)}
              aria-pressed={selected}
              className={`p-3 rounded-[18px] border-[1.5px] text-start transition-all flex flex-col gap-2 cursor-pointer ${
                isFeaturedRoyal ? 'col-span-2' : ''
              } ${
                selected
                  ? isFeaturedRoyal
                    ? 'bg-[#0E1526] text-[#F5F1E8] border-[#C9A35B] ring-2 ring-[#C9A35B]/30'
                    : 'bg-[#DCFCE7] dark:bg-[#173323] border-[#15803D] ring-2 ring-[#15803D]/20'
                  : 'bg-[#FFFFFF] dark:bg-[#18231C] border-[#CFE3D5] dark:border-[#2C3D32] hover:border-[#15803D]'
              }`}
            >
              <TemplateMiniWireframe id={tpl.id} accentHex={accentHex} active={selected} />
              <div className="space-y-0.5">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`font-extrabold text-xs ${
                      selected && isFeaturedRoyal
                        ? 'text-[#C9A35B]'
                        : 'text-[#14201A] dark:text-[#E8F2EB]'
                    }`}
                  >
                    {tplMeta.name}
                  </span>
                  {selected ? (
                    <span
                      style={{ backgroundColor: isFeaturedRoyal ? '#C9A35B' : accentHex }}
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        isFeaturedRoyal ? 'text-[#0E1526]' : 'text-white'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                    </span>
                  ) : (
                    <span
                      className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                        isFeaturedRoyal
                          ? 'bg-[#0E1526] text-[#C9A35B] border border-[#C9A35B]/40'
                          : 'bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0]'
                      }`}
                    >
                      {tpl.badge}
                    </span>
                  )}
                </div>
                <p
                  className={`text-[11px] font-semibold leading-snug line-clamp-2 ${
                    selected && isFeaturedRoyal
                      ? 'text-[#F5F1E8]/80'
                      : 'text-[#4B5B52] dark:text-[#A3B5AA]'
                  }`}
                >
                  {tplMeta.tagline}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Live Interactive Preview Box matching Selected Template + Color + Dark/Light Mode */}
      <div
        className={`rounded-[20px] border overflow-hidden transition-colors ${
          activeId === 'royal'
            ? isDarkPreview
              ? 'bg-[#0E1526] border-[#2A3550] text-[#F5F1E8]'
              : 'bg-[#F7F4ED] border-[#E3DCCB] text-[#20263A]'
            : isDarkPreview
              ? 'bg-[#0F1712] border-[#2C3D32] text-[#E8F2EB]'
              : 'bg-[#F6FBF7] border-[#CFE3D5] text-[#14201A]'
        }`}
      >
        <div
          className={`px-3.5 py-2 border-b flex items-center justify-between text-[11px] font-extrabold ${
            activeId === 'royal'
              ? isDarkPreview
                ? 'bg-[#0A1120] border-[#2A3550] text-[#C9A35B]'
                : 'bg-white border-[#E3DCCB] text-[#A9813F]'
              : isDarkPreview
                ? 'bg-[#18231C] border-[#2C3D32] text-[#A3B5AA]'
                : 'bg-white border-[#CFE3D5] text-[#4B5B52]'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Sparkles
              style={{
                color: activeId === 'royal' ? (isDarkPreview ? '#C9A35B' : '#A9813F') : accentHex,
              }}
              className="w-3.5 h-3.5"
            />
            <span>
              {tx(
                isEn,
                `معاينة حية: قالب ${MENU_TEMPLATES.find((t) => t.id === activeId)?.name}`,
                `Live Preview: ${MENU_TEMPLATES.find((t) => t.id === activeId)?.englishName} Template`
              )}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-[10px]">
            {isDarkPreview ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
            {isDarkPreview ? tx(isEn, 'داكن', 'Dark') : tx(isEn, 'فاتح', 'Light')}
          </span>
        </div>

        <div className="p-3 space-y-2.5">
          {/* Mini Hero Preview */}
          <div
            className={`relative rounded-[14px] overflow-hidden border p-2.5 flex items-center gap-2.5 ${
              activeId === 'royal'
                ? isDarkPreview
                  ? 'bg-[#1B2540] border-[#C9A35B]/35'
                  : 'bg-white border-[#E3DCCB]'
                : isDarkPreview
                  ? 'bg-[#18231C] border-[#2C3D32]'
                  : 'bg-white border-[#CFE3D5]'
            }`}
          >
            {coverImage && (
              <>
                <img
                  src={coverImage}
                  alt={shopName}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-[#14201A]/75" />
              </>
            )}
            <div className="relative z-10 flex items-center justify-between gap-2.5 w-full min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={shopName}
                    className={`w-9 h-9 rounded-xl object-cover border bg-white shrink-0 ${
                      activeId === 'royal' ? 'border-[#C9A35B]' : 'border-white'
                    }`}
                  />
                ) : (
                  <div
                    style={{
                      backgroundColor:
                        activeId === 'royal'
                          ? isDarkPreview
                            ? '#C9A35B'
                            : '#A9813F'
                          : accentHex,
                    }}
                    className={`w-9 h-9 rounded-xl font-extrabold text-xs flex items-center justify-center shrink-0 ${
                      activeId === 'royal' && isDarkPreview ? 'text-[#0E1526]' : 'text-white'
                    }`}
                  >
                    {(shopName || 'غ').trim().slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <div
                    className={`font-extrabold text-xs truncate ${coverImage ? 'text-white' : ''}`}
                  >
                    {shopName}
                  </div>
                  <div
                    style={{
                      color: coverImage
                        ? '#BBF7D0'
                        : activeId === 'royal'
                          ? isDarkPreview
                            ? '#C9A35B'
                            : '#A9813F'
                          : accentHex,
                    }}
                    className="text-[10px] font-bold"
                  >
                    {tx(isEn, 'مفتوح الآن · بدون رسوم إضافية', 'Open Now · Zero extra fees')}
                  </div>
                </div>
              </div>

              {activeId === 'royal' && (
                <span
                  className={`px-2 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 shrink-0 ${
                    isDarkPreview
                      ? 'bg-[#C9A35B] text-[#0E1526]'
                      : 'bg-[#A9813F] text-white'
                  }`}
                >
                  <ChefHat className="w-3 h-3" />
                  {tx(isEn, 'شيف AI', 'Chef AI')}
                </span>
              )}
            </div>
          </div>

          {/* Template-specific Item Card Preview */}
          {activeId === 'classic' && (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1].map((idx) => (
                <div
                  key={idx}
                  className={`rounded-[16px] p-2 border space-y-1.5 ${
                    isDarkPreview
                      ? 'bg-[#173323] border-[#2C3D32]'
                      : 'bg-[#DCFCE7]/85 border-[#CFE3D5]'
                  }`}
                >
                  <div
                    className={`relative h-14 rounded-xl flex items-center justify-center ${
                      isDarkPreview ? 'bg-[#18231C]' : 'bg-white/90'
                    }`}
                  >
                    <Utensils style={{ color: accentHex }} className="w-5 h-5" />
                    {logoUrl && showLogoOnItems && (
                      <img
                        src={logoUrl}
                        alt=""
                        className="w-4 h-4 rounded-full object-cover border border-white absolute top-1 left-1 bg-white"
                      />
                    )}
                  </div>
                  <div className="font-extrabold text-[11px] truncate">
                    {idx === 0 ? demoTitle : tx(isEn, 'طاجن ورق عنب', 'Stuffed Vine Leaves')}
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      style={{ color: accentHex }}
                      className="text-[11px] font-black tabular-nums"
                    >
                      {idx === 0 ? sampleItemPrice : 115} {tx(isEn, 'جنيه', 'EGP')}
                    </span>
                    <span
                      style={{ backgroundColor: accentHex }}
                      className="w-6 h-6 rounded-full text-white flex items-center justify-center"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeId === 'modern' && (
            <div
              className={`rounded-[18px] p-3 border flex items-center justify-between gap-3 ${
                isDarkPreview
                  ? 'bg-[#18231C] border-[#2C3D32]'
                  : 'bg-white border-[#CFE3D5] shadow-xs'
              }`}
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div style={{ color: accentHex }} className="text-[10px] font-extrabold">
                  {demoCategory}
                </div>
                <div className="font-black text-xs truncate">{demoTitle}</div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span style={{ color: accentHex }} className="text-xs font-black tabular-nums">
                    {sampleItemPrice} {tx(isEn, 'جنيه', 'EGP')}
                  </span>
                  <span
                    style={{ backgroundColor: accentHex }}
                    className="px-2.5 py-1 rounded-full text-white text-[10px] font-extrabold"
                  >
                    {tx(isEn, '+ أضف للسلة', '+ Add')}
                  </span>
                </div>
              </div>
              <div
                className={`relative w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${
                  isDarkPreview ? 'bg-[#173323]' : 'bg-[#DCFCE7]'
                }`}
              >
                <Utensils style={{ color: accentHex }} className="w-6 h-6" />
                {logoUrl && showLogoOnItems && (
                  <img
                    src={logoUrl}
                    alt=""
                    className="w-4 h-4 rounded-full object-cover border border-white absolute bottom-1 left-1 bg-white"
                  />
                )}
              </div>
            </div>
          )}

          {activeId === 'minimal' && (
            <div
              className={`rounded-[16px] border divide-y ${
                isDarkPreview
                  ? 'bg-[#18231C] border-[#2C3D32] divide-[#2C3D32]'
                  : 'bg-white border-[#CFE3D5] divide-[#CFE3D5]/70'
              }`}
            >
              {[0, 1].map((idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isDarkPreview ? 'bg-[#173323]' : 'bg-[#F6FBF7] border border-[#CFE3D5]'
                      }`}
                    >
                      <Utensils style={{ color: accentHex }} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-xs truncate">
                        {idx === 0 ? demoTitle : tx(isEn, 'عصير مانجو فريش', 'Fresh Mango Juice')}
                      </div>
                      <div className="text-[10px] font-bold opacity-70 tabular-nums">
                        {idx === 0 ? sampleItemPrice : 45} {tx(isEn, 'جنيه', 'EGP')}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{ borderColor: accentHex, color: accentHex }}
                    className="px-2.5 py-1 rounded-full border text-[10px] font-extrabold shrink-0"
                  >
                    + {tx(isEn, 'أضف', 'Add')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeId === 'compact' && (
            <div className="grid grid-cols-2 gap-1.5">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`rounded-xl p-1.5 border flex items-center justify-between gap-1.5 ${
                    isDarkPreview
                      ? 'bg-[#18231C] border-[#2C3D32]'
                      : 'bg-white border-[#CFE3D5]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isDarkPreview ? 'bg-[#173323]' : 'bg-[#DCFCE7]'
                      }`}
                    >
                      <Utensils style={{ color: accentHex }} className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-[10px] truncate">
                        {idx === 0
                          ? tx(isEn, 'كباب مشوي', 'Kebab')
                          : idx === 1
                            ? tx(isEn, 'شيش طاووق', 'Shish')
                            : idx === 2
                              ? tx(isEn, 'طحينة', 'Tahini')
                              : tx(isEn, 'بيبسي', 'Cola')}
                      </div>
                      <div
                        style={{ color: accentHex }}
                        className="text-[10px] font-black tabular-nums"
                      >
                        {idx === 0 ? 185 : idx === 1 ? 140 : idx === 2 ? 25 : 20}ج
                      </div>
                    </div>
                  </div>
                  <span
                    style={{ backgroundColor: accentHex }}
                    className="w-5 h-5 rounded-full text-white flex items-center justify-center shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeId === 'royal' && (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1].map((idx) => (
                <div
                  key={idx}
                  className={`rounded-[14px] p-2.5 border space-y-2 ${
                    isDarkPreview
                      ? 'bg-[#1B2540] border-[#2A3550]'
                      : 'bg-white border-[#E3DCCB]'
                  }`}
                >
                  <div
                    className={`h-14 rounded-[10px] flex items-center justify-center border ${
                      isDarkPreview
                        ? 'bg-[#0A1120] border-[#2A3550]'
                        : 'bg-[#EFE9DA] border-[#E3DCCB]'
                    }`}
                  >
                    <Utensils
                      className={`w-5 h-5 ${isDarkPreview ? 'text-[#C9A35B]' : 'text-[#A9813F]'}`}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <div
                      className={`text-[10px] font-bold ${
                        isDarkPreview ? 'text-[#C9A35B]' : 'text-[#A9813F]'
                      }`}
                    >
                      {demoCategory}
                    </div>
                    <div className="font-extrabold text-[11px] truncate">
                      {idx === 0 ? demoTitle : tx(isEn, 'فتة شاورما سوري', 'Syrian Shawarma Fatteh')}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={`text-[11px] font-black tabular-nums ${
                        isDarkPreview ? 'text-[#C9A35B]' : 'text-[#A9813F]'
                      }`}
                    >
                      {idx === 0 ? sampleItemPrice : 155} {tx(isEn, 'جنيه', 'EGP')}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-[8px] text-[10px] font-black ${
                        isDarkPreview
                          ? 'bg-[#C9A35B] text-[#0E1526]'
                          : 'bg-[#A9813F] text-white'
                      }`}
                    >
                      + {tx(isEn, 'أضف', 'Add')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

