import React from 'react';
import { NodeResizer } from '@xyflow/react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export interface ResizableCanvasNodeProps {
  id: string;
  selected?: boolean;
  collapsed?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  onToggleCollapse?: () => void;
  children: React.ReactNode;
  headerContent?: React.ReactNode;
  className?: string;
}

export const ResizableCanvasNode: React.FC<ResizableCanvasNodeProps> = ({
  selected,
  collapsed,
  minWidth = 280,
  minHeight = 160,
  maxWidth = 840,
  maxHeight = 1200,
  onToggleCollapse,
  children,
  headerContent,
  className = ''
}) => {
  return (
    <div className={`relative transition-all duration-200 ${className}`}>
      {/* NodeResizer shows when node is selected and NOT collapsed */}
      {!collapsed && selected && (
        <NodeResizer
          color="#B28C5A"
          isVisible={selected}
          minWidth={minWidth}
          minHeight={minHeight}
          maxWidth={maxWidth}
          maxHeight={maxHeight}
          handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
        />
      )}

      {/* Optional Top Right Collapse Button if headerContent doesn't provide it */}
      {onToggleCollapse && !headerContent && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="absolute top-2 right-2 z-10 p-1 text-stone-400 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors"
          title={collapsed ? '展开节点' : '收起节点'}
        >
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      )}

      {collapsed ? (
        <div className="h-[56px] overflow-hidden flex items-center justify-between px-3 bg-white rounded-2xl border border-[#E5E0D8] shadow-xs">
          {headerContent || <span className="font-bold text-xs text-[#2C2622]">节点已收起</span>}
          {onToggleCollapse && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
              className="p-1 text-stone-400 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors ml-2"
              title="展开节点"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
};
