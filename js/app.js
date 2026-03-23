/* app.js (legacy wrapper) - kept for backward compatibility.
   This file loads the split scripts if they haven't been included.
   Prefer including js/site.js plus js/weledo.js or js/simon.js directly. */
(function(){
  'use strict';
  function load(src){
    var s=document.createElement('script');
    s.src=src;
    s.defer=true;
    document.head.appendChild(s);
  }
  // If site.js already present, do nothing.
  var scripts=[].slice.call(document.scripts).map(function(x){return (x.getAttribute('src')||'');});
  if(!scripts.some(function(s){return /\bsite\.js(\?|$)/.test(s);})){
    load((/\/pages\//.test(location.pathname)?'../':'')+'js/site.js');
  }
  // Page-specific
  if(/weledo\.html$/i.test(location.pathname)){
    if(!scripts.some(function(s){return /\bweledo\.js(\?|$)/.test(s);})){
      load((/\/pages\//.test(location.pathname)?'../':'')+'js/weledo.js');
    }
  }
  if(/\/pages\/simon\.html$/i.test(location.pathname)){
    if(!scripts.some(function(s){return /\bsimon\.js(\?|$)/.test(s);})){
      load('../js/simon.js');
    }
  }
})();
