import React from 'react';
import { AlertTriangle, UserRound } from 'lucide-react';
import { SpacePreset } from '../../../types/spaceStudio';
import { OWNER_PERSONAS, getOwnerPersona } from '../data/ownerPersonas';
import { resolveOwnerFit } from '../engine/ownerContext';

interface Props {
  space: SpacePreset;
  ownerId: string | null;
  viewId: string | null;
  isLight: boolean;
  onChangeOwner: (ownerId: string | null) => void;
  onChangeView: (viewId: string | null) => void;
}

export const SpaceOwnerPanel: React.FC<Props> = ({ space, ownerId, viewId, isLight, onChangeOwner, onChangeView }) => {
  const persona = getOwnerPersona(ownerId);
  const fit = persona ? resolveOwnerFit(persona, space, viewId) : null;
  const muted = isLight ? 'text-stone-500' : 'text-stone-400';
  const field = `w-full rounded-lg border px-2 py-1.5 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 ${
    isLight ? 'border-stone-200 bg-white text-stone-800' : 'border-stone-700 bg-stone-900 text-stone-200'
  }`;

  return (
    <div className={`p-3 rounded-xl border space-y-2 ${isLight ? 'bg-[#FAF8F5] border-stone-200' : 'bg-stone-950/60 border-stone-800'}`}>
      <div className={`flex items-center gap-1.5 text-xs font-bold ${isLight ? 'text-stone-800' : 'text-stone-200'}`}>
        <UserRound className="w-3.5 h-3.5 text-amber-500" />
        业主身份
      </div>

      <select aria-label="业主身份" value={ownerId || ''} onChange={(e) => onChangeOwner(e.target.value || null)} className={field}>
        <option value="">不设定（按户型默认窗景）</option>
        {OWNER_PERSONAS.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {persona && fit && (
        <>
          <div className={`text-[11px] leading-relaxed ${muted}`}>{persona.summary}。常见于{persona.location}。</div>
          <label className={`block text-[11px] font-medium ${muted}`}>
            窗外景
            <select aria-label="窗外景" value={fit.view.id} onChange={(e) => onChangeView(e.target.value)} className={`${field} mt-1`}>
              {fit.feasibleViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.label}{persona.views.includes(view.id) ? ' · 推荐' : ''}
                </option>
              ))}
            </select>
          </label>
          {fit.warning && (
            <div className="flex items-start gap-1 text-[11px] leading-relaxed text-amber-700">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{fit.warning}</span>
            </div>
          )}
          <div className={`text-[10px] ${muted}`}>更换业主或窗景后，需要重新生成 A00 母版才会体现。</div>
        </>
      )}
    </div>
  );
};
