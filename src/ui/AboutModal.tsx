import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useT } from '../i18n';
import { useUI } from '../store';

export function AboutModal() {
  const t = useT();
  const open = useUI((s) => s.aboutOpen);
  const lang = useUI((s) => s.lang);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useUI.setState({ aboutOpen: false });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onClick={() => useUI.setState({ aboutOpen: false })}>
      <div className="relative max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/10 bg-[#0a0e18] p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button className="absolute top-4 right-4 rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white" onClick={() => useUI.setState({ aboutOpen: false })} aria-label={t('about.close')}>
          <X size={18} />
        </button>
        <h2 className="text-xl font-semibold text-white">{t('about.title')}</h2>
        <div className="prose-science mt-2">{lang === 'hu' ? <ScienceHu /> : <ScienceEn />}</div>
      </div>
    </div>
  );
}

function ScienceHu() {
  return (
    <>
      <h3>Dinamika</h3>
      <ul>
        <li>
          Minden tömeges test (fekete lyukak, csillagok, bolygók) teljes N-test rendszerként, adaptív lépésközű negyedrendű Runge-Kutta módszerrel mozog. Az idő a távoli
          megfigyelő <em>koordinátaideje</em>.
        </li>
        <li>
          Általános relativitás: minden párra a Schwarzschild-geodetikus egzakt mozgásegyenlete érvényes koordinátaidőben,{' '}
          <code>a = -(GM/r²)[(f + 2(v²-ṙ²)/c² - ṙ²/(c²f)) n - 2ṙ/(c²f) v]</code>, <code>f = 1 - 2GM/(c²r)</code>. Ez pontosan adja a perihélium-precessziót, az ISCO-t (6GM/c²), a
          fotongömböt (3GM/c²) és a fényelhajlást (4GM/(c²b)). Összemérhető tömegeknél a relatív mozgás a teljes tömeg terében mozgó próbatestként kezelt (az effektív egytest
          leképezés η→0 határesete).
        </li>
        <li>
          Gravitációs hullámok visszahatása: 2,5PN sugárzási reakció (Kidder 1995), amely a Peters-féle luminozitást adja; a relativisztikus (Killing-) energiára kalibrálva. A
          becsapódás ideje az utolsó pályákon kb. 15-20%-on belül egyezik a pontosabb poszt-newtoni számításokkal.
        </li>
        <li>A próbatestek (űrhajók, meteorok, fotonok, törmelék) saját adaptív lépésközzel mozognak a tömeges testek Hermite-interpolált pályáin.</li>
        <li>
          Óra járása: <code>dτ/dt = √(f - u_r²/(fc²) - u_t²/c²)</code> a domináns tömeghez képest; egyetlen fekete lyuk körül egzakt (körpályán <code>√(1 - 3GM/(c²r))</code>).
        </li>
      </ul>
      <h3>Összeolvadás</h3>
      <ul>
        <li>A közös horizont kialakulásakor (szeparáció &lt; 1,5·(r_s1 + r_s2)) a maradvány tulajdonságait numerikus relativitáselméleti illesztések adják:</li>
        <li>kisugárzott energia: Jiménez-Forteza és mtsai. (2017); végső spin: Rezzolla és mtsai. (2008); kilökődési sebesség: González és mtsai. (2007).</li>
        <li>Kilecsengés: a Kerr-fekete lyuk l=m=2 alapmódusa (Berti, Cardoso, Will 2006). GW150914-re 62 M☉, a* ≈ 0,67, ~3 M☉c² kisugárzott energia jön ki.</li>
        <li>A gravitációs hullám jel a kvadrupól-formulából számolt deformáció (h₊, h×) felülről nézve.</li>
      </ul>
      <h3>Árapály-szétszakítás, ütközések</h3>
      <ul>
        <li>
          Árapály-sugár: <code>r_t = R (M/m)^(1/3)</code>. Ha r_t a horizonton kívül esik, a csillag „befagyott” közelítéssel törmelékfelhővé válik; ha belül, egészben
          elnyelődik (kb. 10⁸ M☉ felett Napszerű csillagra).
        </li>
        <li>Neutroncsillag 2,3 M☉ felett fekete lyukká omlik; fehér törpe 1,4 M☉ (Chandrasekhar-határ) felett Ia szupernóvaként felrobban.</li>
      </ul>
      <h3>Hawking-sugárzás és a stabilitás határa</h3>
      <ul>
        <li>
          <code>T_H = ħc³/(8πGMk)</code>, <code>P = ħc⁶/(15360πG²M²)</code>, élettartam <code>t = 5120πG²M³/(ħc⁴)</code> (csak fotonok; minden részecskefajtával a
          párolgás pár-szor gyorsabb, Page 1976).
        </li>
        <li>
          A CMB elnyelésével a nettó tömegváltozás <code>dM/dt = 4πr_s²σ(T_CMB⁴ - T_H⁴)/c²</code>. Az egyensúly <code>T_H = T_CMB</code>-nél, kb. 4,5·10²² kg-nál van (Hold-tömeg
          nagyságrend). Ez <em>instabil</em>: kisebb tömegnél a párolgás gyorsul, nagyobbnál a fekete lyuk nő.
        </li>
        <li>
          A legkisebb értelmes fekete lyuk a Planck-tömeg (~2,2·10⁻⁸ kg); ez alatt a félklasszikus leírás nem érvényes. Egy 10¹¹-10¹² kg-os primordiális fekete lyuk
          párologna el az Univerzum mai korára.
        </li>
      </ul>
      <h3>Megjelenítés</h3>
      <ul>
        <li>
          Valósághű nézet: valós idejű GPU sugárkövetés; a fénysugarak a Schwarzschild nulla-geodetikus egyenletét követik. Több fekete lyuk tere szuperponált (közelítés). A
          spin csak a korong belső sugarát módosítja.
        </li>
        <li>
          Akkréciós korong: vékony korong hőmérsékleti profil, a megfigyelt frekvencia arány egzakt Schwarzschild képlettel: <code>g = √(1 - 3M/r)/(1 - Ωb)</code>; szín:
          feketetest <code>gT</code>-nél, intenzitás <code>∝ g⁴</code>. A „Filmes” mód csak a színskálát változtatja. A korong forgási sebessége illusztratív.
        </li>
        <li>A próbatestek (meteorok, fotonok, űrhajók) a valósághű nézetben lencsézés nélkül jelennek meg.</li>
        <li>
          Fénysugarak: a fotonpályák a Schwarzschild nulla-geodetikusok, színük a helyben álló megfigyelő által mért hullámhossz:{' '}
          <code>λ = λ₀ √(f(r)/f(r₀))</code>. Befelé esve kékeltolódás, kifelé mászva vöröseltolódás látszik.
        </li>
        <li>Az űrhajók stilizált modellek valós (közelítő) méretekkel, a 2D térképen felülnézeti sziluettként, a 3D nézetekben modellként.</li>
        <li>Erőtér nézet: egy helyben lebegő test gyorsulása <code>g = GM/(r²√(1 - r_s/r))</code>, több test esetén vektorösszeg (közelítés).</li>
        <li>
          Bolygóütközések: a kimenet a fajlagos ütközési energiától függ (Leinhardt &amp; Stewart 2012): <code>Q = ½μv²/M</code>, a legnagyobb maradvány tömege{' '}
          <code>M = M_össz(1 − Q/2Q*)</code>, a többi törmelék. Lassú ütközésnél összeolvadás, gyorsnál szétszakadás. A maradvány felszíne megolvad, és ~1000 év alatt hűl ki.
        </li>
        <li>
          A Naprendszer bolygóinak adatai a NASA adatlapjairól valók. A bolygótextúrák forrása: Solar System Scope (solarsystemscope.com), CC BY 4.0, NASA-adatok alapján.
        </li>
        <li>
          Görbületi nézet: a térbeli metrika Flamm-féle beágyazása (külső és homogén belső Schwarzschild megoldás); több test esetén a mélységek összege (közelítés). Szín: az
          óra járása. A mélység skálája állítható (×1 = valós arány); a gravitációs hullám fodrok csak illusztrációk.
        </li>
      </ul>
    </>
  );
}

function ScienceEn() {
  return (
    <>
      <h3>Dynamics</h3>
      <ul>
        <li>
          All massive bodies (black holes, stars, planets) are integrated as a full N-body system with adaptive 4th-order Runge-Kutta. Time is the <em>coordinate time</em> of a
          distant observer.
        </li>
        <li>
          General relativity: every pair follows the exact Schwarzschild geodesic equation in coordinate time,{' '}
          <code>a = -(GM/r²)[(f + 2(v²-ṙ²)/c² - ṙ²/(c²f)) n - 2ṙ/(c²f) v]</code>, <code>f = 1 - 2GM/(c²r)</code>. It gives the exact perihelion precession, the ISCO (6GM/c²), the
          photon sphere (3GM/c²) and light deflection (4GM/(c²b)). For comparable masses the relative motion is treated as a test body in the field of the total mass (the η→0 limit
          of the effective-one-body map).
        </li>
        <li>
          Gravitational-wave back-reaction: 2.5PN radiation reaction (Kidder 1995) reproducing the Peters luminosity, calibrated to the relativistic (Killing) energy. The plunge
          time agrees with higher-order post-Newtonian estimates to roughly 15-20% over the last orbits.
        </li>
        <li>Test bodies (ships, meteors, photons, debris) use individual adaptive steps along Hermite-interpolated trajectories of the massive bodies.</li>
        <li>
          Clock rate: <code>dτ/dt = √(f - u_r²/(fc²) - u_t²/c²)</code> relative to the dominant mass; exact around a single black hole (<code>√(1 - 3GM/(c²r))</code> on a circular
          orbit).
        </li>
      </ul>
      <h3>Mergers</h3>
      <ul>
        <li>When a common horizon forms (separation &lt; 1.5·(r_s1 + r_s2)) the remnant follows numerical-relativity fits:</li>
        <li>radiated energy: Jiménez-Forteza et al. (2017); final spin: Rezzolla et al. (2008); recoil: González et al. (2007).</li>
        <li>Ringdown: the l=m=2 fundamental Kerr quasi-normal mode (Berti, Cardoso & Will 2006). GW150914 gives 62 M☉, a* ≈ 0.67 and ~3 M☉c² radiated.</li>
        <li>The gravitational-wave signal is the quadrupole-formula strain (h₊, h×) for a face-on observer.</li>
      </ul>
      <h3>Tidal disruption, collisions</h3>
      <ul>
        <li>
          Tidal radius <code>r_t = R (M/m)^(1/3)</code>. If r_t lies outside the horizon the star becomes a debris cloud (frozen-in approximation); otherwise it is swallowed whole
          (above ~10⁸ M☉ for a Sun-like star).
        </li>
        <li>Neutron stars above 2.3 M☉ collapse to black holes; white dwarfs above 1.4 M☉ (Chandrasekhar limit) explode as type Ia supernovae.</li>
      </ul>
      <h3>Hawking radiation and the edge of stability</h3>
      <ul>
        <li>
          <code>T_H = ħc³/(8πGMk)</code>, <code>P = ħc⁶/(15360πG²M²)</code>, lifetime <code>t = 5120πG²M³/(ħc⁴)</code> (photons only; with all particle species evaporation is a
          few times faster, Page 1976).
        </li>
        <li>
          Including CMB absorption, <code>dM/dt = 4πr_s²σ(T_CMB⁴ - T_H⁴)/c²</code>. The balance point <code>T_H = T_CMB</code> lies at ~4.5·10²² kg (about a Moon mass) and is{' '}
          <em>unstable</em>: lighter holes evaporate ever faster, heavier ones grow.
        </li>
        <li>
          The smallest meaningful black hole is the Planck mass (~2.2·10⁻⁸ kg); below it the semiclassical description fails. Primordial black holes of 10¹¹-10¹² kg would be
          evaporating today.
        </li>
      </ul>
      <h3>Rendering</h3>
      <ul>
        <li>
          Realistic view: real-time GPU ray tracing of Schwarzschild null geodesics. Fields of several holes are superposed (approximation). Spin only changes the inner disk
          radius.
        </li>
        <li>
          Accretion disk: thin-disk temperature profile; the observed frequency ratio uses the exact Schwarzschild expression <code>g = √(1 - 3M/r)/(1 - Ωb)</code>; colour is a
          black body at <code>gT</code>, intensity <code>∝ g⁴</code>. “Cinematic” only changes the colour scale. The disk rotation speed is illustrative.
        </li>
        <li>Test bodies (meteors, photons, ships) are drawn without lensing in the realistic view.</li>
        <li>
          Light rays: photon paths are Schwarzschild null geodesics, coloured by the wavelength a static observer measures:{' '}
          <code>λ = λ₀ √(f(r)/f(r₀))</code>. Falling in they are blueshifted, climbing out redshifted.
        </li>
        <li>Spaceships are stylised models at their (approximate) real size: top-view silhouettes on the 2D map, 3D models in the 3D views.</li>
        <li>Force-field view: acceleration of a body held at rest, <code>g = GM/(r²√(1 - r_s/r))</code>, vector-summed for several bodies (approximation).</li>
        <li>
          Planet collisions: the outcome depends on the specific impact energy (Leinhardt &amp; Stewart 2012): <code>Q = ½μv²/M</code>, largest remnant{' '}
          <code>M = M_tot(1 − Q/2Q*)</code>, the rest becomes debris. Slow impacts merge, fast ones disrupt. The remnant's surface melts and cools over ~1000 years.
        </li>
        <li>
          Solar System data from the NASA planetary fact sheets. Planet textures: Solar System Scope (solarsystemscope.com), CC BY 4.0, based on NASA data.
        </li>
        <li>
          Curvature view: Flamm embedding of the spatial metric (exterior and uniform-density interior Schwarzschild solutions); depths of several bodies are summed
          (approximation). Colour: clock rate. Depth scale is adjustable (×1 = true scale); gravitational-wave ripples are illustrative.
        </li>
      </ul>
    </>
  );
}
