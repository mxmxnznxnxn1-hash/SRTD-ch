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
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, playSuccessSound } from "./lib/utils";
import { parseSRT, stringifySRT, translateSubtitleBlocks } from "./services/srtService";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [translatedContent, setTranslatedContent] = useState<string>("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

    setIsTranslating(true);
    setProgress(0);
    setError(null);
    setSuccess(false);

    try {
      const blocks = parseSRT(originalContent);
      if (blocks.length === 0) {
        throw new Error("Không tìm thấy nội dung phụ đề hợp lệ trong tệp.");
      }

      const translatedBlocks = await translateSubtitleBlocks(blocks, (p) => {
        setProgress(p);
      });

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
        <div className="text-xs uppercase tracking-widest font-medium opacity-50">
          Powered by Gemini AI
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-12">
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
