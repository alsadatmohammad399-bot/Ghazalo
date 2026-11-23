import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { prepareMenuFileForAi, type QueuedMenuFile } from '../utils/menuFilePrep';
import type { ExtractedMenuItem } from '../types';

interface MultiMenuUploaderProps {
  businessName: string;
  language?: string;
  isEn?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onExtractedChunk: (items: ExtractedMenuItem[], categories: string[]) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
}

const CHUNK_SIZE = 1;

const AI_STAGES_AR = [
  'قراءة الصور والملفات',
  'تنظيم الأقسام تلقائياً',
  'استخراج الأصناف والأسعار والأوزان',
  'تجهيز الصور والعروض',
];

const AI_STAGES_EN = [
  'Reading pages & images',
  'Structuring categories',
  'Extracting items, prices & options',
  'Resolving dish photos & deals',
];

export const MultiMenuUploader: React.FC<MultiMenuUploaderProps> = ({
  businessName,
  language = 'العربية',
  isEn = false,
  disabled = false,
  compact = false,
  onExtractedChunk,
  onBusyChange,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<QueuedMenuFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stageIndex, setStageIndex] = useState(-1);
  const [progressText, setProgressText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const updateBusy = (busy: boolean) => {
    setProcessing(busy);
    onBusyChange?.(busy);
  };

  const processFileList = async (targetQueue: QueuedMenuFile[]) => {
    const actionable = targetQueue.filter(
      (f) => f.status === 'pending' || f.status === 'error'
    );
    if (actionable.length === 0) return;

    updateBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    setStageIndex(0);

    const stageTimer = window.setInterval(() => {
      setStageIndex((prev) => (prev < 3 ? prev + 1 : prev));
    }, 950);

    let totalExtracted = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < actionable.length; i += CHUNK_SIZE) {
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 900));
        }
        const chunk = actionable.slice(i, i + CHUNK_SIZE);
        const chunkIds = new Set(chunk.map((c) => c.id));
        const startPage = i + 1;

        setProgressText(
          isEn
            ? `Analyzing page ${startPage} of ${actionable.length}...`
            : `جاري تحليل صفحة ${startPage} من أصل ${actionable.length}...`
        );

        setFiles((prev) =>
          prev.map((f) => (chunkIds.has(f.id) ? { ...f, status: 'scanning', errorMessage: undefined } : f))
        );

        try {
          const res = await fetch('/api/ai/extract-menu', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              files: chunk.map((c) => c.payload),
              businessName: businessName || 'متجري',
              language,
            }),
          });

          const rawBody = await res.text();
          let data: {
            categories?: string[];
            items?: ExtractedMenuItem[];
            error?: string;
          } = {};
          try {
            data = rawBody ? (JSON.parse(rawBody) as typeof data) : {};
          } catch {
            data = {};
          }

          if (!res.ok) {
            if (res.status === 413) {
              throw new Error(
                isEn
                  ? 'Menu photo size is too large. Please pick a smaller or cropped image.'
                  : 'حجم الصورة كبير جداً. يرجى اختيار صورة أصغر أو قصها ثم إعادة المحاولة.'
              );
            }
            if (res.status === 504) {
              throw new Error(
                isEn
                  ? 'Menu analysis timed out. Please try a clearer single photo or retry.'
                  : 'استغرق تحليل الصورة وقتاً أطول من المعتاد. اضغط إعادة المحاولة أو جرب صورة أوضح.'
              );
            }
            throw new Error(
              data.error ||
                (isEn
                  ? 'Could not extract items from this page. Please retry.'
                  : 'تعذر تحليل هذه الصفحة حالياً. اضغط إعادة المحاولة.')
            );
          }

          const items = data.items || [];
          const categories = data.categories || [];
          totalExtracted += items.length;

          if (items.length > 0 || categories.length > 0) {
            await onExtractedChunk(items, categories);
          }

          setFiles((prev) =>
            prev.map((f) =>
              chunkIds.has(f.id)
                ? { ...f, status: 'done', extractedCount: items.length, errorMessage: undefined }
                : f
            )
          );
        } catch (err: unknown) {
          failedCount += chunk.length;
          const msg =
            err instanceof Error
              ? err.message
              : isEn
                ? 'Extraction failed for this page'
                : 'تعذر تحليل هذه الصفحة';
          setFiles((prev) =>
            prev.map((f) =>
              chunkIds.has(f.id) ? { ...f, status: 'error', errorMessage: msg } : f
            )
          );
          setErrorMsg(msg);
        }
      }

      setStageIndex(3);
      if (totalExtracted > 0) {
        setSuccessMsg(
          isEn
            ? `Extracted ${totalExtracted} items from ${actionable.length - failedCount} page(s) successfully.`
            : `تم استخراج ${totalExtracted} صنف بنجاح من ${actionable.length - failedCount} صفحة.`
        );
      } else if (failedCount === 0) {
        setErrorMsg(
          isEn
            ? 'No clear dishes or prices found in these files. Try clearer menu photos.'
            : 'لم يتم العثور على أصناف واضحة في هذه الصور. جرب صوراً أوضح للمنيو.'
        );
      }
    } finally {
      window.clearInterval(stageTimer);
      setProgressText('');
      updateBusy(false);
    }
  };

  const addIncomingFiles = async (rawFiles: File[]) => {
    if (rawFiles.length === 0 || processing || disabled) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const prepared = await Promise.all(rawFiles.map((f) => prepareMenuFileForAi(f)));
      let nextSnapshot: QueuedMenuFile[] = [];
      setFiles((prev) => {
        nextSnapshot = [...prev, ...prepared];
        return nextSnapshot;
      });
      // Immediately start processing the newly queued pages
      await processFileList(prepared);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isEn
            ? 'Could not read selected files'
            : 'تعذر قراءة الملفات المختارة'
      );
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (selected.length > 0) {
      void addIncomingFiles(selected);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length > 0) {
      void addIncomingFiles(dropped);
    }
  };

  const removeFile = (id: string) => {
    if (processing) return;
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAll = () => {
    if (processing) return;
    setFiles([]);
    setErrorMsg('');
    setSuccessMsg('');
    setStageIndex(-1);
  };

  const retryFailed = () => {
    if (processing) return;
    void processFileList(files.filter((f) => f.status === 'error' || f.status === 'pending'));
  };

  const failedFilesCount = files.filter((f) => f.status === 'error').length;
  const stages = isEn ? AI_STAGES_EN : AI_STAGES_AR;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.xlsx,.xls,.csv"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Multi-file Drop Zone & Picker */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!processing && !disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!processing && !disabled) inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !processing && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`rounded-[20px] border-2 border-dashed transition-all cursor-pointer select-none ${
          compact ? 'p-4' : 'p-5'
        } ${
          isDragging
            ? 'border-[#15803D] bg-[#DCFCE7] dark:bg-[#173323]'
            : 'border-[#86EFAC] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#173323]/60 hover:border-[#15803D]'
        } ${processing || disabled ? 'opacity-70 cursor-wait' : ''}`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-start">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="w-12 h-12 rounded-[16px] bg-[#15803D] text-white flex items-center justify-center shrink-0 shadow-xs">
              {processing ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : files.length > 0 ? (
                <ImagePlus className="w-6 h-6" />
              ) : (
                <Upload className="w-6 h-6" />
              )}
            </div>
            <div className="space-y-0.5">
              <div className="text-sm font-black text-[#14201A] dark:text-[#E8F2EB]">
                {processing
                  ? progressText ||
                    (isEn ? 'Extracting items with AI...' : 'جاري استخراج المنيو بالذكاء الاصطناعي...')
                  : files.length > 0
                    ? isEn
                      ? 'Add more menu photos or pages'
                      : 'إضافة صور أو صفحات أخرى للمنيو'
                    : isEn
                      ? 'Select or drag & drop multiple menu photos'
                      : 'اختر أو اسحب عدة صور للمنيو مرة واحدة'}
              </div>
              <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                {isEn
                  ? 'Supports uploading 1, 5, or 10+ photos at once + PDF & Excel sheets'
                  : 'يمكنك رفع أكثر من صورة دفعة واحدة أو إضافة صفحات متتالية + PDF و Excel'}
              </p>
            </div>
          </div>

          <span className="sf-btn-primary !min-h-[42px] px-4 text-xs whitespace-nowrap shrink-0">
            {files.length > 0 ? <Plus className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
            <span>
              {files.length > 0
                ? isEn
                  ? 'Add Photos'
                  : 'إضافة صور'
                : isEn
                  ? 'Choose Files'
                  : 'اختيار الصور'}
            </span>
          </span>
        </div>
      </div>

      {/* Uploaded Pages Thumbnail Grid */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-[#4B5B52] dark:text-[#A3B5AA]">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Sparkles className="w-3.5 h-3.5 text-[#15803D]" />
              {isEn
                ? `Uploaded Pages (${files.length})`
                : `صفحات المنيو المرفوعة (${files.length})`}
            </span>
            <div className="flex items-center gap-2">
              {failedFilesCount > 0 && !processing && (
                <button
                  type="button"
                  onClick={retryFailed}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FEF9C3] text-[#14201A] border border-[#FACC15] text-[11px] font-extrabold"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{isEn ? 'Retry Failed' : 'إعادة المحاولة'}</span>
                </button>
              )}
              {!processing && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-bold text-[#4B5B52] hover:text-amber-800 underline"
                >
                  {isEn ? 'Clear list' : 'مسح القائمة'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {files.map((fileItem, index) => (
              <div
                key={fileItem.id}
                className={`relative rounded-[14px] border overflow-hidden bg-[#FFFFFF] dark:bg-[#18231C] flex flex-col ${
                  fileItem.status === 'error'
                    ? 'border-amber-500'
                    : fileItem.status === 'done'
                      ? 'border-[#15803D]'
                      : 'border-[#CFE3D5] dark:border-[#2C3D32]'
                }`}
              >
                <div className="relative h-20 bg-[#F6FBF7] dark:bg-[#0F1712] flex items-center justify-center overflow-hidden">
                  {fileItem.previewUrl ? (
                    <img
                      src={fileItem.previewUrl}
                      alt={fileItem.name}
                      className="w-full h-full object-cover"
                    />
                  ) : fileItem.isSheet ? (
                    <FileSpreadsheet className="w-6 h-6 text-[#15803D]" />
                  ) : (
                    <FileText className="w-6 h-6 text-[#15803D]" />
                  )}

                  {/* Page number */}
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-[#14201A]/80 text-white text-[10px] font-extrabold tabular-nums">
                    {index + 1}
                  </span>

                  {/* Status badge */}
                  <span
                    className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-xs ${
                      fileItem.status === 'done'
                        ? 'bg-[#15803D] text-white'
                        : fileItem.status === 'scanning'
                          ? 'bg-[#FACC15] text-[#14201A]'
                          : fileItem.status === 'error'
                            ? 'bg-amber-600 text-white'
                            : 'bg-white/90 text-[#4B5B52]'
                    }`}
                  >
                    {fileItem.status === 'done' ? (
                      <Check className="w-3 h-3" />
                    ) : fileItem.status === 'scanning' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : fileItem.status === 'error' ? (
                      <AlertTriangle className="w-3 h-3" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    )}
                  </span>

                  {!processing && (
                    <button
                      type="button"
                      onClick={() => removeFile(fileItem.id)}
                      aria-label={isEn ? 'Remove file' : 'حذف الصورة'}
                      className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[#14201A]/80 text-white flex items-center justify-center hover:bg-[#14201A]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="px-1.5 py-1 text-[10px] font-bold truncate text-[#4B5B52] dark:text-[#A3B5AA]">
                  {fileItem.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage Progress during AI run */}
      {processing && (
        <div className="rounded-[18px] p-3.5 bg-[#F6FBF7] dark:bg-[#173323] border border-[#CFE3D5] dark:border-[#2C3D32] space-y-1.5">
          {progressText && (
            <div className="text-xs font-black text-[#15803D] dark:text-[#BBF7D0] pb-1">
              {progressText}
            </div>
          )}
          {stages.map((label, idx) => {
            const done = idx < stageIndex;
            const active = idx === stageIndex;
            return (
              <div key={label} className="flex items-center gap-2 text-xs font-extrabold">
                {done ? (
                  <Check className="w-4 h-4 text-[#15803D] shrink-0" />
                ) : active ? (
                  <Loader2 className="w-4 h-4 text-[#15803D] animate-spin shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-[#CFE3D5] dark:border-[#2C3D32] shrink-0" />
                )}
                <span className={done || active ? '' : 'opacity-50'}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {successMsg && !processing && (
        <div className="rounded-[16px] bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] px-3.5 py-2.5 text-xs font-extrabold text-[#14532D] dark:text-[#BBF7D0] flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-[16px] bg-[#FEF9C3] border border-[#FACC15] p-3 text-xs font-extrabold text-[#14201A] flex flex-wrap items-center justify-between gap-2">
          <span>{errorMsg}</span>
          {failedFilesCount > 0 && !processing && (
            <button
              type="button"
              onClick={retryFailed}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#14201A] text-white text-[11px] font-black shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{isEn ? 'Retry Failed' : 'إعادة المحاولة الآن'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
