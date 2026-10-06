// Pantallas propias de ¡Fakeado! Fallas: "La meua falla" y la Hemeroteca fallera
import { useMemo, useState } from 'react';
import historia from '../data/historia.json';
import { Bar } from './screens';
import { CARGOS, getMeua, meuaQuestions, saveMeua, type MeuaFalla } from './meua';

/* ---------- La meua falla ---------- */

export function MeuaScreen({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const [m, setM] = useState<MeuaFalla>(() => structuredClone(getMeua()));
  const [saved, setSaved] = useState(false);
  const n = useMemo(() => meuaQuestions(m).length, [m]);
  const set = (patch: Partial<MeuaFalla>) => {
    setM({ ...m, ...patch });
    setSaved(false);
  };

  return (
    <div className="app">
      <Bar title="La meua falla" onBack={onBack} />
      <p className="on-ink" style={{ margin: 0 }}>
        Los datos de tu comisión se convierten en preguntas del tema «La meua falla». Se guardan en este dispositivo: cuando crees una sala desde aquí, saldrán en la partida.
      </p>
      <div className="card stack">
        <label className="field">
          Nombre de la falla
          <input id="meua-falla" className="input" value={m.falla} maxLength={70} onChange={(e) => set({ falla: e.target.value })} placeholder="Por ejemplo, Plaza de la Reina-Paz" />
        </label>
        <label className="field">
          Ejercicio
          <input id="meua-ej" className="input" value={m.ejercicio} maxLength={9} inputMode="numeric" onChange={(e) => set({ ejercicio: e.target.value })} />
        </label>
      </div>

      <div className="card stack">
        <h2>Cargos</h2>
        {m.cargos.map((c, i) => (
          <div key={i} className="stack" style={{ gap: 8, borderBottom: '2px dashed #cbbcff', paddingBottom: 12 }}>
            <select
              id={`cargo-${i}`}
              className="input"
              value={c.cargo}
              onChange={(e) => set({ cargos: m.cargos.map((x, j) => (j === i ? { ...x, cargo: e.target.value } : x)) })}
            >
              {CARGOS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <input
              id={`nom-${i}`}
              className="input"
              value={c.nom}
              placeholder="Nombre y apellidos"
              onChange={(e) => set({ cargos: m.cargos.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) })}
            />
            <button className="btn white small" onClick={() => set({ cargos: m.cargos.filter((_, j) => j !== i) })}>
              Quitar cargo
            </button>
          </div>
        ))}
        <button className="btn lilac small" onClick={() => set({ cargos: [...m.cargos, { cargo: CARGOS[0], nom: '' }] })}>
          Añadir cargo
        </button>
      </div>

      <div className="card stack">
        <h2>Preguntas de la comisión</h2>
        <p className="hint" style={{ margin: 0 }}>
          Escribe la frase con ___ donde va la respuesta. Por ejemplo: «Nuestro casal está en la calle ___».
        </p>
        {m.preguntas.map((p, i) => (
          <div key={i} className="stack" style={{ gap: 8, borderBottom: '2px dashed #cbbcff', paddingBottom: 12 }}>
            <input id={`pq-${i}`} className="input" value={p.q} placeholder="Pregunta con ___" onChange={(e) => set({ preguntas: m.preguntas.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
            <input id={`pa-${i}`} className="input" value={p.a} placeholder="Respuesta verdadera" onChange={(e) => set({ preguntas: m.preguntas.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
            <input
              id={`pl-${i}`}
              className="input"
              value={p.lies.join(', ')}
              placeholder="Dos o tres mentiras, separadas por comas"
              onChange={(e) => set({ preguntas: m.preguntas.map((x, j) => (j === i ? { ...x, lies: e.target.value.split(',') } : x)) })}
            />
            {!p.q.includes('___') && p.q && <span className="error">Falta el hueco ___ en la pregunta.</span>}
            <button className="btn white small" onClick={() => set({ preguntas: m.preguntas.filter((_, j) => j !== i) })}>
              Quitar pregunta
            </button>
          </div>
        ))}
        <button className="btn lilac small" onClick={() => set({ preguntas: [...m.preguntas, { q: '', a: '', lies: [] }] })}>
          Añadir pregunta
        </button>
      </div>

      {saved && <div className="banner">Guardado. {n} preguntas de tu falla entrarán en las partidas.</div>}
      <button
        className="btn"
        onClick={() => {
          saveMeua(m);
          onSaved();
          setSaved(true);
        }}
      >
        Guardar
      </button>
    </div>
  );
}

/* ---------- Hemeroteca ---------- */

type Tab = 'fmv' | 'fmi' | 'premios' | 'ninots' | 'municipal';
const H = historia as any;
// Las infantiles de los últimos años aún son menores: solo se muestran hasta 2018
const FMI_MAX = 2018;

export function Hemeroteca({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('fmv');
  const [q, setQ] = useState('');
  const rows: { any: string; txt: string; sub?: string }[] = useMemo(() => {
    const list =
      tab === 'fmv'
        ? H.fallerasMayores.map((x: any) => ({ any: x.any, txt: x.nom, sub: x.falla }))
        : tab === 'fmi'
          ? H.fallerasMayoresInfantiles.filter((x: any) => Number(x.any.slice(0, 4)) <= FMI_MAX).map((x: any) => ({ any: x.any, txt: x.nom }))
          : tab === 'premios'
            ? [...H.primerPremioEspecial].reverse().map((x: any) => ({ any: x.any, txt: x.falla }))
            : tab === 'ninots'
              ? H.ninotIndultat.map((x: any) => ({ any: x.any, txt: x.falla }))
              : H.fallaMunicipal.map((x: any) => ({ any: x.any, txt: x.artista, sub: x.lema ? `«${x.lema}»` : undefined }));
    const n = q.trim().toLowerCase();
    return n ? list.filter((r: any) => (r.any + ' ' + r.txt).toLowerCase().includes(n)) : list;
  }, [tab, q]);
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const p of H.primerPremioEspecial) t[p.falla] = (t[p.falla] ?? 0) + 1;
    return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, []);

  return (
    <div className="app">
      <Bar title="Hemeroteca fallera" onBack={onBack} />
      <div className="seg">
        <button aria-pressed={tab === 'fmv'} onClick={() => setTab('fmv')}>Falleras Mayores</button>
        <button aria-pressed={tab === 'fmi'} onClick={() => setTab('fmi')}>Infantiles</button>
        <button aria-pressed={tab === 'premios'} onClick={() => setTab('premios')}>1er premio Especial</button>
        <button aria-pressed={tab === 'ninots'} onClick={() => setTab('ninots')}>Ninots indultats</button>
        <button aria-pressed={tab === 'municipal'} onClick={() => setTab('municipal')}>Falla municipal</button>
      </div>
      <input id="hem-buscar" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar año o nombre" />
      {tab === 'premios' && (
        <div className="rank">
          {totals.map(([f, n], i) => (
            <div key={f} className={'rank-row' + (i === 0 ? ' first' : '')}>
              <span className="pos">{i + 1}º</span>
              <span className="name">{f}</span>
              <span className="pts">{n}</span>
            </div>
          ))}
        </div>
      )}
      <div className="card" style={{ padding: 0 }}>
        {rows.map((r) => (
          <div key={r.any + r.txt} style={{ display: 'flex', gap: 14, padding: '10px 16px', borderBottom: '2px solid #f3ecff', alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--arcade)', fontSize: 11, color: 'var(--pink)', minWidth: 100, flex: '0 0 auto' }}>{r.any}</span>
            <span style={{ fontWeight: 650, minWidth: 0 }}>
              {r.txt}
              {r.sub && <span className="hint"> · {r.sub}</span>}
            </span>
          </div>
        ))}
        {!rows.length && <p className="hint" style={{ padding: 16, margin: 0 }}>Sin resultados.</p>}
      </div>
      <p className="muted on-ink" style={{ margin: 0, fontSize: 14 }}>
        Fuente: Junta Central Fallera y prensa. {tab === 'fmi' ? 'Las Falleras Mayores Infantiles de los últimos años no se muestran porque aún son menores.' : ''}
        {tab === 'premios' ? ' No se incluyen 1943 y 1953 (premio compartido), 1981 (sin confirmar) ni 2020 (sin Fallas).' : ''}
        {tab === 'ninots' ? ' El primer ninot indultat fue «Abuela y nieta», en 1934. No se incluyen 1956 y 1966 (indulto compartido).' : ''}
      </p>
    </div>
  );
}
