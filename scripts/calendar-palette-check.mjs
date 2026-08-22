const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) }
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const relLum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => { const [x, y] = [relLum(hex(a)), relLum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
function lab(h) {
  let [r, g, b] = hex(h).map(lin)
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(X), f(Y), f(Z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
const dE = (a, b) => { const [A, B] = [lab(a), lab(b)]; return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) }

const CUR_L = { event: '#1450a3', drop: '#14663a', lead: '#1450a3', invoice_due: '#7a4e00', follow_up: '#14522f', task: '#5e6672', compliance: '#c4362a' }
const CUR_D = { event: '#5ca8e8', drop: '#6fd79a', lead: '#5ca8e8', invoice_due: '#f0b93d', follow_up: '#7fe3a3', task: '#a6a9a3', compliance: '#f0705c' }

// Candidate: keep sapphire/amber/graphite/red anchored; spread lead->violet,
// drop->forest, follow_up->teal across the wheel.
const NEW_L = {
  event: '#1450a3',
  lead: '#7b3fb0',
  drop: '#146b3d',
  invoice_due: '#8a5000',
  follow_up: '#00767c',
  task: '#5e6672',
  compliance: '#c4362a',
}
const NEW_D = {
  event: '#5ca8e8',
  lead: '#c093ee',
  drop: '#4fc07e',
  invoice_due: '#f0b93d',
  follow_up: '#4fd0d8',
  task: '#a6a9a3',
  compliance: '#f0705c',
}

function report(name, p, bgs) {
  const ks = Object.keys(p)
  const rows = []
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) rows.push([ks[i], ks[j], dE(p[ks[i]], p[ks[j]])])
  rows.sort((a, b) => a[2] - b[2])
  console.log(`\n### ${name}`)
  for (const bg of bgs) {
    const bad = ks.filter((k) => ratio(p[k], bg) < 3)
    console.log(`  vs ${bg}: min=${Math.min(...ks.map((k) => ratio(p[k], bg))).toFixed(2)} ${bad.length ? 'FAIL<3:1 -> ' + bad.map((k) => `${k}:${ratio(p[k], bg).toFixed(2)}`).join(', ') : 'all >=3:1 OK'}`)
  }
  console.log('  worst dE:', rows.slice(0, 5).map((r) => `${r[0]}/${r[1]}=${r[2].toFixed(1)}`).join('  '))
  console.log('  min dE  :', rows[0][2].toFixed(1))
}
report('CURRENT light', CUR_L, ['#ffffff', '#f7f8fa'])
report('CURRENT dark', CUR_D, ['#1d1d1c', '#131313'])
report('CANDIDATE light', NEW_L, ['#ffffff', '#f7f8fa'])
report('CANDIDATE dark', NEW_D, ['#1d1d1c', '#131313'])
