export const TOUCH_BAND = 'band_amedic';
export const QINGZHI_BAND = 'band_qingzhi';
export const W_BAND = 'band_w';
export const CLOSURE_BAND = 'band_closure';
export const KIRARA_REBATE = 'band:kirara:sell_rebate';
export const ROLLING_BAND = 'band_rolling_logs';
export const MEDIC_TOKEN = 'char_605_cmedic';
export const TOUCH_TOKEN = 'char_613_acmedc';
export const W_PENDING = 'band:w:next_round';

/** The server-granted field medic is independent of any operator or deployment slot. */
export function isStrategyMedic(piece, bandId) {
  return bandId === TOUCH_BAND && piece.kind === 'token' && piece.meta?.strategyBand === TOUCH_BAND
    && [MEDIC_TOKEN, TOUCH_TOKEN].includes(piece.id) && piece.count === 1;
}
