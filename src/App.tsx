import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { 
  Upload, 
  FileText, 
  Download, 
  Languages, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  X,
  FileUp
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, playSuccessSound } from "./lib/utils";
import { parseSRT, stringifySRT, translateSubtitleBlocks, checkApiKey } from "./services/srtService";
import { Settings, Key, CheckCircle2 as CheckIcon, XCircle as ErrorIcon } from "lucide-react";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [translatedContent, setTranslatedContent] = useState<string>("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [showSettings, setShowSettings] = useState(false);
  const [isCheckingKeys, setIsCheckingKeys] = useState(false);
  const [keyStatuses, setKeyStatuses] = useState<Record<string, "valid" | "invalid" | "checking" | null>>({});
  const [checkSummary, setCheckSummary] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile && selectedFile.name.toLowerCase().endsWith(".srt")) {
      setFile(selectedFile);
      setSuccess(false);
      setError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        setOriginalContent(e.target?.result as string);
      };
      reader.readAsText(selectedFile);
    } else {
      setError("Vui lòng tải lên tệp .srt hợp lệ.");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/plain": [".srt"], "application/x-subrip": [".srt"] },
    multiple: false,
  } as any);

  const handleTranslate = async () => {
    if (!originalContent) return;
    if (!apiKey && !process.env.GEMINI_API_KEY) {
      setError("Vui lòng nhập Gemini API Key trong phần cài đặt.");
      setShowSettings(true);
      return;
    }

    setIsTranslating(true);
    setProgress(0);
    setError(null);
    setSuccess(false);

    try {
      const blocks = parseSRT(originalContent);
      if (blocks.length === 0) {
        throw new Error("Không tìm thấy nội dung phụ đề hợp lệ trong tệp.");
      }

      const translatedBlocks = await translateSubtitleBlocks(
        blocks, 
        (p) => setProgress(p),
        apiKey
      );

      const result = stringifySRT(translatedBlocks);
      setTranslatedContent(result);
      setSuccess(true);
      playSuccessSound();
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi trong quá trình dịch.");
    } finally {
      setIsTranslating(false);
    }
  };

  const saveApiKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem("gemini_api_key", val);
    // Reset statuses and summary when keys change
    setKeyStatuses({});
    setCheckSummary(null);
  };

  const handleCheckKeys = async () => {
    const keys = apiKey.split(/[\n,]/).map(k => k.trim()).filter(k => k !== "");
    if (keys.length === 0) return;

    setIsCheckingKeys(true);
    const newStatuses: Record<string, "valid" | "invalid" | "checking" | null> = {};
    let validCount = 0;
    let invalidCount = 0;
    
    for (const key of keys) {
      setKeyStatuses(prev => ({ ...prev, [key]: "checking" }));
      const isValid = await checkApiKey(key);
      if (isValid) validCount++;
      else invalidCount++;
      setKeyStatuses(prev => ({ ...prev, [key]: isValid ? "valid" : "invalid" }));
    }
    setIsCheckingKeys(false);
    
    // Show summary message
    const summary = `Kiểm tra hoàn tất: ${validCount} Key hoạt động, ${invalidCount} Key lỗi.`;
    setCheckSummary(summary);
    
    if (validCount === 0 && invalidCount > 0) {
      setError(summary);
    }
  };

  const handleImportKeys = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const newKeys = content.split(/[\n,]/).map(k => k.trim()).filter(k => k !== "");
        const currentKeys = apiKey.split(/[\n,]/).map(k => k.trim()).filter(k => k !== "");
        
        // Merge and remove duplicates
        const mergedKeys = Array.from(new Set([...currentKeys, ...newKeys]));
        saveApiKey(mergedKeys.join("\n"));
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = "";
  };

  const downloadSRT = () => {
    if (!translatedContent) return;
    const blob = new Blob([translatedContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file ? `translated_${file.name}` : "translated.srt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    setOriginalContent("");
    setTranslatedContent("");
    setProgress(0);
    setSuccess(false);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-[#FF6321]/20">
      {/* Header */}
      <header className="border-b border-[#1A1A1A]/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#FDFCFB]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FF6321] rounded-full flex items-center justify-center text-white">
            <Languages size={24} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">SRT Translator</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-2 rounded-full transition-all",
              showSettings ? "bg-[#FF6321] text-white" : "hover:bg-[#F5F5F0] text-[#1A1A1A]/60"
            )}
          >
            <Settings size={20} />
          </button>
          <div className="text-xs uppercase tracking-widest font-medium opacity-50 hidden sm:block">
            Powered by Gemini AI
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-12">
          {/* Settings Panel */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-[#F5F5F0] rounded-3xl p-6 space-y-4 border border-[#1A1A1A]/5">
                  <div className="flex items-center justify-between gap-2 text-sm font-bold uppercase tracking-wider opacity-60">
                    <div className="flex items-center gap-2">
                      <Key size={14} />
                      Cấu hình API Key
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer hover:text-[#FF6321] transition-colors text-[10px]">
                      <FileUp size={14} />
                      Tải lên file .txt
                      <input 
                        type="file" 
                        accept=".txt" 
                        className="hidden" 
                        onChange={handleImportKeys}
                      />
                    </label>
                  </div>
                  <div className="space-y-3">
                    <textarea 
                      value={apiKey}
                      onChange={(e) => saveApiKey(e.target.value)}
                      placeholder="Dán danh sách API Key (mỗi dòng một key)..."
                      rows={4}
                      className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6321]/20 focus:border-[#FF6321] font-mono"
                    />
                    <button
                      onClick={handleCheckKeys}
                      disabled={isCheckingKeys || !apiKey.trim()}
                      className="w-full bg-[#1A1A1A] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#333] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isCheckingKeys ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Kiểm tra danh sách Key
                    </button>
                  </div>
                  
                  {checkSummary && (
                    <div className={cn(
                      "p-3 rounded-xl text-xs font-medium flex items-center gap-2",
                      checkSummary.includes("0 Key hoạt động") 
                        ? "bg-red-50 text-red-600 border border-red-100" 
                        : "bg-green-50 text-green-600 border border-green-100"
                    )}>
                      {checkSummary.includes("0 Key hoạt động") ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                      {checkSummary}
                    </div>
                  )}
                  
                  {Object.keys(keyStatuses).length > 0 && (
                    <div className="space-y-2 mt-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-40">Trạng thái Key:</p>
                      <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
                        {Object.entries(keyStatuses).map(([key, status]) => (
                          <div key={key} className="flex items-center justify-between text-[11px] bg-white/50 p-2 rounded-lg border border-[#1A1A1A]/5">
                            <span className="font-mono opacity-60 truncate max-w-[200px]">{key}</span>
                            <span className={cn(
                              "flex items-center gap-1 font-medium",
                              status === "valid" && "text-green-600",
                              status === "invalid" && "text-red-600",
                              status === "checking" && "text-blue-600 animate-pulse",
                            )}>
                              {status === "valid" && <CheckIcon size={12} />}
                              {status === "invalid" && <ErrorIcon size={12} />}
                              {status === "checking" && <Loader2 size={12} className="animate-spin" />}
                              {status === "valid" ? "Hoạt động" : status === "invalid" ? "Lỗi/Hết hạn" : "Đang kiểm tra..."}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-[#1A1A1A]/40 italic">
                    * Bạn có thể nhập nhiều Key (mỗi dòng 1 key) để tăng tốc độ dịch và tránh bị giới hạn.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hero Section */}
          <section className="text-center space-y-4">
            <h2 className="text-5xl font-light tracking-tighter leading-tight">
              Dịch phụ đề <span className="italic font-serif">thông minh</span> sang tiếng Việt
            </h2>
            <p className="text-[#1A1A1A]/60 max-w-lg mx-auto">
              Tải lên tệp .srt của bạn và chúng tôi sẽ dịch nó sang tiếng Việt trong khi vẫn giữ nguyên cấu trúc thời gian.
            </p>
          </section>


          {/* Upload Area */}
          {!file ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed border-[#1A1A1A]/20 rounded-3xl p-16 flex flex-col items-center justify-center gap-6 cursor-pointer transition-all duration-300 hover:border-[#FF6321]/50 hover:bg-[#FF6321]/5",
                isDragActive && "border-[#FF6321] bg-[#FF6321]/10"
              )}
            >
              <input {...getInputProps()} />
              <div className="w-20 h-20 bg-[#F5F5F0] rounded-full flex items-center justify-center text-[#1A1A1A]/40 group-hover:text-[#FF6321]">
                <Upload size={32} />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium">Kéo và thả tệp .srt vào đây</p>
                <p className="text-[#1A1A1A]/40 text-sm mt-1">Hoặc nhấp để chọn tệp từ máy tính</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-[#1A1A1A]/10 rounded-3xl p-8 shadow-sm"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#F5F5F0] rounded-2xl flex items-center justify-center text-[#FF6321]">
                    <FileText size={24} />
                  </div>
                  <div>
                    <p className="font-semibold">{file.name}</p>
                    <p className="text-xs text-[#1A1A1A]/40 uppercase tracking-wider">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                {!isTranslating && (
                  <button 
                    onClick={reset}
                    className="p-2 hover:bg-[#F5F5F0] rounded-full transition-colors text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              {isTranslating ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-[#FF6321]" />
                      Đang dịch...
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 bg-[#F5F5F0] rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-[#FF6321]"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-center text-sm text-[#1A1A1A]/40 italic">
                    Vui lòng không đóng tab này trong khi quá trình đang diễn ra.
                  </p>
                </div>
              ) : success ? (
                <div className="space-y-8">
                  <div className="bg-[#E7F5E7] text-[#2E7D32] p-4 rounded-2xl flex items-center gap-3">
                    <CheckCircle2 size={20} />
                    <span className="font-medium">Dịch thành công!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={downloadSRT}
                      className="flex items-center justify-center gap-2 bg-[#1A1A1A] text-white py-4 rounded-2xl font-medium hover:bg-[#333] transition-all active:scale-[0.98]"
                    >
                      <Download size={20} />
                      Tải xuống SRT
                    </button>
                    <button
                      onClick={reset}
                      className="flex items-center justify-center gap-2 border border-[#1A1A1A]/10 py-4 rounded-2xl font-medium hover:bg-[#F5F5F0] transition-all active:scale-[0.98]"
                    >
                      Dịch tệp khác
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleTranslate}
                  disabled={isTranslating}
                  className="w-full bg-[#FF6321] text-white py-5 rounded-2xl font-semibold text-lg hover:bg-[#E5591D] transition-all shadow-lg shadow-[#FF6321]/20 active:scale-[0.99]"
                >
                  Bắt đầu dịch sang Tiếng Việt
                </button>
              )}

              {error && (
                <div className="mt-6 bg-[#FEF2F2] text-[#DC2626] p-4 rounded-2xl flex items-center gap-3 text-sm">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}
            </motion.div>
          )}

          {/* Preview Section */}
          <AnimatePresence>
            {(originalContent || translatedContent) && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="space-y-4"
              >
                <h3 className="text-sm font-bold uppercase tracking-widest text-[#1A1A1A]/40">Xem trước</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-[#1A1A1A]/60">Gốc</span>
                    <div className="bg-[#F5F5F0] rounded-2xl p-6 h-64 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap border border-[#1A1A1A]/5">
                      {originalContent || "Chưa có nội dung..."}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-[#1A1A1A]/60">Bản dịch</span>
                    <div className="bg-[#1A1A1A] text-white rounded-2xl p-6 h-64 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap border border-white/10">
                      {translatedContent || (isTranslating ? "Đang xử lý..." : "Chờ dịch...")}
                    </div>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="max-w-4xl mx-auto px-6 py-12 border-t border-[#1A1A1A]/10 text-center text-[#1A1A1A]/40 text-sm">
        <p>© 2026 SRT Translator. Một công cụ đơn giản để dịch phụ đề.</p>
      </footer>
    </div>
  );
}
