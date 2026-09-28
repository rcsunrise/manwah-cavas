// src/components/poster-studio/DevDebugDrawer.tsx
import React, { useState } from 'react';
import { Terminal, ChevronUp, ChevronDown, Check, Copy } from 'lucide-react';
import { PosterCompositionSnapshot } from '../../types/posterTemplate';

interface DevDebugDrawerProps {
  currentComposition: PosterCompositionSnapshot;
}

export const DevDebugDrawer: React.FC<DevDebugDrawerProps> = ({ currentComposition }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(currentComposition, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed bottom-16 right-4 z-40 select-none">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-950/80 hover:bg-stone-900 text-stone-400 hover:text-stone-200 text-[10px] font-mono rounded-full border border-stone-800 backdrop-blur-sm transition shadow-lg"
          title="开发者诊断信息"
        >
          <Terminal className="w-3 h-3 text-amber-500" />
          <span>DEV DIAGNOSTICS</span>
        </button>
      ) : (
        <div className="w-96 bg-stone-950/95 border border-stone-800 rounded-xl p-3 shadow-2xl backdrop-blur-md text-stone-300 font-mono text-[10px] space-y-2 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold">
              <Terminal className="w-3.5 h-3.5" />
              <span>Snapshot Manifest (2100×2800)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-1.5 py-0.5 bg-stone-800 hover:bg-stone-700 rounded text-stone-300"
              >
                {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:text-white rounded"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 text-[9px] text-stone-400">
            <div>Screen: <span className="text-white">0{currentComposition.screenIndex}</span></div>
            <div>Template: <span className="text-amber-400">{currentComposition.templateId}</span></div>
            <div>Output Spec: <span className="text-white">2100×2800 JPEG</span></div>
            <div>Aspect Ratio: <span className="text-white">3:4</span></div>
          </div>

          <pre className="max-h-48 overflow-y-auto p-2 bg-stone-900/90 rounded text-[9px] text-emerald-400/90 border border-stone-800/80 scrollbar-none">
            {JSON.stringify(currentComposition, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
