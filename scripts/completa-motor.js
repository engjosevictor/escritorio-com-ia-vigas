/* Motor de cálculo — Viga completa, seção retangular, concreto armado (NBR 6118:2026)
 *
 * Flexão simples/dupla, flexo-compressão, flexo-tração, cortante (Modelos I e II) e torção,
 * validada por centenas de casos cruzados contra a norma e ferramentas de referência do mercado
 * (ver base-calculo/07-completa/casos-validacao.md e testes/, não versionados no servidor).
 *
 * Sem DOM: roda no navegador (window.MotorVigasCompleta) e no Node (require).
 * Unidades de entrada: cm, MPa, kN e kN·m. Internamente: kN e cm.
 * Convenções: Mk > 0 traciona a fibra inferior; Mk < 0 traciona a superior (As passa a ser a superior).
 *             Nk > 0 é compressão, Nk < 0 é tração, aplicado a meia altura da seção.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotorVigasCompleta = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GC = 1.4, GS = 1.15, ES = 21000;   // kN/cm² (Es = 210 GPa)
  const G_DESF = 1.4, G_FAV = 1.0;

  const MSG_T_DOM5 = 'Programa não dimensiona Seção T em domínio 5!';
  const MSG_BIELA = 'Esmagamento da biela de compressão. Aumente as dimensões da seção transversal.';

  function propriedades(fck, fyk, xdLimEntrada, etaEntrada, fctm2014) {
    const fcd = fck / 10 / GC;
    const lambda = fck <= 50 ? 0.8 : 0.8 - (fck - 50) / 400;
    const alphaC = fck <= 50 ? 0.85 : 0.85 * (1 - (fck - 50) / 200);
    const etaAuto = fck <= 40 ? 1 : Math.pow(40 / fck, 1 / 3);
    const etaC = etaEntrada > 0 ? etaEntrada : etaAuto;
    const epsC2 = fck <= 50 ? 0.002 : 0.002 + 0.000085 * Math.pow(fck - 50, 0.53);
    const epsCu = fck <= 50 ? 0.0035 : 0.0026 + 0.035 * Math.pow((90 - fck) / 100, 4);
    // NBR 6118:2026 (fck > 50): 2,12·ln[1 + 0,1·(fck + 8)]. Versões anteriores da norma usavam 2,12·ln(1 + 0,11·fck).
    const fctm = fck <= 50 ? 0.3 * Math.pow(fck, 2 / 3)
      : (fctm2014 ? 2.12 * Math.log(1 + 0.11 * fck) : 2.12 * Math.log(1 + 0.1 * (fck + 8)));   // MPa
    const fyd = fyk / 10 / GS;
    const epsYd = fyd / ES;
    return {
      fck, fyk, fcd, lambda, alphaC, etaC, etaAuto, epsC2, epsCu, fctm,
      fctkInf: 0.7 * fctm, fctkSup: 1.3 * fctm,
      fctd: 0.7 * fctm / GC / 10,                 // kN/cm²
      scd: alphaC * etaC * fcd,                   // tensão de pico do bloco retangular
      fyd, fywd: Math.min(fyd, 43.5), epsYd,
      xdLim: xdLimEntrada > 0 ? xdLimEntrada : (fck <= 50 ? 0.45 : 0.35),
      x23: epsCu / (epsCu + 0.01),
      x34: epsCu / (epsCu + epsYd),
      alphaV2: 1 - fck / 250,
    };
  }

  function dominioPorXi(xi, p) {
    if (xi < p.x23) return 2;
    if (xi <= p.x34) return 3;
    return 4;
  }

  // Flexão simples ou dupla para Md > 0 (kN·cm), tração em As.
  function flexao(Md, p, g) {
    const { bw, d, dl } = g;
    const mu = Md / (bw * d * d * p.scd);
    const radicando = 1 - 2 * mu;
    const xiSimples = radicando >= 0 ? (1 - Math.sqrt(radicando)) / p.lambda : Infinity;
    if (xiSimples <= p.xdLim) {
      return {
        tipo: 'simples', mu, xi: xiSimples, x: xiSimples * d, dominio: dominioPorXi(xiSimples, p),
        As: p.lambda * xiSimples * bw * d * p.scd / p.fyd, Asl: 0, sigmaSl: 0,
      };
    }
    const xi = p.xdLim, lx = p.lambda * xi;
    const M1 = lx * (1 - lx / 2) * bw * d * d * p.scd;
    const epsSl = p.epsCu * (xi * d - dl) / (xi * d);
    const sigmaSl = Math.max(0, Math.min(ES * epsSl, p.fyd));
    if (sigmaSl <= 0) return { erro: 'Armadura de compressão inviável: a linha neutra limite fica acima de d\'.' };
    const Asl = (Md - M1) / ((d - dl) * sigmaSl);
    const As = lx * bw * d * p.scd / p.fyd + Asl * sigmaSl / p.fyd;
    return { tipo: 'dupla', mu, xi, x: xi * d, dominio: dominioPorXi(xi, p), As, Asl, sigmaSl, epsSl };
  }

  // Flexão simples ou dupla em seção T (momento positivo: mesa comprimida). Md em kN·cm.
  function flexaoT(Md, p, g) {
    const { bw, bf, hf, d, dl } = g;
    const muF = Md / (bf * d * d * p.scd);
    const radF = 1 - 2 * muF;
    const Cf = (bf - bw) * hf * (d - hf / 2);
    let precisaDupla = false;
    if (radF >= 0) {
      const xiF = (1 - Math.sqrt(radF)) / p.lambda, yF = p.lambda * xiF * d;
      if (yF <= hf) {
        if (xiF <= p.xdLim) {
          return { tipo: 'simples-mesa', mu: muF, xi: xiF, x: xiF * d, dominio: dominioPorXi(xiF, p), As: p.scd * bf * yF / p.fyd, Asl: 0, sigmaSl: 0 };
        }
        precisaDupla = true;
      }
    } else precisaDupla = true;
    if (!precisaDupla) {
      const rad2 = d * d - 2 * (Md / p.scd - Cf) / bw;
      if (rad2 >= 0) {
        const y = d - Math.sqrt(rad2), xi = y / (p.lambda * d);
        if (xi <= p.xdLim) {
          return { tipo: 'simples-alma', mu: muF, xi, x: xi * d, dominio: dominioPorXi(xi, p), As: p.scd * ((bf - bw) * hf + bw * y) / p.fyd, Asl: 0, sigmaSl: 0 };
        }
      }
    }
    const xi = p.xdLim, y = p.lambda * xi * d;
    const naMesa = y <= hf;
    const M1 = naMesa ? p.scd * bf * y * (d - y / 2) : p.scd * (Cf + bw * y * (d - y / 2));
    const epsSl = p.epsCu * (xi * d - dl) / (xi * d);
    const sigmaSl = Math.max(0, Math.min(ES * epsSl, p.fyd));
    if (sigmaSl <= 0) return { erro: 'Armadura de compressão inviável: a linha neutra limite fica acima de d\'.' };
    const Asl = (Md - M1) / ((d - dl) * sigmaSl);
    const areaC = naMesa ? bf * y : (bf - bw) * hf + bw * y;
    const As = p.scd * areaC / p.fyd + Asl * sigmaSl / p.fyd;
    return { tipo: 'dupla', mu: muF, xi, x: xi * d, dominio: dominioPorXi(xi, p), As, Asl, sigmaSl, epsSl };
  }

  // Momento positivo em seção T usa a mesa comprimida; momento negativo comprime só a alma (retangular bw).
  function flexaoSecao(Md, p, g, positivo) {
    return g.bf > 0 && positivo ? flexaoT(Md, p, g) : flexao(Md, p, g);
  }

  // Área, centro de gravidade e módulos de resistência da seção (retangular ou T)
  function geometria(g) {
    const { bw, h, bf, hf } = g;
    if (!(bf > 0)) {
      const A = bw * h;
      return { A, yInf: h / 2, Ix: bw * h * h * h / 12, Winf: bw * h * h / 6, Wsup: bw * h * h / 6 };
    }
    const A = bw * h + (bf - bw) * hf;
    const yInf = (bw * h * h / 2 + (bf - bw) * hf * (h - hf / 2)) / A;
    const Ix = bw * Math.pow(h, 3) / 12 + bw * h * Math.pow(h / 2 - yInf, 2)
      + (bf - bw) * Math.pow(hf, 3) / 12 + (bf - bw) * hf * Math.pow(h - hf / 2 - yInf, 2);
    return { A, yInf, Ix, Winf: Ix / yInf, Wsup: Ix / (h - yInf) };
  }

  // ρmín = As,mín/Ac (NBR 17.3.5.2.1 e Tabela 17.3): flexão de uma seção retangular com d/h = 0,8 sob o momento
  // mínimo 0,8·W0·fctk,sup, com piso de 0,15% (fck 35 → 0,163%; a tabela da norma arredonda para 0,164%).
  function rhoMin(p) {
    const r = flexao(0.8 * (1 / 6) * p.fctkSup / 10, p, { bw: 1, d: 0.8, dl: 0.2 });
    return Math.max(0.0015, r.erro ? 0 : r.As);
  }
  function asMinimoViga(p, g) { return rhoMin(p) * geometria(g).A; }

  function num(v, def) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : def;
  }

  function calcular(entrada) {
    const inp = entrada || {};
    const fck = num(inp.fck, 30), fyk = num(inp.fyk, 500);
    const bw = num(inp.bw, 0), h = num(inp.h, 0), dl = num(inp.dl, 0);
    const bfIn = num(inp.bf, 0), hfIn = num(inp.hf, 0);
    const ehT = bfIn > bw && hfIn > 0;
    const Mk = num(inp.Mk, 0), Nk = num(inp.Nk, 0), Vk = num(inp.Vk, 0), Tk = num(inp.Tk, 0);
    const modelo = Number(inp.modelo) === 2 ? 2 : 1;
    const thetaGraus = modelo === 1 ? 45 : num(inp.theta, 45);
    const c1 = num(inp.c1, 0) > 0 ? num(inp.c1, 0) : dl;
    const MsdMaxEntrada = Math.abs(num(inp.MsdMax, 0)) * 100;   // kN·cm

    const r = { erro: null, avisos: [], entrada: { fck, fyk, bw, h, dl, bf: ehT ? bfIn : 0, hf: ehT ? hfIn : 0, Mk, Nk, Vk, Tk, modelo, theta: thetaGraus, c1 } };
    if (!(fck >= 20 && fck <= 90)) { r.erro = 'fck deve estar entre 20 e 90 MPa.'; return r; }
    if (!(bw > 0 && h > 0 && dl > 0 && dl < h / 2)) { r.erro = 'Dimensões inválidas: informe bw, h e d\' (0 < d\' < h/2).'; return r; }
    if (ehT && !(hfIn < h)) { r.erro = 'Na seção T, hf deve ser menor que h.'; return r; }
    if (modelo === 2 && !(thetaGraus >= 30 && thetaGraus <= 45)) { r.erro = 'No Modelo II, θ deve estar entre 30° e 45°.'; return r; }

    const p = propriedades(fck, fyk, num(inp.xdLim, 0), num(inp.etaC, 0), !!inp.fctm2014);
    const d = h - dl;
    const g = { bw, h, d, dl, bf: ehT ? bfIn : 0, hf: ehT ? hfIn : 0 };
    const positivo = Mk > 0;
    const geo = geometria(g);
    const Ac = geo.A;
    const flexSec = M => flexaoSecao(M, p, g, positivo);
    const es = h / 2 - dl;
    r.props = p;
    r.geo = { bw, h, d, dl, bf: g.bf, hf: g.hf, tipo: ehT ? 'T' : 'retangular', Ac, ycg: geo.yInf, Ix: geo.Ix, Wx: positivo ? geo.Winf : geo.Wsup, es };

    const Md = G_DESF * Math.abs(Mk) * 100;   // kN·cm
    const Nd = G_DESF * Nk;                   // kN, + compressão
    const face = Mk > 0 || Mk === 0 ? 'inferior' : 'superior';
    r.face = { As: face, Asl: face === 'inferior' ? 'superior' : 'inferior' };
    const asMin = asMinimoViga(p, g, positivo);

    // ---------- Flexão / flexão composta ----------
    let flex = null;
    if (Md > 0 || Nd !== 0) {
      if (Md === 0 && Nd > 0) {
        // Compressão centrada (excentricidade zero): resultado é o total simétrico As + As'
        if (ehT) { r.erro = MSG_T_DOM5; return r; }
        const sigma = Math.min(ES * p.epsC2, p.fyd);
        const AsTotCalc = Math.max(0, (Nd - p.scd * Ac) / sigma);
        const asMinPilar = Math.max(0.15 * Nd / p.fyd, 0.004 * Ac);
        const AsTot = Math.max(AsTotCalc, asMinPilar);
        flex = { regime: 'compressao-centrada', dominio: 5, Md, Nd, exc: 0, Msd: null, xh: Infinity, sigmaSl: sigma, AsTotCalc, AsMin: asMinPilar, AsTot, AsCalc: AsTotCalc / 2, As: AsTot / 2, Asl: AsTot / 2 };
      } else if (Nd === 0) {
        const fl = flexSec(Md);
        if (fl.erro) { r.erro = fl.erro; return r; }
        flex = Object.assign({}, fl, { regime: 'flexao', Md, Msd: Md, AsCalc: fl.As, AsMin: asMin, As: Math.max(fl.As, asMin) });
      } else if (Nd < 0) {
        const exc = Md / Math.abs(Nd);
        if (exc > es) {
          const Msd = Md + Nd * es;
          const fl = flexSec(Msd);
          if (fl.erro) { r.erro = fl.erro; return r; }
          const dAs = -Nd / p.fyd;
          flex = Object.assign({}, fl, { regime: 'tracao-grande', Md, Nd, Msd, exc, dAs, AsCalc: fl.As + dAs, AsMin: asMin, As: Math.max(fl.As + dAs, asMin) });
        } else {
          const braco = d - dl;
          flex = {
            regime: 'tracao-pequena', dominio: 1, Md, Nd, exc, Msd: null,
            As: Math.abs(Nd) * (es + exc) / (braco * p.fyd), Asl: Math.abs(Nd) * (es - exc) / (braco * p.fyd),
            AsMin: asMin,
          };
          flex.AsCalc = flex.As;
          // Em tração com pequena excentricidade, cada armadura (As e As') vale no mínimo metade de As,mín
          flex.As = Math.max(flex.As, asMin / 2);
          flex.Asl = Math.max(flex.Asl, asMin / 2);
        }
      } else {
        const scdBw = p.scd * bw;
        const exc = Md / Nd;
        const E = Nd * es - Md;                                  // momento externo em relação a As'
        let I1 = scdBw * (p.lambda * h) * (p.lambda * h / 2 - dl);   // concreto com λh comprimido
        let I2 = scdBw * h * (h / 2 - dl);                           // seção toda comprimida
        if (ehT && positivo) {
          const momentoEmAsl = y => {
            const R = y <= hfIn ? p.scd * bfIn * y : p.scd * (bw * y + (bfIn - bw) * hfIn);
            const Mtopo = y <= hfIn ? p.scd * bfIn * y * y / 2 : p.scd * (bw * y * y / 2 + (bfIn - bw) * hfIn * hfIn / 2);
            return Mtopo - R * dl;
          };
          I1 = momentoEmAsl(p.lambda * h);
          I2 = momentoEmAsl(h);
        }
        const asMinPilar = Math.max(0.15 * Nd / p.fyd, 0.004 * Ac);
        if (ehT && E > I1) { r.erro = MSG_T_DOM5; return r; }
        if (E <= I1) {
          const Msd = Md + Nd * es;
          const fl = flexSec(Msd);
          if (fl.erro) { r.erro = fl.erro; return r; }
          const dAs = -Nd / p.fyd;
          const AsBruto = fl.As + dAs;
          flex = Object.assign({}, fl, {
            regime: 'compressao-grande', Md, Nd, Msd, exc, dAs, AsFlexao: fl.As, AsCalc: Math.max(AsBruto, 0),
            AsMin: asMin, As: Math.max(AsBruto, 0, asMin),
          });
          if (AsBruto < 0) r.avisos.push('As da flexão equivalente ficou menor que a compressão aplicada (ΔAs): As zerado, vale a armadura mínima.');
        } else if (E <= I2) {
          const y = dl + Math.sqrt(dl * dl + 2 * E / scdBw);
          const x = y / p.lambda;
          const Rcc = scdBw * y;
          const epsSl = p.epsC2 * (x - dl) / (x - (1 - p.epsC2 / p.epsCu) * h);
          const sigmaSl = Math.min(ES * epsSl, p.fyd);
          let Asl = (Nd - Rcc) / sigmaSl;
          if (Asl < 0) { Asl = 0; r.avisos.push('O concreto sozinho já equilibra a normal: armadura calculada nula, vale o mínimo de pilar (0,15·Nd/fyd).'); }
          const AsCalc = 0;
          let As = 0, AslFinal = Asl;
          const deficit = asMinPilar - (As + AslFinal);
          if (deficit > 0) AslFinal += deficit;
          flex = { regime: 'compressao-dominio5', dominio: 5, Md, Nd, exc, Msd: null, E, I1, I2, xh: x / h, x, y, epsSl, sigmaSl, AsCalc, AslCalc: Asl, AsMin: asMinPilar, As, Asl: AslFinal };
        } else {
          const sigma = Math.min(ES * p.epsC2, p.fyd);
          const Rh = scdBw * h;
          const As = ((Nd - Rh) * es - Md) / (sigma * (d - dl));
          const Asl = (Nd - Rh - As * sigma) / sigma;
          let AslFinal = Asl;
          const deficit = asMinPilar - (As + AslFinal);
          if (deficit > 0) AslFinal += deficit;
          flex = { regime: 'compressao-dominio5-infinito', dominio: 5, Md, Nd, exc, Msd: null, E, I1, I2, xh: Infinity, sigmaSl: sigma, AsCalc: As, AslCalc: Asl, AsMin: asMinPilar, As, Asl: AslFinal };
        }
      }
      flex.es = es;
      r.flexao = flex;
    }

    // ---------- Cortante e torção ----------
    const Vd = G_DESF * Math.abs(Vk);
    const Td = G_DESF * Math.abs(Tk) * 100;   // kN·cm
    const rad = thetaGraus * Math.PI / 180;
    const cot = 1 / Math.tan(rad);
    const sin2 = Math.sin(2 * rad);

    let cort = null, tor = null;
    if (Vd > 0 || Td > 0) {
      const VRd2 = modelo === 1 ? 0.27 * p.alphaV2 * p.fcd * bw * d
        : 0.54 * p.alphaV2 * p.fcd * bw * d * Math.pow(Math.sin(rad), 2) * cot;
      const Vc0 = 0.6 * p.fctd * bw * d;
      const taxaSwMin = 0.2 * p.fctm / p.fyk;           // adimensional (ρsw,mín), mesma taxa usada na torção
      const AswMin = taxaSwMin * bw * 100;              // cm²/m, 2 ramos

      cort = { modelo, theta: thetaGraus, Vd, VRd2, VRd3: Vd, Vc0, AswMin, AswMinPerc: taxaSwMin * 100 };
      if (Vd > 0) {
        let Vc1 = Vc0;
        if (modelo === 2) Vc1 = Vd <= Vc0 ? Vc0 : Math.max(0, Vc0 * (VRd2 - Vd) / (VRd2 - Vc0));
        let Vc, situacao, M0 = 0, MsdMax = 0, fatorM0 = 1;
        if (Nk > 0) {
          M0 = Nk * G_FAV * (positivo ? geo.Winf : geo.Wsup) / Ac;   // Nk·γfav·W/Ac (retangular: h/6)
          MsdMax = MsdMaxEntrada > 0 ? MsdMaxEntrada : Md;
          fatorM0 = MsdMax > 0 ? Math.min(1 + M0 / MsdMax, 2) : 2;
          Vc = Vc1 * fatorM0;
          situacao = 'Flexo-compressão';
        } else if (Nk < 0 && flex && flex.regime === 'tracao-pequena') {
          Vc = 0;
          situacao = 'Flexo-tração com LN fora da seção (Vc = 0)';
        } else {
          Vc = Vc1;
          situacao = Nk < 0 ? 'Flexo-tração, LN cortando a seção' : 'Flexão simples, LN cortando a seção';
        }
        const Vsw = Vd - Vc;   // pode dar negativo quando Vc > Vd (Vc já cobre a demanda sozinho)
        const Aswc = Math.max(0, Vsw) / (0.9 * d * p.fywd * cot) * 100;   // cm²/m, 2 ramos
        const alD = Vd > Vc ? Math.min(1, Math.max(0.5, 0.5 * Vd / (Vd - Vc) * cot)) : 1;
        Object.assign(cort, { situacao, Vc, Vc1, Vsw, M0, MsdMax, fatorM0, Asw: Aswc, alD, Asapo: Vd * alD / p.fyd + (Nk < 0 ? Math.abs(Nd) / p.fyd : 0) });
      } else {
        Object.assign(cort, { Asw: 0, Vc: 0, Vsw: 0, alD: null, Asapo: 0 });
      }

      if (Td > 0) {
        // Seção T: torção tratada como a alma inteira (retangular bw × h), sem dividir em retângulos (simplificação; a NBR 17.5.1.4.2 permite a divisão em retângulos por rigidez).
        const A = bw * h, u = 2 * (bw + h);
        const heAu = A / u;
        const abaixo = heAu < 2 * c1;
        const heEf = abaixo ? Math.min(heAu, bw - 2 * c1) : heAu;   // A/u < 2c1: he = A/u ≤ bw − 2c1
        const bn = abaixo ? bw - 2 * c1 : bw - heAu;
        const hn = abaixo ? h - 2 * c1 : h - heAu;
        if (!(bn > 0 && hn > 0 && heEf > 0)) {
          // núcleo nulo: TRd2 = 0, indica esmagamento da biela por torção (seção estreita demais para o c1 adotado)
          r.erro = MSG_BIELA;
          r.erroCausa = 'Causa: torção | núcleo resistente nulo (bw e/ou h pequenos demais para o c1 adotado).';
          return r;
        }
        const Ae = bn * hn, ue = 2 * (bn + hn);
        const TRd2 = 0.5 * p.alphaV2 * p.fcd * Ae * heEf * sin2;
        const A90s = Td / (2 * Ae * p.fywd * cot) * 100;        // cm²/m, 1 ramo
        const AslM = Td * cot / (2 * Ae * p.fyd) * 100;         // cm²/m de perímetro
        // Taxa mínima da NBR 17.5.1.2 (0,2·fct,m/fywk) aplicada à parede equivalente de espessura he.
        // Confere com os valores de referência observados (0,83 cm²/m em 20×50 e 1,02 cm²/m em 25×60).
        const AslMin = 0.2 * p.fctm / p.fyk * heEf * 100;
        const AslEf = Math.max(AslM, AslMin);   // o valor calculado é informativo, mas a distribuição pelas faces usa o mínimo
        tor = {
          Td, TRd3: Td, TRd4: Td, c1, he: heEf, heAu, bnuc: bn, hnuc: hn, u: ue, Ae, TRd2, A90s, AslM, AslMin, AslEf,
          AslTotal: AslEf * ue / 100, AsVer: AslEf * hn / 100, AsHor: AslEf * bn / 100,
        };
        if (AslM < AslMin) r.avisos.push('Armadura longitudinal de torção calculada abaixo do mínimo: distribuída pelas faces com AsLong,mín.');
      }

      const soma = Vd / VRd2 + (tor ? Td / tor.TRd2 : 0);
      cort.soma = soma;
      cort.Smax = soma <= 0.67 ? Math.min(0.6 * d, 30) : Math.min(0.3 * d, 20);
      cort.StMax = soma <= 0.2 ? Math.min(d, 80) : Math.min(0.6 * d, 35);
      const AswTotal = cort.Asw + (tor ? 2 * tor.A90s : 0);
      cort.AswTotal = Math.max(AswTotal, AswMin);

      // Ramos do estribo (NBR 18.3.3.2, espaçamento entre ramos ≤ St,max). O total de aço do cortante
      // não depende do número de ramos (é sempre a mesma área por metro); ramos>2 só reparte esse total
      // em mais pernas, todas na mesma bitola (mesma convenção da planilha "Detalhamento de viga" da
      // Promab: Asw/ramos por perna). A torção continua sempre no laço de 2 ramos do perímetro, por
      // isso não entra nessa divisão — cort.AswTotal (cisalhamento + 2×torção) não muda com ramos.
      const ramos = Math.max(2, Math.round(num(inp.ramos, 2) / 2) * 2);
      cort.ramos = ramos;
      cort.AswPorPerna = cort.Asw / ramos;
      if (ramos === 2 && bw > cort.StMax) {
        r.avisos.push(`bw (${bw} cm) maior que o espaçamento máximo entre ramos (${cort.StMax.toFixed(1)} cm): usar mais de 2 ramos.`);
      }

      r.cortante = cort;
      r.torcao = tor;
      if (soma > 1) {
        r.erro = MSG_BIELA;
        const razaoV = VRd2 > 0 ? Vd / VRd2 : Infinity;
        const razaoT = tor && tor.TRd2 > 0 ? Td / tor.TRd2 : 0;
        if (razaoT === 0) {
          r.erroCausa = `Causa: cisalhamento | Vd (${Vd.toFixed(2)} kN) muito próximo ou acima de VRd2 (${VRd2.toFixed(2)} kN).`;
        } else if (razaoV === 0) {
          r.erroCausa = `Causa: torção | Td (${(Td/100).toFixed(2)} kN·m) muito próximo ou acima de TRd2 (${(tor.TRd2/100).toFixed(2)} kN·m).`;
        } else {
          r.erroCausa = `Causa: combinação de cisalhamento e torção (Vd/VRd2 = ${razaoV.toFixed(2)} + Td/TRd2 = ${razaoT.toFixed(2)} = ${soma.toFixed(2)} > 1).`;
        }
      }
    }

    if (flex && (flex.As + (flex.Asl || 0)) > 0.04 * Ac) {
      r.avisos.push('As + As\' acima de 4% de Ac (NBR 17.3.5.2.4): aumentar a seção.');
    }

    // Armadura de pele (NBR 17.3.5.2.3): 0,10% de Ac,alma por face em vigas com h > 60 cm, no máximo 5 cm²/m por face.
    // Não informada no domínio 5. No resultado vale o maior entre a pele e a torção nas faces verticais.
    const pele = h > 60 && !(flex && flex.dominio === 5) ? Math.min(0.001 * bw * h, 5 * h / 100) : 0;
    const asCost = tor ? Math.max(tor.AsVer, pele) : (pele > 0 ? pele : null);
    r.pele = pele;

    // A torção soma As,hor na face tracionada; na comprimida vale |As' da flexão − As,hor|
    // (as barras de torção na face comprimida contam como armadura de compressão)
    // Em seções baixas (h ≤ 40 cm) as barras das faces verticais são as de canto e também entram em As e As'
    const somaTorcao = tor ? (h <= 40 ? tor.AsHor + tor.AsVer : tor.AsHor) : 0;
    const AsRes = flex ? flex.As + somaTorcao : null;
    const AslRes = flex ? (tor ? (flex.regime === 'tracao-pequena' ? (flex.Asl || 0) + somaTorcao : Math.abs((flex.Asl || 0) - somaTorcao)) : (flex.Asl || 0)) : null;
    const soN = flex && (flex.regime === 'compressao-centrada' || (Md === 0 && Nd < 0));
    r.resumo = {
      As: AsRes,
      Asl: AslRes,
      Asw: cort ? cort.AswTotal : null,
      AsCost: asCost,
      AsTot: soN ? AsRes + AslRes + 2 * (asCost || 0) : null,
    };
    return r;
  }

  return { calcular, propriedades, flexao, MSG_BIELA, MSG_T_DOM5, TF_PARA_KN: 9.80665, constantes: { GC, GS, ES, G_DESF, G_FAV } };
}));
