# Event Horizon - fekete lyuk szimulátor

Interaktív, fizikailag megalapozott fekete lyuk szimulátor a böngészőben (React + TypeScript + Three.js).

## Funkciók

- **Öt nézet**, akár egymás mellett (1-4 panel): 2D térkép, téridő görbület (Flamm-beágyazás), 3D erőtér nyilakkal, valósághű GPU sugárkövetés, gravitációs hullám jel.
- **Objektumok**: fekete lyukak (Planck-tömegtől 10¹¹ M☉-ig), csillagok, fehér törpék, neutroncsillagok, bolygók, 25 híres űrhajó valós méretben (Enterprise, Millennium Falcon, Halálcsillag, TIE vadász, Endurance, Hail Mary, Tesla Roadster a Starmannel, Csillagkapu, …), meteorrajok, fénynyalábok gravitációs szín-eltolódással.
- **Fizika**: N-test dinamika Schwarzschild-geodetikus egyenletekkel, 2,5PN sugárzási reakció, fekete lyuk összeolvadás NR-illesztésekkel és kilecsengéssel, árapály-szétszakítás, Hawking-párolgás CMB-elnyeléssel, időtágulás.
- **Időléptek**: 1 µs/s-tól 30 millió év/s-ig.
- **18 forgatókönyv**: Sgr A*, GW150914, Nap–Föld–Hold holdfázisokkal (valódi égi helyzetek), a Naprendszer, Theia-becsapódás, flotta a Nap körül közeledő fekete lyukkal, TDE, mikro fekete lyukak, Hawking–CMB egyensúly, fotongömb, gravitációs színeltolódás, Gargantua stb.
- **A Naprendszer** bolygói valósághű textúrákkal (a Földön felhők, éjszakai városfények, légkör), bolygóütközések törmelékkel és megolvadt maradvánnyal.
- Magyar és angol felület. A modellek és közelítések leírása az alkalmazásban: „Tudományos háttér”.

## Futtatás

```bash
npm install
npm run dev      # fejlesztői szerver
npm test         # fizikai tesztek
npm run build    # statikus build a dist/ mappába
```

A `dist/` mappa bármilyen statikus tárhelyre feltölthető (relatív útvonalakkal épül).

Megosztható linkek: `?scenario=gw150914&layout=quad&views=realistic,map,curvature,data&lang=en`

## Billentyűk

Dupla kattintás egy objektumra: ráközelítés valós méretben. Objektumlista: `L` vagy a felső sáv „Objektumok” gombja. Jobb klikk egy soron: „Nézd ezt innen” (a kamera a kijelölt testen marad, és folyamatosan a választott test felé néz; görgő: látószög, `Esc`: feloldás).

`Szóköz` indítás/szünet · `[` `]` időléptek ÷10/×10 · `F` követés · `Del` törlés · `Esc` kijelölő eszköz

## Források

A bolygótextúrák a [Solar System Scope](https://www.solarsystemscope.com/textures/) oldaláról származnak (CC BY 4.0, NASA-adatok alapján).
