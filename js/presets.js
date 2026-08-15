export const DEFAULT_RACER_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23131722'/%3E%3Ccircle cx='50' cy='38' r='20' fill='%2300f2fe' opacity='0.85'/%3E%3Cpath d='M20,88 C20,64 34,58 50,58 C66,58 80,64 80,88 Z' fill='%2300f2fe' opacity='0.85'/%3E%3C/svg%3E";

export const DEFAULT_TEAM_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='96' height='96' x='2' y='2' rx='18' fill='%23131826' stroke='%2300f2fe' stroke-width='4'/%3E%3Cpolygon points='50,22 78,72 22,72' fill='%2300f2fe' opacity='0.9'/%3E%3C/svg%3E";

export const PRESET_AVATARS = [
  {
    id: 'helmet_red',
    name: 'Crimson Fury',
    category: 'Formula Apex',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23ff2a55"/><stop offset="100%" stop-color="%238a001f"/></linearGradient><linearGradient id="v1" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="%2300f2fe"/><stop offset="100%" stop-color="%234facfe"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="%23131722" stroke="%23ff2a55" stroke-width="2"/><path d="M25,50 C25,28 35,20 52,20 C70,20 78,30 78,50 C78,72 68,78 50,78 C32,78 25,70 25,50 Z" fill="url(%23g1)"/><path d="M30,42 Q50,34 72,42 Q74,56 68,60 Q48,56 32,58 Z" fill="%23080b11" stroke="url(%23v1)" stroke-width="2"/><circle cx="50" cy="28" r="4" fill="%23ffffff" opacity="0.8"/><rect x="44" y="66" width="16" height="4" rx="2" fill="%23ffffff" opacity="0.6"/></svg>`
  },
  {
    id: 'helmet_cyan',
    name: 'Cyber Phantom',
    category: 'GT Pro',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2300f2fe"/><stop offset="100%" stop-color="%23005bea"/></linearGradient><linearGradient id="v2" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="%23ffe600"/><stop offset="100%" stop-color="%23ff5e00"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="%230d141e" stroke="%2300f2fe" stroke-width="2"/><path d="M25,50 C25,28 35,20 52,20 C70,20 78,30 78,50 C78,72 68,78 50,78 C32,78 25,70 25,50 Z" fill="url(%23g2)"/><path d="M28,42 Q50,35 74,42 Q75,56 69,61 Q49,57 31,59 Z" fill="%2305080e" stroke="url(%23v2)" stroke-width="2"/><polygon points="45,24 55,24 50,32" fill="%2300f2fe"/><rect x="42" y="68" width="18" height="3" rx="1.5" fill="%2300f2fe" opacity="0.7"/></svg>`
  },
  {
    id: 'helmet_gold',
    name: 'Apex Legend',
    category: 'Formula Apex',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23ffd700"/><stop offset="100%" stop-color="%23ff8c00"/></linearGradient><linearGradient id="v3" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="%23111111"/><stop offset="100%" stop-color="%23333333"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="%231a1508" stroke="%23ffd700" stroke-width="2"/><path d="M25,50 C25,28 35,20 52,20 C70,20 78,30 78,50 C78,72 68,78 50,78 C32,78 25,70 25,50 Z" fill="url(%23g3)"/><path d="M30,42 Q50,34 72,42 Q74,55 68,60 Q48,56 32,58 Z" fill="url(%23v3)" stroke="%23ffd700" stroke-width="2"/><circle cx="50" cy="27" r="5" fill="%23ffffff"/><polygon points="46,67 54,67 50,73" fill="%23ffd700"/></svg>`
  },
  {
    id: 'helmet_violet',
    name: 'Vortex Drift',
    category: 'Drift Master',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23b026ff"/><stop offset="100%" stop-color="%234a00e0"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="%23150d22" stroke="%23b026ff" stroke-width="2"/><path d="M25,50 C25,28 35,20 52,20 C70,20 78,30 78,50 C78,72 68,78 50,78 C32,78 25,70 25,50 Z" fill="url(%23g4)"/><path d="M30,43 Q50,36 72,43 Q73,56 67,60 Q48,57 32,59 Z" fill="%23090412" stroke="%2300f2fe" stroke-width="2"/><path d="M38,24 L62,24 L56,30 L44,30 Z" fill="%23b026ff"/></svg>`
  },
  {
    id: 'helmet_green',
    name: 'Nitro Surge',
    category: 'Moto GP',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2300ff87"/><stop offset="100%" stop-color="%2360efff"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="%230c1a14" stroke="%2300ff87" stroke-width="2"/><path d="M25,50 C25,28 35,20 52,20 C70,20 78,30 78,50 C78,72 68,78 50,78 C32,78 25,70 25,50 Z" fill="url(%23g5)"/><path d="M30,42 Q50,34 72,42 Q74,56 68,60 Q48,56 32,58 Z" fill="%23040e09" stroke="%2300ff87" stroke-width="2"/><polygon points="40,24 60,24 50,29" fill="%23ffffff"/></svg>`
  },
  {
    id: 'helmet_white',
    name: 'Stealth Ghost',
    category: 'Rookie',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g6" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23ffffff"/><stop offset="100%" stop-color="%238a9ba8"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="%2312151b" stroke="%238a9ba8" stroke-width="2"/><path d="M25,50 C25,28 35,20 52,20 C70,20 78,30 78,50 C78,72 68,78 50,78 C32,78 25,70 25,50 Z" fill="url(%23g6)"/><path d="M30,42 Q50,34 72,42 Q74,56 68,60 Q48,56 32,58 Z" fill="%230d1117" stroke="%23ff2a55" stroke-width="2"/><rect x="42" y="24" width="16" height="4" fill="%23ff2a55"/></svg>`
  }
];

export const PRESET_TEAM_LOGOS = [
  {
    id: 'logo_supercar',
    name: 'Apex Supercar',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="tl1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23ff2a55"/><stop offset="100%" stop-color="%23ff758c"/></linearGradient></defs><rect width="96" height="96" x="2" y="2" rx="20" fill="%23131826" stroke="url(%23tl1)" stroke-width="3"/><path d="M18,62 L26,46 L38,36 L64,36 L76,46 L82,62 Z" fill="%231b2234"/><path d="M28,47 L36,39 L64,39 L72,47 Z" fill="url(%23tl1)"/><path d="M16,62 Q50,56 84,62 L80,72 Q50,76 20,72 Z" fill="url(%23tl1)"/><circle cx="30" cy="65" r="7" fill="%230a0e17" stroke="%23ffffff" stroke-width="2"/><circle cx="70" cy="65" r="7" fill="%230a0e17" stroke="%23ffffff" stroke-width="2"/></svg>`
  },
  {
    id: 'logo_lightning',
    name: 'Cyber Bolt',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="tl2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2300f2fe"/><stop offset="100%" stop-color="%234facfe"/></linearGradient></defs><rect width="96" height="96" x="2" y="2" rx="20" fill="%230a131f" stroke="url(%23tl2)" stroke-width="3"/><polygon points="56,16 28,52 48,52 42,84 74,44 54,44" fill="url(%23tl2)" filter="drop-shadow(0 0 8px %2300f2fe)"/></svg>`
  },
  {
    id: 'logo_viper',
    name: 'Viper Strike',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="tl3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2300ff87"/><stop offset="100%" stop-color="%2360efff"/></linearGradient></defs><rect width="96" height="96" x="2" y="2" rx="20" fill="%230b1a13" stroke="url(%23tl3)" stroke-width="3"/><path d="M50,18 C34,18 26,30 26,45 C26,62 38,76 50,82 C62,76 74,62 74,45 C74,30 66,18 50,18 Z" fill="none" stroke="url(%23tl3)" stroke-width="4"/><circle cx="40" cy="40" r="4" fill="url(%23tl3)"/><circle cx="60" cy="40" r="4" fill="url(%23tl3)"/><path d="M42,54 Q50,64 58,54 L54,72 L50,66 L46,72 Z" fill="url(%23tl3)"/></svg>`
  },
  {
    id: 'logo_shield',
    name: 'Titanium Shield',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="tl4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23ffd700"/><stop offset="100%" stop-color="%23ff8c00"/></linearGradient></defs><rect width="96" height="96" x="2" y="2" rx="20" fill="%231a150a" stroke="url(%23tl4)" stroke-width="3"/><path d="M50,20 L76,30 L76,54 C76,70 64,80 50,86 C36,80 24,70 24,54 L24,30 Z" fill="none" stroke="url(%23tl4)" stroke-width="4"/><polygon points="50,34 55,46 68,46 57,54 61,66 50,58 39,66 43,54 32,46 45,46" fill="url(%23tl4)"/></svg>`
  },
  {
    id: 'logo_flame',
    name: 'Nitro Flame',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="tl5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23ff007a"/><stop offset="100%" stop-color="%237928ca"/></linearGradient></defs><rect width="96" height="96" x="2" y="2" rx="20" fill="%23180c1f" stroke="url(%23tl5)" stroke-width="3"/><path d="M50,16 C55,26 62,30 68,40 C76,52 74,68 62,78 C54,84 46,84 38,78 C26,68 24,52 32,40 C38,30 45,26 50,16 Z" fill="url(%23tl5)"/><path d="M50,42 C54,48 56,54 54,62 C50,68 46,68 44,62 C42,54 46,48 50,42 Z" fill="%23ffffff" opacity="0.9"/></svg>`
  },
  {
    id: 'logo_chequered',
    name: 'Grand Prix Flag',
    svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="tl6" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2300f2fe"/><stop offset="100%" stop-color="%23ffffff"/></linearGradient></defs><rect width="96" height="96" x="2" y="2" rx="20" fill="%2310141d" stroke="url(%23tl6)" stroke-width="3"/><path d="M22,22 L30,80" stroke="%23ffffff" stroke-width="3" stroke-linecap="round"/><path d="M28,26 Q50,20 74,28 L74,56 Q50,48 28,54 Z" fill="%231e293b" stroke="%23ffffff" stroke-width="1.5"/><rect x="28" y="26" width="11" height="9" fill="%23ffffff"/><rect x="50" y="24" width="12" height="10" fill="%23ffffff"/><rect x="39" y="35" width="11" height="9" fill="%23ffffff"/><rect x="62" y="34" width="12" height="10" fill="%23ffffff"/><rect x="28" y="44" width="11" height="10" fill="%23ffffff"/><rect x="50" y="43" width="12" height="11" fill="%23ffffff"/></svg>`
  }
];

