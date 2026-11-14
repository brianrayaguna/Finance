(function () {
  try {
    // Kunci penyimpanan 'neraca.*' dipertahankan agar data tersimpan tetap terbaca.
    var p = JSON.parse(localStorage.getItem('neraca.prefs') || '{}');
    var s = (p && p.state) || {};
    var mode = s.theme || 'system';
    var dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var r = document.documentElement;
    var accents = ['forest', 'ocean', 'plum', 'clay', 'graphite'];
    r.dataset.theme = dark ? 'dark' : 'light';
    r.style.colorScheme = dark ? 'dark' : 'light';
    r.dataset.accent = accents.indexOf(s.accent) >= 0 ? s.accent : 'forest';
    if (s.density) r.dataset.density = s.density;
  } catch (e) {
    var rFallback = document.documentElement;
    rFallback.dataset.theme = 'light';
    rFallback.style.colorScheme = 'light';
  }
})();
