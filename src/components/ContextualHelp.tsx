import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface ContextualHelpProps {
  title: string;
  description: string;
  align?: 'left' | 'right';
}

export const ContextualHelp: React.FC<ContextualHelpProps> = ({
  title,
  description,
  align = 'left',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-5 h-5 rounded-full bg-[#E6F6FF] hover:bg-[#00AEEF] text-[#003366] hover:text-white border border-[#00AEEF]/40 flex items-center justify-center transition-colors cursor-pointer shrink-0"
        aria-label={`Ajuda sobre ${title}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="tooltip"
          className={`absolute top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3.5 z-50 text-left ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-xs font-semibold text-[#003366]">{title}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[#64748B] hover:text-[#003366] cursor-pointer"
              aria-label="Fechar dica"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-[#64748B] leading-relaxed font-normal">{description}</p>
        </div>
      )}
    </div>
  );
};
