import type { Lang } from '../store';

interface Text {
  title: string;
  desc: string;
}

export const SCENARIO_TEXT: Record<string, Record<Lang, Text>> = {
  sgrA: {
    hu: {
      title: 'Sgr A* és az S-csillagok',
      desc: 'A Tejútrendszer központi fekete lyuka (4,3 millió M☉) valódi S-csillag pályákkal. Az S2 pályája a Schwarzschild-precessziót mutatja.',
    },
    en: {
      title: 'Sgr A* and the S-stars',
      desc: 'The Milky Way’s central black hole (4.3 million M☉) with real S-star orbits. S2’s orbit shows Schwarzschild precession.',
    },
  },
  gw150914: {
    hu: {
      title: 'GW150914 – két fekete lyuk összeolvadása',
      desc: '36 + 29 M☉ spirálozik egymásba, gravitációs hullámokat sugározva. Az első közvetlenül észlelt GW-esemény 410 Mpc távolságból.',
    },
    en: {
      title: 'GW150914 – binary black hole merger',
      desc: '36 + 29 M☉ spiral together while radiating gravitational waves. The first directly detected GW event, at 410 Mpc.',
    },
  },
  tde: {
    hu: {
      title: 'Árapály-szétszakítás (TDE)',
      desc: 'Egy Napszerű csillag parabolapályán az árapály-sugáron belülre kerül egy 10⁶ M☉ fekete lyuk körül, és törmelékfolyammá szakad.',
    },
    en: {
      title: 'Tidal disruption event',
      desc: 'A Sun-like star on a parabolic orbit passes inside the tidal radius of a 10⁶ M☉ black hole and is shredded into a debris stream.',
    },
  },
  microEvap: {
    hu: {
      title: 'Mikro fekete lyukak párolgása',
      desc: '10⁸–4·10⁸ kg tömegű primordiális fekete lyukak Hawking-sugárzással percek–órák alatt elpárolognak, egyre forróbban.',
    },
    en: {
      title: 'Micro black holes evaporating',
      desc: 'Primordial black holes of 10⁸–4·10⁸ kg evaporate through Hawking radiation within minutes to hours, getting ever hotter.',
    },
  },
  equilibrium: {
    hu: {
      title: 'A stabilitás határa: Hawking–CMB egyensúly',
      desc: 'Egy ~4,5·10²² kg-os fekete lyuk (kb. Hold-tömeg) Hawking-hőmérséklete épp 2,725 K: ugyanannyit sugároz, mint amennyi CMB-t elnyel. Instabil egyensúly.',
    },
    en: {
      title: 'Edge of stability: Hawking–CMB balance',
      desc: 'A ~4.5·10²² kg black hole (about a Moon mass) has a Hawking temperature of exactly 2.725 K: it emits as much as it absorbs from the CMB. An unstable equilibrium.',
    },
  },
  photonSphere: {
    hu: {
      title: 'Fényelhajlás és fotongömb',
      desc: 'Párhuzamos fénysugarak egy 10 M☉ fekete lyuk mellett. A kritikus ütközési paraméter (3√3 GM/c²) közelében a fény a fotongömb körül kering.',
    },
    en: {
      title: 'Light bending and the photon sphere',
      desc: 'Parallel light rays passing a 10 M☉ black hole. Near the critical impact parameter (3√3 GM/c²) light winds around the photon sphere.',
    },
  },
  gravRedshift: {
    hu: {
      title: 'Gravitációs színeltolódás',
      desc: 'Kék fény indul kifelé a horizont közeléből: minél mélyebbről jön, annál vörösebb lesz (a legmélyebbről infravörös). A befelé eső vörös fény ibolyára, majd UV-be kékül.',
    },
    en: {
      title: 'Gravitational colour shift',
      desc: 'Blue light leaves from near the horizon: the deeper its source, the redder it gets (the deepest becomes infrared). Red light falling in is blueshifted to violet and ultraviolet.',
    },
  },
  fleet: {
    hu: {
      title: 'Flotta a Nap körül – közeledik egy fekete lyuk',
      desc: 'Mind a 25 űrhajó és a Föld a Nap körül kering, amikor egy 5 M☉ tömegű fekete lyuk 40 km/s-mal berepül a rendszerbe, és a pályák között halad el.',
    },
    en: {
      title: 'Fleet around the Sun – a black hole approaches',
      desc: 'All 25 spaceships and the Earth orbit the Sun when a 5 M☉ black hole flies into the system at 40 km/s and passes right through their orbits.',
    },
  },
  timeDilation: {
    hu: {
      title: 'Időtágulás a horizont közelében',
      desc: 'Az Enterprise, a Millennium Falcon, a Rocinante és a TARDIS körpályán 3,05 és 60 r_s között. Hasonlítsd össze a sajátidejüket: az ISCO közelében az órák ~30%-kal lassabban járnak.',
    },
    en: {
      title: 'Time dilation near the horizon',
      desc: 'The Enterprise, the Millennium Falcon, the Rocinante and the TARDIS on circular orbits from 3.05 to 60 r_s. Compare their proper times: near the ISCO clocks run ~30% slower.',
    },
  },
  meteors: {
    hu: {
      title: 'Meteorraj befogása',
      desc: '420 meteor repül el egy 10 M☉ fekete lyuk mellett: egy részük elnyelődik, mások szétszóródnak vagy pályára állnak.',
    },
    en: {
      title: 'Meteor swarm capture',
      desc: '420 meteors fly past a 10 M☉ black hole: some are swallowed, others are scattered or captured into orbit.',
    },
  },
  cluster: {
    hu: {
      title: 'Csillaghalmaz közepes tömegű fekete lyukkal',
      desc: '44 csillag (köztük fehér törpék és neutroncsillagok) kering egy 10⁴ M☉ fekete lyuk körül, teljes N-test dinamikával.',
    },
    en: {
      title: 'Star cluster with an intermediate-mass black hole',
      desc: '44 stars (including white dwarfs and neutron stars) orbit a 10⁴ M☉ black hole with full N-body dynamics.',
    },
  },
  triple: {
    hu: {
      title: 'Hármas fekete lyuk rendszer',
      desc: 'Szoros kettős és egy külső, excentrikus pályán keringő harmadik fekete lyuk: kaotikus háromtest-dinamika, összeolvadással.',
    },
    en: {
      title: 'Triple black hole system',
      desc: 'A tight binary plus a third black hole on an eccentric outer orbit: chaotic three-body dynamics ending in mergers.',
    },
  },
  kilonova: {
    hu: {
      title: 'Neutroncsillagok összeolvadása → fekete lyuk',
      desc: 'Két neutroncsillag spirálozik egymásba (mint a GW170817). Az összeolvadt test túllépi a tömeghatárt és fekete lyukká omlik.',
    },
    en: {
      title: 'Neutron star merger → black hole',
      desc: 'Two neutron stars spiral together (like GW170817). The merged object exceeds the mass limit and collapses into a black hole.',
    },
  },
  gargantua: {
    hu: {
      title: 'Gargantua (Csillagok között)',
      desc: '10⁸ M☉, gyorsan forgó fekete lyuk fényes korongal, a Miller-bolygóval az ISCO közelében, az Endurance-szel és a Ranger űrsiklóval.',
    },
    en: {
      title: 'Gargantua (Interstellar)',
      desc: 'A 10⁸ M☉ rapidly spinning black hole with a bright disk, Miller’s planet near the ISCO, the Endurance and a Ranger.',
    },
  },
  earthMoon: {
    hu: {
      title: 'Nap, Föld, Hold – holdfázisok',
      desc: 'A Nap, a Föld és a Hold a mai dátum valódi helyzetében (csillagászati efemeriszből). A Holdat a Föld felől nézed: követheted a fázisokat, és a Föld is a valódi forgási helyzetében látszik.',
    },
    en: {
      title: 'Sun, Earth, Moon – lunar phases',
      desc: "The Sun, Earth and Moon at today's true positions (from astronomical ephemerides). You see the Moon from the Earth: follow its phases; the Earth shows its true rotation too.",
    },
  },
  solarSystem: {
    hu: {
      title: 'A Naprendszer',
      desc: 'A Nap, a nyolc bolygó és a Hold valódi tömeggel, mérettel, tengelyferdeséggel és forgással. Kattints duplán a Földre.',
    },
    en: {
      title: 'The Solar System',
      desc: 'The Sun, the eight planets and the Moon with real masses, sizes, axial tilts and rotation. Double-click the Earth.',
    },
  },
  giantImpact: {
    hu: {
      title: 'Óriás becsapódás (Theia) – így születhetett a Hold',
      desc: 'Egy Mars méretű bolygó 45°-os szögben a korai Földbe csapódik. A két bolygó összeolvad, a felszín megolvad, és a kirepülő törmelékből hold állhat össze.',
    },
    en: {
      title: 'Giant impact (Theia) – how the Moon may have formed',
      desc: 'A Mars-sized planet hits the young Earth at 45°. The two merge, the surface melts, and a moon may gather from the ejected debris.',
    },
  },
  solar: {
    hu: {
      title: 'Ha a Nap fekete lyuk lenne',
      desc: 'A Nap helyén egy ugyanakkora tömegű, 3 km sugarú fekete lyuk. A belső bolygók pályája nem változik.',
    },
    en: {
      title: 'If the Sun were a black hole',
      desc: 'A black hole of one solar mass (3 km radius) replaces the Sun. The inner planets’ orbits do not change.',
    },
  },
};
