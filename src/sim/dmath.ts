// Deterministic maths for the race engine.
//
// Browsers don't agree to the last bit on Math.sin, Math.exp, Math.atan2 and friends: Chrome's
// engine and Safari's (every iPhone and iPad browser) round some results differently. For one
// player that never matters. For a live race, where every device sails the same race from the
// same inputs, it does: a difference in the last bit grows step by step until two devices see
// different races. So the engine uses these instead. They are built only from + − × ÷ and square
// root, which every browser must round exactly the same way (IEEE 754), using the classic fdlibm
// approximations, so they are as accurate as the built-ins (within a unit or two in the last place)
// and give the same bits everywhere.

const PIO2_1 = 1.57079632673412561417e+00;  // the first 33 bits of π/2
const PIO2_1T = 6.07710050650619224932e-11; // π/2 − PIO2_1
const INV_PIO2 = 6.36619772367581382433e-01; // 2/π

// sin and cos on [−π/4, π/4] (fdlibm __kernel_sin and __kernel_cos).
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

function ksin(x: number): number {
  const z = x * x, v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + v * (S1 + z * r);
}
function kcos(x: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z, w = 1 - hz;
  return w + ((1 - w - hz) + z * r);
}

/** sin(x), the same bits on every browser. */
export function dsin(x: number): number {
  if (!(x > -1e9 && x < 1e9)) return x !== x || !isFinite(x) ? NaN : Math.sin(x);
  const n = Math.round(x * INV_PIO2);
  const r = (x - n * PIO2_1) - n * PIO2_1T;
  switch (n & 3) {
    case 0: return ksin(r);
    case 1: return kcos(r);
    case 2: return -ksin(r);
    default: return -kcos(r);
  }
}

/** cos(x), the same bits on every browser. */
export function dcos(x: number): number {
  if (!(x > -1e9 && x < 1e9)) return x !== x || !isFinite(x) ? NaN : Math.cos(x);
  const n = Math.round(x * INV_PIO2);
  const r = (x - n * PIO2_1) - n * PIO2_1T;
  switch (n & 3) {
    case 0: return kcos(r);
    case 1: return -ksin(r);
    case 2: return -kcos(r);
    default: return ksin(r);
  }
}

/** tan(x), the same bits on every browser. */
export function dtan(x: number): number { return dsin(x) / dcos(x); }

// atan (fdlibm s_atan.c).
const ATAN_HI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02,
];

/** atan(x), the same bits on every browser. */
export function datan(x: number): number {
  if (x !== x) return NaN;
  const neg = x < 0;
  let a = neg ? -x : x;
  let id = -1;
  if (a >= 0.4375) {
    if (a < 1.1875) {
      if (a < 0.6875) { id = 0; a = (2 * a - 1) / (2 + a); } else { id = 1; a = (a - 1) / (a + 1); }
    } else if (a < 2.4375) { id = 2; a = (a - 1.5) / (1 + 1.5 * a); } else { id = 3; a = -1 / a; }
  }
  const z = a * a, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  const r = id < 0 ? a - a * (s1 + s2) : ATAN_HI[id] - ((a * (s1 + s2) - ATAN_LO[id]) - a);
  return neg ? -r : r;
}

const PI_HI = 3.14159265358979311600e+00, PI_LO = 1.22464679914735317720e-16;

/** atan2(y, x), the same bits on every browser. */
export function datan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (x === 0) return y > 0 ? PI_HI / 2 : y < 0 ? -PI_HI / 2 : 0;
  if (!isFinite(x) || !isFinite(y)) return Math.atan2(y, x);
  // Keep the ratio at most 1 for accuracy: atan(y/x) or ±π/2 − atan(x/y).
  const ay = y < 0 ? -y : y, ax = x < 0 ? -x : x;
  let a: number;
  if (ay <= ax) a = datan(y / x);
  else a = (y > 0 === x > 0 ? PI_HI / 2 : -PI_HI / 2) - datan(x / y);
  if (x > 0) return a;
  return y >= 0 ? (a + PI_LO) + PI_HI : (a - PI_LO) - PI_HI;
}

// exp (fdlibm e_exp.c).
const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;

/** 2^k exactly, for whole k in the double range (built by doubling and halving, which is exact). */
const POW2: number[] = [];
const POW2_MIN = -1074, POW2_MAX = 1023;
function pow2(k: number): number {
  if (k < POW2_MIN) return 0;
  if (k > POW2_MAX) return Infinity;
  if (!POW2.length) {
    let v = 1;
    const up: number[] = [1];
    for (let i = 1; i <= POW2_MAX; i++) { v *= 2; up.push(v); }
    v = 1;
    const down: number[] = [];
    for (let i = 1; i <= -POW2_MIN; i++) { v /= 2; down.push(v); }
    for (let i = down.length - 1; i >= 0; i--) POW2.push(down[i]);
    for (const u of up) POW2.push(u);
  }
  return POW2[k - POW2_MIN];
}

/** e^x, the same bits on every browser. */
export function dexp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745.14) return 0;
  const k = Math.round(x * INV_LN2);
  const hi = x - k * LN2_HI, lo = k * LN2_LO, r = hi - lo;
  const z = r * r;
  const c = r - z * (P1 + z * (P2 + z * (P3 + z * (P4 + z * P5))));
  const y = 1 - ((lo - (r * c) / (2 - c)) - hi);
  // Scale in two steps so a result near the ends of the range doesn't overflow on the way.
  if (k > 1000) return y * pow2(k - 100) * pow2(100);
  if (k < -1000) return y * pow2(k + 100) * pow2(-100);
  return y * pow2(k);
}

// log (fdlibm e_log.c).
const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01, LG3 = 2.857142874366239149e-01,
  LG4 = 2.222219843214978396e-01, LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01,
  LG7 = 1.479819860511658591e-01;
const SQRT2 = 1.41421356237309514547e+00;
const DV = new DataView(new ArrayBuffer(8));

/** ln(x), the same bits on every browser. */
export function dlog(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = 0;
  if (x < 2.2250738585072014e-308) { x *= pow2(54); e = -54; } // subnormal: scale up first
  DV.setFloat64(0, x);
  e += ((DV.getUint32(0) >>> 20) & 0x7ff) - 1023;
  let m = x * pow2(-e); // in [1, 2), exactly
  if (m > SQRT2) { m *= 0.5; e += 1; }
  const f = m - 1, s = f / (2 + f), z = s * s, w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6)), t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1, hfsq = 0.5 * f * f;
  return e * LN2_HI - ((hfsq - (s * (hfsq + R) + e * LN2_LO)) - f);
}

/** a^b, the same bits on every browser (whole powers by multiplying, others by exp and log). */
export function dpow(a: number, b: number): number {
  if (b === 0) return 1;
  if (b === Math.round(b) && b >= -16 && b <= 16) {
    let r = 1;
    const n = b < 0 ? -b : b;
    for (let i = 0; i < n; i++) r *= a;
    return b < 0 ? 1 / r : r;
  }
  if (a > 0) return dexp(b * dlog(a));
  if (a === 0) return b > 0 ? 0 : Infinity;
  return NaN; // a negative number to a fractional power
}

/** √(x² + y²), the same bits on every browser (Math.hypot isn't the same everywhere; √ is). */
export function dhypot(x: number, y: number): number { return Math.sqrt(x * x + y * y); }
