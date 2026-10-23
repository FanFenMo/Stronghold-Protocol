import { useLayoutEffect, useRef } from '../../vendor/hooks.module.js';
import { GEO } from '../../../shared/constants.js';
import { data } from '../data.js';
import { chessPortraitUrl, itemIconUrl } from './assetUrls.js';
import { mergeTarget } from './gameLogic.js';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A reveal belongs to a delivered shop page; it never delays interaction. */
export function revealShopCards(root) {
  if (!root || reducedMotion()) return;
  root.querySelectorAll('.scard:not(.scard--sold)').forEach((card, index) => {
    const shutter = card.querySelector('.scard__shutter');
    for (const animation of shutter.getAnimations()) animation.cancel();
    shutter.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(102%)' }], {
      duration: 220, delay: index * 20, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards',
    });
    const body = card.querySelector('.scard__body');
    for (const animation of body.getAnimations()) animation.cancel();
    body.animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 160, delay: index * 20 + 60, easing: 'ease-out', fill: 'backwards',
    });
    const etch = card.querySelector('.scard__etch');
    if (etch) {
      for (const animation of etch.getAnimations()) animation.cancel();
      etch.animate([{ clipPath: 'inset(0 100% 0 0)', opacity: 0.6 }, { clipPath: 'inset(0)', opacity: 0.35 }, { clipPath: 'inset(0)', opacity: 0 }], {
        duration: 320, delay: index * 20, easing: 'ease-out', fill: 'backwards',
      });
    }
  });
}

const pieces = priv => [...(priv.board || []), ...(priv.hand || []), ...(priv.temp || [])].filter(Boolean);

/** Resolve the actual purchase result, including an elite returning to its deployed tile. */
export function shopPurchasePoint(view, before, after, slot) {
  if (!view) return null;
  const merge = slot.kind === 'chess' ? mergeTarget(before, slot.id, id => data.lookup('chess', id)) : null;
  if (merge) return view.tileScreen(merge.row, merge.col);
  const owned = new Set(pieces(before).map(piece => piece.uid));
  const record = data.lookup(slot.kind === 'item' ? 'items' : 'chess', slot.id);
  const result = pieces(after).find(piece => !owned.has(piece.uid) && (piece.id === slot.id || piece.id === record?.goldenId));
  if (!result) return null;
  const board = (after.board || []).find(piece => piece?.uid === result.uid);
  if (board) return view.tileScreen(board.row, board.col);
  const hand = (after.hand || []).findIndex(piece => piece?.uid === result.uid);
  if (hand >= 0) return view.tileScreen(GEO.HAND_ROW, hand);
  const temp = (after.temp || []).findIndex(piece => piece?.uid === result.uid);
  return temp >= 0 ? view.tileScreen(GEO.TEMP_ROW, GEO.TEMP_C0 + temp) : null;
}

function receipt(card, slot, destination, owned) {
  const rect = card.getBoundingClientRect();
  const root = document.createElement('div');
  root.className = 'shop-motion';
  root.setAttribute('aria-hidden', 'true');
  const stamp = document.createElement('span');
  stamp.className = 'shop-motion__stamp';
  stamp.textContent = slot.kind === 'item' ? '已签收' : '已招募';
  stamp.style.cssText = `left:${rect.left}px;top:${rect.top + rect.height * 0.38}px;width:${rect.width}px`;
  root.append(stamp);
  const moving = !reducedMotion() && destination;
  if (moving) {
    const record = data.lookup(slot.kind === 'item' ? 'items' : 'chess', slot.id);
    const image = document.createElement('img');
    image.className = 'shop-motion__portrait';
    image.src = slot.kind === 'item' ? itemIconUrl(data.get('assets'), record) : chessPortraitUrl(data.get('assets'), record);
    const x = rect.left + rect.width / 2, y = rect.top + rect.height * 0.4;
    const mx = (x + destination.x) / 2, my = Math.min(y, destination.y) - Math.min(100, Math.abs(destination.x - x) * 0.15 + 35);
    image.style.cssText = `left:0;top:0;width:${Math.min(64, rect.width * 0.55)}px;offset-path:path('M${x},${y} Q${mx},${my} ${destination.x},${destination.y}');offset-anchor:50% 50%;offset-rotate:0deg`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'shop-motion__route');
    svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', `M${x},${y} Q${mx},${my} ${destination.x},${destination.y}`);
    svg.append(path); root.append(svg, image);
    image.animate([
      { offsetDistance: '0%', transform: 'scale(.85)', opacity: 0.8, offset: 0 },
      { offsetDistance: '50%', transform: 'scale(.55)', opacity: 0.75, offset: 0.5 },
      { offsetDistance: '100%', transform: 'scale(.12)', opacity: 0, offset: 1 },
    ], { duration: 460, easing: 'ease-in', fill: 'both' });
    svg.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.2 }, { opacity: 0 }], { duration: 460, fill: 'both' });
  }
  document.body.append(root); owned.add(root);
  const animation = stamp.animate([
    { opacity: 0, transform: 'translateY(4px) scale(1.04)' },
    { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.2 },
    { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.65 },
    { opacity: 0, transform: 'translateY(-5px) scale(.96)' },
  ], { duration: moving ? 560 : 240, fill: 'both' });
  animation.onfinish = () => { root.remove(); owned.delete(root); };
}

/** Sold transitions are authoritative; refused requests and ordinary wallet updates produce no receipt. */
export function useShopMotion({ barRef, priv, collapsed, reward, purchasePoint }) {
  const previous = useRef(null), owned = useRef(new Set());
  useLayoutEffect(() => {
    const root = barRef.current;
    if (!root || collapsed || reward) { previous.current = null; return; }
    const slots = priv?.shop?.slots || [], last = previous.current;
    if (!last || slots.some((slot, i) => slot?.id !== last.slots[i]?.id || (last.slots[i]?.sold && !slot?.sold))) revealShopCards(root);
    if (last) slots.forEach((slot, index) => {
      const old = last.slots[index];
      if (!slot?.sold || !old || old.sold || slot.id !== old.id) return;
      const card = root.querySelector(`[data-shop-slot="${index}"]`);
      if (card) receipt(card, old, purchasePoint?.(last.priv, priv, old), owned.current);
    });
    previous.current = { priv, slots: slots.map(slot => slot && { ...slot }) };
  }, [priv, collapsed, reward]);
  useLayoutEffect(() => () => { for (const root of owned.current) root.remove(); owned.current.clear(); }, []);
}
