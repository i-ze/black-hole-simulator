/** Glyph used to draw the ship on the 2D map. */
export type ShipShape = 'arrow' | 'saucer' | 'disc' | 'ring' | 'wedge' | 'box' | 'long' | 'car' | 'ufo' | 'shell' | 'sphere' | 'tie';

export interface ShipModel {
  id: string;
  name: string;
  franchise: string;
  /** Approximate length, m (canon or commonly quoted values). */
  length: number;
  /** Approximate mass, kg. Ships are test bodies, so this only matters when they are swallowed. */
  mass: number;
  color: string;
  shape: ShipShape;
  /** Width as a fraction of the length (top view). */
  beam: number;
}

export const SHIPS: ShipModel[] = [
  { id: 'enterprise', beam: 0.73, name: 'USS Enterprise', franchise: 'Star Trek', length: 642, mass: 4.5e9, color: '#cbd5e1', shape: 'saucer' },
  { id: 'borgcube', beam: 1, name: 'Borg Cube', franchise: 'Star Trek', length: 3040, mass: 9.0e10, color: '#4ade80', shape: 'box' },
  { id: 'falcon', beam: 0.8, name: 'Millennium Falcon', franchise: 'Star Wars', length: 34.8, mass: 1.0e5, color: '#e5e7eb', shape: 'disc' },
  { id: 'stardestroyer', beam: 0.56, name: 'Star Destroyer', franchise: 'Star Wars', length: 1600, mass: 4.0e10, color: '#94a3b8', shape: 'wedge' },
  { id: 'endurance', beam: 1, name: 'Endurance', franchise: 'Interstellar', length: 64, mass: 5.0e5, color: '#f1f5f9', shape: 'ring' },
  { id: 'ranger', beam: 0.54, name: 'Ranger', franchise: 'Interstellar', length: 25, mass: 5.0e4, color: '#e2e8f0', shape: 'arrow' },
  { id: 'sanctuary', beam: 0.9, name: 'Sanctuary II', franchise: 'Avengers (Thanos)', length: 4000, mass: 1.0e11, color: '#a78bfa', shape: 'saucer' },
  { id: 'darkaster', beam: 0.2, name: 'Dark Aster', franchise: 'Guardians of the Galaxy (Ronan)', length: 2500, mass: 5.0e10, color: '#f87171', shape: 'wedge' },
  { id: 'discovery', beam: 0.12, name: 'Discovery One', franchise: '2001: A Space Odyssey', length: 140, mass: 5.4e6, color: '#f8fafc', shape: 'long' },
  { id: 'nostromo', beam: 0.36, name: 'Nostromo', franchise: 'Alien', length: 243, mass: 6.3e7, color: '#a8a29e', shape: 'box' },
  { id: 'rocinante', beam: 0.3, name: 'Rocinante', franchise: 'The Expanse', length: 46, mass: 4.6e5, color: '#9ca3af', shape: 'arrow' },
  { id: 'serenity', beam: 0.7, name: 'Serenity', franchise: 'Firefly', length: 82, mass: 2.5e6, color: '#d6a676', shape: 'arrow' },
  { id: 'galactica', beam: 0.32, name: 'Battlestar Galactica', franchise: 'Battlestar Galactica', length: 1438, mass: 1.5e10, color: '#78716c', shape: 'long' },
  { id: 'eventhorizon', beam: 0.48, name: 'Event Horizon', franchise: 'Event Horizon', length: 800, mass: 5.0e8, color: '#64748b', shape: 'long' },
  { id: 'tesla', beam: 0.46, name: 'Tesla Roadster (Starman)', franchise: 'SpaceX (real, 2018)', length: 3.9, mass: 1.4e3, color: '#c8102e', shape: 'car' },
  { id: 'hailmary', beam: 0.3, name: 'Hail Mary', franchise: 'Project Hail Mary', length: 60, mass: 2.0e6, color: '#d4d8de', shape: 'long' },
  { id: 'blipa', beam: 0.7, name: 'Blip-A', franchise: 'Project Hail Mary (Rocky)', length: 200, mass: 1.0e7, color: '#7a7d70', shape: 'disc' },
  { id: 'marsattacks', beam: 1, name: 'Martian Saucer', franchise: 'Mars Attacks!', length: 60, mass: 5.0e5, color: '#b8c4cc', shape: 'ufo' },
  { id: 'district9', beam: 0.9, name: 'District 9 Mothership', franchise: 'District 9', length: 2000, mass: 1.0e11, color: '#5f655f', shape: 'ufo' },
  { id: 'citydestroyer', beam: 1, name: 'City Destroyer', franchise: 'Independence Day', length: 24000, mass: 1.0e14, color: '#4f545b', shape: 'ufo' },
  { id: 'arrival', beam: 0.55, name: 'Shell', franchise: 'Arrival', length: 450, mass: 1.0e9, color: '#34373a', shape: 'shell' },
  { id: 'stargate', beam: 1, name: 'Stargate', franchise: 'Stargate', length: 6.7, mass: 2.9e4, color: '#8c8f96', shape: 'ring' },
  { id: 'deathstar', beam: 1, name: 'Death Star', franchise: 'Star Wars', length: 120000, mass: 1.0e18, color: '#8e9399', shape: 'sphere' },
  { id: 'tie', beam: 0.9, name: 'TIE Fighter', franchise: 'Star Wars', length: 7.2, mass: 4.0e3, color: '#5a5f66', shape: 'tie' },
  { id: 'tardis', beam: 0.54, name: 'TARDIS', franchise: 'Doctor Who', length: 2.7, mass: 1.0e3, color: '#3b82f6', shape: 'box' },
];

export const shipById = (id: string | undefined) => SHIPS.find((s) => s.id === id);
