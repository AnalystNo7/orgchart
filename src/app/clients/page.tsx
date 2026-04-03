"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrgChartStore } from "@/lib/store";
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Save,
  X,
  Search,
  Users,
  FileText,
  TrendingUp,
} from "lucide-react";

// --- Types ---

type ClientStatus = "ACTIVE" | "PROSPECT" | "INACTIVE";
type PipelineStage = "LEAD" | "QUALIFICATION" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";

interface ClientData {
  id: string;
  name: string;
  industry: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  status: ClientStatus;
  description: string | null;
  contracts: Array<{ id: string; name: string; type: string; amount: string | null; status: string }>;
  _count: { contracts: number; deals: number };
}

interface DealData {
  id: string;
  name: string;
  clientId: string;
  client: { id: string; name: string; status: string };
  amount: number;
  probability: number;
  stage: PipelineStage;
  expectedCloseDate: string | null;
  description: string | null;
}

// --- Constants ---

const CLIENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активный",
  PROSPECT: "Потенциальный",
  INACTIVE: "Неактивный",
};

const CLIENT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PROSPECT: "bg-blue-100 text-blue-700",
  INACTIVE: "bg-neutral-100 text-neutral-500",
};

const STAGE_LABELS: Record<string, string> = {
  LEAD: "Лид",
  QUALIFICATION: "Квалификация",
  PROPOSAL: "Предложение",
  NEGOTIATION: "Переговоры",
  WON: "Выиграна",
  LOST: "Проиграна",
};

const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-neutral-100 text-neutral-600",
  QUALIFICATION: "bg-blue-100 text-blue-700",
  PROPOSAL: "bg-purple-100 text-purple-700",
  NEGOTIATION: "bg-amber-100 text-amber-700",
  WON: "bg-green-100 text-green-700",
  LOST: "bg-red-100 text-red-700",
};

function formatAmount(v: number): string {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toString();
}

// --- Component ---

export default function ClientsPage() {
  const currentScenarioId = useOrgChartStore((s) => s.currentScenarioId);
  const [activeTab, setActiveTab] = useState<"clients" | "pipeline">("clients");
  const [clients, setClients] = useState<ClientData[]>([]);
  const [deals, setDeals] = useState<DealData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Client form
  const [showClientForm, setShowClientForm] = useState(false);
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [cfName, setCfName] = useState("");
  const [cfIndustry, setCfIndustry] = useState("");
  const [cfContact, setCfContact] = useState("");
  const [cfPhone, setCfPhone] = useState("");
  const [cfEmail, setCfEmail] = useState("");
  const [cfStatus, setCfStatus] = useState<ClientStatus>("PROSPECT");
  const [cfDesc, setCfDesc] = useState("");

  // Deal form
  const [showDealForm, setShowDealForm] = useState(false);
  const [editDealId, setEditDealId] = useState<string | null>(null);
  const [dfName, setDfName] = useState("");
  const [dfClientId, setDfClientId] = useState("");
  const [dfAmount, setDfAmount] = useState(0);
  const [dfProbability, setDfProbability] = useState(50);
  const [dfStage, setDfStage] = useState<PipelineStage>("LEAD");
  const [dfCloseDate, setDfCloseDate] = useState("");
  const [dfDesc, setDfDesc] = useState("");

  const [saving, setSaving] = useState(false);

  const loadClients = useCallback(() => {
    setLoading(true);
    fetch(`/api/clients`)
      .then((r) => r.json())
      .then((data) => setClients(data.clients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadDeals = useCallback(() => {
    if (!currentScenarioId) return;
    fetch(`/api/pipeline?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data) => setDeals(data.deals || []))
      .catch(() => {});
  }, [currentScenarioId]);

  useEffect(() => { loadClients(); }, [loadClients]);
  useEffect(() => { loadDeals(); }, [loadDeals]);

  // --- Client form ---
  function openCreateClient() {
    setEditClientId(null);
    setCfName(""); setCfIndustry(""); setCfContact(""); setCfPhone(""); setCfEmail("");
    setCfStatus("PROSPECT"); setCfDesc("");
    setShowClientForm(true);
  }

  function openEditClient(c: ClientData) {
    setEditClientId(c.id);
    setCfName(c.name); setCfIndustry(c.industry || ""); setCfContact(c.contactPerson || "");
    setCfPhone(c.phone || ""); setCfEmail(c.email || "");
    setCfStatus(c.status); setCfDesc(c.description || "");
    setShowClientForm(true);
  }

  async function handleSaveClient() {
    if (!cfName.trim()) return;
    setSaving(true);
    const body = { name: cfName.trim(), industry: cfIndustry.trim() || null, contactPerson: cfContact.trim() || null, phone: cfPhone.trim() || null, email: cfEmail.trim() || null, status: cfStatus, description: cfDesc.trim() || null };
    try {
      if (editClientId) {
        await fetch(`/api/clients/${editClientId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setShowClientForm(false);
      loadClients();
    } catch {} finally { setSaving(false); }
  }

  async function handleDeleteClient(id: string) {
    if (!confirm("Удалить заказчика?")) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    loadClients();
  }

  // --- Deal form ---
  function openCreateDeal(clientId?: string) {
    setEditDealId(null);
    setDfName(""); setDfClientId(clientId || ""); setDfAmount(0); setDfProbability(50);
    setDfStage("LEAD"); setDfCloseDate(""); setDfDesc("");
    setShowDealForm(true);
  }

  function openEditDeal(d: DealData) {
    setEditDealId(d.id);
    setDfName(d.name); setDfClientId(d.clientId); setDfAmount(d.amount); setDfProbability(d.probability);
    setDfStage(d.stage); setDfCloseDate(d.expectedCloseDate ? d.expectedCloseDate.slice(0, 10) : ""); setDfDesc(d.description || "");
    setShowDealForm(true);
  }

  async function handleSaveDeal() {
    if (!dfName.trim() || !dfClientId || !currentScenarioId) return;
    setSaving(true);
    const body = { scenarioId: currentScenarioId, clientId: dfClientId, name: dfName.trim(), amount: dfAmount, probability: dfProbability, stage: dfStage, expectedCloseDate: dfCloseDate || null, description: dfDesc.trim() || null };
    try {
      if (editDealId) {
        await fetch(`/api/pipeline/${editDealId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/pipeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setShowDealForm(false);
      loadDeals();
    } catch {} finally { setSaving(false); }
  }

  async function handleDeleteDeal(id: string) {
    if (!confirm("Удалить сделку?")) return;
    await fetch(`/api/pipeline/${id}`, { method: "DELETE" });
    loadDeals();
  }

  // --- Filter ---
  const filteredClients = searchQuery
    ? clients.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.industry || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : clients;

  const totalRevenue = clients.reduce((s, c) => s + c.contracts.filter((ct) => ct.type === "REVENUE").reduce((ss, ct) => ss + Number(ct.amount || 0), 0), 0);
  const pipelineValue = deals.filter((d) => d.stage !== "LOST").reduce((s, d) => s + d.amount * (d.probability / 100), 0);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Briefcase className="h-6 w-6 text-neutral-700" />
          <h1 className="text-xl font-bold">Заказчики</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-neutral-100 p-1">
            <button onClick={() => setActiveTab("clients")} className={`rounded-md px-3 py-1 text-sm font-medium transition ${activeTab === "clients" ? "bg-white shadow-sm" : "text-neutral-500"}`}>
              <Users className="inline h-3.5 w-3.5 mr-1" />Заказчики ({clients.length})
            </button>
            <button onClick={() => setActiveTab("pipeline")} className={`rounded-md px-3 py-1 text-sm font-medium transition ${activeTab === "pipeline" ? "bg-white shadow-sm" : "text-neutral-500"}`}>
              <TrendingUp className="inline h-3.5 w-3.5 mr-1" />Pipeline ({deals.length})
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs text-neutral-500">Заказчиков</div>
          <div className="text-lg font-bold">{clients.length}</div>
          <div className="text-[10px] text-neutral-400">активных: {clients.filter((c) => c.status === "ACTIVE").length}</div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs text-neutral-500">Контрактов</div>
          <div className="text-lg font-bold">{clients.reduce((s, c) => s + c._count.contracts, 0)}</div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs text-neutral-500">Выручка</div>
          <div className="text-lg font-bold">{formatAmount(totalRevenue)}</div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs text-neutral-500">Pipeline (взвеш.)</div>
          <div className="text-lg font-bold">{formatAmount(pipelineValue)}</div>
        </div>
      </div>

      {/* Clients tab */}
      {activeTab === "clients" && (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-neutral-400" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded border pl-8 pr-3 py-1.5 text-sm" placeholder="Поиск по названию или отрасли..." />
            </div>
            <button onClick={openCreateClient} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
              <Plus className="h-4 w-4" />Добавить
            </button>
          </div>

          {showClientForm && (
            <div className="rounded-lg border bg-white p-4 space-y-3">
              <h2 className="text-sm font-semibold">{editClientId ? "Редактировать заказчика" : "Новый заказчик"}</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Название *</label>
                  <input value={cfName} onChange={(e) => setCfName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" placeholder="Название компании" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Отрасль</label>
                  <input value={cfIndustry} onChange={(e) => setCfIndustry(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" placeholder="IT, Нефтегаз..." />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Контактное лицо</label>
                  <input value={cfContact} onChange={(e) => setCfContact(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Статус</label>
                  <select value={cfStatus} onChange={(e) => setCfStatus(e.target.value as ClientStatus)} className="w-full rounded border px-2 py-1.5 text-sm">
                    {Object.entries(CLIENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Телефон</label>
                  <input value={cfPhone} onChange={(e) => setCfPhone(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Email</label>
                  <input value={cfEmail} onChange={(e) => setCfEmail(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveClient} disabled={!cfName.trim() || saving} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editClientId ? "Сохранить" : "Создать"}
                </button>
                <button onClick={() => setShowClientForm(false)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">
                  <X className="h-4 w-4" />Отмена
                </button>
              </div>
            </div>
          )}

          {filteredClients.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">Нет заказчиков. Нажмите «Добавить».</div>
          ) : (
            <div className="rounded-lg border bg-white overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-neutral-50 px-4 py-2 text-xs font-medium uppercase text-neutral-500">
                <span className="flex-1">Заказчик</span>
                <span className="w-28">Отрасль</span>
                <span className="w-20 text-center">Статус</span>
                <span className="w-16 text-center">Контракты</span>
                <span className="w-16 text-center">Сделки</span>
                <span className="w-20" />
              </div>
              {filteredClients.map((c) => (
                <div key={c.id} className="flex items-center gap-2 border-b px-4 py-2.5 hover:bg-neutral-50">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    {c.contactPerson && <div className="text-[10px] text-neutral-400">{c.contactPerson}</div>}
                  </div>
                  <span className="w-28 text-xs text-neutral-500 truncate">{c.industry || "—"}</span>
                  <span className={`w-20 text-center rounded-full px-2 py-0.5 text-[10px] font-medium ${CLIENT_STATUS_COLORS[c.status]}`}>
                    {CLIENT_STATUS_LABELS[c.status]}
                  </span>
                  <span className="w-16 text-center text-xs text-neutral-500 flex items-center justify-center gap-1">
                    <FileText className="h-3 w-3" />{c._count.contracts}
                  </span>
                  <span className="w-16 text-center text-xs text-neutral-500">{c._count.deals}</span>
                  <div className="w-20 flex items-center justify-end gap-1">
                    <button onClick={() => openCreateDeal(c.id)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600" title="Новая сделка">
                      <TrendingUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => openEditClient(c)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600" title="Редактировать">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDeleteClient(c.id)} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600" title="Удалить">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Pipeline tab */}
      {activeTab === "pipeline" && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-400">{deals.length} сделок</span>
            <button onClick={() => openCreateDeal()} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
              <Plus className="h-4 w-4" />Новая сделка
            </button>
          </div>

          {showDealForm && (
            <div className="rounded-lg border bg-white p-4 space-y-3">
              <h2 className="text-sm font-semibold">{editDealId ? "Редактировать сделку" : "Новая сделка"}</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Название *</label>
                  <input value={dfName} onChange={(e) => setDfName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Заказчик *</label>
                  <select value={dfClientId} onChange={(e) => setDfClientId(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                    <option value="">Выберите заказчика</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Сумма</label>
                  <input type="number" value={dfAmount} onChange={(e) => setDfAmount(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Вероятность (%)</label>
                  <input type="number" min={0} max={100} value={dfProbability} onChange={(e) => setDfProbability(Number(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Стадия</label>
                  <select value={dfStage} onChange={(e) => setDfStage(e.target.value as PipelineStage)} className="w-full rounded border px-2 py-1.5 text-sm">
                    {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Ожидаемое закрытие</label>
                  <input type="date" value={dfCloseDate} onChange={(e) => setDfCloseDate(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveDeal} disabled={!dfName.trim() || !dfClientId || saving} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editDealId ? "Сохранить" : "Создать"}
                </button>
                <button onClick={() => setShowDealForm(false)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">
                  <X className="h-4 w-4" />Отмена
                </button>
              </div>
            </div>
          )}

          {/* Pipeline by stages */}
          {!currentScenarioId ? (
            <div className="text-center text-neutral-400 py-8">Выберите сценарий</div>
          ) : deals.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-400">Нет сделок. Нажмите «Новая сделка».</div>
          ) : (
            <div className="space-y-3">
              {(["LEAD", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as PipelineStage[]).map((stage) => {
                const stageDeals = deals.filter((d) => d.stage === stage);
                if (stageDeals.length === 0) return null;
                return (
                  <div key={stage} className="rounded-lg border bg-white overflow-hidden">
                    <div className={`flex items-center justify-between px-4 py-2 ${STAGE_COLORS[stage]} bg-opacity-50`}>
                      <span className="text-xs font-semibold">{STAGE_LABELS[stage]}</span>
                      <span className="text-xs">{stageDeals.length} сделок &middot; {formatAmount(stageDeals.reduce((s, d) => s + d.amount, 0))}</span>
                    </div>
                    {stageDeals.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 border-t px-4 py-2 hover:bg-neutral-50">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{d.name}</div>
                          <div className="text-[10px] text-neutral-400">{d.client.name}</div>
                        </div>
                        <span className="w-20 text-right text-sm font-medium">{formatAmount(d.amount)}</span>
                        <span className="w-12 text-center text-xs text-neutral-500">{d.probability}%</span>
                        <span className="w-24 text-xs text-neutral-400">{d.expectedCloseDate ? new Date(d.expectedCloseDate).toLocaleDateString("ru") : "—"}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditDeal(d)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDeleteDeal(d.id)} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
