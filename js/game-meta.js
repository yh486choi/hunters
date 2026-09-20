const $=id=>document.getElementById(id);
export function setupGameTime(){
  for(const [id,count,step,label] of [['gameHour',24,1,'시'],['gameMinute',6,10,'분']]){
    const select=$(id);select.replaceChildren(new Option(label,''));
    for(let i=0;i<count;i++){const value=String(i*step).padStart(2,'0');select.add(new Option(value+label,value));}
  }
  $('gameMinute').addEventListener('change',()=>{
    $('gameMinute').setCustomValidity('');
    $('gameMinute').querySelector('[data-legacy]')?.remove();
  });
}
export function readGameForm(){const hour=$('gameHour').value,minute=$('gameMinute').value;return {date:$('gameDate').value,time:hour&&minute?`${hour}:${minute}`:'',opponent:$('opponent').value.trim()};}
export function fillGameForm(game={}){
  $('gameDate').value=game.date||'';$('opponent').value=game.opponent||'';
  const [hour='',minute='']=(game.time||'').split(':');
  $('gameHour').value=hour;
  const select=$('gameMinute');select.querySelector('[data-legacy]')?.remove();select.setCustomValidity('');
  if(/^[0-5]\d$/.test(minute)&&Number(minute)%10!==0){
    const option=new Option(`${minute}분 (기존)`,minute);option.disabled=true;option.dataset.legacy='true';select.add(option);
    select.setCustomValidity('경기시간은 10분 단위로 다시 선택해 주세요.');
  }
  select.value=minute;
}
export function scheduleText(game={}){
  if(!game.date)return '경기일 미정';
  const date=new Date(`${game.date}T00:00:00Z`);
  if(Number.isNaN(date.getTime()))return '경기일 미정';
  return `${game.date} (${'일월화수목금토'[date.getUTCDay()]}) ${game.time||'시간 미정'}`;
}
export function gameTitle(game={}){return `${scheduleText(game)} · ${game.opponent||'상대팀 미정'}`;}
