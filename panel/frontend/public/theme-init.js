(function(){
  var t=localStorage.getItem('dp-theme');
  // One-shot migration: AxiaPanel defaults to light. Old installs had midnight as default.
  if(localStorage.getItem('dp-theme-migrated-axia')!=='1'){
    t='arctic';
    localStorage.setItem('dp-theme-migrated-axia','1');
  }
  if(!t)t='arctic';
  else if(t==='dark')t='midnight';
  else if(t==='light')t='arctic';
  else if(t==='nexus')t='clean';
  else if(t==='nexus-dark')t='clean-dark';
  localStorage.setItem('dp-theme',t);
  document.documentElement.setAttribute('data-theme',t);
  document.documentElement.setAttribute('data-color-scheme',(t==='arctic'||t==='clean')?'light':'dark');
})();
