import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Check, ExternalLink, Globe, ImagePlus, Layers, Loader2, Minus, Palette, Send, Sparkles, Trash2, X } from 'lucide-react';
import { ProductAsset, SpacePreset, StylePreset } from '../../../types/spaceStudio';
import { AgentLayoutResult, AgentStyleResult } from '../data/customPresetLibrary';
import { DEFAULT_LAYOUT_AGENT_MODEL, LAYOUT_AGENT_MODELS } from '../../../shared/layoutAgentModels';
import { confirmDialog } from '../../../utils/confirmDialog';
import {
  AgentEnsembleAdvice,
  AgentEnsembleAdviceItem,
  PRODUCT_IMAGE_DRAG_TYPE,
  buildAgentEnsemble,
  getEnsembleImageSources,
  getValidAdviceItems,
  isEnsembleAdviceApplied,
  isInEnsemble
} from '../data/ensembleAgentBridge';
import { isInitialDemoProduct } from '../data/productAssets';
import { OWNER_PERSONAS, OwnerPersona, getOutdoorView, getOwnerPersona } from '../data/ownerPersonas';

interface AgentSource {
  title: string;
  url: string;
}

interface StyleResult {
  reply: string;
  recommendations: Array<{ code: string; score: number; reason: string }>;
  newStyles: AgentStyleResult[];
  sources: AgentSource[];
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  images?: string[];
  layouts?: AgentLayoutResult[];
  styleResult?: StyleResult;
  ensembleLabel?: string;
  ensembleAdvice?: AgentEnsembleAdvice;
  ownerSuggestion?: { id: string; reason: string };
  sources?: AgentSource[];
  isError?: boolean;
}

interface Props {
  projectId: string;
  spaces: SpacePreset[];
  open: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onBusyChange: (busy: boolean) => void;
  products: ProductAsset[];
  selectedOwner: OwnerPersona | null;
  onSelectOwner: (ownerId: string | null) => void;
  ensembleSendNonce: number;
  onApplyEnsembleAdvice: (items: AgentEnsembleAdviceItem[]) => void;
  styles: StylePreset[];
  selectedStyle: StylePreset;
  primaryProduct?: ProductAsset;
  isLight: boolean;
  onUseLayout: (layout: AgentLayoutResult) => SpacePreset;
  onApplyStyle: (style: StylePreset) => void;
  onSaveNewStyle: (style: AgentStyleResult) => StylePreset;
}

const MAX_IMAGES = 4;
const MODEL_STORAGE_KEY = 'manwah_space_layout_agent_model';

function loadSavedModel(): string {
  try {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY);
    if (saved && LAYOUT_AGENT_MODELS.some((m) => m.id === saved)) return saved;
  } catch {
    // 浏览器禁用存储时用默认模型
  }
  return DEFAULT_LAYOUT_AGENT_MODEL;
}
const WINDOW_WIDTH = 400;
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// 对话记录按工程保存在本机；图片只存小缩略图，避免占满浏览器存储
const MAX_SAVED_MESSAGES = 60;
const chatStorageKey = (projectId: string) => `manwah_space_layout_agent_chat_${projectId}`;

interface SavedChat {
  messages: AgentMessage[];
  usedLayoutKeys: Record<string, string>;
  savedStyleKeys: Record<string, StylePreset>;
}

function loadSavedChat(projectId: string): SavedChat {
  try {
    const parsed = JSON.parse(localStorage.getItem(chatStorageKey(projectId)) || 'null');
    if (parsed && Array.isArray(parsed.messages)) {
      return { messages: parsed.messages, usedLayoutKeys: parsed.usedLayoutKeys || {}, savedStyleKeys: parsed.savedStyleKeys || {} };
    }
  } catch {
    // 记录损坏时从空对话开始
  }
  return { messages: [], usedLayoutKeys: {}, savedStyleKeys: {} };
}

function persistChat(projectId: string, chat: SavedChat): void {
  const key = chatStorageKey(projectId);
  try {
    if (chat.messages.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    const messages = chat.messages.filter((m) => !m.isError).slice(-MAX_SAVED_MESSAGES);
    try {
      localStorage.setItem(key, JSON.stringify({ ...chat, messages }));
    } catch {
      // 存储空间不足时放弃缩略图，保住文字和方案
      localStorage.setItem(key, JSON.stringify({ ...chat, messages: messages.map(({ images: _images, ...rest }) => rest) }));
    }
  } catch (err) {
    console.warn('[SpaceLayoutAgent] 对话保存失败', err);
  }
}

function makeThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function fileToCompressedDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('无法读取图片'));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片无法读取'));
    };
    img.src = url;
  });
}

/** 依次尝试候选地址，取第一张能读取的产品图 */
async function productImageToDataUrl(sources: string[]): Promise<string> {
  for (const src of sources) {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      if (res.ok && blob.type.startsWith('image/')) return await fileToCompressedDataUrl(blob);
    } catch {
      // 云端地址可能跨域，继续尝试下一个
    }
  }
  throw new Error('产品图读取失败，请换一张或手动上传');
}

const ownerForAgent = (owner: OwnerPersona | null) =>
  owner
    ? {
        id: owner.id,
        name: owner.name,
        summary: owner.summary,
        location: owner.location,
        preferredViews: owner.views.map((id) => getOutdoorView(id)?.label || id),
        identity: owner.identityDirective,
        livingPlan: owner.livingPlanDirective
      }
    : undefined;
const AGENT_OWNER_OPTIONS = OWNER_PERSONAS.map(({ id, name, summary }) => ({ id, name, summary }));

async function postJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error || `请求失败（${res.status}）`);
  return data.data;
}

export const SpaceLayoutAgentWindow: React.FC<Props> = ({
  projectId,
  spaces,
  open,
  onClose,
  onMinimize,
  onBusyChange,
  products,
  selectedOwner,
  onSelectOwner,
  ensembleSendNonce,
  onApplyEnsembleAdvice,
  styles,
  selectedStyle,
  primaryProduct,
  isLight,
  onUseLayout,
  onApplyStyle,
  onSaveNewStyle
}) => {
  const [savedChat] = useState(() => loadSavedChat(projectId));
  const [messages, setMessages] = useState<AgentMessage[]>(savedChat.messages);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [ensembleAttached, setEnsembleAttached] = useState(false);
  const [busyText, setBusyText] = useState('');
  const [model, setModel] = useState<string>(loadSavedModel);
  const [usedLayoutKeys, setUsedLayoutKeys] = useState<Record<string, string>>(savedChat.usedLayoutKeys);
  const [savedStyleKeys, setSavedStyleKeys] = useState<Record<string, StylePreset>>(savedChat.savedStyleKeys);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busyText, open]);

  useEffect(() => {
    if (open && !position) {
      const height = Math.min(620, window.innerHeight - 48);
      setPosition({ left: Math.min(90, window.innerWidth - WINDOW_WIDTH - 16), top: Math.max(16, window.innerHeight - height - 110) });
    }
  }, [open, position]);

  useEffect(() => {
    persistChat(projectId, { messages, usedLayoutKeys, savedStyleKeys });
  }, [projectId, messages, usedLayoutKeys, savedStyleKeys]);

  const busy = Boolean(busyText);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  const addFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/')).slice(0, MAX_IMAGES - attachments.length);
    if (imageFiles.length === 0) return;
    try {
      const urls = await Promise.all(imageFiles.map(fileToCompressedDataUrl));
      setAttachments((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: err?.message || '图片读取失败', isError: true }]);
    }
  };

  const addProductImages = async (sourceList: string[][]) => {
    try {
      const urls = await Promise.all(sourceList.map(productImageToDataUrl));
      setAttachments((prev) => [...new Set([...prev, ...urls])].slice(0, MAX_IMAGES));
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: err?.message || '产品图读取失败', isError: true }]);
    }
  };

  const attachEnsemble = () => {
    setEnsembleAttached(true);
    void addProductImages(getEnsembleImageSources(products).slice(0, MAX_IMAGES));
  };

  // 左侧“发送到 AI 智能体”按钮每点一次，nonce 加一
  const handledSendNonce = useRef(ensembleSendNonce);
  useEffect(() => {
    if (ensembleSendNonce === handledSendNonce.current) return;
    handledSendNonce.current = ensembleSendNonce;
    attachEnsemble();
  });

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0 && !ensembleAttached) || busy) return;
    const thumbnails = await Promise.all(attachments.map(makeThumbnail));
    const includedProducts = products.filter(isInEnsemble);
    const userMessage: AgentMessage = {
      id: newId(),
      role: 'user',
      text: text || (ensembleAttached ? '请根据当前场景套组推荐合适的户型' : '请根据参考图生成户型'),
      images: thumbnails,
      ensembleLabel: ensembleAttached ? `场景套组 ${includedProducts.length} 款：${includedProducts.map((p) => p.name).join('、')}` : undefined
    };
    const history = [...messages.filter((m) => !m.isError), userMessage].map((m) => ({
      role: m.role,
      text: `${m.text}${m.layouts?.length ? `（方案：${m.layouts.map((l) => l.name).join('、')}）` : ''}${m.ensembleAdvice?.summary ? `（套组建议：${m.ensembleAdvice.summary}）` : ''}`
    })).slice(-30);
    const images = attachments;
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachments([]);
    setBusyText('正在联网查找户型…');
    try {
      const data = await postJson('/api/space/build/layout-agent/search', { messages: history, images, model, ensemble: ensembleAttached ? buildAgentEnsemble(products) : undefined, owner: ownerForAgent(selectedOwner), ownerOptions: AGENT_OWNER_OPTIONS });
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          text: data.reply || (data.layouts?.length ? '找到以下户型方案：' : '这次没有得到可用的户型方案，换个描述再试试。'),
          layouts: data.layouts,
          ensembleAdvice: data.ensembleAdvice,
          ownerSuggestion: data.ownerSuggestion,
          sources: data.sources
        }
      ]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: `查找失败：${err?.message || '未知错误'}`, isError: true }]);
    } finally {
      setBusyText('');
    }
  };

  const useLayout = async (layout: AgentLayoutResult, key: string) => {
    if (busy) return;
    const space = onUseLayout(layout);
    setUsedLayoutKeys((prev) => ({ ...prev, [key]: space.code }));
    setBusyText('户型已选定，正在推荐美学并生成新风格…');
    try {
      const data: StyleResult = await postJson('/api/space/build/layout-agent/recommend-styles', {
        layout: {
          name: space.name,
          propertyType: space.propertyType,
          layoutType: space.layoutType,
          ceilingHeight: space.ceilingHeight,
          signatureFeatures: space.signatureFeatures
        },
        existingStyles: styles.slice(0, 80).map((s) => ({
          code: s.code,
          name: s.name,
          category: s.category,
          typicalLayout: s.typicalLayout,
          lifestyleTags: s.lifestyleTags
        })),
        product: primaryProduct ? { name: primaryProduct.name, colors: primaryProduct.colors, materials: primaryProduct.materials } : undefined,
        ensemble: buildAgentEnsemble(products),
        owner: ownerForAgent(selectedOwner),
        model
      });
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: data.reply || `已为 ${space.code} 推荐以下美学：`, styleResult: data, sources: data.sources }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: `户型已切换到 ${space.code}，但美学推荐失败：${err?.message || '未知错误'}`, isError: true }]);
    } finally {
      setBusyText('');
    }
  };

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || !position) return;
    e.preventDefault();
    const offsetX = e.clientX - position.left;
    const offsetY = e.clientY - position.top;
    const onMove = (ev: MouseEvent) => {
      const width = windowRef.current?.offsetWidth || WINDOW_WIDTH;
      setPosition({
        left: Math.max(0, Math.min(window.innerWidth - width, ev.clientX - offsetX)),
        top: Math.max(0, Math.min(window.innerHeight - 48, ev.clientY - offsetY))
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (!open || !position || typeof document === 'undefined') return null;

  const panel = isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-[#181a24] border-white/15 text-neutral-200';
  const card = isLight ? 'bg-[#FAF8F5] border-stone-200' : 'bg-stone-950/60 border-stone-800';
  const muted = isLight ? 'text-stone-500' : 'text-stone-400';
  const primaryBtn = 'px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-[11px] font-bold transition cursor-pointer shrink-0';
  const secondaryBtn = `px-2.5 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer shrink-0 disabled:opacity-50 ${
    isLight ? 'border-stone-300 text-stone-700 hover:bg-stone-100' : 'border-stone-700 text-stone-200 hover:bg-stone-800'
  }`;

  const renderSources = (sources?: AgentSource[]) =>
    sources && sources.length > 0 ? (
      <div className={`mt-2 text-[10px] ${muted}`}>
        <div className="flex items-center gap-1 font-bold mb-1"><Globe className="w-3 h-3" /> 联网来源</div>
        <div className="space-y-0.5">
          {sources.slice(0, 5).map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-amber-600 truncate">
              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{s.title}</span>
            </a>
          ))}
        </div>
      </div>
    ) : null;

  return createPortal(
    <div
      ref={windowRef}
      role="dialog"
      aria-label="AI 户型智能体"
      style={{ left: position.left, top: position.top, width: WINDOW_WIDTH, height: 'min(620px, calc(100vh - 48px))' }}
      className={`fixed z-[300] max-w-[calc(100vw-32px)] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${panel}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const productImage = e.dataTransfer.getData(PRODUCT_IMAGE_DRAG_TYPE);
        if (productImage) {
          void addProductImages([JSON.parse(productImage)]);
        } else {
          void addFiles(Array.from(e.dataTransfer.files));
        }
      }}
    >
      <div onMouseDown={startDrag} className={`flex items-center justify-between gap-2 px-3.5 py-2.5 border-b cursor-move select-none ${isLight ? 'border-stone-100' : 'border-white/10'}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <Bot className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs font-bold whitespace-nowrap">AI 户型智能体</span>
          <span title="联网搜索已开启" className={`shrink-0 ${muted}`}><Globe className="w-3 h-3" /></span>
        </div>
        <select
          aria-label="智能体模型"
          title={LAYOUT_AGENT_MODELS.find((m) => m.id === model)?.hint}
          value={model}
          disabled={busy}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            setModel(e.target.value);
            try {
              localStorage.setItem(MODEL_STORAGE_KEY, e.target.value);
            } catch {
              // 仅影响下次打开时的默认选择
            }
          }}
          className={`ml-auto w-[136px] shrink-0 rounded-lg border px-1.5 py-1 text-[11px] cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-400 ${
            isLight ? 'border-stone-200 bg-white text-stone-700' : 'border-stone-700 bg-stone-900 text-stone-200'
          }`}
        >
          {LAYOUT_AGENT_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label} · {m.hint}</option>
          ))}
        </select>
        <button type="button" onClick={onMinimize} aria-label="收起到左侧" title="收起到左侧，任务继续进行" className={`p-1 rounded cursor-pointer ${isLight ? 'hover:bg-stone-100' : 'hover:bg-white/10'}`}>
          <Minus className="w-4 h-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="关闭" className={`p-1 rounded cursor-pointer ${isLight ? 'hover:bg-stone-100' : 'hover:bg-white/10'}`}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 select-text">
        {messages.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog('清空这个工程的智能体对话记录？已保存的户型和美学不受影响。', { confirmText: '清空' })) {
                  setMessages([]);
                  setUsedLayoutKeys({});
                  setSavedStyleKeys({});
                }
              }}
              className={`flex items-center gap-1 text-[10px] cursor-pointer hover:text-rose-600 disabled:opacity-40 ${muted}`}
            >
              <Trash2 className="w-3 h-3" /> 清空记录
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className={`text-[12px] leading-relaxed ${muted}`}>
            先说说谁住在这里，比如"上海的企业家家庭，200 平四房，看江景"，也可以上传户型图或空间照片。我会按业主身份找户型，选定后再推荐合适的美学，并新建适合的风格。
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex flex-col items-end' : ''}>
            {m.images && m.images.length > 0 && (
              <div className="flex gap-1 mb-1 flex-wrap justify-end">
                {m.images.map((src, i) => (
                  <img key={i} src={src} alt={`参考图 ${i + 1}`} className="w-16 h-16 rounded-lg object-cover" />
                ))}
              </div>
            )}
            <div
              className={`text-[12px] leading-relaxed whitespace-pre-wrap rounded-xl px-3 py-2 max-w-full ${
                m.isError
                  ? 'bg-rose-500/10 text-rose-600'
                  : m.role === 'user'
                  ? 'bg-amber-500 text-stone-950'
                  : isLight
                  ? 'bg-stone-100'
                  : 'bg-white/5'
              }`}
            >
              {m.text}
            </div>

            {m.ensembleLabel && (
              <div className={`mt-1 max-w-full flex items-center gap-1 text-[10px] ${muted}`}>
                <Layers className="w-3 h-3 shrink-0" />
                <span className="truncate">{m.ensembleLabel}</span>
              </div>
            )}

            {m.ownerSuggestion && getOwnerPersona(m.ownerSuggestion.id) && (
              <div className={`mt-2 p-2.5 rounded-xl border border-amber-500/50 ${card}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold min-w-0 truncate">建议业主：{getOwnerPersona(m.ownerSuggestion.id)!.name}</div>
                  <button
                    type="button"
                    disabled={selectedOwner?.id === m.ownerSuggestion.id}
                    onClick={() => onSelectOwner(m.ownerSuggestion!.id)}
                    className={primaryBtn}
                  >
                    {selectedOwner?.id === m.ownerSuggestion.id ? '已应用' : '应用此业主'}
                  </button>
                </div>
                {m.ownerSuggestion.reason && <div className={`mt-1 text-[11px] leading-relaxed ${muted}`}>{m.ownerSuggestion.reason}</div>}
              </div>
            )}

            {m.ensembleAdvice && getValidAdviceItems(products, m.ensembleAdvice).length > 0 && (() => {
              const advice = m.ensembleAdvice;
              const applied = isEnsembleAdviceApplied(products, advice);
              return (
                <div className={`mt-2 p-2.5 rounded-xl border border-amber-500/50 ${card}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold min-w-0 truncate flex items-center gap-1">
                      <Layers className="w-3 h-3 text-amber-500 shrink-0" /> 场景套组建议
                    </div>
                    <button type="button" disabled={applied} onClick={() => onApplyEnsembleAdvice(advice.items)} className={primaryBtn}>
                      {applied ? '已应用' : '应用到场景套组'}
                    </button>
                  </div>
                  {advice.summary && <div className={`mt-1 text-[11px] leading-relaxed ${muted}`}>{advice.summary}</div>}
                  <div className="mt-1.5 space-y-1">
                    {getValidAdviceItems(products, advice).map(({ product, include, reason }) => (
                      <div key={product.id} className="text-[11px] leading-relaxed">
                        <span className={`font-bold ${include ? 'text-emerald-600' : 'text-rose-600'}`}>{include ? '放入' : '不放入'}</span>
                        <span className="ml-1 font-bold">{product.name}</span>
                        {reason && <span className={`ml-1 ${muted}`}>{reason}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {m.layouts?.map((layout, i) => {
              const key = `${m.id}-${i}`;
              // 户型被删除后恢复“使用”按钮
              const usedCode = spaces.some((s) => s.code === usedLayoutKeys[key]) ? usedLayoutKeys[key] : undefined;
              return (
                <div key={key} className={`mt-2 p-2.5 rounded-xl border ${card}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold min-w-0 truncate">{layout.name}</div>
                    <button type="button" disabled={busy || Boolean(usedCode)} onClick={() => void useLayout(layout, key)} className={primaryBtn}>
                      {usedCode ? `已使用 ${usedCode}` : '使用此户型'}
                    </button>
                  </div>
                  <div className={`mt-1 text-[11px] leading-relaxed ${muted}`}>{layout.signatureFeatures.slice(0, 3).join(' · ')}</div>
                  <div className={`mt-1 text-[10px] font-mono ${muted}`}>层高 {layout.ceilingHeight}m · {layout.zones.length} 个功能区</div>
                  {layout.basis && <div className={`mt-1 text-[10px] ${muted}`}>依据：{layout.basis}</div>}
                </div>
              );
            })}

            {m.styleResult && (
              <div className="mt-2 space-y-2">
                {m.styleResult.recommendations.map((rec) => {
                  const style = styles.find((s) => s.code === rec.code);
                  if (!style) return null;
                  const applied = selectedStyle.id === style.id;
                  return (
                    <div key={rec.code} className={`p-2.5 rounded-xl border ${card}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-bold min-w-0 truncate">
                          <span className="font-mono text-[10px] mr-1">{style.code}</span>
                          {style.name.split(' (')[0]}
                          <span className="ml-1 text-[10px] text-emerald-600">{rec.score}%</span>
                        </div>
                        <button type="button" disabled={applied} onClick={() => onApplyStyle(style)} className={secondaryBtn}>
                          {applied ? '当前美学' : '应用'}
                        </button>
                      </div>
                      <div className={`mt-1 text-[11px] leading-relaxed ${muted}`}>{rec.reason}</div>
                    </div>
                  );
                })}

                {m.styleResult.newStyles.map((style, i) => {
                  const key = `${m.id}-new-${i}`;
                  const saved = savedStyleKeys[key] && styles.some((s) => s.id === savedStyleKeys[key].id) ? savedStyleKeys[key] : undefined;
                  const applied = saved && selectedStyle.id === saved.id;
                  return (
                    <div key={key} className={`p-2.5 rounded-xl border border-amber-500/50 ${card}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-bold min-w-0 truncate flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                          <span className="truncate">{style.name}</span>
                        </div>
                        <button
                          type="button"
                          disabled={Boolean(applied)}
                          onClick={() => {
                            if (saved) {
                              onApplyStyle(saved);
                            } else {
                              const created = onSaveNewStyle(style);
                              setSavedStyleKeys((prev) => ({ ...prev, [key]: created }));
                            }
                          }}
                          className={primaryBtn}
                        >
                          {applied ? '当前美学' : saved ? '应用' : '保存并应用'}
                        </button>
                      </div>
                      <div className="mt-1.5 flex gap-1">
                        {style.colorPalette.map((color) => (
                          <span key={color} title={color} className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                      <div className={`mt-1 text-[11px] leading-relaxed ${muted}`}>{style.reason}</div>
                      <div className={`mt-1 text-[10px] ${muted}`}>{style.materialSystem.join(' · ')}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {renderSources(m.sources)}
          </div>
        ))}

        {busy && (
          <div className={`flex items-center gap-2 text-[11px] ${muted}`}>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
            {busyText}
          </div>
        )}
      </div>

      <div className={`border-t p-2.5 ${isLight ? 'border-stone-100' : 'border-white/10'}`}>
        <div className={`mb-1.5 px-1 text-[10px] ${muted}`}>
          业主身份：{selectedOwner ? selectedOwner.name : '未设定，智能体会根据你的描述判断'}
        </div>
        {ensembleAttached && (
          <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-amber-500/10 text-[11px] text-amber-700">
            <Check className="w-3 h-3 shrink-0" />
            <span className="truncate flex-1">
              已带上场景套组 {products.filter(isInEnsemble).length} 款
              {products.filter(isInEnsemble).some((p) => isInitialDemoProduct(p)) ? '（示例产品只发文字资料）' : ''}
            </span>
            <button type="button" aria-label="不带场景套组" onClick={() => setEnsembleAttached(false)} className="cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex gap-1.5 mb-2">
            {attachments.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt={`待发送参考图 ${i + 1}`} className="w-12 h-12 rounded-lg object-cover" />
                <button
                  type="button"
                  aria-label={`移除参考图 ${i + 1}`}
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void addFiles(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
          <button
            type="button"
            title="带上当前场景产品套组（产品资料和产品图）"
            aria-label="带上当前场景产品套组"
            aria-pressed={ensembleAttached}
            disabled={products.length === 0}
            onClick={attachEnsemble}
            className={`p-2 rounded-lg border transition cursor-pointer disabled:opacity-40 ${
              ensembleAttached
                ? 'border-amber-400 bg-amber-500/15 text-amber-600'
                : isLight
                ? 'border-stone-200 hover:bg-stone-100 text-stone-600'
                : 'border-stone-700 hover:bg-stone-800 text-stone-300'
            }`}
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            type="button"
            title={`上传参考图（最多 ${MAX_IMAGES} 张，可粘贴或拖入）`}
            aria-label="上传参考图"
            disabled={attachments.length >= MAX_IMAGES}
            onClick={() => fileRef.current?.click()}
            className={`p-2 rounded-lg border transition cursor-pointer disabled:opacity-40 ${isLight ? 'border-stone-200 hover:bg-stone-100 text-stone-600' : 'border-stone-700 hover:bg-stone-800 text-stone-300'}`}
          >
            <ImagePlus className="w-4 h-4" />
          </button>
          <textarea
            value={input}
            rows={2}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length > 0) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={ensembleAttached ? '可补充需求，或直接发送' : '描述户型需求，Enter 发送'}
            className={`flex-1 min-w-0 resize-none rounded-lg border px-2.5 py-1.5 text-xs select-text focus:outline-none focus:ring-2 focus:ring-amber-400 ${
              isLight ? 'border-stone-200 bg-white' : 'border-stone-700 bg-stone-950/60'
            }`}
          />
          <button
            type="button"
            aria-label="发送"
            disabled={busy || (!input.trim() && attachments.length === 0 && !ensembleAttached)}
            onClick={() => void send()}
            className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 transition cursor-pointer"
          >
            {busy ? <Palette className="w-4 h-4 animate-pulse" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
