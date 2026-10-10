/* Theme: 'auto' follows the phone, or 'light' / 'dark'. Resolved to data-theme before first paint. */
(function(){var m='auto';try{m=localStorage.getItem('lift.theme')||'auto';}catch(e){}
 var dark=m==='dark'||(m==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
 document.documentElement.setAttribute('data-theme',dark?'dark':'light');})();
