// src/components/common/UserBadge.tsx
// 用户身份徽章组件：展示用户名称、头像、工号角色与在线状态，支持快速交互
import React, { useState } from 'react';
import { User, ShieldCheck, Check, Edit2, ChevronDown } from 'lucide-react';
import { useCurrentUser } from '../../utils/userUtils';

interface UserBadgeProps {
  theme?: 'dark' | 'light';
  variant?: 'compact' | 'detailed';
  className?: string;
}

export const UserBadge: React.FC<UserBadgeProps> = ({
  theme = 'dark',
  variant = 'compact',
  className = ''
}) => {
  const { name, email, role, initials, updateUserName } = useCurrentUser();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(name);

  const isLight = theme === 'light';

  const handleSaveName = () => {
    if (tempName.trim()) {
      updateUserName(tempName.trim());
      setIsEditing(false);
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border transition-all cursor-pointer select-none ${
          isLight
            ? 'bg-white hover:bg-stone-50 border-stone-200 text-stone-800 shadow-xs'
            : 'bg-stone-900/90 hover:bg-stone-800 border-stone-800 text-stone-200 shadow-xs'
        }`}
        title={`当前操作用户: ${name} (${role})`}
      >
        <div className="relative">
          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 flex items-center justify-center text-[10px] font-bold text-white shadow-xs">
            {initials}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-stone-900" />
        </div>

        <div className="flex flex-col text-left leading-tight">
          <span className="text-xs font-bold tracking-tight">{name}</span>
          {variant === 'detailed' && (
            <span className={`text-[9px] font-mono ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>
              {role}
            </span>
          )}
        </div>

        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''} ${isLight ? 'text-stone-400' : 'text-stone-500'}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setIsOpen(false)} />
          <div
            className={`absolute right-0 top-full mt-1.5 w-64 rounded-2xl border shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150 ${
              isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-stone-900 border-stone-800 text-stone-100'
            }`}
          >
            <div className="flex items-center gap-3 pb-3 border-b border-stone-200 dark:border-stone-800">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-sm font-bold text-white shadow-md">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      className="w-full text-xs px-2 py-1 rounded border border-amber-500 bg-transparent focus:outline-hidden"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveName}
                      className="p-1 rounded bg-amber-600 text-white hover:bg-amber-500"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs truncate">{name}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setTempName(name);
                        setIsEditing(true);
                      }}
                      className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-200"
                      title="修改用户名"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className="text-[10px] text-stone-400 truncate">{email}</div>
              </div>
            </div>

            <div className="pt-2.5 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between text-stone-500">
                <span>当前岗位权限</span>
                <span className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> {role}
                </span>
              </div>
              <div className="flex items-center justify-between text-stone-500">
                <span>在线运行状态</span>
                <span className="text-emerald-500 font-mono font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> 在线 (Session Active)
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
