"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, Upload, Trash2, Loader2, FileText, Search } from "lucide-react";

interface KnowledgeDoc {
  id: string;
  title: string;
  category: string;
  origin: string;
  sourceFile: string | null;
  createdAt: string;
  _count: { chunks: number };
}

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
                Файл (MD, TXT, PDF)
              </label>
              <input
                id="file-input"
                type="file"
                accept=".md,.txt,.pdf,.markdown"
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
    </div>
  );
}
