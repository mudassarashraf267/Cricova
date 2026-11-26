import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { EmptyArt } from './art';

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className={`card max-h-[92vh] w-full overflow-y-auto p-4 ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} rounded-b-none sm:rounded-b-2xl`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">{title}</h2>
              <button className="btn btn-ghost !px-2 !py-1" onClick={onClose} aria-label="Close">✕</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}

export function Stat({ label, value, sub, gold }: { label: string; value: ReactNode; sub?: string; gold?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold ${gold ? 'text-gold' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h1 className="text-gradient text-3xl font-black tracking-tight">{children}</h1>{right}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <EmptyArt>{children}</EmptyArt>;
}

export function Confirm({ open, onClose, onYes, text, yes = 'Confirm' }: { open: boolean; onClose: () => void; onYes: () => void; text: string; yes?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Please confirm">
      <p className="mb-4 text-sm">{text}</p>
      <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-danger" onClick={() => { onYes(); onClose(); }}>{yes}</button></div>
    </Modal>
  );
}

export function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  useEffect(() => { if (msg) { const t = setTimeout(onDone, 4000); return () => clearTimeout(t); } }, [msg, onDone]);
  return (
    <AnimatePresence>
      {msg && <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} role="alert" className="fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-md rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-xl md:bottom-6">{msg}</motion.div>}
    </AnimatePresence>
  );
}

export function useLocal<T>(init: T) { return useState<T>(init); }
export const initials = (n: string) => n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
export function Avatar({ name, photo, color = '#10b981', size = 36 }: { name: string; photo?: string; color?: string; size?: number }) {
  return photo
    ? <img src={photo} alt={name} width={size} height={size} loading="lazy" className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <div className="flex items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, background: color, fontSize: size / 2.6 }}>{initials(name)}</div>;
}

/** Downscale an uploaded image to a small data URL so storage stays light. */
export function readImage(file: File, max = 160): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('Could not read image'));
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => rej(new Error('Not an image'));
      img.src = r.result as string;
    };
    r.readAsDataURL(file);
  });
}
