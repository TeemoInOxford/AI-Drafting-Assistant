'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface InfoIconPortalProps {
  tooltip: string;
  detail?: string;
  className?: string;
}

/**
 * InfoIcon with Portal-based tooltip/popover
 * Renders tooltip/popover to document.body to avoid overflow clipping
 */
export default function InfoIconPortal({
  tooltip,
  detail,
  className = '',
}: InfoIconPortalProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Only render portal on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position for tooltip/popover
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX + rect.width / 2,
    });
  }, []);

  // Update position on show
  useEffect(() => {
    if (showTooltip || showPopover) {
      updatePosition();
    }
  }, [showTooltip, showPopover, updatePosition]);

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPopover]);

  // Close popover on scroll
  useEffect(() => {
    if (!showPopover) return;
    const handleScroll = () => {
      updatePosition();
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [showPopover, updatePosition]);

  const tooltipContent = (
    <AnimatePresence>
      {showTooltip && !showPopover && mounted && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="fixed z-[9999] px-2 py-1 bg-slate-800 border border-slate-600 rounded text-[10px] text-slate-300 whitespace-nowrap shadow-lg pointer-events-none"
          style={{
            top: position.top - 8,
            left: position.left,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-600"
            style={{ marginTop: -1 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  const popoverContent = (
    <AnimatePresence>
      {showPopover && detail && mounted && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.15 }}
          className="fixed z-[9999] w-56 p-3 bg-slate-800 border border-slate-600 rounded-lg text-[11px] text-slate-300 shadow-xl"
          style={{
            top: position.top + 24,
            left: position.left,
            transform: 'translateX(-50%)',
          }}
        >
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-slate-600"
            style={{ marginBottom: -1 }}
          />
          <div className="whitespace-pre-wrap">{detail}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={buttonRef}
        className={`w-3.5 h-3.5 rounded-full border border-slate-500/50 text-slate-500 hover:border-slate-400 hover:text-slate-400 text-[9px] flex items-center justify-center transition-colors ml-1 ${className}`}
        onMouseEnter={() => {
          setShowTooltip(true);
          updatePosition();
        }}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (detail) {
            setShowPopover(!showPopover);
            setShowTooltip(false);
          }
        }}
      >
        i
      </button>

      {/* Portal tooltips to body */}
      {mounted && createPortal(tooltipContent, document.body)}
      {mounted && createPortal(popoverContent, document.body)}
    </>
  );
}
