(function(){
  var t=localStorage.getItem('dp-theme');
  // One-shot migration v2: AxiaPanel ships with the new "axia" theme as default.
  if(localStorage.getItem('dp-theme-migrated-axia-v2')!=='1'){
    t='axia';
    localStorage.setItem('dp-theme-migrated-axia-v2','1');
  }
  if(!t)t='axia';
  else if(t==='dark')t='midnight';
  else if(t==='light')t='axia';
  else if(t==='nexus')t='clean';
  else if(t==='nexus-dark')t='clean-dark';
  localStorage.setItem('dp-theme',t);
  document.documentElement.setAttribute('data-theme',t);
  document.documentElement.setAttribute('data-color-scheme',(t==='arctic'||t==='clean'||t==='axia')?'light':'dark');
})();
