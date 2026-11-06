/* Детерминированные sin / cos / atan2 для физики «Шаткой башни».
   Встроенные Math.sin/cos/atan2 в разных браузерах (V8 на Android, JavaScriptCore на iPhone) могут отличаться
   в последнем бите — а падающая башня хаотична, и через пару секунд расхождение видно глазом.
   Здесь только + − × ÷ и Math.round (они по стандарту IEEE 754 одинаковы везде), поэтому результат бит-в-бит совпадает
   на всех устройствах. planck.js запоминает Math.sin/cos/atan2 при загрузке: index.html на время загрузки планка
   подменяет их этими (DMath.swap), а сразу после — возвращает родные (DMath.restore). */
(function () {
  "use strict";
  const HALF_PI = 1.5707963267948966, PI = 3.141592653589793;
  const P1 = 1.5707963267341256, P2 = 6.077100506506192e-11;   // π/2 = P1 + P2 (Коди — Уэйт)
  const S3 = 0.16666666666666666, S5 = 0.008333333333333333, S7 = 0.0001984126984126984, S9 = 0.0000027557319223985893,
    S11 = 2.505210838544172e-8, S13 = 1.6059043836821613e-10, S15 = 7.647163731819816e-13, S17 = 2.8114572543455206e-15;
  const C2 = 0.5, C4 = 0.041666666666666664, C6 = 0.001388888888888889, C8 = 0.0000248015873015873, C10 = 2.755731922398589e-7,
    C12 = 2.08767569878681e-9, C14 = 1.1470745597729725e-11, C16 = 4.779477332387385e-14;
  function ps(x) { const z = x * x; return x * (1 - z * (S3 - z * (S5 - z * (S7 - z * (S9 - z * (S11 - z * (S13 - z * (S15 - z * S17)))))))); }
  function pc(x) { const z = x * x; return 1 - z * (C2 - z * (C4 - z * (C6 - z * (C8 - z * (C10 - z * (C12 - z * (C14 - z * C16))))))); }
  function red(x) { const q = Math.round(x / HALF_PI); return [(x - q * P1) - q * P2, ((q % 4) + 4) % 4]; }
  function sin(x) {
    if (!(x - x === 0)) return NaN;
    const r = red(x), v = r[0];
    switch (r[1]) { case 0: return ps(v); case 1: return pc(v); case 2: return -ps(v); default: return -pc(v); }
  }
  function cos(x) {
    if (!(x - x === 0)) return NaN;
    const r = red(x), v = r[0];
    switch (r[1]) { case 0: return pc(v); case 1: return -ps(v); case 2: return -pc(v); default: return ps(v); }
  }
  const T = [];
  for (let k = 0; k < 15; k++) T.push(1 / (2 * k + 1));
  function atan(x) {
    if (x !== x) return NaN;
    let neg = false, inv = false, off = 0;
    if (x < 0) { neg = true; x = -x; }
    if (x > 1) { x = 1 / x; inv = true; }
    if (x > 0.2679491924311227) { x = (x * 1.7320508075688772 - 1) / (x + 1.7320508075688772); off = 0.5235987755982988; }
    const z = x * x;
    let s = T[14];
    for (let k = 13; k >= 0; k--) s = T[k] - z * s;
    let r = off + x * s;
    if (inv) r = HALF_PI - r;
    return neg ? -r : r;
  }
  function atan2(y, x) {
    if (x !== x || y !== y) return NaN;
    if (x > 0) return atan(y / x);
    if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
    return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
  }
  const native = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2 };
  window.DMath = {
    sin, cos, atan2,
    swap() { Math.sin = sin; Math.cos = cos; Math.atan2 = atan2; },
    restore() { Math.sin = native.sin; Math.cos = native.cos; Math.atan2 = native.atan2; }
  };
})();
