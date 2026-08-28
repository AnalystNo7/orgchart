"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, Upload, Trash2, Loader2, FileText, Search, Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface KnowledgeDoc {
  id: string;
  title: string;
  category: string;
  origin: string;
  sourceFile: string | null;
  includeInPrompt: boolean;
  contentBytes: number;
  createdAt: string;
  _count: { chunks: number };
}

// Держать синхронно с AI_KB_PROMPT_BUDGET_BYTES (src/lib/ai/limits.ts) —
// клиентский счётчик, сервер проверяет бюджет сам при включении.
const KB_PROMPT_BUDGET_BYTES = 45_000;
const kb = (n: number) => (n / 1024).toFixed(1);

interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  category: string;
  content: string;
  similarity: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  FRAMEWORK: "Фреймворк",
  BENCHMARK: "Бенчмарк",
  CLIENT_DOC: "Документ клиента",
};

const ORIGIN_LABELS: Record<string, string> = {
  BUILTIN: "Встроенный",
  MANUAL: "Загружен",
  IMPORTED: "Импортирован",
  AI_EXTRACTED: "Извлечён AI",
};

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [viewDoc, setViewDoc] = useState<KnowledgeDoc | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);

  // Upload form
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("CLIENT_DOC");
  const [file, setFile] = useState<File | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);

  const loadDocuments = () => {
    setLoading(true);
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((data) => setDocuments(data.documents || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title || file.name);
    formData.append("category", category);

    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setUploadError(data.error || "Ошибка загрузки");
        return;
      }

      setUploadSuccess(data.message);
      setTitle("");
      setFile(null);
      // Reset file input
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      loadDocuments();
    } catch {
      setUploadError("Ошибка сети при загрузке");
    } finally {
      setUploading(false);
    }
  }

  async function handleTogglePrompt(doc: KnowledgeDoc, value: boolean) {
    setToggling(doc.id);
    setToggleError(null);
    const res = await fetch(`/api/knowledge/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeInPrompt: value }),
    });
    setToggling(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setToggleError(data?.error || `Не удалось изменить (HTTP ${res.status})`);
      return;
    }
    setDocuments((docs) =>
      docs.map((d) => (d.id === doc.id ? { ...d, includeInPrompt: value } : d))
    );
  }

  async function handleView(doc: KnowledgeDoc) {
    setViewDoc(doc);
    setViewContent(null);
    const res = await fetch(`/api/knowledge/${doc.id}`);
    if (res.ok) {
      const data = await res.json();
      setViewContent(data.document?.content ?? "");
    } else {
      setViewContent("Не удалось загрузить текст документа.");
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
      loadDocuments();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchResults(null);

    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, topK: 5 }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <BookOpenCheck className="h-6 w-6 text-neutral-700" />
        <h1 className="text-xl font-bold">База знаний</h1>
        <span className="text-sm text-neutral-400">
          RAG — документы для AI-ассистента
        </span>
      </div>

      {/* Upload form */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Загрузить документ</h2>
        <form onSubmit={handleUpload} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                Название
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Название документа (или имя файла)"
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                Категория
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded border px-2 py-1.5 text-sm"
              >
                <option value="CLIENT_DOC">Документ клиента</option>
                <option value="FRAMEWORK">Фреймворк</option>
                <option value="BENCHMARK">Бенчмарк</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                Файл (MD, TXT, PDF, DOCX)
              </label>
              <input
                id="file-input"
                type="file"
                accept=".md,.txt,.pdf,.markdown,.docx,.doc"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!file || uploading}
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "Загрузка..." : "Загрузить"}
            </button>
          </div>

          {uploadError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {uploadSuccess}
            </div>
          )}
        </form>
      </div>

      {/* Semantic search */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Семантический поиск</h2>
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Введите запрос на естественном языке..."
            className="flex-1 rounded border px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={!searchQuery.trim() || searching}
            className="inline-flex items-center gap-1.5 rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:text-neutral-400"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Найти
          </button>
        </form>

        {searchResults !== null && (
          <div className="mt-3 space-y-2">
            {searchResults.length === 0 ? (
              <div className="text-sm text-neutral-400">Ничего не найдено</div>
            ) : (
              searchResults.map((r) => (
                <div key={r.chunkId} className="rounded border p-3">
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className="font-medium">{r.documentTitle}</span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                      {CATEGORY_LABELS[r.category] || r.category}
                    </span>
                    <span className="text-green-600">
                      {(r.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-neutral-700 whitespace-pre-wrap line-clamp-4">
                    {r.content}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Documents list */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">
          Документы ({documents.length})
        </h2>

        {(() => {
          const enabled = documents.filter((d) => d.includeInPrompt);
          const usedBytes = enabled.reduce((s, d) => s + d.contentBytes, 0);
          const ratio = Math.min(1, usedBytes / KB_PROMPT_BUDGET_BYTES);
          const barColor =
            ratio > 0.95 ? "bg-red-500" : ratio > 0.8 ? "bg-amber-400" : "bg-green-500";
          return (
            <div className="mb-3 rounded-lg border bg-white px-4 py-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-600">
                  Постоянно в промпте: {enabled.length}{" "}
                  {enabled.length === 1 ? "документ" : "документа(ов)"} ·{" "}
                  {kb(usedBytes)} КБ из {kb(KB_PROMPT_BUDGET_BYTES)} КБ
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-neutral-100">
                <div
                  className={`h-full rounded ${barColor}`}
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-400">
                Включённые документы попадают в каждый AI-запрос целиком и расходуют
                контекст. Точечный поиск по базе знаний работает для всех документов
                независимо от флажка.
              </p>
              {toggleError && (
                <p className="mt-1.5 text-[11px] text-red-600">{toggleError}</p>
              )}
            </div>
          );
        })()}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">
            База знаний пуста. Загрузите документы (MD, TXT, PDF) для обогащения контекста AI-ассистента.
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-4 rounded-lg border bg-white px-4 py-3"
              >
                <FileText className="h-5 w-5 flex-shrink-0 text-neutral-400" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{doc.title}</div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                      {CATEGORY_LABELS[doc.category] || doc.category}
                    </span>
                    <span>{ORIGIN_LABELS[doc.origin] || doc.origin}</span>
                    <span>{doc._count.chunks} чанков</span>
                    {doc.sourceFile && <span>{doc.sourceFile}</span>}
                    <span>{new Date(doc.createdAt).toLocaleDateString("ru-RU")}</span>
                  </div>
                </div>
                <div
                  className="flex flex-shrink-0 items-center gap-1.5"
                  title="Включить полный текст документа в системный промпт каждого AI-запроса"
                >
                  <span className="text-[11px] text-neutral-400">В промпте</span>
                  <Switch
                    checked={doc.includeInPrompt}
                    disabled={toggling === doc.id}
                    onCheckedChange={(v) => handleTogglePrompt(doc, v)}
                  />
                </div>
                <button
                  onClick={() => handleView(doc)}
                  className="flex-shrink-0 rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  title="Просмотр текста документа"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deleting === doc.id}
                  className="flex-shrink-0 rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Удалить"
                >
                  {deleting === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Просмотр извлечённого текста — ровно то, что видит модель.
          Оригинальный файл (PDF/DOCX) не хранится. */}
      <Dialog open={viewDoc !== null} onOpenChange={(open) => !open && setViewDoc(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-8">{viewDoc?.title}</DialogTitle>
          </DialogHeader>
          {viewDoc && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                {CATEGORY_LABELS[viewDoc.category] || viewDoc.category}
              </span>
              {viewDoc.sourceFile && <span>{viewDoc.sourceFile}</span>}
              <span>{viewDoc._count.chunks} чанков</span>
              <span>{kb(viewDoc.contentBytes)} КБ</span>
              <span>
                {new Date(viewDoc.createdAt).toLocaleDateString("ru-RU")}
              </span>
              {viewDoc.includeInPrompt && (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">
                  в промпте
                </span>
              )}
            </div>
          )}
          <div className="max-h-[60vh] overflow-auto rounded border bg-neutral-50 p-3">
            {viewContent === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-neutral-700">
                {viewContent}
              </pre>
            )}
          </div>
          <p className="text-[11px] text-neutral-400">
            Показан извлечённый текст — именно его видит AI-ассистент. Исходный
            файл в системе не хранится.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
