import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  Eye,
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
import {
  formatFileSizeLabel,
  prepareMenuFileForAi,
  type QueuedMenuFile,
} from '../utils/menuFilePrep';
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

const CONCURRENCY = 2;

const AI_STAGES_AR = [
  'ضغط وتحسين وضوح الصور',
  'قراءة الأصناف والأسعار والأوزان',
  'تنظيم الأقسام والعروض تلقائياً',
  'تجهيز صور الأطباق بدقة',
];

const AI_STAGES_EN = [
  'Optimizing photo clarity & size',
  'Reading dishes, prices & options',
  'Structuring categories & offers',
  'Matching dish photos cleanly',
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
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<QueuedMenuFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stageIndex, setStageIndex] = useState(-1);
  const [completedStepCount, setCompletedStepCount] = useState(0);
  const [totalStepCount, setTotalStepCount] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [previewModalFile, setPreviewModalFile] = useState<QueuedMenuFile | null>(null);

  const isBusy = preparingFiles || processing;

  const updateBusy = (busy: boolean) => {
    setProcessing(busy);
    onBusyChange?.(busy);
  };

  const extractSinglePage = async (fileItem: QueuedMenuFile, pageIndex: number, totalPages: number) => {
    const requestBody = JSON.stringify({
      files: [fileItem.payload],
      businessName: businessName || 'متجري',
      language,
    });

    const postWithTimeout = async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 38000);
      try {
        return await fetch('/api/ai/extract-menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    let res = await postWithTimeout();

    if (res.status === 503) {
      setProgressText(
        isEn
          ? `Temporary busy spike on page ${pageIndex}, retrying automatically...`
          : `ضغط مؤقت في صفحة ${pageIndex} — جاري إعادة المحاولة تلقائياً...`
      );
      await new Promise((r) => setTimeout(r, 900));
      res = await postWithTimeout();
    }

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
            ? `Could not extract items from page ${pageIndex} of ${totalPages}.`
            : `تعذر تحليل الصفحة ${pageIndex} من ${totalPages} حالياً. اضغط إعادة المحاولة.`)
      );
    }

    return {
      items: data.items || [],
      categories: data.categories || [],
    };
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
    setCompletedStepCount(0);
    setTotalStepCount(actionable.length);

    const stageTimer = window.setInterval(() => {
      setStageIndex((prev) => (prev < 3 ? prev + 1 : prev));
    }, 450);

    let totalExtracted = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < actionable.length; i += CONCURRENCY) {
        const wave = actionable.slice(i, i + CONCURRENCY);
        const waveIds = new Set(wave.map((c) => c.id));

        setProgressText(
          wave.length > 1
            ? isEn
              ? `Analyzing pages ${i + 1}-${i + wave.length} of ${actionable.length}...`
              : `جاري قراءة الصفحات ${i + 1}-${i + wave.length} من ${actionable.length}...`
            : isEn
              ? `Analyzing page ${i + 1} of ${actionable.length} — ${wave[0]?.name || ''}`
              : `جاري قراءة صفحة ${i + 1} من ${actionable.length} — ${wave[0]?.name || ''}`
        );

        setFiles((prev) =>
          prev.map((f) =>
            waveIds.has(f.id) ? { ...f, status: 'scanning', errorMessage: undefined } : f
          )
        );

        await Promise.all(
          wave.map(async (fileItem, waveOffset) => {
            const pageNum = i + waveOffset + 1;
            try {
              const { items, categories } = await extractSinglePage(
                fileItem,
                pageNum,
                actionable.length
              );
              totalExtracted += items.length;
              if (items.length > 0 || categories.length > 0) {
                await onExtractedChunk(items, categories);
              }
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === fileItem.id
                    ? { ...f, status: 'done', extractedCount: items.length, errorMessage: undefined }
                    : f
                )
              );
            } catch (err: unknown) {
              failedCount += 1;
              const isAbort = err instanceof Error && err.name === 'AbortError';
              const msg = isAbort
                ? isEn
                  ? 'Menu analysis timed out. Please retry or crop into smaller sections.'
                  : 'استغرق تحليل الصورة وقتاً أطول من المعتاد. اضغط إعادة المحاولة أو قسّم الصورة.'
                : err instanceof Error
                  ? err.message
                  : isEn
                    ? 'Extraction failed for this page'
                    : 'تعذر تحليل هذه الصفحة';
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === fileItem.id ? { ...f, status: 'error', errorMessage: msg } : f
                )
              );
              setErrorMsg(msg);
            } finally {
              setCompletedStepCount((c) => Math.min(actionable.length, c + 1));
            }
          })
        );
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
    if (rawFiles.length === 0 || isBusy || disabled) return;
    setErrorMsg('');
    setSuccessMsg('');
    setPreparingFiles(true);
    try {
      const prepared: QueuedMenuFile[] = [];
      for (const file of rawFiles) {
        const item = await prepareMenuFileForAi(file);
        prepared.push(item);
      }
      setFiles((prev) => [...prev, ...prepared]);
      setPreparingFiles(false);
      await processFileList(prepared);
    } catch (err: unknown) {
      setPreparingFiles(false);
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

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (isBusy || disabled) return;
    const items = Array.from(e.clipboardData?.items || []);
    const pastedImages: File[] = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) pastedImages.push(f);
      }
    }
    if (pastedImages.length > 0) {
      e.preventDefault();
      void addIncomingFiles(pastedImages);
    }
  };

  const removeFile = (id: string) => {
    if (isBusy) return;
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (previewModalFile?.id === id) setPreviewModalFile(null);
  };

  const clearAll = () => {
    if (isBusy) return;
    setFiles([]);
    setErrorMsg('');
    setSuccessMsg('');
    setStageIndex(-1);
    setPreviewModalFile(null);
  };

  const retryFailed = () => {
    if (isBusy) return;
    void processFileList(files.filter((f) => f.status === 'error' || f.status === 'pending'));
  };

  const retrySingleFile = (fileId: string) => {
    if (isBusy) return;
    const target = files.find((f) => f.id === fileId);
    if (target) {
      void processFileList([target]);
    }
  };

  const failedFilesCount = files.filter((f) => f.status === 'error').length;
  const doneItemsSum = files.reduce((sum, f) => sum + (f.extractedCount || 0), 0);
  const stages = isEn ? AI_STAGES_EN : AI_STAGES_AR;
  const progressPct =
    totalStepCount > 0
      ? Math.max(12, Math.round((completedStepCount / totalStepCount) * 100))
      : 18;

  return (
    <div className="space-y-3" onPaste={handlePaste}>
      {/* Standard multi-file picker */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.xlsx,.xls,.csv"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Mobile direct rear-camera capture */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Modern Studio Dropzone & Dual Capture Controls */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isBusy && !disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-[22px] border-2 border-dashed transition-all ${
          compact ? 'p-4' : 'p-5'
        } ${
          isDragging
            ? 'border-[#15803D] bg-[#DCFCE7] dark:bg-[#173323] scale-[0.995]'
            : 'border-[#86EFAC] dark:border-[#2C3D32] bg-gradient-to-b from-[#FFFFFF] to-[#F6FBF7] dark:from-[#18231C] dark:to-[#131F18] hover:border-[#15803D]'
        } ${isBusy || disabled ? 'opacity-80' : ''}`}
      >
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-start">
            <div className="w-13 h-13 rounded-[18px] bg-[#15803D] text-white flex items-center justify-center shrink-0 shadow-[0_6px_16px_rgba(21,128,61,0.22)]">
              {isBusy ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : files.length > 0 ? (
                <ImagePlus className="w-6 h-6" />
              ) : (
                <Upload className="w-6 h-6" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[15px] font-black text-[#14201A] dark:text-[#E8F2EB]">
                {preparingFiles
                  ? isEn
                    ? 'Optimizing & compressing photos...'
                    : 'جاري تجهيز وضغط الصور بوضوح عالٍ...'
                  : processing
                    ? progressText ||
                      (isEn ? 'Reading menu with AI...' : 'جاري استخراج الأصناف بالذكاء الاصطناعي...')
                    : files.length > 0
                      ? isEn
                        ? 'Add more menu pages or take another shot'
                        : 'أضف صفحات أخرى للمنيو أو صوّر صفحة جديدة'
                      : isEn
                        ? 'Modern AI Menu Scanner — Photos, Camera, PDF or Excel'
                        : 'ارفع صور المنيو أو صوّر المنيو بالكاميرا مباشرة'}
              </div>
              <p className="text-xs font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
                {isEn
                  ? 'Smart auto-compression preserves crisp Arabic & English prices • Drag, paste (Ctrl+V), or tap below'
                  : 'ضغط ذكي يحافظ على وضوح الأسعار الصغيرة • يدعم السحب أو اللصق أو تصوير المنيو الورقي'}
              </p>
            </div>
          </div>

          {/* Primary Action Bar: Gallery/Files + Live Camera */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isBusy || disabled}
              onClick={() => inputRef.current?.click()}
              className="sf-btn-primary !min-h-[46px] text-xs w-full whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {files.length > 0 ? <Plus className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              <span>
                {files.length > 0
                  ? isEn
                    ? 'Add Photos / Files'
                    : 'اختيار صور أو ملفات إضافية'
                  : isEn
                    ? 'Choose Menu Photos / Files'
                    : 'اختيار صور المنيو أو PDF / Excel'}
              </span>
            </button>

            <button
              type="button"
              disabled={isBusy || disabled}
              onClick={() => cameraInputRef.current?.click()}
              className="sf-btn-mint !min-h-[46px] text-xs w-full whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <Camera className="w-4 h-4" />
              <span>{isEn ? 'Snap Menu with Camera' : 'التقاط المنيو بالكاميرا'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2 pt-0.5 text-[11px] font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
            <span>JPG • PNG • WEBP • PDF • Excel</span>
            <span>
              {isEn ? 'Multi-page batch supported' : 'يدعم رفع عدة صفحات متتالية بدون حد'}
            </span>
          </div>
        </div>
      </div>

      {/* Modern Live Progress Panel */}
      {processing && (
        <div className="rounded-[20px] p-4 bg-[#F6FBF7] dark:bg-[#173323] border border-[#CFE3D5] dark:border-[#2C3D32] space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs font-black text-[#15803D] dark:text-[#BBF7D0]">
            <span className="truncate">{progressText || (isEn ? 'Scanning...' : 'جاري القراءة...')}</span>
            <span className="tabular-nums shrink-0">{progressPct}%</span>
          </div>

          <div className="h-2 rounded-full bg-[#DCFCE7] dark:bg-[#0F1712] overflow-hidden">
            <div
              style={{ width: `${progressPct}%` }}
              className="h-full bg-[#15803D] rounded-full transition-all duration-300"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {stages.map((label, idx) => {
              const done = idx < stageIndex;
              const active = idx === stageIndex;
              return (
                <div key={label} className="flex items-center gap-2 text-xs font-extrabold">
                  {done ? (
                    <Check className="w-4 h-4 text-[#15803D] dark:text-[#BBF7D0] shrink-0" />
                  ) : active ? (
                    <Loader2 className="w-4 h-4 text-[#15803D] dark:text-[#BBF7D0] animate-spin shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-[#CFE3D5] dark:border-[#2C3D32] shrink-0" />
                  )}
                  <span className={done || active ? '' : 'opacity-50'}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Uploaded Pages Modern Card Grid */}
      {files.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-[#4B5B52] dark:text-[#A3B5AA]">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 tabular-nums text-[#14201A] dark:text-[#E8F2EB]">
                <Sparkles className="w-3.5 h-3.5 text-[#15803D]" />
                {isEn
                  ? `Menu Pages (${files.length})`
                  : `صفحات المنيو (${files.length})`}
              </span>
              {doneItemsSum > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#DCFCE7] dark:bg-[#173323] text-[#14532D] dark:text-[#BBF7D0] text-[11px] font-black tabular-nums">
                  {isEn ? `${doneItemsSum} items` : `${doneItemsSum} صنف مستخرج`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {failedFilesCount > 0 && !isBusy && (
                <button
                  type="button"
                  onClick={retryFailed}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FEF9C3] text-[#14201A] border border-[#FACC15] text-[11px] font-black whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{isEn ? 'Retry Failed' : 'إعادة المحاولة'}</span>
                </button>
              )}
              {!isBusy && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-bold text-[#4B5B52] dark:text-[#A3B5AA] hover:text-amber-800 underline"
                >
                  {isEn ? 'Clear list' : 'مسح القائمة'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {files.map((fileItem, index) => {
              const displaySize = formatFileSizeLabel(
                fileItem.compressedBytes || fileItem.sizeBytes
              );
              return (
                <div
                  key={fileItem.id}
                  className={`relative rounded-[16px] border overflow-hidden bg-[#FFFFFF] dark:bg-[#18231C] flex flex-col transition-colors ${
                    fileItem.status === 'error'
                      ? 'border-amber-500'
                      : fileItem.status === 'done'
                        ? 'border-[#15803D]'
                        : fileItem.status === 'scanning'
                          ? 'border-[#FACC15]'
                          : 'border-[#CFE3D5] dark:border-[#2C3D32]'
                  }`}
                >
                  <div className="relative h-28 bg-[#F6FBF7] dark:bg-[#0F1712] flex items-center justify-center overflow-hidden group">
                    {fileItem.previewUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreviewModalFile(fileItem)}
                        className="w-full h-full relative cursor-zoom-in block"
                        title={isEn ? 'Preview image' : 'معاينة الصورة'}
                      >
                        <img
                          src={fileItem.previewUrl}
                          alt={fileItem.name}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                      </button>
                    ) : fileItem.isSheet ? (
                      <FileSpreadsheet className="w-7 h-7 text-[#15803D]" />
                    ) : (
                      <FileText className="w-7 h-7 text-[#15803D]" />
                    )}

                    {/* Page number pill */}
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-[#14201A]/85 text-white text-[10px] font-black tabular-nums pointer-events-none">
                      {index + 1}
                    </span>

                    {/* Status badge */}
                    <span
                      className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 text-[10px] font-black shadow-xs pointer-events-none ${
                        fileItem.status === 'done'
                          ? 'bg-[#15803D] text-white'
                          : fileItem.status === 'scanning'
                            ? 'bg-[#FACC15] text-[#14201A]'
                            : fileItem.status === 'error'
                              ? 'bg-amber-600 text-white'
                              : 'bg-white/95 text-[#14201A]'
                      }`}
                    >
                      {fileItem.status === 'done' ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span className="tabular-nums">
                            {typeof fileItem.extractedCount === 'number'
                              ? `+${fileItem.extractedCount}`
                              : isEn
                                ? 'OK'
                                : 'تم'}
                          </span>
                        </>
                      ) : fileItem.status === 'scanning' ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>{isEn ? 'Scanning' : 'قراءة'}</span>
                        </>
                      ) : fileItem.status === 'error' ? (
                        <>
                          <AlertTriangle className="w-3 h-3" />
                          <span>{isEn ? 'Failed' : 'تعذر'}</span>
                        </>
                      ) : (
                        <span>{isEn ? 'Queued' : 'جاهز'}</span>
                      )}
                    </span>

                    {!isBusy && (
                      <button
                        type="button"
                        onClick={() => removeFile(fileItem.id)}
                        aria-label={isEn ? 'Remove file' : 'حذف الصورة'}
                        className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-[#14201A]/85 text-white flex items-center justify-center hover:bg-[#14201A]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="p-2 space-y-1">
                    <div className="flex items-center justify-between gap-1 text-[10px] font-extrabold text-[#4B5B52] dark:text-[#A3B5AA]">
                      <span className="truncate text-[#14201A] dark:text-[#E8F2EB]">
                        {fileItem.name}
                      </span>
                      <span className="tabular-nums shrink-0">{displaySize}</span>
                    </div>

                    {fileItem.status === 'error' && !isBusy && (
                      <button
                        type="button"
                        onClick={() => retrySingleFile(fileItem.id)}
                        className="w-full py-1 px-2 rounded-lg bg-[#FEF9C3] hover:bg-[#FACC15] text-[#14201A] text-[10px] font-black inline-flex items-center justify-center gap-1 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{isEn ? 'Retry this page' : 'إعادة قراءة الصفحة'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
          {failedFilesCount > 0 && !isBusy && (
            <button
              type="button"
              onClick={retryFailed}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#14201A] text-white text-[11px] font-black shrink-0 whitespace-nowrap"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{isEn ? 'Retry Failed' : 'إعادة المحاولة الآن'}</span>
            </button>
          )}
        </div>
      )}

      {/* Full-size Image Lightbox Preview */}
      {previewModalFile?.previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewModalFile(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-[#FFFFFF] dark:bg-[#18231C] rounded-[22px] overflow-hidden border border-[#CFE3D5] dark:border-[#2C3D32] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#CFE3D5] dark:border-[#2C3D32]">
              <div className="min-w-0">
                <div className="text-xs font-black truncate">{previewModalFile.name}</div>
                {previewModalFile.width && previewModalFile.height && (
                  <div className="text-[11px] font-bold text-[#4B5B52] dark:text-[#A3B5AA] tabular-nums">
                    {previewModalFile.width}×{previewModalFile.height} •{' '}
                    {formatFileSizeLabel(
                      previewModalFile.compressedBytes || previewModalFile.sizeBytes
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalFile(null)}
                className="sf-btn !min-h-[36px] w-9 px-0 shrink-0"
                aria-label={isEn ? 'Close preview' : 'إغلاق المعاينة'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto bg-[#0F1712] flex items-center justify-center p-2">
              <img
                src={previewModalFile.previewUrl}
                alt={previewModalFile.name}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
