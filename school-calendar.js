(function(){
  'use strict';
  const URL='https://wcibmaths.github.io/teacher-hub/data/wcib_academic_key_dates_2026_27.csv';
  const ZONE='Asia/Bangkok';
  function esc(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function parseCsv(text){
    const rows=[];let row=[],field='',quoted=false;
    text=String(text).replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const c=text[i],next=text[i+1];
      if(c==='"'&&quoted&&next==='"'){field+='"';i++;}
      else if(c==='"')quoted=!quoted;
      else if(c===','&&!quoted){row.push(field);field='';}
      else if((c==='\r'||c==='\n')&&!quoted){
        if(c==='\r'&&next==='\n')i++;
        row.push(field);field='';if(row.some(Boolean))rows.push(row);row=[];
      }else field+=c;
    }
    row.push(field);if(row.some(Boolean))rows.push(row);
    if(quoted)throw new Error('Incomplete quoted calendar field');
    if(!rows.length)return [];
    const headers=rows.shift().map(x=>x.trim());
    if(!['event_id','start_date','event'].every(h=>headers.includes(h)))throw new Error('Invalid calendar headers');
    return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,String(values[i]||'').trim()])));
  }
  function term(row){
    const value=String(row.term||row.legacy_term||'');
    if(/michaelmas|term\s*1/i.test(value))return 'Michaelmas';
    if(/lent|term\s*2/i.test(value))return 'Lent';
    if(/summer|term\s*3/i.test(value))return 'Summer';
    return '';
  }
  function years(row){
    if(Array.isArray(row.audience_years))return row.audience_years.map(Number).filter(n=>n>=7&&n<=13);
    if(row.audience_years){try{return years({audience_years:JSON.parse(row.audience_years)});}catch(e){}}
    // Audience is an explicit CSV field; never infer it from event titles.
    const found=new Set(),text=String(row.audience||'');
    text.replace(/\b(?:Y|Year\s*)(\d{1,2})\s*[-–]\s*(?:Y|Year\s*)?(\d{1,2})/gi,(_,a,b)=>{
      for(let n=Number(a);n<=Number(b);n++)if(n>=7&&n<=13)found.add(n);return '';
    }).replace(/\b(?:Y|Year\s*)(\d{1,2})\b/gi,(_,n)=>{if(+n>=7&&+n<=13)found.add(+n);return '';});
    return [...found].sort((a,b)=>a-b);
  }
  function isExternal(row){
    return row.external===true||String(row.external).toLowerCase()==='true'||
      /external\s+exam|edexcel|pearson\s+exam/i.test(String(row.category||'')+' '+String(row.display_section||''))||
      /^(?:IAL|IGCSE|Edexcel|Pearson)?\s*External Exams?(?:\s*$|\s+sittings?)/i.test(String(row.event||''));
  }
  function normaliseRows(rows){
    const ids=new Set();
    return rows.map(row=>{
      const out={...row,term:term(row),audience_years:years(row)};
      if(!out.event_id||ids.has(out.event_id))throw new Error('Missing or duplicate calendar event ID');
      ids.add(out.event_id);
      if(!out.term)throw new Error('Unrecognised school calendar term');
      if(out.start_date&&!/^\d{4}-\d{2}-\d{2}$/.test(out.start_date))throw new Error('Invalid school calendar date');
      return out;
    }).filter(row=>!isExternal(row));
  }
  function audience(row){
    const values=years(row);
    return values.length?values.map(n=>'Year '+n).join(', '):String(row.audience||'Whole school');
  }
  function day(iso){return new Date(iso+'T12:00:00+07:00');}
  function date(iso){
    return iso?day(iso).toLocaleDateString('en-GB',{timeZone:ZONE,weekday:'short',day:'numeric',month:'short',year:'numeric'}):'Date TBC';
  }
  function dates(row){
    return date(row.start_date)+(row.end_date&&row.end_date!==row.start_date?' – '+date(row.end_date):'')+
      (row.deadline_time==='12:00'?' · 12:00 PM · '+ZONE:'');
  }
  function details(row){
    return [row.reporting_cycle,audience(row),row.week_code,row.deadline_time==='12:00'?'12:00 PM · '+ZONE:'',row.notes].filter(Boolean).join(' · ');
  }
  function todayISO(){
    return new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }
  function createStore(key,onChange){
    const state={rows:[],status:'loading'};let pending=null;
    const emit=()=>{if(onChange)onChange(state);};
    async function refresh(){
      if(pending)return pending;
      pending=(async()=>{
        if(!state.rows.length){
          try{const cached=JSON.parse(localStorage.getItem(key)||'null');if(cached&&Array.isArray(cached.rows))state.rows=normaliseRows(cached.rows);}catch(e){}
        }
        state.status='loading';emit();
        try{
          const response=await fetch(URL+'?calendar='+Date.now(),{cache:'no-store'});
          if(!response.ok)throw new Error('Calendar HTTP '+response.status);
          const rows=normaliseRows(parseCsv(await response.text()));
          if(!rows.length)throw new Error('Empty school calendar');
          state.rows=rows;state.status='fresh';
          try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),rows}));}catch(e){}
        }catch(error){
          state.status=state.rows.length?'saved':'unavailable';
        }
        emit();return state.rows;
      })();
      try{return await pending;}finally{pending=null;}
    }
    return {state,refresh};
  }
  function notice(state,retry){
    if(!state||!['saved','unavailable'].includes(state.status))return '';
    return '<div role="status" style="font-size:12px;color:var(--dark-gray,#667080);margin:8px 0;">'+
      (state.status==='saved'?'Showing saved dates — calendar data unavailable.':'Calendar data unavailable.')+
      ' <button type="button" onclick="'+retry+'" style="font:inherit;color:inherit;background:none;border:0;text-decoration:underline;cursor:pointer;">Retry</button></div>';
  }
  window.WCIB_SCHOOL_CALENDAR={URL,ZONE,esc,parseCsv,normaliseRows,term,years,audience,isExternal,dates,details,todayISO,createStore,notice};
})();
